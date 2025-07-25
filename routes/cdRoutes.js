const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');

const descriptionTemplate = (aiData) => {
    const tracklistHtml = aiData.Tracklist ? aiData.Tracklist.replace(/, /g, '<br>') : 'N/A';
    let editionInfo = '';
    if (aiData.isFirstEdition || aiData.hasBonus) {
        editionInfo = `--- 特典・エディション情報 ---<br>${aiData.editionNotes || '詳細は画像をご確認ください。'}<br><br>`;
    }

    return `【Disc Condition】: new<br>【Case Condition】: new<br>【Booklet/Insert】: new<br>【OBI Strip】: new<br><br>${editionInfo}--- 収録曲 ---<br>${tracklistHtml}`.trim();
};

const generateCsv = (records) => {
    const headers = [
        "ConditionID", "Category", "StoreCategory", "Title", "Artist", "C:Type",
        "C:Case Type", "C:Inlay Condition", "RecordLabel", "Released",
        "Format", "MPN", "UPC", "Description", "PicURL", "PriceInfo_BestOfferEnabled",
        "PriceInfo_MinimumBestOfferPrice", "ShippingService-1:Cost", "ShippingService-1:Option"
    ];
    const headerRow = headers.join(',');

    const rows = records.filter(r => r.status === 'saved').map(r => {
        const { aiData, userInput, allImageUrls } = r;
        const data = {
            "ConditionID": "1000",
            "Category": "14970",
            "StoreCategory": "",
            "Title": userInput.title,
            "Artist": aiData.Artist,
            "C:Type": aiData.Type,
            "C:Case Type": "",
            "C:Inlay Condition": "",
            "RecordLabel": aiData.RecordLabel,
            "Released": aiData.Released,
            "Format": aiData.Format,
            "MPN": aiData.MPN,
            "UPC": "",
            "Description": descriptionTemplate(aiData),
            "PicURL": allImageUrls.join('|'),
            "PriceInfo_BestOfferEnabled": "FALSE",
            "PriceInfo_MinimumBestOfferPrice": "",
            "ShippingService-1:Cost": userInput.shipping,
            "ShippingService-1:Option": "JP_Post_YuPacket"
        };
        return headers.map(h => `"${(data[h] || '').toString().replace(/"/g, '""')}"`).join(',');
    });

    return [headerRow, ...rows].join('\r\n');
};

// Router Factory
module.exports = (sessions) => {
    const router = express.Router();

    router.get('/', (req, res) => res.render('index'));

    router.post('/process', async (req, res) => {
        const parentFolderUrl = req.body.parentFolderUrl;
        if (!parentFolderUrl) return res.redirect('/');

        const sessionId = uuidv4();
        sessions.set(sessionId, { status: 'processing', records: [] });
        res.render('results', { sessionId }); // まず結果ページに遷移させる

        // 非同期でバックグラウンド処理を開始
        (async () => {
            const session = sessions.get(sessionId);
            try {
                const subfolders = await driveService.getUnprocessedSubfolders(parentFolderUrl);
                if (subfolders.length === 0) throw new Error('処理対象のフォルダが見つかりません。「済」がついていないフォルダがあるか確認してください。');

                session.records = subfolders.slice(0, 10).map(f => ({ // 最大10件
                    id: uuidv4(),
                    folderId: f.id,
                    folderName: f.name,
                    status: 'pending'
                }));

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
                        // webViewLinkは直接表示できないため、Google DriveのファイルプレビューURLを生成
                        const allImageUrls = [...m, ...j, ...d].map(f => `https://drive.google.com/file/d/${f.id}/view`);

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

        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fileName = `cd_lister_${date}.csv`;
        
        res.header('Content-Type', 'text/csv; charset=UTF-8');
        res.attachment(fileName);
        res.send('\uFEFF' + generateCsv(session.records)); // BOM付きUTF-8
    });

    return router;
};
