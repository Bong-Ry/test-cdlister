const OpenAI = require('openai');

// Load API key from Render's environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, 
});

// Prompt tailored to CD requirements with stronger English translation enforcement and a clear example.
const PROMPT_TEXT = `
You are a professional CD appraiser. From the provided images, identify one specific CD by referencing the Discogs database.
Output all items in English, separated by a single '|' character.
The order of the items MUST be exactly as follows:
Title|Artist|Type|Genre|Style|RecordLabel|CatalogNumber|Format|Country|Released|Tracklist|isFirstEdition|hasBonus|editionNotes|DiscogsUrl|MPN

- Title: Official title. Translate to English if necessary.
- Artist: Artist's name in Roman characters.
- Type: "Album" or "Single".
- Genre: Music genre.
- Style: Detailed music style.
- RecordLabel: Record label name.
- CatalogNumber: Catalog number.
- Format: e.g., "CD, Album, Reissue".
- Country: Release country.
- Released: Release year (A.D.).
- Tracklist: All track names in the format "1. Track Name 1, 2. Track Name 2...". Translate to English.
- isFirstEdition: true/false.
- hasBonus: true/false.
- editionNotes: Supplementary info (e.g., "First Press Limited Edition with bonus sticker."). Leave empty if none.
- DiscogsUrl: The exact Discogs URL.
- MPN: Same value as CatalogNumber.

Here is an example of a perfect response:
Quintet for Winds, Op. 26|Arnold Schönberg|Album|Classical|Modern|Deutsche Grammophon|MG 1072|CD, Album|Japan|1970|1. Schwungvoll, 2. Anmutig und heiter|false|false||https://www.discogs.com/release/2970217|MG 1072

Do not include any other text, explanations, or formatting. Only provide the single line of pipe-separated values.
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
        });

        const content = response.choices[0].message.content;
        return content;

    } catch (error) {
        console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
        throw new Error('Failed to analyze with OpenAI API.');
    }
}

module.exports = { analyzeCd };

