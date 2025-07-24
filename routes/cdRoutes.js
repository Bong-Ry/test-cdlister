/* CD Router: CD processing & CSV (eBay) */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
const {
  getSubfolders,
  getProcessedSubfolders,
  getRecordImages,
  renameFolder,
  getDriveImageStream,
  getDriveImageBuffer
} = require('../services/googleDriveService');
const { analyzeCd } = require('../services/openAiService');

/* ──────────────────────────
 * CD用 HTML description template
 * ────────────────────────── */
const descriptionTemplate = ({ ai, user }) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 900px; margin: auto;">
    <h1 style="font-size: 24px; border-bottom: 2px solid #ccc; padding-bottom: 10px;">
      ${user.title || ai.Title || ''}
    </h1>
    <p style="margin: 16px 0;">
      Our CDs are brand new items. Please check the details below.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <tbody>
        <tr>
          <td style="vertical-align: top; padding-right: 20px;">
            <h2 style="font-size: 20px;">Key Features</h2>
            <ul style="list-style: none; padding: 0; line-height: 1.8;">
              <li>- <strong>Artist:</strong> ${ai.Artist || 'Not specified'}</li>
              <li>- <strong>Format:</strong> ${ai.Format || 'CD'}</li><br>
              <li>- <strong>Condition:</strong></li>
              <li>&nbsp;&nbsp;• Disc Condition: new</li>
              <li>&nbsp;&nbsp;• Case Condition: new</li>
              <li>&nbsp;&nbsp;• Booklet/Insert: new</li>
              <li>&nbsp;&nbsp;• OBI Strip: new</li>
            </ul>
          </td>
          <td style="width: 300px; vertical-align: top;">
            <h2 style="font-size: 20px;">Edition Details</h2>
            <ul style="list-style: none; padding: 0; line-height: 1.8;">
                <li>- <strong>First Edition:</strong> ${ai.isFirstEdition ? 'Yes' : 'No'}</li>
                <li>- <strong>Bonus Items:</strong> ${ai.hasBonus ? 'Yes' : 'No'}</li>
                ${ai.editionNotes ? `<li>- <strong>Notes:</strong> ${ai.editionNotes}</li>` : ''}
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
    <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Tracklist</h2>
    <div style="column-count: 2; column-gap: 40px;">
        <ol style="padding-left: 20px; margin: 0;">
            ${(ai.Tracklist && Array.isArray(ai.Tracklist)) ? ai.Tracklist.map(track => `<li style="line-height: 1.8;">${track}</li>`).join('') : 'No tracklist available.'}
        </ol>
    </div>
    <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Shipping</h2>
    <p>Shipping by FedEx, DHL, or Japan Post.</p>
    <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">International Buyers - Please Note:</h2>
    <p>Import duties, taxes and charges are not included in the item price or shipping charges and are the buyer’s responsibility.</p>
  </div>`.replace(/\r?\n|\r/g, '').replace(/\s\s+/g, ' ').trim();
};

const getFormattedDate = () => {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/* ──────────────────────────
 * CD用 CSV builder
 * ────────────────────────── */
const getSortKeyCd = (name) => {
    const nameUpper = name.toUpperCase();
    let group = 99;
    let number = 0;
    const match = nameUpper.match(/^([MJD])(\d*)_/);
    if (match) {
        const letter = match[1];
        const numStr = match[2];
        if (letter === 'M') group = 1;
        if (letter === 'J') group = 2;
        if (letter === 'D') group = 3;
        number = numStr ? parseInt(numStr, 10) : 0;
    }
    return { group, number };
};

const generateCsvCd = records => {
  const header = [
    "Action(CC=Cp1252)","CustomLabel","Category","StoreCategory","Title",
    "ConditionID","PicURL","Description","Format","Duration","StartPrice",
    "Quantity","Location","ShippingProfileName","ReturnProfileName","PaymentProfileName",
    "C:Artist","C:Type","C:Release Title","C:Genre","C:Case Type","C:Inlay Condition",
    "C:Edition","C:Language","UPC"
  ];
  const headerRow = header.map(h => `"${h.replace(/"/g, '""')}"`).join(',');

  const rows = records.filter(r => r.status === 'saved').map(r => {
    const { aiData: ai, userInput: user } = r;
    const row = {};

    const picURL = [...r.images]
      .sort((a, b) => {
          const keyA = getSortKeyCd(a.name);
          const keyB = getSortKeyCd(b.name);
          if (keyA.group !== keyB.group) return keyA.group - keyB.group;
          return keyA.number - keyB.number;
      })
      .map(img => img.url)
      .join('|');

    row["Action(CC=Cp1252)"] = 'Add';
    row["CustomLabel"] = r.customLabel;
    row["Category"] = '14970';
    row["StoreCategory"] = '';
    row["Title"] = user.title || ai.Title;
    row["ConditionID"] = '1000';
    row["PicURL"] = picURL;
    row["Description"] = descriptionTemplate({ ai, user });
    row["Format"] = 'FixedPrice';
    row["Duration"] = 'GTC';
    row["StartPrice"] = user.price;
    row["Quantity"] = '1';
    row["Location"] = 'Japan';
    row["ShippingProfileName"] = user.shipping;
    row["ReturnProfileName"] = 'Seller 60days';
    row["PaymentProfileName"] = 'buy it now';
    row["C:Artist"] = ai.Artist;
    row["C:Type"] = ai.Type || 'Album';
    row["C:Release Title"] = user.title || ai.Title;
    row["C:Genre"] = ai.Genre;
    row["C:Case Type"] = '';
    row["C:Inlay Condition"] = '';
    row["C:Edition"] = `${ai.isFirstEdition ? 'First Edition' : ''}${ai.hasBonus ? ', Bonus Items' : ''}`.replace(/^,|,$/g, '').trim();
    row["C:Language"] = 'Japanese';
    row["UPC"] = '';

    return header.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',');
  });

  return [headerRow, ...rows].join('\n');
};

/* ──────────────────────────
 * Router factory (CD)
 * ────────────────────────── */
module.exports = sessions => {
  const router = express.Router();

  router.get('/image/:fileId', async (req, res) => {
    try {
      (await getDriveImageStream(req.params.fileId)).pipe(res);
    } catch {
      res.status(500).send('Error fetching image');
    }
  });

  router.post('/process', async (req, res) => {
    const { parentFolderUrl } = req.body;
    if (!parentFolderUrl) return res.redirect('/');
    
    const parentFolderId = parentFolderUrl.split('/folders/')[1]?.split('?')[0];
    if (!parentFolderId) return res.status(400).send('Invalid Folder URL');

    const sessionId = uuidv4();
    sessions.set(sessionId, { status: 'processing', records: [] });
    res.render('cd_results', { sessionId: sessionId });

    try {
      const [unproc, proc] = await Promise.all([
        getSubfolders(parentFolderId),
        getProcessedSubfolders(parentFolderId),
      ]);
      const session = sessions.get(sessionId);

      let counter = proc.length;
      const dateStr = getFormattedDate();

      session.records = unproc.map(f => ({
        id: uuidv4(),
        folderId: f.id,
        originalFolderName: f.name,
        status: 'pending',
        customLabel: `C${dateStr}_${String(++counter).padStart(4, '0')}`
      }));

      for (const rec of session.records) {
        try {
          const imgs = (await getRecordImages(rec.folderId)).map(img => ({
            ...img,
            url: `https://drive.google.com/uc?export=download&id=${img.id}`
          }));

          let analysisImages = imgs.filter(img =>
              img.name.toUpperCase().startsWith('J1_') ||
              img.name.toUpperCase().startsWith('J2_') ||
              img.name.toUpperCase().startsWith('D1_')
          );
          if (analysisImages.length > 0 && !analysisImages.some(img => img.name.toUpperCase().startsWith('D1_'))) {
            analysisImages = imgs.filter(img =>
                img.name.toUpperCase().startsWith('J1_') ||
                img.name.toUpperCase().startsWith('J2_')
            );
          }

          const buf = [];
          for (const img of analysisImages.slice(0, 3)) {
            try { buf.push(await getDriveImageBuffer(img.id)); } catch {}
          }
          if (!buf.length) throw new Error('No images for analysis downloaded.');

          const aiData = await analyzeCd(buf);
          Object.assign(rec, { images: imgs, aiData, status: 'success' });
        } catch (err) {
          Object.assign(rec, { status: 'error', error: err.message });
        }
      }
      session.status = 'completed';
    } catch (err) {
      const s = sessions.get(sessionId);
      s.status = 'error';
      s.error = err.message;
    }
  });

  router.post('/save/:sessionId/:recordId', async (req, res) => {
    const { sessionId, recordId } = req.params;
    const session = sessions.get(sessionId);
    const rec = session?.records.find(r => r.id === recordId);
    if (!rec) return res.status(404).json({ error: 'Record not found' });

    rec.userInput = {
      title:    req.body.title,
      price:    req.body.price,
      shipping: req.body.shipping,
      comment:  req.body.comment
    };
    rec.status = 'saved';

    await renameFolder(rec.folderId, `済 ${rec.originalFolderName}`);
    res.json({ status: 'ok' });
  });

  router.get('/', (req, res) => {
    res.render('cd_index');
  });

  router.get('/status/:sessionId', (req, res) =>
    res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' })
  );

  router.get('/csv/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session?.records) return res.status(404).send('Session not found');

    const d = new Date();
    const fileName = `CD_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;

    res.header('Content-Type', 'text/csv; charset=UTF-8');
    res.attachment(fileName);
    res.send('\uFEFF' + generateCsvCd(session.records));
  });

  return router;
};

