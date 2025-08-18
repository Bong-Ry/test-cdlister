'use strict';

const eBayApi = require('ebay-api');
const axios = require('axios');
const sharp = require('sharp');

const EBAY_PICTURE_SYSTEM_VERSION = 2;
const MAX_BYTES = 25 * 1024 * 1024; // 25MB 上限（十分な余裕）
const DEFAULT_PIC_NAME = 'CD_Image_From_App';

const imageMagics = [
  { fmt: 'jpeg', sig: [0xff, 0xd8, 0xff], mime: 'image/jpeg', ext: '.jpg' },
  { fmt: 'png',  sig: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png', ext: '.png' },
  { fmt: 'gif',  sig: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif', ext: '.gif' },
  // WEBP: "RIFF....WEBP"
  { fmt: 'webp', sig: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp', ext: '.webp', tail: 'WEBP' },
  // HEIC/HEIF は多様な箱識別子を持つため後段の sharp 判定で吸収
];

const isHtmlMagic = (buf) =>
  buf.length >= 6 &&
  buf[0] === 0x3c && // '<'
  (String.fromCharCode(buf[1]) === 'h' || String.fromCharCode(buf[1]) === 'H');

/* ──────────────────────────────────────────────────────────────────────────
 * eBay クライアント
 * ────────────────────────────────────────────────────────────────────────── */
const getEbay = () => {
  // 必要な環境変数: EBAY_APP_ID / EBAY_CERT_ID / EBAY_DEV_ID(任意) / EBAY_AUTH_TOKEN
  const ebay = eBayApi.fromEnv();
  if (!ebay || !ebay.trading) {
    throw new Error('eBay 環境変数が不足しています（EBAY_APP_ID / EBAY_CERT_ID / EBAY_AUTH_TOKEN など）。');
  }
  return ebay;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 共有URL → 直リンク変換（Google Drive / Dropbox など）
 * ────────────────────────────────────────────────────────────────────────── */
const toDirectPublicUrl = (urlRaw) => {
  if (!urlRaw) return urlRaw;
  const url = String(urlRaw).trim();

  // Google Drive
  // - 形式1: https://drive.google.com/file/d/<ID>/view?usp=sharing
  // - 形式2: https://drive.google.com/open?id=<ID>
  // → 直リンク: https://drive.google.com/uc?export=download&id=<ID>
  {
    const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    const id = m1?.[1] || m2?.[1];
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }

  // Dropbox
  // - 共有URL: https://www.dropbox.com/s/xxxx/filename.jpg?dl=0
  // → 直リンク: dl=1
  if (url.includes('dropbox.com/')) {
    if (url.includes('?')) return url.replace(/dl=\d/, 'dl=1');
    return `${url}?dl=1`;
  }

  // OneDrive (短縮対応・単純化): ?download=1 を強制
  if (url.includes('1drv.ms') || url.includes('sharepoint.com')) {
    if (url.includes('?')) return `${url}&download=1`;
    return `${url}?download=1`;
  }

  return url;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 画像ダウンロード & バイト検証
 * ────────────────────────────────────────────────────────────────────────── */
const fetchImageBuffer = async (url) => {
  const direct = toDirectPublicUrl(url);
  const res = await axios.get(direct, {
    responseType: 'arraybuffer',
    maxContentLength: MAX_BYTES,
    validateStatus: (s) => s >= 200 && s < 400, // リダイレクト踏破可
  });

  const buf = Buffer.from(res.data);
  if (!buf || buf.length === 0) {
    throw new Error('画像が 0 バイトです。');
  }

  // content-type チェック
  const ctype = String(res.headers['content-type'] || '').split(';')[0].trim();
  if (!ctype.startsWith('image/')) {
    // HTML 等の場合は明示
    if (isHtmlMagic(buf)) {
      throw new Error(`画像ではなく HTML が返却されています（認証/アクセス権や直リンクの可能性）。content-type=${ctype}`);
    }
    // 一部 CDN は content-type を付けない場合があるため、後段でマジック確認へ
  }
  return buf;
};

const sniffImage = (buf) => {
  for (const m of imageMagics) {
    const sig = m.sig;
    if (buf.length >= sig.length && sig.every((b, i) => buf[i] === b)) {
      if (m.fmt === 'webp' && buf.length >= 16) {
        const tail = buf.slice(8, 12).toString('ascii');
        if (tail === 'WEBP') return m; // 正当な WEBP
        continue;
      }
      return m;
    }
  }
  return null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * 正規化（sharpでJPEGへ再エンコード）
 * ────────────────────────────────────────────────────────────────────────── */
const normalizeToJpeg = async (buf) => {
  try {
    const meta = await sharp(buf, { pages: -1 }).metadata();
    // アニメーションや多ページは1枚目にフォールバック
    const needsJpeg =
      meta.format !== 'jpeg' ||
      Boolean(meta.hasAlpha) ||
      (typeof meta.pages === 'number' && meta.pages > 1);

    if (needsJpeg) {
      // 透過は白背景に合成して JPEG 化
      let pipeline = sharp(buf);
      if (meta.hasAlpha) {
        pipeline = pipeline.flatten({ background: '#ffffff' });
      }
      return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    }
    // そのまま JPEG の場合
    return buf;
  } catch (e) {
    // sharp が読めない＝壊れ/非対応
    throw new Error(`画像が読み取れません（破損/非対応形式の可能性）: ${e.message}`);
  }
};

/* ──────────────────────────────────────────────────────────────────────────
 * eBay へのアップロード
 * ────────────────────────────────────────────────────────────────────────── */
const uploadViaExternalUrl = async (publicUrl, pictureName = DEFAULT_PIC_NAME) => {
  const ebay = getEbay();
  const res = await ebay.trading.UploadSiteHostedPictures({
    PictureName: pictureName,
    PictureSystemVersion: EBAY_PICTURE_SYSTEM_VERSION,
    ExternalPictureURL: publicUrl,
  });
  const details = res?.SiteHostedPictureDetails;
  const full = details?.FullURL || details?.BaseURL;
  if (!full) throw new Error('eBay 応答に画像URLが含まれていません。');
  return full;
};

const uploadViaAttachment = async (jpegBuffer, pictureName = DEFAULT_PIC_NAME) => {
  const ebay = getEbay();

  // 一部バージョン差異を吸収するため、attachments の形を2通りで試す
  const xml = {
    PictureName: pictureName,
    PictureSystemVersion: EBAY_PICTURE_SYSTEM_VERSION,
  };

  // 1) もっとも一般的: Buffer を配列で渡す
  try {
    const res = await ebay.trading.UploadSiteHostedPictures(xml, { attachments: [jpegBuffer] });
    const details = res?.SiteHostedPictureDetails;
    const full = details?.FullURL || details?.BaseURL;
    if (!full) throw new Error('No FullURL');
    return full;
  } catch (e1) {
    // 2) オブジェクト形式（filename/mime 同梱）
    try {
      const res = await ebay.trading.UploadSiteHostedPictures(xml, {
        attachments: [
          {
            data: jpegBuffer,
            filename: `${pictureName.replace(/[^\w.-]/g, '_')}.jpg`,
            mimeType: 'image/jpeg',
          },
        ],
      });
      const details = res?.SiteHostedPictureDetails;
      const full = details?.FullURL || details?.BaseURL;
      if (!full) throw new Error('No FullURL');
      return full;
    } catch (e2) {
      // 呼び出し形不一致 or eBay 側エラー
      const cause = e2?.meta?.Errors?.LongMessage || e1?.meta?.Errors?.LongMessage || e2.message || e1.message;
      throw new Error(`添付アップロードに失敗しました: ${cause}`);
    }
  }
};

/* ──────────────────────────────────────────────────────────────────────────
 * 公開 API
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 公開URLから eBay へアップロード
 * 1) ExternalPictureURL（直接取り込み）
 * 2) 失敗時: ダウンロード→JPEG 正規化→添付アップロード
 */
const uploadPictureFromUrl = async (imageUrl, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const publicUrl = toDirectPublicUrl(imageUrl);

  // まず直接取り込み（最速/安定）
  try {
    return await uploadViaExternalUrl(publicUrl, pictureName);
  } catch (e) {
    // 直取り込みが失敗（非公開/HTML/認証付き 等）の場合は添付に切り替え
  }

  const raw = await fetchImageBuffer(publicUrl);
  // 簡易マジック判定（HTML・未知バイナリの弾き）
  const magic = sniffImage(raw);
  if (!magic && !isHtmlMagic(raw)) {
    // content-type が不明でも sharp が読めるなら続行
    // ここでは何もしない（下で sharp が判定）
  } else if (isHtmlMagic(raw)) {
    throw new Error('画像ではなく HTML が返却されました（直リンク化・公開権限をご確認ください）。');
  }

  const jpeg = await normalizeToJpeg(raw);
  return uploadViaAttachment(jpeg, pictureName);
};

/**
 * バッファから eBay へアップロード（アプリ内生成/既取得の画像向け）
 * 常に JPEG へ正規化してから添付アップロード
 */
const uploadPictureFromBuffer = async (buffer, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const jpeg = await normalizeToJpeg(buffer);
  return uploadViaAttachment(jpeg, pictureName);
};

module.exports = {
  uploadPictureFromUrl,
  uploadPictureFromBuffer,
  // ユニットテスト/デバッグ用にエクスポート
  toDirectPublicUrl,
  fetchImageBuffer,
  normalizeToJpeg,
};
