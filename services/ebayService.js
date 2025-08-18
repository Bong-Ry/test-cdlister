// services/ebayService.js
// Trading API: UploadSiteHostedPictures を “素の axios” で直叩きして確実に FullURL を取る版
// - ExternalPictureURL: XML POST（multipart不要）
// - バイナリ送信: multipart/form-data（パート順序は XML → 画像）
// - ダウンロード時に直リンク化＆JPEG 正規化（WEBP/HEIC/αPNG→JPEG）
// 必要ENV: EBAY_AUTH_TOKEN, EBAY_SITE_ID(=0 US 等), EBAY_SANDBOX("true"/"false"), 省略可: EBAY_COMPAT_LEVEL(既定: 1423)

'use strict';

const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const { XMLParser } = require('fast-xml-parser');

const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_PIC_NAME = 'CD_Image_From_App';
const DEFAULT_COMPAT = parseInt(process.env.EBAY_COMPAT_LEVEL || '1423', 10); // 2025-07 時点のドキュメント版数に追随
const EBAY_SITE_ID = String(process.env.EBAY_SITE_ID || '0'); // 0=US
const EBAY_AUTH_TOKEN = process.env.EBAY_AUTH_TOKEN;
const EBAY_SANDBOX = String(process.env.EBAY_SANDBOX || '').toLowerCase() === 'true';

if (!EBAY_AUTH_TOKEN) {
  throw new Error('ENV EBAY_AUTH_TOKEN が未設定です（Trading XMLはトークンをXML内の RequesterCredentials に入れます）。');
}

const TRADING_ENDPOINT = EBAY_SANDBOX
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

/* ──────────────────────────────────────────────────────────────────────────
 * 共有URL → 直リンク（Google Drive / Dropbox / OneDrive）
 * ────────────────────────────────────────────────────────────────────────── */
const toDirectPublicUrl = (urlRaw) => {
  if (!urlRaw) return urlRaw;
  const url = String(urlRaw).trim();

  // Google Drive
  {
    const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    const id = m1?.[1] || m2?.[1];
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  // Dropbox
  if (url.includes('dropbox.com/')) {
    return url.includes('?') ? url.replace(/dl=\d/, 'dl=1') : `${url}?dl=1`;
  }
  // OneDrive / SharePoint
  if (url.includes('1drv.ms') || url.includes('sharepoint.com')) {
    return url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
  }
  return url;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 画像ダウンロード & 正規化
 * ────────────────────────────────────────────────────────────────────────── */
const isHtmlMagic = (buf) => buf.length >= 6 && buf[0] === 0x3c; // '<'

const fetchImageBuffer = async (url) => {
  const direct = toDirectPublicUrl(url);
  const res = await axios.get(direct, {
    responseType: 'arraybuffer',
    maxContentLength: MAX_BYTES,
    validateStatus: (s) => s >= 200 && s < 400, // リダイレクト含め許容
  });
  const buf = Buffer.from(res.data);
  if (!buf.length) throw new Error('画像が 0 バイトです。');

  const ctype = String(res.headers['content-type'] || '').split(';')[0].trim();
  if (!ctype.startsWith('image/')) {
    if (isHtmlMagic(buf)) {
      throw new Error(`画像ではなく HTML が返却されました（直リンク化・公開権限を確認）。content-type=${ctype}`);
    }
    // ctype 無しCDNもあるので続行
  }
  return buf;
};

const normalizeToJpeg = async (buf) => {
  try {
    const meta = await sharp(buf, { pages: -1 }).metadata();
    const needsJpeg =
      meta.format !== 'jpeg' || Boolean(meta.hasAlpha) || (typeof meta.pages === 'number' && meta.pages > 1);

    let pipeline = sharp(buf);
    if (meta.hasAlpha) pipeline = pipeline.flatten({ background: '#ffffff' });
    return needsJpeg ? pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer() : buf;
  } catch (e) {
    throw new Error(`画像を読み取れません（破損/非対応形式の可能性）: ${e.message}`);
  }
};

/* ──────────────────────────────────────────────────────────────────────────
 * Trading API 共通: ヘッダ作成 & XML ラッパ
 * ────────────────────────────────────────────────────────────────────────── */
const tradingHeaders = (callName, isMultipart) => ({
  'X-EBAY-API-CALL-NAME': callName,
  'X-EBAY-API-SITEID': EBAY_SITE_ID,
  'X-EBAY-API-COMPATIBILITY-LEVEL': String(DEFAULT_COMPAT),
  'X-EBAY-API-RESPONSE-ENCODING': 'XML',
  // Content-Type は後段で form-data のヘッダと合流（multipart時）／text/xml（XMLのみ時）
  ...(isMultipart ? {} : { 'Content-Type': 'text/xml' }),
});

const buildXmlEnvelope = (innerXml) =>
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
  `<RequesterCredentials><eBayAuthToken>${escapeXml(EBAY_AUTH_TOKEN)}</eBayAuthToken></RequesterCredentials>` +
  innerXml +
  `</UploadSiteHostedPicturesRequest>`;

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/* ──────────────────────────────────────────────────────────────────────────
 * レスポンス XML → URL 抽出
 * ────────────────────────────────────────────────────────────────────────── */
const parseXml = (xml) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: true,
    trimValues: true,
  });
  return parser.parse(xml);
};

const extractFirstUrl = (json) => {
  // Ack チェック
  const ack =
    json?.UploadSiteHostedPicturesResponse?.Ack ||
    json?.UploadSiteHostedPicturesResponse?.['ns:Ack'] ||
    json?.Ack;
  if (ack && !/^Success/i.test(ack)) {
    // eBay の error は別途上位で拾わせる
    return null;
  }

  const details =
    json?.UploadSiteHostedPicturesResponse?.SiteHostedPictureDetails ||
    json?.SiteHostedPictureDetails;

  // 1) FullURL 最優先（公式ドキュメントに明記） [oai_citation:1‡eBay Developers](https://developer.ebay.com/devzone/xml/docs/reference/ebay/uploadsitehostedpictures.html)
  const fullUrl = details?.FullURL;
  if (typeof fullUrl === 'string' && /^https?:\/\//i.test(fullUrl)) return fullUrl;

  // 2) PictureSetMember[].MemberURL（サイズ別URL群）
  const psm = details?.PictureSetMember;
  const members = Array.isArray(psm) ? psm : psm ? [psm] : [];
  for (const m of members) {
    const mu = m?.MemberURL;
    if (typeof mu === 'string' && /^https?:\/\//i.test(mu)) return mu;
  }

  // 3) BaseURL（まれにこれしか来ないケースへのフォールバック）
  const base = details?.BaseURL;
  if (typeof base === 'string' && /^https?:\/\//i.test(base)) return base;

  // 4) それでも無ければ、JSON全体から http(s) を総当り
  const urls = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === 'string') {
      if (/^https?:\/\//i.test(v)) urls.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(json);
  return urls[0] || null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 実装: ExternalPictureURL（XML POST）
 * ────────────────────────────────────────────────────────────────────────── */
const uploadViaExternalUrl = async (publicUrl, pictureName = DEFAULT_PIC_NAME) => {
  const inner =
    `<ExternalPictureURL>${escapeXml(publicUrl)}</ExternalPictureURL>` +
    `<PictureName>${escapeXml(pictureName)}</PictureName>` +
    `<PictureSystemVersion>2</PictureSystemVersion>`;
  const xml = buildXmlEnvelope(inner);

  const { data } = await axios.post(TRADING_ENDPOINT, xml, {
    headers: tradingHeaders('UploadSiteHostedPictures', false),
    responseType: 'text',
  });

  const json = parseXml(String(data));
  const url = extractFirstUrl(json);
  if (!url) {
    const errText = JSON.stringify(json?.UploadSiteHostedPicturesResponse?.Errors || json, null, 2);
    throw new Error(`ExternalPictureURL で URL を取得できません: ${errText}`);
  }
  return url;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 実装: バイナリ添付（multipart）… パート順序は XML → 画像（必須） [oai_citation:2‡eBay Developers](https://developer.ebay.com/devzone/xml/docs/reference/ebay/uploadsitehostedpictures.html)
 * ────────────────────────────────────────────────────────────────────────── */
const uploadViaAttachment = async (jpegBuffer, pictureName = DEFAULT_PIC_NAME) => {
  const inner =
    `<PictureName>${escapeXml(pictureName)}</PictureName>` +
    `<PictureSystemVersion>2</PictureSystemVersion>`;
  const xml = buildXmlEnvelope(inner);

  const form = new FormData();
  form.append('XML Payload', xml, { contentType: 'text/xml; charset=utf-8' }); // 先に XML
  form.append('file', jpegBuffer, { filename: `${pictureName.replace(/[^\w.-]/g, '_')}.jpg`, contentType: 'image/jpeg' });

  const headers = { ...tradingHeaders('UploadSiteHostedPictures', true), ...form.getHeaders() };

  const { data } = await axios.post(TRADING_ENDPOINT, form, {
    headers,
    maxContentLength: MAX_BYTES,
    responseType: 'text',
  });

  const json = parseXml(String(data));
  const url = extractFirstUrl(json);
  if (!url) {
    const err = json?.UploadSiteHostedPicturesResponse?.Errors;
    const ack = json?.UploadSiteHostedPicturesResponse?.Ack;
    throw new Error(
      `添付アップロードは応答を受信しましたが URL を抽出できません（Ack=${ack || 'N/A'}）。Details: ${JSON.stringify(err || json).slice(0, 2000)}`
    );
  }
  return url;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 公開 API
 * ────────────────────────────────────────────────────────────────────────── */
const uploadPictureFromUrl = async (imageUrl, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const publicUrl = toDirectPublicUrl(imageUrl);

  // まず ExternalPictureURL（XMLのみ）で取り込み（仕様に明記） [oai_citation:3‡eBay Developers](https://developer.ebay.com/devzone/xml/docs/reference/ebay/uploadsitehostedpictures.html)
  try {
    return await uploadViaExternalUrl(publicUrl, pictureName);
  } catch (_) {
    // 非公開/HTML 等で失敗時は添付にフォールバック
  }

  const raw = await fetchImageBuffer(publicUrl);
  const jpeg = await normalizeToJpeg(raw);
  return uploadViaAttachment(jpeg, pictureName);
};

const uploadPictureFromBuffer = async (buffer, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const jpeg = await normalizeToJpeg(buffer);
  return uploadViaAttachment(jpeg, pictureName);
};

module.exports = {
  uploadPictureFromUrl,
  uploadPictureFromBuffer,
  // テスト/デバッグ用
  toDirectPublicUrl,
  fetchImageBuffer,
  normalizeToJpeg,
};
