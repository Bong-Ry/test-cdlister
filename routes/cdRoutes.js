const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');

const descriptionTemplate = ({ aiData, userInput }) => {
    const tracklistHtml = aiData.Tracklist 
        ? aiData.Tracklist.split(', ').map(track => `<li>${track.replace(/^\d+\.\s*/, '')}</li>`).join('') 
        : '<li>N/A</li>';

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; color: #333;">
        <h1 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; font-size: 24px;">${userInput.title}</h1>
        <div style="display: flex; flex-wrap: wrap; margin-top: 20px;">
            <div style="flex: 1; min-width: 300px; padding: 10px;">
                <h2 style="color: #2c5282; font-size: 20px;">Condition</h2>
                <ul style="list-style-type: disc; padding-left: 20px;">
                    <li style="margin-bottom: 10px;">Case: ${userInput.conditionCase}</li>
                    <li style="margin-bottom: 10px;">CD: ${userInput.conditionCd}</li>
                    <li style="margin-bottom: 10px;">OBI: ${userInput.conditionObi}</li>
                </ul>
                <h2 style="color: #2c5282; font-size: 20px;">Key Features</h2>
                <ul style="list-style-type: disc; padding-left: 20px;">
                    <li style="margin-bottom: 10px;">${userInput.comment || aiData.editionNotes || 'Please check the images for details.'}</li>
                    <li style="margin-bottom: 10px;">Artist: ${aiData.Artist || 'N/A'}</li>
                    <li style="margin-bottom: 10px;">Format: ${aiData.Format || 'CD'}</li>
                    <li style="margin-bottom: 10px;">Genre: ${aiData.Genre || 'N/A'}</li>
                </ul>
            </div>
            <div style="flex: 1; min-width: 300px; padding: 10px;">
                <h2 style="color: #2c5282; font-size: 20px;">Tracklist</h2>
                <ol style="list-style-type: decimal; padding-left: 20px;">
                    ${tracklistHtml}
                </ol>
                <h2 style="color: #2c5282; font-size: 20px;">Specifications</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tbody>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Brand</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${aiData.RecordLabel || 'No Brand'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Country</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${aiData.Country || 'Japan'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h2 style="color: #2c5282; font-size: 20px;">Product Description</h2>
            <p style="line-height: 1.6;">If you have any questions or request about items, please feel free to ask us. Thank you!</p>
            <h2 style="color: #2c5282; font-size: 20px; margin-top: 20px;">Shipping</h2>
            <p>Shipping by FedEx, DHL, or EMS.</p>
            <h2 style="color: #2c5282; font-size: 20px; margin-top: 20px;">International Buyers - Please Note:</h2>
            <p>Import duties, taxes, and charges are not included in the item price or shipping cost. These charges are the buyer's responsibility. Please check with your country's customs office to determine what these additional costs will be prior to bidding or buying.</p>
            <p>Thank you for your understanding.</p>
        </div>
    </div>`;
    return html.replace(/\s{2,}/g, ' ').replace(/\n/g, '');
};

const generateCsv = (records) => {
    const headers = [
        "Action(CC=Cp1252)", "CustomLabel", "StartPrice", "ConditionID", "Title", "Description", "C:Brand", "PicURL",
        "UPC", "Category", "PayPalAccepted", "PayPalEmailAddress", "PaymentProfileName", "ReturnProfileName", "ShippingProfileName",
        "Country", "Location", "Apply Profile Domestic", "Apply Profile International", "BuyerRequirements:LinkedPayPalAccount",
        "Duration", "Format", "Quantity", "Currency", "SiteID", "C:Country", "BestOfferEnabled", "C:Artist", "C:Release Title",
        "C:Format", "C:Genre", "C:Record Label", "C:Edition", "C:Style", "C:Type", "C:Color", "C:Release Year",
        "C:CD Grading", "C:Case Type", "C:Case Condition", "C:Inlay Condition", "C:Country/Region of Manufacture",
        "C:Features", "C:Producer", "C:Language", "C:Instrument", "C:Occasion", "C:Era", "C:Composer", "C:Conductor",
        "C:Performer Orchestra", "C:Run Time", "C:MPN", "C:California Prop 65 Warning", "C:Catalog Number",
        "C:Unit Quantity", "C:Unit Type", "StoreCategory", "__keyValuePairs"
    ];
    const headerRow = headers.join(',');

    const rows = records.filter(r => r.status === 'saved').map(r => {
        const { aiData, userInput, allImageUrls, customLabel } = r;

        const shippingCost = parseFloat(userInput.shipping);
        const shippingProfileName = `#${shippingCost}USD-DHL FedEx 00.00 - 06.50kg`;
        
        const conditionId = userInput.conditionId;

        const picURLs = allImageUrls.map(url => {
            const fileId = url.split('/d/')[1].split('/')[0];
            return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }).join('|');
        
        // ★★★ タイトル生成ロジックの修正 ★★★
        const titleParts = [
            aiData.Title, // AIで抽出したタイトル
            aiData.Artist
        ];
        if (userInput.conditionObi !== 'なし') {
            titleParts.push('w/obi');
        }
        const newTitle = titleParts.join(' ');


        const data = {
            "Action(CC=Cp1252)": "Add",
            "CustomLabel": customLabel,
            "StartPrice": userInput.price,
            "ConditionID": conditionId,
            "Title": newTitle, // ★★★ 修正後のタイトル ★★★
            "Description": descriptionTemplate({ aiData, userInput }),
            "C:Brand": aiData.RecordLabel || "No Brand",
            "PicURL": picURLs,
            "UPC": "NA",
            "Category": "176984",
            "PayPalAccepted": "1",
            "PayPalEmailAddress": "payAddress",
            "PaymentProfileName": "buy it now",
            "ReturnProfileName": "Seller 60days",
            "ShippingProfileName": shippingProfileName,
            "Country": "JP",
            "Location": "417-0816, Fuji Shizuoka",
            "Apply Profile Domestic": "0.0",
            "Apply Profile International": "0.0",
            "BuyerRequirements:LinkedPayPalAccount": "0.0",
            "Duration": "GTC",
            "Format": "FixedPriceItem",
            "Quantity": "1",
            "Currency": "USD",
            "SiteID": "US",
            "C:Country": "Japan",
            "BestOfferEnabled": "0",
            "C:Artist": aiData.Artist,
            "C:Release Title": aiData.Title,
            "C:Format": aiData.Format,
            "C:Genre": aiData.Genre,
            "C:Record Label": aiData.RecordLabel,
            "C:Edition": aiData.isFirstEdition ? 'Limited Edition' : '',
            "C:Style": aiData.Style,
            "C:Type": aiData.Type,
            "C:Color": "NA",
            "C:Release Year": aiData.Released,
            "C:CD Grading": userInput.conditionCd,
            "C:Case Type": "Jewel Case: Standard",
            "C:Case Condition": userInput.conditionCase,
            "C:Inlay Condition": userInput.conditionObi,
            "C:Country/Region of Manufacture": aiData.Country,
            "C:Features": userInput.conditionObi !== 'なし' ? 'OBI' : '',
            "C:Producer": "NA", "C:Language": "NA", "C:Instrument": "NA", "C:Occasion": "NA", "C:Era": "NA",
            "C:Composer": "NA", "C:Conductor": "NA", "C:Performer Orchestra": "NA", "C:Run Time": "NA",
            "C:MPN": aiData.MPN,
            "C:California Prop 65 Warning": "NA",
            "C:Catalog Number": aiData.CatalogNumber,
            "C:Unit Quantity": "", "C:Unit Type": "",
            "StoreCategory": userInput.storeCategory,
            "__keyValuePairs": "[object Object]"
        };
        return headers.map(h => `"${(data[h] || '').toString().replace(/"/g, '""')}"`).join(',');
    });

    return [headerRow, ...rows].join('\r\n');
};

module.exports = (sessions) => {
    const router = express.Router();

    router.get('/', (req, res) => res.render('index'));

    router.get('/categories', async (req, res) => {
        try {
            const categories = await driveService.getStoreCategories();
            res.json(categories);
        } catch (error) {
            console.error('Category fetch error:', error.message);
            res.status(500).json({ error: 'Failed to retrieve categories' });
        }
    });

    // ★★★ 送料情報を取得するAPIエンドポイントを追加 ★★★
    router.get('/shipping-costs', async (req, res) => {
        try {
            const shippingCosts = await driveService.getShippingCosts();
            res.json(shippingCosts);
        } catch (error) {
            console.error('Shipping costs fetch error:', error.message);
            res.status(500).json({ error: 'Failed to retrieve shipping costs' });
        }
    });

    router.post('/process', async (req, res) => {
        const parentFolderUrl = req.body.parentFolderUrl;
        if (!parentFolderUrl) return res.redirect('/');

        const sessionId = uuidv4();
        sessions.set(sessionId, { status: 'processing', records: [] });
        res.render('results', { sessionId });

        (async () => {
            const session = sessions.get(sessionId);
            try {
                const processedCount = await driveService.countProcessedSubfolders(parentFolderUrl);
                const subfolders = await driveService.getUnprocessedSubfolders(parentFolderUrl);
                if (subfolders.length === 0) throw new Error('処理対象のフォルダが見つかりません。「済」がついていないフォルダがあるか確認してください。');

                const d = new Date();
                const yy = d.getFullYear().toString().slice(-2);
                const mm = (d.getMonth() + 1).toString().padStart(2, '0');
                const dd = d.getDate().toString().padStart(2, '0');
                const datePrefix = `C${yy}${mm}${dd}`;

                session.records = subfolders.slice(0, 10).map((f, index) => {
                    const customLabelNumber = (processedCount + index + 1).toString().padStart(4, '0');
                    return {
                        id: uuidv4(),
                        folderId: f.id,
                        folderName: f.name,
                        status: 'pending',
                        customLabel: `${datePrefix}_${customLabelNumber}`
                    };
                });

                for (const record of session.records) {
                    try {
                        const analysisFiles = await driveService.getImagesForAnalysis(record.folderId);
                        const imageBuffers = await Promise.all(analysisFiles.map(f => driveService.downloadFile(f.id)));
                        
                        const aiData = await aiService.analyzeCd(imageBuffers);
                        
                        const allFiles = await driveService.getAllImageFiles(record.folderId);
                        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
                        const m = allFiles.filter(f => f.name.startsWith('M')).sort((a,b) => collator.compare(a.name, b.name));
                        const j = allFiles.filter(f => f.name.startsWith('J')).sort((a,b) => collator.compare(a.name, b.name));
                        const d = allFiles.filter(f => f.name.startsWith('D')).sort((a,b) => collator.compare(a.name, b.name));
                        
                        const allImageUrls = [...m, ...j, ...d].map(f => `https://drive.google.com/file/d/${f.id}/view`);

                        const j1File = j.find(f => f.name.startsWith('J1_'));
                        if (j1File) {
                            aiData.J1_FileId = j1File.id;
                        } else if (j.length > 0) {
                            aiData.J1_FileId = j[0].id;
                        }

                        Object.assign(record, { status: 'success', aiData, allImageUrls });

                    } catch (err) {
                        Object.assign(record, { status: 'error', error: err.message });
                    }
                }
                session.status = 'completed';
            } catch (err) {
                session.status = 'error';
                session.error = err.message;
            }
        })();
    });

    router.get('/status/:sessionId', (req, res) => {
        res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' });
    });

    router.post('/save/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session?.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        
        record.userInput = req.body;
        record.status = 'saved';
        
        await driveService.renameFolder(record.folderId, `済 ${record.folderName}`);
        res.json({ status: 'ok' });
    });

    router.get('/csv/:sessionId', (req, res) => {
        const session = sessions.get(req.params.sessionId);
        if (!session) return res.status(404).send('Session not found');

        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        const date = `${yyyy}${mm}${dd}`;
        const fileName = `CD_${date}.csv`;
        
        res.header('Content-Type', 'text/csv; charset=UTF-8');
        res.attachment(fileName);
        res.send('\uFEFF' + generateCsv(session.records));
    });

    router.get('/image/:fileId', async (req, res) => {
        try {
            const imageStream = await driveService.getImageStream(req.params.fileId);
            imageStream.pipe(res);
        } catch (error) {
            console.error('Image fetch error:', error);
            res.status(404).send('Image not found');
        }
    });

    return router;
};
