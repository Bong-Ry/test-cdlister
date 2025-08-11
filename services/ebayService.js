// services/ebayService.js
const EbayApi = require('ebay-api');

const siteKey = process.env.EBAY_SITE || 'EBAY_US';
const ebay = new EbayApi({
  appId:  process.env.EBAY_APP_ID,
  certId: process.env.EBAY_CERT_ID,
  devId:  process.env.EBAY_DEV_ID,
  siteId: EbayApi.SiteId[siteKey] ?? EbayApi.SiteId.EBAY_US,
  sandbox: false,
  authToken: process.env.EBAY_AUTH_TOKEN ?? process.env.EBAY_USER_TOKEN
});

async function uploadPictureFromExternalUrl(imageUrl, name = 'CD_Image_From_App') {
  if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
    throw new Error(`Invalid image URL: ${imageUrl}`);
  }
  const res = await ebay.trading.UploadSiteHostedPictures({
    ExternalPictureURL: imageUrl,
    PictureName: name
  });
  return res.SiteHostedPictureDetails.FullURL;
}

async function uploadPictureFromBuffer(imageBuffer, name = 'CD_Image_From_App') {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('imageBuffer must be a non-empty Buffer');
  }
  const res = await ebay.trading.UploadSiteHostedPictures({
    PictureName: name,
    PictureData: imageBuffer.toString('base64') // SDK側でMIME組み立て
  });
  return res.SiteHostedPictureDetails.FullURL;
}

/** 後方互換用：呼び出し側が uploadPicture(...) のままでも動く */
async function uploadPicture(src, name) {
  if (Buffer.isBuffer(src)) return uploadPictureFromBuffer(src, name);
  if (typeof src === 'string') return uploadPictureFromExternalUrl(src, name);
  throw new Error('uploadPicture: expected a Buffer or an https URL string');
}

module.exports = {
  ebay,
  uploadPicture,                    // ← 既存呼び出し用
  uploadPictureFromExternalUrl,
  uploadPictureFromBuffer
};
