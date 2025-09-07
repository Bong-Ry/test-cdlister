const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// PromptをJSON形式に変更し、価格相場取得と再検索の指示を追加
const PROMPT_TEXT = `
You are a professional CD appraiser. From the provided images, identify one specific CD by referencing the Discogs database.
Then, output all items in the following JSON format. All text must be in English.

{
  "Title": "Official album title. Translate to English if necessary.",
  "Artist": "Artist's name in Roman characters.",
  "MarketPrice": "Based on Discogs and eBay history, describe the realistic market price in USD. Example: '15-25 USD'. If unknown, specify 'N/A'.",
  "Type": "'Album' or 'Single'.",
  "Genre": "Main music genre.",
  "Style": "Detailed music style.",
  "RecordLabel": "Record label name.",
  "CatalogNumber": "Catalog number.",
  "Format": "e.g., 'CD, Album, Reissue, Stereo'.",
  "Country": "Release country.",
  "Released": "Release year (A.D.).",
  "Tracklist": "A JSON object with track numbers as keys and song titles as values. e.g., { \"1\": \"Track Name 1\", \"2\": \"Track Name 2\" }",
  "isFirstEdition": "true or false.",
  "hasBonus": "true or false.",
  "editionNotes": "Supplementary info (e.g., 'First Press Limited Edition with bonus sticker'). Leave empty if none.",
  "DiscogsUrl": "The exact Discogs URL.",
  "MPN": "Same value as CatalogNumber."
}

Constraints:
- If an 'excludeUrl' is provided, you must find a different release.
- Respond ONLY with the JSON object. Do not include any other text, explanations, or formatting.
`;

async function analyzeCd(imageBuffers, excludeUrl = null) {
    if (!imageBuffers || imageBuffers.length === 0) {
        throw new Error('No image data provided.');
    }

    const imageMessages = imageBuffers.map(buffer => {
        return {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` },
        };
    });

    let userPrompt = PROMPT_TEXT;
    if (excludeUrl) {
        userPrompt += `\nImportant: Exclude this URL from the search results: ${excludeUrl}`;
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        ...imageMessages,
                    ],
                },
            ],
            // JSONモードを有効化
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        // AIの応答がJSON文字列なのでパースして返す
        return JSON.parse(content);

    } catch (error) {
        console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
        throw new Error('Failed to analyze with OpenAI API.');
    }
}

module.exports = { analyzeCd };
