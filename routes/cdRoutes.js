const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');
const ebayService = require('../services/ebayService');

const descriptionTemplate = ({ aiData, userInput }) => {
    // AIのTracklistがオブジェクト形式になったことに対応
    const tracklistHtml = (aiData.Tracklist && typeof aiData.Tracklist === 'object')
        ? Object.entries(aiData.Tracklist).map(([key, track]) => `<li>${key}. ${track}</li>`).join('')
        : '<li>N/A</li>';

    // ★★★ 変更点: ユーザーが編集したアーティスト名を使うようにする ★★★
    const artistName = userInput.artist || aiData.Artist || 'N/A';

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; color: #333;">
        <h1 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; font-size: 24px;">${userInput.title}</h1>
        <div style="display: flex; flex-wrap: wrap; margin-top: 20px;">
            <div style="flex: 1; min-width: 300px; padding: 10px;">
                <h2 style="color: #2c5282; font-size: 20px;">Condition</h2>
                <ul style="list-style-type: disc; padding-left: 20px;"><li style="margin-bottom: 10px;">Case: ${userInput.conditionCase}</li><li style="margin-bottom: 10px;">CD: ${userInput.conditionCd}</li><li style="margin-bottom: 10px;">OBI: ${userInput.conditionObi}</li></ul>
                <h2 style="color: #2c5282; font-size: 20px;">Key Features</h2>
                <ul style="list-style-type: disc; padding-left: 20px;"><li style="margin-bottom: 10px;">${userInput.comment || aiData.editionNotes || 'Please check the images for details.'}</li><li style="margin-bottom: 10px;">Artist: ${artistName}</li><li style="margin-bottom: 10px;">Format: ${aiData.Format || 'CD'}</li><li style="margin-bottom: 10px;">Genre: ${aiData.Genre || 'N/A'}</li></ul>
            </div>
            <div style="flex: 1; min-width: 300px; padding: 10px;">
                <h2 style="color: #2c5282; font-size: 20px;">Tracklist</h2>
                <ol style="list-style-type: decimal; padding-left: 20px;">${tracklistHtml}</ol>
                <h2 style="color: #2c5282; font-size: 20px;">Specifications</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tbody>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Brand</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${aiData.RecordLabel || 'No Brand'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Country</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${aiData.Country || 'Japan'}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h2 style="color: #2c5282; font-size: 20px;">Product Description</h2><p style="line-height: 1.6;">If you have any questions or request about items, please feel free to ask us. Thank you!</p>
            <h2 style="color: #2c5282; font-size: 20px; margin-top: 20px;">Shipping</h2><p>Shipping by FedEx, DHL, or EMS.</p>
            <h2 style="color: #2c5282; font-size: 20px; margin-top: 20px;">International Buyers - Please Note:</h2><p>Import duties, taxes, and charges are not included in the item price or shipping cost. These charges are the buyer's responsibility. Please check with your country's customs office to determine what these additional costs will be prior to bidding or buying.</p><p>Thank you for your understanding.</p>
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
        const { aiData, userInput, ebayImageUrls, customLabel } = r;
        const picURLs = (ebayImageUrls || []).join('|');

        // ★★★ 変更点: ユーザーが編集したタイトルとアーティスト名を優先して使用 ★★★
        const artist = userInput.artist || aiData.Artist;
        const title = userInput.title || aiData.Title;
        const titleParts = [artist, title];
        if (userInput.conditionObi !== 'なし' && userInput.conditionObi !== 'Not Applicable') titleParts.push('w/obi');
        const newTitle = titleParts.filter(Boolean).join(' ');

        const data = {
            "Action(CC=Cp1252)": "Add", "CustomLabel": customLabel, "StartPrice": userInput.price,
            "ConditionID": userInput.conditionId, "Title": newTitle, "Description": descriptionTemplate({ aiData, userInput }),
            "C:Brand": aiData.RecordLabel || "No Brand", "PicURL": picURLs, "UPC": "NA", "Category": "176984",
            "PayPalAccepted": "1", "PayPalEmailAddress": "payAddress", "PaymentProfileName": "buy it now",
            "ReturnProfileName": "Seller 60days", "ShippingProfileName": userInput.shipping, "Country": "JP",
            "Location": "417-0816, Fuji Shizuoka", "Apply Profile Domestic": "0.0", "Apply Profile International": "0.0",
            "BuyerRequirements:LinkedPayPalAccount": "0.0", "Duration": "GTC", "Format": "FixedPriceItem",
            "Quantity": "1", "Currency": "USD", "SiteID": "US", "C:Country": "Japan", "BestOfferEnabled": "0",
            "C:Artist": artist, "C:Release Title": title, "C:Format": aiData.Format, "C:Genre": aiData.Genre,
            "C:Record Label": aiData.RecordLabel, "C:Edition": aiData.isFirstEdition ? 'Limited Edition' : '',
            "C:Style": aiData.Style, "C:Type": aiData.Type, "C:Color": "NA", "C:Release Year": aiData.Released,
            "C:CD Grading": userInput.conditionCd, "C:Case Type": "Jewel Case: Standard", "C:Case Condition": userInput.conditionCase,
            "C:Inlay Condition": userInput.conditionObi, "C:Country/Region of Manufacture": aiData.Country,
            "C:Features": (userInput.conditionObi !== 'なし' && userInput.conditionObi !== 'Not Applicable') ? 'OBI' : '',
            "C:Producer": "", "C:Language": "", "C:Instrument": "", "C:Occasion": "", "C:Era": "", "C:Composer": "", "C:Conductor": "",
            "C:Performer Orchestra": "", "C:Run Time": "", "C:MPN": aiData.MPN,
            "C:California Prop 65 Warning": "", "C:Catalog Number": aiData.CatalogNumber,
            "C:Unit Quantity": "", "C:Unit Type": "", "StoreCategory": userInput.storeCategory, "__keyValuePairs": ""
        };
        return headers.map(h => `"${(data[h] || '').toString().replace(/"/g, '""')}"`).join(',');
    });
    return [headerRow, ...rows].join('\r\n');
};

module.exports = (sessions) => {
    const router = express.Router();
    router.get('/', (req, res) => res.render('index'));

    // ... ( '/categories' and '/shipping-costs' routes remain the same ) ...
    router.get('/categories', async (req, res) => {
        try {
            const categories = await driveService.getStoreCategories();
            res.json(categories);
        } catch (error) {
            console.error('Category fetch error:', error.message);
            res.status(500).json({ error: 'Failed to retrieve categories' });
        }
    });
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
                // ★★★ 変更点: SKU生成のために親フォルダ名を取得 ★★★
                const parentFolderId = driveService.getFolderIdFromUrl(parentFolderUrl);
                if (!parentFolderId) throw new Error('親フォルダのURLが無効です。');
                const parentFolder = await driveService.getFolderDetails(parentFolderId);
                const parentFolderName = parentFolder.name;

                const subfolders = await driveService.getUnprocessedSubfolders(parentFolderId);
                if (subfolders.length === 0) throw new Error('処理対象のフォルダが見つかりません。「済」がついていないフォルダがあるか確認してください。');
                
                // ★★★ 変更点: SKUの命名規則を変更 ★★★
                session.records = subfolders.slice(0, 10).map((f) => {
                    return { id: uuidv4(), folderId: f.id, folderName: f.name, status: 'pending', customLabel: `${parentFolderName}-${f.name}` };
                });

                for (const record of session.records) {
                    try {
                        const analysisFiles = await driveService.getImagesForAnalysis(record.folderId);
                        const imageBuffersForAi = await Promise.all(analysisFiles.map(f => driveService.downloadFile(f.id)));
                        
                        // ★★★ 変更点: AIの応答がJSONになったため、パース処理は不要 ★★★
                        const aiData = await aiService.analyzeCd(imageBuffersForAi);
                        
                        let allImageFiles = await driveService.getAllImageFiles(record.folderId);
                        if (allImageFiles.length === 0) throw new Error('画像ファイルが見つかりません。');
                        
                        allImageFiles.sort((a, b) => {
                            const priority = (name) => {
                                const upper = name.toUpperCase();
                                if (upper.startsWith('M')) return 1; if (upper.startsWith('J')) return 2; if (upper.startsWith('D')) return 3; return 4;
                            };
                            return priority(a.name) - priority(b.name) || a.name.localeCompare(b.name);
                        });

                        const ebayImageUrls = await Promise.all(allImageFiles.map(async (file) => {
                            const imageBuffer = await driveService.downloadFile(file.id);
                            return ebayService.uploadPictureFromBuffer(imageBuffer, { pictureName: `${record.customLabel}_${file.name}` });
                        }));
                        
                        const j1File = allImageFiles.find(f => f.name.toUpperCase().startsWith('J1'));
                        aiData.J1_FileId = j1File ? j1File.id : (allImageFiles.length > 0 ? allImageFiles[0].id : null);
                        
                        Object.assign(record, { status: 'success', aiData, ebayImageUrls, allImageFiles: allImageFiles.map(f => ({id: f.id, name: f.name})) });

                    } catch (err) {
                        console.error(`Error processing record ${record.folderName}:`, err);
                        Object.assign(record, { status: 'error', error: err.message });
                    }
                }
                session.status = 'completed';
            } catch (err) {
                console.error(`Fatal error in processing session:`, err);
                session.status = 'error';
                session.error = err.message;
            }
        })();
    });

    router.get('/status/:sessionId', (req, res) => {
        res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' });
    });

    // ★★★ 追加: 再検索用のAPIエンドポイント ★★★
    router.post('/research/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session?.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        try {
            record.status = 'researching'; // フロントで処理中だとわかるように
            
            const analysisFiles = await driveService.getImagesForAnalysis(record.folderId);
            const imageBuffersForAi = await Promise.all(analysisFiles.map(f => driveService.downloadFile(f.id)));
            const excludeUrl = record.aiData?.DiscogsUrl || null;
            
            const aiData = await aiService.analyzeCd(imageBuffersForAi, excludeUrl);
            record.aiData = aiData;
            record.status = 'success';
            
            res.json({ status: 'ok', aiData: record.aiData });
        } catch (err) {
            console.error(`Error re-searching record ${record.customLabel}:`, err);
            record.status = 'error';
            record.error = err.message;
            res.status(500).json({ status: 'error', error: err.message });
        }
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
        const date = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
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
