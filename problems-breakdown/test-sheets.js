// test-sheets.js
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYFILE_PATH = path.join(__dirname, 'service-account-key.json');
const SPREADSHEET_ID = '<spreadsheet-ID>';

async function test() {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEYFILE_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    console.log(`🔑 Auth email: ${(await authClient.getCredentials()).client_email}`);

    const sheets = google.sheets({ version: 'v4', auth: authClient });
    try {
        const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        console.log(`✅ Success! Sheet title: ${res.data.properties.title}`);
    } catch (err) {
        console.error(`❌ Error ${err.code}: ${err.message}`);
        if (err.errors) console.error(err.errors);
    }
}

test();
