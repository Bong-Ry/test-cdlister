const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');

// 新しい商品説明テンプレート
const descriptionTemplate = ({ aiData, userInput }) => {
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
                <h2 style="color: #2c5282; font-size: 20px;">Specifications</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Brand</td>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${aiData.RecordLabel || 'No Brand'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Country</td>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${aiData.Country || 'Japan'}</td>
                    </tr>
                </table>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h2 style="color: #2c5282; font-size: 20px;">Product Description</h2>
            <p style="line-height: 1.6;">
                If you have any questions or request about items, please feel free to ask us. Thank you!
            </p>
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
        
        const conditionId = userInput.conditionCd === 'New' ? '1000' : '3000';
        const inlayCondition = userInput.conditionCd === 'New' ? 'Mint (M)' : 'Near Mint (NM or M-)';

        const data = {
            "Action(SiteID=US|Country=JP|Currency=USD|Version=1197)": "Add",
            "CustomLabel": customLabel,
            "ItemID": "",
            "ConditionID": conditionId,
            "ConditionDescription": descriptionTemplate({ aiData, userInput }),
            "Category": "176984",
            "StoreCategory": userInput.storeCategory,
            "Title": `【${conditionId === '1000' ? 'New' : 'Used'}】 ${userInput.title} ${aiData.Artist} ${aiData.MPN} CD ${aiData.Country} OBI`,
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
            "C:Inlay Condition": inlayCondition,
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
        
        // 新しい入力データを保存
        record.userInput = {
            title:         req.body.title,
            price:         req.body.price,
            shipping:      req.body.shipping,
            storeCategory: req.body.storeCategory,
            comment:       req.body.comment,
            conditionCase: req.body.conditionCase,
            conditionCd:   req.body.conditionCd,
            conditionObi:  req.body.conditionObi,
        };
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
