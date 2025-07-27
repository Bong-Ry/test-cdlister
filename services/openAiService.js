const OpenAI = require('openai');

// Load API key from Render's environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, 
});

// Prompt tailored to CD requirements with stronger English translation enforcement
const PROMPT_TEXT = `
You are a professional CD appraiser.
From the provided images of the CD jacket, obi, and disc, please identify only one specific CD by referencing the Discogs database.
Then, output all items in English according to the following JSON format. If the original data is in another language, you MUST translate it to English.

- Title: The official title of the album or single. This MUST be translated into English.
- Artist: The artist's name in Roman characters.
- Type: Automatically determine if this CD is an "Album" or a "Single".
- Genre: The music genre.
- Style: A more detailed music style.
- RecordLabel: The name of the record label.
- CatalogNumber: The catalog number.
- Format: Detailed format like "CD, Album, Reissue".
- Country: The country where it was released.
- Released: The release year (in A.D.).
- Tracklist: List all tracks in the format "1. Track Name 1, 2. Track Name 2, 3. Track Name 3...". All track names MUST be translated into English.
- isFirstEdition: Automatically determine if it is a first press limited edition with true/false.
- hasBonus: Automatically determine if it comes with bonuses (bonus tracks, stickers, etc.) with true/false.
- editionNotes: Supplementary information about the first edition or bonuses (e.g., "First Press Limited Edition with bonus sticker.").
- DiscogsUrl: The exact Discogs URL referenced during identification.
- MPN: Output the same value as CatalogNumber.

Please be sure to respond in the specified JSON format. Do not include any other text.
`;

async function analyzeCd(imageBuffers) {
    if (!imageBuffers || imageBuffers.length === 0) {
        throw new Error('No image data provided.');
    }

    // Convert image data to Base64 format
    const imageMessages = imageBuffers.map(buffer => {
        return {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` },
        };
    });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Specify a high-performance and cost-effective model
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
        throw new Error('Failed to analyze with OpenAI API.');
    }
}

// Export for use in other files
module.exports = { analyzeCd };
