// googlesheets.js
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYFILE_PATH = path.join(__dirname, 'service-account-key.json'); // Get your API from https://console.cloud.google.com -> Ask AI how!
const SPREADSHEET_ID = '<spreadsheet-id>'; // use your spreadsheet ID

async function getAuthClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEYFILE_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return await auth.getClient();
}

/**
 * Uploads issue data rows (without headers) to a specific sheet.
 * @param {Array<Object>} data - Array of problem objects
 * @param {string} dateStr - Sheet name in format 'DD-MM-YYYY'
 * @throws {Error} If conditions are not met
 */
export async function uploadToGoogleSheet(data, dateStr) {
    // Fixed sheet name – ignore the passed dateStr
    const SHEET_NAME = 'sheet-report';

    // --- Pre‑condition checks ---
    if (!data || data.length === 0) {
        throw new Error('No data provided to upload.');
    }

    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    console.log(`🔑 Authenticated as: ${authClient.email || (await authClient.getCredentials()).client_email}`);

    // 1. Verify spreadsheet access
    let spreadsheet;
    try {
        const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        spreadsheet = res.data;
    } catch (err) {
        if (err.code === 404) {
            throw new Error(`Spreadsheet not found. Check SPREADSHEET_ID and sharing permissions.`);
        }
        if (err.code === 403) {
            throw new Error(`Permission denied. Did you share the spreadsheet with the service account email?`);
        }
        throw err;
    }

    // 2. Find or create the fixed sheet "sheet-report"
    const sheetsList = spreadsheet.sheets || [];
    let targetSheet = sheetsList.find(s => s.properties.title === SHEET_NAME);

    if (!targetSheet) {
        console.log(`Sheet "${SHEET_NAME}" not found. Creating...`);
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
            },
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        targetSheet = { properties: { title: SHEET_NAME } };
    }

    // 3. Build data rows
    const rows = data.map((item, index) => [
        index + 1,
        item['Problem ID'],
        item['Date'],
        item['Issues'],
        item['Application'],
        item['Host/Service'],
        item['IP Address'],
        item['Error Message'],
        item['Timestamp'],
        item['Time Resolved'],
        item['Duration'],
        item['Status']
    ]);

    // 4. Clear existing data (rows 2 and below)
    const sheetInfo = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:A`,
    });
    const existingRows = sheetInfo.data.values ? sheetInfo.data.values.length : 1;

    if (existingRows > 1) {
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:L${existingRows}`,
        });
        console.log(`Cleared data from A2:L${existingRows}`);
    }

    // 5. Write new data
    if (rows.length > 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:L${rows.length + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: rows },
        });
        console.log(`✅ Uploaded ${rows.length} rows to sheet "${SHEET_NAME}"`);
    } else {
        console.log(`No rows to upload.`);
    }
}
