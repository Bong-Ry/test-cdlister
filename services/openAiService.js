const OpenAI = require('openai');

// クライアント初期化時にタイムアウトを設定
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, 
    timeout: 120 * 1000, // タイムアウトを120秒（2分）に設定
});

// ★★★ 修正点：プロンプトを新しい軽量フォーマットに変更 ★★★
const PROMPT_TEXT = `
You are a professional CD appraiser.
From the provided images, identify the CD and output its details in a single line of pipe-separated (|) text.
Do not use JSON. Translate all information into English.

The order MUST be exactly as follows:
Title|Artist|Type|Genre|Style|RecordLabel|CatalogNumber|Format|Country|Released|Tracklist|isFirstEdition|hasBonus|editionNotes|DiscogsUrl|MPN

- Tracklist: All tracks in a single comma-separated string (e.g., "1. Track A, 2. Track B, 3. Track C").
- isFirstEdition, hasBonus: Output as true/false.
- Do not include headers or any other text. Only the single pipe-separated line.
`;

async function analyzeCd(imageBuffers) {
    if (!imageBuffers || imageBuffers.length === 0) {
        throw new Error('No image data provided.');
    }

    const imageMessages = imageBuffers.map(buffer => {
        return {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` },
        };
    });
    
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPT_TEXT },
                        ...imageMessages,
                    ],
                },
            ],
            // ★★★ 修正点：JSONモードをオフにする ★★★
            // response_format: { type: "json_object" }, 
        });

        const content = response.choices[0].message.content;
        
        // ★★★ 修正点：JSON.parseをせず、生のテキストをそのまま返す ★★★
        if (!content) {
            throw new Error('OpenAI returned empty content.');
        }
        return content;

    } catch (error) {
        console.error('OpenAI API Call Error:', error.message);
        throw new Error('Failed to analyze with OpenAI API.');
    }
}

module.exports = { analyzeCd };
