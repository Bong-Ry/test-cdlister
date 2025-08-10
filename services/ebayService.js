const eBay = require('ebay-api');

// Renderの環境変数からAPIキーを読み込む設定
const ebay = new eBay({
    clientID: process.env.EBAY_APP_ID,
    clientSecret: process.env.EBAY_CERT_ID,
    devid: process.env.EBAY_DEV_ID,
    body: {
        requesterCredentials: {
            eBayAuthToken: process.env.EBAY_USER_TOKEN
        }
    }
});

/**
 * 画像データをeBayのサーバーにアップロードする関数
 * @param {Buffer} imageBuffer - 画像のバッファデータ
 * @returns {Promise<string>} - eBayから返された画像URL
 */
async function uploadPicture(imageBuffer) {
    try {
        const response = await ebay.trading.UploadSiteHostedPictures({
            PictureName: 'CD_Image_From_App',
            PictureData: imageBuffer.toString('base64'), // 画像データをBase64形式に変換
        });

        // 成功した場合、eBayの画像URLを返す
        return response.SiteHostedPictureDetails.FullURL;

    } catch (error) {
        console.error('eBay Picture Upload Error:', error);
        // エラーの詳細を表示
        if (error.meta && error.meta.res && error.meta.res.Errors) {
            console.error(JSON.stringify(error.meta.res.Errors, null, 2));
        }
        throw new Error('Failed to upload picture to eBay.');
    }
}

module.exports = { uploadPicture };
