const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- CD用のプロンプト ---
const CD_PROMPT_TEXT = `
あなたはプロのCD鑑定士です。
提供されたCDのジャケットやディスクの画像から、Discogsのデータベースを参照して、このCDを1件だけ特定してください。
そして、以下のJSON形式に従って、すべての項目を英語で出力してください。
もし日本語の情報が見つかった場合は、必ず自然な英語に翻訳してください。日本語は一切含めないでください。

- Title: アルバムのタイトル。必ず英語で表記してください。
- Artist: アーティスト名。必ず英語（ローマ字）で表記してください。
- Type: このCDが「Album」か「Single」かを判断して、どちらかの文字列を出力してください。
- Genre: 音楽ジャンル。必ず英語で表記してください。
- Style: より詳細な音楽スタイル。必ず英語で表記してください。
- RecordLabel: レーベル名。
- CatalogNumber: カタログ番号。
- Format: "CD, Album, Reissue" のような詳細なフォーマット。
- Country: リリース国。
- Released: リリース年。
- Tracklist: 1, 2, 3...の形式で全トラックリストを記載。曲名も必ず英語に翻訳してください。
- isFirstEdition: 画像や情報から、これが初回版（First Edition / First Press）であるかをtrueかfalseで判断してください。
- hasBonus: 特典（Bonus Track / Bookletなど）が含まれているかをtrueかfalseで判断してください。
- editionNotes: 初回版や特典に関する補足情報を簡潔に英語で記載してください。なければ空欄にしてください。
- DiscogsUrl: 特定したDiscogsのURL。
- MPN: カタログ番号と同じで可。

必ず指定されたJSONフォーマットで回答してください。他のテキストは含めないでください。
`;

// CDの情報を解析する唯一の関数
async function analyzeCd(imageBuffers) {
    if (!imageBuffers || imageBuffers.length === 0) {
        throw new Error('画像データがありません。');
    }

    const imageMessages = imageBuffers.map(buffer => {
        const base64Image = buffer.toString('base64');
        return {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
        };
    });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: CD_PROMPT_TEXT },
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

module.exports = { 
    analyzeCd
};

