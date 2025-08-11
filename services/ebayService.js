const axios = require('axios');

// eBay Trading APIのエンドポイント
const EBAY_API_URL = 'https://api.ebay.com/ws/api.dll';

/**
 * 画像データをeBayのサーバーにアップロードする関数 (axios版)
 * @param {Buffer} imageBuffer - 画像のバッファデータ
 * @returns {Promise<string>} - eBayから返された画像URL
 */
async function uploadPicture(imageBuffer) {
    // Trading API (UploadSiteHostedPictures) が要求するXML形式のリクエストボディを作成
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${process.env.EBAY_USER_TOKEN}</eBayAuthToken>
  </RequesterCredentials>
  <PictureName>CD_Image_From_App</PictureName>
  <PictureFormat>JPG</PictureFormat> 
  <PictureData>${imageBuffer.toString('base64')}</PictureData>
</UploadSiteHostedPicturesRequest>`;

    try {
        const response = await axios.post(EBAY_API_URL, xmlRequest, {
            headers: {
                'Content-Type': 'text/xml',
                'X-EBAY-API-COMPATIBILITY-LEVEL': '967', // APIのバージョン
                'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', // 呼び出すAPI機能名
                'X-EBAY-API-SITEID': '0', // サイトID (0はUS)
            },
        });

        // eBayからのXML応答をパースしてURLを取得
        const responseXml = response.data;
        if (responseXml.includes('<Ack>Success</Ack>')) {
            const match = responseXml.match(/<FullURL>(.*?)<\/FullURL>/);
            if (match && match[1]) {
                return match[1]; // 画像URLを返す
            }
        }

        // エラーがあった場合、その内容をログに出力
        const errorMatch = responseXml.match(/<LongMessage>(.*?)<\/LongMessage>/);
        const errorMessage = errorMatch ? errorMatch[1] : 'Unknown eBay API error after upload.';
        console.error('eBay API returned non-success Ack:', errorMessage);
        throw new Error(errorMessage);

    } catch (error) {
        console.error('eBay Picture Upload Request Error:', error.message);
        // axiosのエラーレスポンス詳細があれば表示
        if (error.response) {
            console.error('Detailed eBay Error Response:', error.response.data);
        }
        throw new Error('Failed to upload picture to eBay.');
    }
}

module.exports = { uploadPicture };

