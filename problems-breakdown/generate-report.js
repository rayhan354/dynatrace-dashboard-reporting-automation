// generate-report.js
import puppeteer from 'puppeteer';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToGoogleSheet } from './googlesheets.js';
import { fetchAllProblemIds, fetchProblemDetail } from './dynatrace-fetch.js';

console.log('DT_CLUSTER_ID:', process.env.DT_CLUSTER_ID);
console.log('DT_ENV_ID:', process.env.DT_ENV_ID);
console.log('DT_API_TOKEN:', process.env.DT_API_TOKEN ? '****' : 'MISSING');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------- CONFIGURATION -------------------
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/<spreadsheet-id>/edit#gid=0'; // use your spreadsheet link
const PIVOT_TABLE_CLIP = { x: 1750, y: 500, width: 1350, height: 675 }; // Adjust for which part you want to capture

// Define output directories
const CSV_OUTPUT_DIR = path.join(__dirname);                                            // CSV stays in problems-breakdown
const SCREENSHOT_OUTPUT_DIR = path.join(__dirname, '..', 'send-dashboard', 'images');   // Screenshot goes here

// Ensure output directories exist
if (!fs.existsSync(CSV_OUTPUT_DIR)) fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOT_OUTPUT_DIR)) fs.mkdirSync(SCREENSHOT_OUTPUT_DIR, { recursive: true });
// -----------------------------------------------------

/**
 * Converts a Date or epoch to a Jakarta date string (YYYY-MM-DD). Adjust as needed.
 * @param {Date|number} input - Date object or epoch milliseconds
 * @returns {string} Date in YYYY-MM-DD format (Jakarta time)
 */
function getJakartaDateString(input) {
    const date = input instanceof Date ? input : new Date(input);
    // Convert to Jakarta time by adding 7 hours to UTC
    const jakartaTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const year = jakartaTime.getUTCFullYear();
    const month = String(jakartaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jakartaTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Determine the report time range based on current Jakarta time (UTC+7). Adjust as needed.
 * @returns {{ from: Date, to: Date, sheetDate: string }}
 */
function getTimeRange() {
    const now = new Date();
    const jakartaOffset = 7 * 60 * 60 * 1000;
    const jakartaNow = new Date(now.getTime() + jakartaOffset);

    const currentHour = jakartaNow.getUTCHours();
    const currentYear = jakartaNow.getUTCFullYear();
    const currentMonth = jakartaNow.getUTCMonth();
    const currentDay = jakartaNow.getUTCDate();

    let reportYear, reportMonth, reportDay, startHour, endHour;

    if (currentHour < 2) {
        const yesterday = new Date(Date.UTC(currentYear, currentMonth, currentDay) - 24*60*60*1000);
        reportYear = yesterday.getUTCFullYear();
        reportMonth = yesterday.getUTCMonth();
        reportDay = yesterday.getUTCDate();
        startHour = 0;
        endHour = 24;
    } else {
        reportYear = currentYear;
        reportMonth = currentMonth;
        reportDay = currentDay;
        startHour = 0;
        endHour = Math.floor(currentHour / 2) * 2;
    }

    const pad = (n) => String(n).padStart(2, '0');

    const formatISO = (y, m, d, h, min, s, ms) =>
    `${y}-${pad(m+1)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(s)}.${String(ms).padStart(3,'0')}+07:00`;

    const fromISO = formatISO(reportYear, reportMonth, reportDay, startHour, 0, 0, 0);
    const toISO = endHour === 24
    ? formatISO(reportYear, reportMonth, reportDay, 23, 59, 59, 999)
    : formatISO(reportYear, reportMonth, reportDay, endHour, 0, 0, 0);

    const sheetDate = `${pad(reportDay)}-${pad(reportMonth+1)}-${reportYear}`;

    // Date objects for filtering (convert Jakarta time to UTC for epoch comparison)
    const fromDate = new Date(Date.UTC(reportYear, reportMonth, reportDay, startHour - 7, 0, 0));
    const toDate = endHour === 24
    ? new Date(Date.UTC(reportYear, reportMonth, reportDay, 23 - 7, 59, 59, 999))
    : new Date(Date.UTC(reportYear, reportMonth, reportDay, endHour - 7, 0, 0));

    return { fromISO, toISO, sheetDate, fromDate, toDate };
}

/**
 * Convert a Dynatrace problem detail into a flat row object.
 */
async function problemToRow(problemSummary, index) {
    const detail = await fetchProblemDetail(problemSummary.problemId);
    if (!detail) return null;

    const problemId = detail.displayId;
    const startTime = new Date(detail.startTime);
    const endTime = detail.endTime === -1 ? null : new Date(detail.endTime);

    const formattedDate = getJakartaDateString(startTime);

    const issues = detail.title;
    const application = detail.managementZones?.[0]?.name || '-';
    const hostServices = detail.impactedEntities?.[0]?.name || '-';
    const ipAddress = (hostServices.includes(' - ') && hostServices.split(' - ')[1]?.match(/^\d/))
    ? hostServices.split(' - ')[1]
    : '-';

    // Extract error message from evidence
    const eventEvidence = detail.evidenceDetails?.details?.find(e => e.evidenceType === 'EVENT');
    let errorMsg = '-';
    if (eventEvidence) {
        const descProp = eventEvidence.data?.properties?.find(p => p.key === 'dt.event.description');
        if (descProp) {
            errorMsg = descProp.value.replace(/\n/g, ' ').replace(/["'\\]+/g, '');
        }
    }

    // Jakarta timestamp for start
    const jakartaStart = new Date(startTime.getTime() + (7 * 60 * 60 * 1000));
    const timestamp = `${formattedDate} ${String(jakartaStart.getUTCHours()).padStart(2, '0')}:${String(jakartaStart.getUTCMinutes()).padStart(2, '0')}`;

    let timeResolved = '-';
    let duration = '-';
    let status = detail.status;

    if (endTime) {
        const jakartaEnd = new Date(endTime.getTime() + (7 * 60 * 60 * 1000));
        const endDateStr = getJakartaDateString(endTime);

        if (endDateStr === formattedDate) {
            timeResolved = `${formattedDate} ${String(jakartaEnd.getUTCHours()).padStart(2, '0')}:${String(jakartaEnd.getUTCMinutes()).padStart(2, '0')}`;
            const diffMs = endTime - startTime;
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
            duration = `${days} days ${hours} hours ${minutes} minutes`;
        } else {
            // Ended on a later day → keep as OPEN
            status = 'OPEN';
        }
    }

    return {
        No: index + 1,
        'Problem ID': problemId,
        Date: formattedDate,
        Issues: issues,
        Application: application,
        'Host/Service': hostServices,
        'IP Address': ipAddress,
        'Error Message': errorMsg,
        Timestamp: timestamp,
        'Time Resolved': timeResolved,
        Duration: duration,
        Status: status
    };
}

/**
 * Convert row objects to CSV string.
 */
function rowsToCSV(rows) {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const csvRows = [
        headers.join(','),
        ...rows.map(row => headers.map(h => {
            const val = row[h];
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(','))
    ];
    return csvRows.join('\n');
}

// ------------------- MAIN WORKFLOW -------------------
(async () => {
    try {
        // 1. Determine time range
        const { fromISO, toISO, sheetDate, fromDate, toDate } = getTimeRange();
        console.log(`📅 Fetching problems from ${fromISO} to ${toISO}`);
        console.log(`📋 Target Google Sheet tab: "${sheetDate}"`);

        // 2. Fetch all problem summaries
        const problems = await fetchAllProblemIds(fromISO, toISO);
        console.log(`🔍 Found ${problems.length} problem summaries.`);

        // Filter strictly by startTime
        const fromEpoch = fromDate.getTime();
        const toEpoch = toDate.getTime();
        const filteredProblems = problems.filter(p => p.startTime >= fromEpoch && p.startTime <= toEpoch);
        console.log(`⏳ After strict filtering: ${filteredProblems.length} problems within exact range.`);

        if (filteredProblems.length === 0) {
            console.log('⚠️ No problems to process. Skipping upload and screenshots.');
            return;
        }


        // 3. Fetch details for each problem (parallel with concurrency control)
        const CONCURRENCY = 500;
        const rows = [];
        for (let i = 0; i < filteredProblems.length; i += CONCURRENCY) {
            const chunk = filteredProblems.slice(i, i + CONCURRENCY);
            const chunkResults = await Promise.all(
                chunk.map((p, idx) => problemToRow(p, i + idx))
            );
            rows.push(...chunkResults.filter(r => r !== null));
            console.log(`   Processed ${Math.min(i + CONCURRENCY, filteredProblems.length)}/${filteredProblems.length}`);
        }

        // 4. Save CSV locally
        const csvContent = rowsToCSV(rows);
        const csvFilename = `REPORT_${getJakartaDateString(fromDate)}.csv`;
        const csvPath = path.join(CSV_OUTPUT_DIR, csvFilename);
        fs.writeFileSync(csvPath, csvContent, 'utf8');
        console.log(`💾 CSV saved: ${csvPath}`);

        // 5. Upload to Google Sheets
        console.log('☁️ Uploading to Google Sheets...');
        await uploadToGoogleSheet(rows, sheetDate);
        console.log('✅ Upload complete.');

        // 6. Take screenshots with Puppeteer
        console.log('📸 Launching browser for screenshots...');
        const browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 3840, height: 2160 });

        await page.goto(SHEET_URL, { waitUntil: 'networkidle2' });
        // Wait a bit for charts to render
        // await page.waitForTimeout(3000);

        // Wait for the chart element to be present in the DOM
        await page.waitForSelector('.waffle-objwrap-gvizchart');

        const screenshotPath = path.join(SCREENSHOT_OUTPUT_DIR, '13-dt-problems-breakdown.png');
        await page.screenshot({ path: screenshotPath, clip: PIVOT_TABLE_CLIP });
        // await page.screenshot({ path: 'pie_chart.png', clip: PIE_CHART_CLIP });

        console.log(`📸 Screenshot saved: ${screenshotPath}`);
        await browser.close();

        console.log('🎉 All tasks completed successfully.');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
})();
