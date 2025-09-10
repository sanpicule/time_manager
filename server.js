const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to parse JSON requests
app.use(express.json());



// Google Sheets API setup
const SPREADSHEET_ID = '1Ed5bzBeQEI9o8kFuqqKkqArVla77h8XjHKOLpFK_xDk'; // Your spreadsheet ID
const SHEET_NAME = '檜皮さん'; // Your sheet name

let auth;

// Load credentials and set up authentication
try {
    const credentialsPath = path.join(__dirname, 'credentials.json');
    const envClientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const envPrivateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

    if (envClientEmail && envPrivateKeyRaw) {
        const envPrivateKey = envPrivateKeyRaw.replace(/\\n/g, '\n');
        auth = new google.auth.JWT(
            envClientEmail,
            null,
            envPrivateKey,
            ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        );
        console.log('Google Sheets auth initialized from environment variables.');
    } else {
        auth = new google.auth.GoogleAuth({
            keyFile: credentialsPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        });
        console.log('Google Sheets auth initialized from credentials.json.');
    }
    console.log('Google Sheets authentication setup complete.');
} catch (error) {
    console.error('Error loading Google credentials:', error.message);
    console.error('Set GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY or place credentials.json in project root.');
    process.exit(1);
}

// API endpoint to submit data
app.post('/api/submit', async (req, res) => {
    const { date, hours, content } = req.body;

    if (!date || !hours || !content) {
        return res.status(400).json({ success: false, message: 'すべてのフィールドを入力してください。' });
    }

    const dayOnly = date.split('-').pop(); // Extract only the day

    try {
        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        // Get all values from column A to find '合計'
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:A`,
        });

        const values = response.data.values || [];
        let totalRowIndex = -1;

        for (let i = 0; i < values.length; i++) {
            if (values[i][0] === '合計') {
                totalRowIndex = i + 1; // +1 because sheets are 1-indexed
                break;
            }
        }

        const newRow = [dayOnly, hours, content];

        if (totalRowIndex !== -1) {
            // 実際にシートに1行を挿入し、その行に値を書き込む
            // まずシートIDを取得
            const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
            const sheet = (spreadsheetMeta.data.sheets || []).find(s => s.properties && s.properties.title === SHEET_NAME);
            if (!sheet || !sheet.properties || typeof sheet.properties.sheetId !== 'number') {
                throw new Error(`シート '${SHEET_NAME}' のIDを取得できませんでした。`);
            }
            const sheetId = sheet.properties.sheetId;

            // '合計' の直上に1行挿入（0-indexed なので startIndex/endIndex に注意）
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [
                        {
                            insertDimension: {
                                range: {
                                    sheetId: sheetId,
                                    dimension: 'ROWS',
                                    startIndex: totalRowIndex - 1,
                                    endIndex: totalRowIndex,
                                },
                                inheritFromBefore: true,
                            },
                        },
                    ],
                },
            });

            // 挿入した行（totalRowIndex 行目）に値を設定
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A${totalRowIndex}:C${totalRowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [newRow],
                },
            });

            // 合計セルの右隣（列B）のSUM範囲終端を+1して更新
            const totalRowAfterInsert = totalRowIndex + 1; // 挿入後に '合計' は1つ下にずれる
            try {
                const formulaCellRange = `${SHEET_NAME}!B${totalRowAfterInsert}`;
                const formulaRes = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: formulaCellRange,
                    valueRenderOption: 'FORMULA',
                });
                const currentFormula = (formulaRes.data.values && formulaRes.data.values[0] && formulaRes.data.values[0][0]) || '';
                if (typeof currentFormula === 'string' && currentFormula.startsWith('=')) {
                    const match = currentFormula.match(/=\s*SUM\(B(\d+):B(\d+)\)/i);
                    if (match) {
                        const startRow = Number(match[1]);
                        const endRow = Number(match[2]) + 1;
                        const newFormula = `=SUM(B${startRow}:B${endRow})`;
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: formulaCellRange,
                            valueInputOption: 'USER_ENTERED',
                            requestBody: {
                                values: [[newFormula]],
                            },
                        });
                    }
                }
            } catch (e) {
                console.warn('Failed to adjust SUM range for total row:', e.message);
            }
        } else {
            // If '合計' not found, append to the end
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A:C`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [newRow],
                },
            });
        }

        res.json({ success: true, message: `記録しました: ${date} / ${hours}時間 / ${content}` });
    } catch (error) {
        const apiErrorMessage = (error && error.response && error.response.data && error.response.data.error && error.response.data.error.message) ? error.response.data.error.message : '';
        console.error('Error writing to Google Sheet:', error.message, apiErrorMessage);
        res.status(500).json({ success: false, message: 'スプレッドシートへの書き込み中にエラーが発生しました。' });
    }
});

// API endpoint to update a row
app.put('/api/records/:rowIndex', async (req, res) => {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const { day, hours, content } = req.body;
    if (!rowIndex || isNaN(rowIndex)) {
        return res.status(400).json({ success: false, message: 'rowIndex が不正です。' });
    }
    try {
        const authClient = await auth.getClient ? await auth.getClient() : auth;
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const range = `${SHEET_NAME}!A${rowIndex}:C${rowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[day ?? '', hours ?? '', content ?? '']],
            },
        });
        res.json({ success: true });
    } catch (error) {
        const apiErrorMessage = (error && error.response && error.response.data && error.response.data.error && error.response.data.error.message) ? error.response.data.error.message : '';
        console.error('Error updating Google Sheet:', error.message, apiErrorMessage);
        res.status(500).json({ success: false, message: '更新中にエラーが発生しました。' });
    }
});

// API endpoint to update a single cell in a row
app.patch('/api/records/:rowIndex', async (req, res) => {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const { column, value } = req.body;
    if (!rowIndex || isNaN(rowIndex)) {
        return res.status(400).json({ success: false, message: 'rowIndex が不正です。' });
    }
    if (!column) {
        return res.status(400).json({ success: false, message: 'column を指定してください。（day|hours|content または A|B|C）' });
    }
    try {
        const authClient = await auth.getClient ? await auth.getClient() : auth;
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const colMap = { day: 'A', hours: 'B', content: 'C', A: 'A', B: 'B', C: 'C' };
        const col = colMap[column];
        if (!col) {
            return res.status(400).json({ success: false, message: 'column は day|hours|content もしくは A|B|C を指定してください。' });
        }
        const range = `${SHEET_NAME}!${col}${rowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[value ?? '']],
            },
        });
        res.json({ success: true });
    } catch (error) {
        const apiErrorMessage = (error && error.response && error.response.data && error.response.data.error && error.response.data.error.message) ? error.response.data.error.message : '';
        console.error('Error patching Google Sheet cell:', error.message, apiErrorMessage);
        res.status(500).json({ success: false, message: 'セル更新中にエラーが発生しました。' });
    }
});
// API endpoint to delete a row
app.delete('/api/records/:rowIndex', async (req, res) => {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    if (!rowIndex || isNaN(rowIndex)) {
        return res.status(400).json({ success: false, message: 'rowIndex が不正です。' });
    }
    try {
        const authClient = await auth.getClient ? await auth.getClient() : auth;
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        // Need sheetId for batchUpdate deleteDimension
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheet = (meta.data.sheets || []).find(s => s.properties && s.properties.title === SHEET_NAME);
        if (!sheet || !sheet.properties || typeof sheet.properties.sheetId !== 'number') {
            return res.status(500).json({ success: false, message: 'シートIDを取得できませんでした。' });
        }
        const sheetId = sheet.properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId,
                                dimension: 'ROWS',
                                startIndex: rowIndex - 1,
                                endIndex: rowIndex,
                            },
                        },
                    },
                ],
            },
        });
        res.json({ success: true });
    } catch (error) {
        const apiErrorMessage = (error && error.response && error.response.data && error.response.data.error && error.response.data.error.message) ? error.response.data.error.message : '';
        console.error('Error deleting Google Sheet row:', error.message, apiErrorMessage);
        res.status(500).json({ success: false, message: '削除中にエラーが発生しました。' });
    }
});

// API endpoint to fetch records
app.get('/api/records', async (req, res) => {
    try {
        const authClient = await auth.getClient ? await auth.getClient() : auth;
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:C`,
            valueRenderOption: 'UNFORMATTED_VALUE',
            dateTimeRenderOption: 'FORMATTED_STRING',
        });

        const values = response.data.values || [];
        
        // Find total hours from '合計' row
        let totalHours = 0;
        const totalRow = values.find(row => row && row.length > 0 && row[0] === '合計');
        if (totalRow && totalRow[1]) {
            totalHours = parseFloat(totalRow[1]) || 0;
        }
        
        // Build records with row index (1-based). Exclude headers like '合計' and '<n>月'
        const records = [];
        for (let i = 0; i < values.length; i++) {
            const row = values[i] || [];
            const firstCell = (row[0] ?? '').toString().trim();
            if (!row.length) continue;
            if (firstCell === '合計') continue;
            if (/^\d+月$/.test(firstCell)) continue; // month headers
            // Exclude rows marked as '神入力' in column B
            if ((row[1] ?? '').toString().trim() === '神入力') continue;
            // Include rows that have any of day/hours/content
            if ((row[0] ?? '') !== '' || (row[1] ?? '') !== '' || (row[2] ?? '') !== '') {
                records.push({
                    rowIndex: i + 1, // Google Sheets is 1-indexed
                    day: row[0] ?? '',
                    hours: row[1] ?? '',
                    content: row[2] ?? '',
                });
            }
        }

        res.json({ success: true, records, totalHours });
    } catch (error) {
        const apiErrorMessage = (error && error.response && error.response.data && error.response.data.error && error.response.data.error.message) ? error.response.data.error.message : '';
        console.error('Error fetching from Google Sheet:', error.message, apiErrorMessage);
        res.status(500).json({ success: false, message: 'スプレッドシートの取得中にエラーが発生しました。' });
    }
});



app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Backend API available at http://localhost:${PORT}/api/submit`);
});
