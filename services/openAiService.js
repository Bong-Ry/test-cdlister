const OpenAI = require('openai');
const config = require('../config'); // APIキーを読み込む

const openai = new OpenAI({
    apiKey: config.openaiApiKey, // config.jsからキーを読み込む
});

// CDの要件に合わせたプロンプト
const PROMPT_TEXT = `
あなたはプロのCD鑑定士です。
提供されたCDのジャケットや帯、盤面の画像から、Discogsのデータベースを参照して、このCDを1件だけ特定してください。
そして、以下のJSON形式に従って、すべての項目を英語で出力してください。

- Title: アルバムまたはシングルの正式タイトル。
- Artist: アーティストのローマ字表記。
- Type: このCDが "Album" か "Single" かを自動で判別。
- Genre: 音楽ジャンル。
- Style: より詳細な音楽スタイル。
- RecordLabel: レーベル名。
- CatalogNumber: カタログ番号。
- Format: "CD, Album, Reissue" のような詳細なフォーマット。
- Country: リリースされた国。
- Released: リリース年（西暦）。
- Tracklist: "1. 曲名1, 2. 曲名2, 3. 曲名3..." という形式で全トラックリストを記載。
- isFirstEdition: 初回限定版かどうかを true/false で自動判別。
- hasBonus: 特典（ボーナストラック、ステッカー等）付きかどうかを true/false で自動判別。
- editionNotes: 初回版や特典に関する補足情報（例: "First Press Limited Edition with bonus sticker."）。
- DiscogsUrl: 特定の際に参照したDiscogsの正確なURL。
- MPN: CatalogNumberと同じ値を出力。

必ず指定されたJSONフォーマットで回答してください。他のテキストは含めないでください。
`;

async function analyzeCd(imageBuffers) {
    if (!imageBuffers || imageadoras.length === 0) {
        throw new Error('画像データがありません。');
    }

    // 画像データをBase64形式に変換
    const imageMessages = imageBuffers.map(buffer => {
        return {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` },
        };
    });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // 高性能かつ安価なモデルを指定
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPT_TEXT },
                        ...imageMessages,
                    ],
                },
            ],
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);

    } catch (error) {
        console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
        throw new Error('OpenAI APIでの解析に失敗しました。');
    }
}

// 他のファイルで使えるようにエクスポート
module.exports = { analyzeCd };
