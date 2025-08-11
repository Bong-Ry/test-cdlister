const eBay = require('ebay-api');

// Renderの環境変数からAPIキーを読み込む設定
const ebay = new eBay({
    clientID: process.env.EBAY_APP_ID,
    clientSecret: process.env.EBAY_CERT_ID,
    devid: process.env.EBAY_DEV_ID,
    body: {
        // ebay-apiライブラリの仕様に合わせて、トークンは直接リクエストに含めます
    }
});

/**
 * 画像データをeBayのサーバーにアップロードする関数
 * @param {Buffer} imageBuffer - 画像のバッファデータ
 * @returns {Promise<string>} - eBayから返された画像URL
 */
async function uploadPicture(imageBuffer) {
    try {
        // Trading APIのUploadSiteHostedPicturesを呼び出す
        const response = await ebay.trading.UploadSiteHostedPictures({
            // リクエストごとにAuthTokenを渡す
            RequesterCredentials: {
                eBayAuthToken: process.env.EBAY_USER_TOKEN
            },
            PictureName: 'CD_Image_From_App',
            PictureData: imageBuffer.toString('base64'), // 画像データをBase64形式に変換
        });

        // 成功した場合、eBayの画像URLを返す
        if (response.Ack === 'Success' && response.SiteHostedPictureDetails && response.SiteHostedPictureDetails.FullURL) {
            return response.SiteHostedPictureDetails.FullURL;
        } else {
            // APIから成功以外のレスポンスが返ってきた場合
            const errorMessage = response.Errors ? response.Errors.map(e => e.LongMessage).join(', ') : 'Unknown eBay API error';
            throw new Error(errorMessage);
        }

    } catch (error) {
        console.error('eBay Picture Upload Error:', error);
        // エラーオブジェクトに詳細情報が含まれている場合、それを表示
        if (error.meta && error.meta.res && error.meta.res.Errors) {
            console.error('Detailed eBay Error:', JSON.stringify(error.meta.res.Errors, null, 2));
        }
        throw new Error('Failed to upload picture to eBay.');
    }
}

module.exports = { uploadPicture };

