// services/ebayService.js
// eBay Trading API: UploadSiteHostedPictures
// - まず ExternalPictureURL を試し、失敗時は画像を取得→JPEG正規化→multipart添付（XML→画像の順）で送信
// - ebay-api の「hook」で multipart を構築（attachments は使いません）

'use strict';

const eBayApi = require('ebay-api');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');

const EBAY_PICTURE_SYSTEM_VERSION = 2;
const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const DEFAULT_PIC_NAME = 'CD_Image_From_App';

/* ─ eBay クライアント ─ */
const getEbay = () => {
  const ebay = eBayApi.fromEnv();
  if (!ebay || !ebay.trading) {
    throw new Error('eBay 環境変数が不足しています（EBAY_APP_ID / EBAY_CERT_ID / EBAY_AUTH_TOKEN / EBAY_SITE_ID 等）。');
  }
  return ebay;
};

/* ─ 共有URL→直リンク化（Google Drive / Dropbox / OneDrive） ─ */
const toDirectPublicUrl = (urlRaw) => {
  if (!urlRaw) return urlRaw;
  const url = String(urlRaw).trim();

  // Google Drive: /file/d/<id> or ?id=<id> -> uc?export=download
  {
    const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    const id = m1?.[1] || m2?.[1];
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  // Dropbox: dl=1 に
  if (url.includes('dropbox.com/')) {
    if (url.includes('?')) return url.replace(/dl=\d/, 'dl=1');
    return `${url}?dl=1`;
  }
  // OneDrive: download=1 を付与
  if (url.includes('1drv.ms') || url.includes('sharepoint.com')) {
    return url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
  }
  return url;
};

/* ─ 画像取得 ─ */
const isHtmlMagic = (buf) =>
  buf.length >= 6 && buf[0] === 0x3c /* '<' */;

const fetchImageBuffer = async (url) => {
  const direct = toDirectPublicUrl(url);
  const res = await axios.get(direct, {
    responseType: 'arraybuffer',
    maxContentLength: MAX_BYTES,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (!buf.length) throw new Error('画像が 0 バイトです。');

  const ctype = String(res.headers['content-type'] || '').split(';')[0].trim();
  if (!ctype.startsWith('image/')) {
    if (isHtmlMagic(buf)) {
      throw new Error(`画像ではなく HTML が返ってきました（直リンク/公開権限を確認）。content-type=${ctype}`);
    }
    // 一部CDNは content-type を付けないことがあるので続行
  }
  return buf;
};

/* ─ JPEG 正規化 ─ */
const normalizeToJpeg = async (buf) => {
  try {
    const meta = await sharp(buf, { pages: -1 }).metadata();
    const needsJpeg =
      meta.format !== 'jpeg' ||
      Boolean(meta.hasAlpha) ||
      (typeof meta.pages === 'number' && meta.pages > 1);

    let pipeline = sharp(buf);
    if (meta.hasAlpha) pipeline = pipeline.flatten({ background: '#ffffff' });
    return needsJpeg ? pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer() : buf;
  } catch (e) {
    throw new Error(`画像を読み取れません（破損/非対応形式の可能性）: ${e.message}`);
  }
};

/* ─ レスポンスから URL を抽出（FullURL を最優先） ─ */
const extractFirstUrl = (obj) => {
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
  // SiteHostedPictureDetails を優先的に走査
  if (obj?.SiteHostedPictureDetails) walk(obj.SiteHostedPictureDetails);
  walk(obj);

  // eBayの公式応答は FullURL / MemberURL / BaseURL 等（FullURLが最重要） [oai_citation:3‡developer.ebay.com](https://developer.ebay.com/devzone/xml/docs/reference/ebay/uploadsitehostedpictures.html?utm_source=chatgpt.com)
  const prefer = urls.find((u) => /ebayimg\.com/i.test(u)) || urls[0];
  return prefer || null;
};

/* ─ ExternalPictureURL での取り込み ─ */
const uploadViaExternalUrl = async (publicUrl, pictureName) => {
  const ebay = getEbay();
  const res = await ebay.trading.UploadSiteHostedPictures({
    PictureName: pictureName,
    PictureSystemVersion: EBAY_PICTURE_SYSTEM_VERSION,
    ExternalPictureURL: publicUrl,
  });
  const url = extractFirstUrl(res);
  if (!url) throw new Error('eBay 応答に URL がありません（ExternalPictureURL 経由）');
  return url;
};

/* ─ 添付アップロード（multipart/form-data。XML→画像の順） ─ */
const uploadViaAttachment = async (jpegBuffer, pictureName) => {
  const ebay = getEbay();

  const xmlBody = {
    PictureName: pictureName,
    PictureSystemVersion: EBAY_PICTURE_SYSTEM_VERSION,
    // PictureData は入れない。画像は multipart の 2 パート目で送る（EPS 必須仕様）。 [oai_citation:4‡developer.ebay.com](https://developer.ebay.com/support/kb-article?KBid=1063&utm_source=chatgpt.com)
  };

  const res = await ebay.trading.UploadSiteHostedPictures(xmlBody, {
    // hook でリクエストボディを multipart に差し替え（ライブラリの公式オプション） [oai_citation:5‡npmjs.com](https://www.npmjs.com/package/ebay-api)
    hook: (xml) => {
      const form = new FormData();
      // ※順序重要：先に XML、次に画像（Postman 事例） [oai_citation:6‡community.ebay.com](https://community.ebay.com/t5/Traditional-APIs-Search/Unable-to-submit-UploadSiteHostedPictures-with-Postman/td-p/33973345?utm_source=chatgpt.com)
      form.append('XML Payload', xml, { contentType: 'text/xml; charset=utf-8' });
      form.append('file', jpegBuffer, {
        filename: `${pictureName.replace(/[^\w.-]/g, '_')}.jpg`,
        contentType: 'image/jpeg',
      });
      return { body: form, headers: form.getHeaders() };
    },
  });

  const url = extractFirstUrl(res);
  if (!url) {
    // 生レスポンスが見たい場合: Render の環境変数に DEBUG=ebay:* を入れると詳細ログが出ます（ライブラリのデバッグ機能）。 [oai_citation:7‡GitHub](https://github.com/hendt/ebay-api)
    throw new Error('添付アップロードは成功しましたが URL を取得できません（FullURL/MemberURL 不在）');
  }
  return url;
};

/* ─ 公開 API ─ */
const uploadPictureFromUrl = async (imageUrl, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const publicUrl = toDirectPublicUrl(imageUrl);

  // 1) まず ExternalPictureURL（公式にも許可されているルート） [oai_citation:8‡developer.ebay.com](https://developer.ebay.com/devzone/xml/docs/reference/ebay/uploadsitehostedpictures.html?utm_source=chatgpt.com)
  try {
    return await uploadViaExternalUrl(publicUrl, pictureName);
  } catch (_) {
    // 2) 失敗したらダウンロード→JPEG 正規化→添付アップロード
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
  // デバッグ/テスト用
  toDirectPublicUrl,
  fetchImageBuffer,
  normalizeToJpeg,
};
