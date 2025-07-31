const { google } = require('googleapis');
const path = require('path');

const KEY_FILE_PATH = path.join(__dirname, '..', 'service-account-key.json');
// スプレッドシート読み取りのスコープを追加
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets.readonly'
];

async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE_PATH, scopes: SCOPES });
    const client = await auth.getClient();
    return google.drive({ version: 'v3', auth: client });
}

// スプレッドシートからカテゴリを取得する関数
async function getStoreCategories() {
    const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE_PATH, scopes: SCOPES });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    try {
        const spreadsheetId = '1pGXjlYl29r1KIIPiIu0N4gXKdGquhIZe3UjH_QApwfA';
        const range = 'Category-CD!A2:B';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            return rows
                .filter(row => row[0] && row[1]) // A列とB列の両方に値がある行のみを対象
                .map(row => ({
                    name: row[0], // A列の値
                    id: row[1],   // B列の値
                }));
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('Failed to retrieve categories from spreadsheet.');
    }
}

// スプレッドシートから送料を取得する関数
async function getShippingCosts() {
    const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE_PATH, scopes: SCOPES });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    try {
        const spreadsheetId = '1pGXjlYl29r1KIIPiIu0N4gXKdGquhIZe3UjH_QApwfA';
        const range = '送料管理!B2:B';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            return rows.flat().filter(cost => cost && cost.trim() !== ''); // 値が存在する行のみを対象
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('Failed to retrieve shipping costs from spreadsheet.');
    }
}


function getFolderIdFromUrl(url) {
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

async function countProcessedSubfolders(parentFolderUrl) {
    const parentFolderId = getFolderIdFromUrl(parentFolderUrl);
    if (!parentFolderId) throw new Error('親フォルダのURLが無効です。');
    const drive = await getDriveClient();
    const res = await drive.files.list({
        q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '済'`,
        fields: 'files(id)',
    });
    return res.data.files ? res.data.files.length : 0;
}

async function getUnprocessedSubfolders(parentFolderUrl) {
    const parentFolderId = getFolderIdFromUrl(parentFolderUrl);
    if (!parentFolderId) throw new Error('親フォルダのURLが無効です。');
    const drive = await getDriveClient();
    const res = await drive.files.list({
        q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and not name contains '済'`,
        fields: 'files(id, name)',
        orderBy: 'createdTime',
    });
    return res.data.files || [];
}

async function getImagesForAnalysis(folderId) {
    const drive = await getDriveClient();
    let query = `'${folderId}' in parents and (name starts with 'J1_' or name starts with 'J2_' or name starts with 'D1_') and mimeType contains 'image/'`;
    let res = await drive.files.list({ q: query, fields: 'files(id, name)', orderBy: 'name' });
    if (!res.data.files || !res.data.files.find(f => f.name.startsWith('D1_'))) {
         query = `'${folderId}' in parents and (name starts with 'J1_' or name starts with 'J2_') and mimeType contains 'image/'`;
         res = await drive.files.list({ q: query, fields: 'files(id, name)', orderBy: 'name' });
    }
    if (!res.data.files || res.data.files.length === 0) {
         throw new Error(`フォルダID: ${folderId} 内に解析対象の画像が見つかりません。`);
    }
    return res.data.files;
}

async function getAllImageFiles(folderId) {
    const drive = await getDriveClient();
    const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'image/'`,
        fields: 'files(id, name)',
    });
    return response.data.files || [];
}

async function downloadFile(fileId) {
    const drive = await getDriveClient();
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
}

async function getImageStream(fileId) {
    const drive = await getDriveClient();
    const res = await drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'stream' }
    );
    return res.data;
}

async function renameFolder(folderId, newName) {
    const drive = await getDriveClient();
    await drive.files.update({
        fileId: folderId,
        requestBody: { name: newName },
    });
}

module.exports = {
    getFolderIdFromUrl,
    countProcessedSubfolders,
    getUnprocessedSubfolders,
    getImagesForAnalysis,
    getAllImageFiles,
    downloadFile,
    getImageStream,
    renameFolder,
    getStoreCategories,
    getShippingCosts // 追加
};
