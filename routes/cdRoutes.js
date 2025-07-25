const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');

const descriptionTemplate = (aiData, userInput) => {
    const tracklistHtml = aiData.Tracklist ? aiData.Tracklist.split(', ').map(track => `<div>${track.replace(/^\d+\.\s*/, '')}</div>`).join('') : 'N/A';
    const conditionText = userInput.condition === '1000' ? 'New' : 'Used';

    const fullHtml = `
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<div style="background-color: #f8f8f8; border: 1px solid #ddd; padding: 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="font-size: 24px; color: #d35400; font-weight: bold;">${aiData.Title}</h1>
        <h2 style="font-size: 18px; color: #555; font-weight: normal;">${aiData.Artist}</h2>
    </div>

    <div style="border-top: 2px solid #d35400; padding-top: 15px;">
        <h3 style="font-size: 16px; color: #d35400; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Item Description</h3>
        <p>${userInput.comment || aiData.editionNotes || ''}</p>
        <p><b>Label:</b> ${aiData.RecordLabel}</p>
        <p><b>Catalog Number:</b> ${aiData.MPN}</p>
        <p><b>Country:</b> ${aiData.Country}</p>
        <p><b>Released:</b> ${aiData.Released}</p>
    </div>

    <div style="margin-top: 20px;">
        <h3 style="font-size: 16px; color: #d35400; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Condition</h3>
        <p><b>Disc:</b> ${conditionText}</p>
        <p><b>Case:</b> ${conditionText}</p>
        <p><b>OBI:</b> ${conditionText}</p>
    </div>

    <div style="margin-top: 20px;">
        <h3 style="font-size: 16px; color: #d35400; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Tracklist</h3>
        ${tracklistHtml}
    </div>
</div>
`;
    return fullHtml.replace(/\s{2,}/g, ' ').replace(/\n/g, '');
};


const generateCsv = (records) => {
    const headers = [
        "Action(SiteID=US|Country=JP|Currency=USD|Version=1197)", "CustomLabel", "ItemID", "ConditionID", "ConditionDescription", "Category", "StoreCategory", "Title",
        "SubTitle", "Relationship", "RelationshipDetails", "ListingDuration", "ListingType", "StartPrice", "BuyItNowPrice", "Quantity",
        "Location", "LotSize", "ApplicationData", "PicURL", "ShippingProfileName", "ReturnProfileName", "PaymentProfileName",
        "C:Artist", "C:Case Type", "C:Edition", "C:Format", "C:Genre", "C:Inlay Condition", "C:Record Label",
        "C:Release Title", "C:Release Year", "C:Style", "C:Type"
    ];
    const headerRow = headers.join(',');

    const rows = records.filter(r => r.status === 'saved').map(r => {
        const { aiData, userInput, allImageUrls, customLabel } = r;

        const shippingCost = parseFloat(userInput.shipping).toFixed(2);
        const shippingProfileName = `#${shippingCost}USD-DHL FedEx 00.00 - 06.50kg`;

        const data = {
            "Action(SiteID=US|Country=JP|Currency=USD|Version=1197)": "Add",
            "CustomLabel": customLabel,
            "ItemID": "",
            "ConditionID": userInput.condition,
            "ConditionDescription": descriptionTemplate(aiData, userInput),
            "Category": "176984",
            "StoreCategory": userInput.storeCategory,
            "Title": `【${userInput.condition === '1000' ? 'New' : 'Used'}】 ${userInput.title} ${aiData.Artist} ${aiData.MPN} CD ${aiData.Country} OBI`,
            "SubTitle": "",
            "Relationship": "",
            "RelationshipDetails": "",
            "ListingDuration": "GTC",
            "ListingType": "FixedPrice",
            "StartPrice": userInput.price,
            "BuyItNowPrice": "",
            "Quantity": "1",
            "Location": "Japan",
            "LotSize": "",
            "ApplicationData": "",
            "PicURL": allImageUrls.join('|'),
            "ShippingProfileName": shippingProfileName,
            "ReturnProfileName": "US-Return",
            "PaymentProfileName": "PAYPAL",
            "C:Artist": aiData.Artist,
            "C:Case Type": "Jewel Case: Standard",
            "C:Edition": aiData.isFirstEdition ? 'Limited Edition' : '',
            "C:Format": "CD",
            "C:Genre": aiData.Genre,
            "C:Inlay Condition": userInput.condition === '1000' ? "Mint (M)" : "Near Mint (NM or M-)",
            "C:Record Label": aiData.RecordLabel,
            "C:Release Title": aiData.Title,
            "C:Release Year": aiData.Released,
            "C:Style": aiData.Style,
            "C:Type": aiData.Type
        };
        return headers.map(h => `"${(data[h] || '').toString().replace(/"/g, '""')}"`).join(',');
    });

    return [headerRow, ...rows].join('\r\n');
};

module.exports = (sessions) => {
    const router = express.Router();

    router.get('/', (req, res) => res.render('index'));

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
