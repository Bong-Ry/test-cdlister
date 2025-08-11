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

/** 公開httpsの画像URLをEPSに取り込み、FullURLを返す */
async function uploadPictureFromExternalUrl(imageUrl, name = 'CD_Image_From_App') {
  if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
    throw new Error(`Invalid image URL: ${imageUrl}`);
  }
  const res = await ebay.trading.UploadSiteHostedPictures({
    ExternalPictureURL: imageUrl,
    PictureName: name
  });
  const url = res?.SiteHostedPictureDetails?.FullURL;
  if (!url) throw new Error('eBay did not return FullURL');
  return url;
}

module.exports = { ebay, uploadPictureFromExternalUrl };
