// send-dashboard.js may be usable, but use at your own risk!

// This is made exactly as how the so-called "WhatsApp API" providers act at their backend, so you should be rest assured as it won't get banned.'

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const TARGET_PHONE = '<phone-number>'; // International format
const TARGET_GROUP_NAME = '<group-name>'; // exactly as it appears in WhatsApp
const AUTH_FOLDER = 'auth_info_baileys';
const IMAGES_FOLDER = 'images';
// const MESSAGE_COUNT = 3;   // not used currently – sends all images at once

// Timezone offset – should match the one in export-dashboard.js
const TIMEZONE_OFFSET = '+07:00';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesPath = path.join(__dirname, IMAGES_FOLDER);

// Helper: sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculates the last completed 2-hour block based on the current time.
 * Returns Date objects for start and end (both at minute 0, second 0).
 */
function getLastCompletedTwoHourBlock(now) {
    const hour = now.getHours();
    let startDate = new Date(now);
    let endDate = new Date(now);

    let startHour, endHour;

    if (hour >= 2) {
        endHour = Math.floor(hour / 2) * 2;
        startHour = endHour - 2;
        startDate.setHours(startHour, 0, 0, 0);
        endDate.setHours(endHour, 0, 0, 0);
    } else {
        // hour is 0 or 1: block ended at 00:00 today, started at 22:00 yesterday
        endHour = 0;
        startHour = 22;
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(startHour, 0, 0, 0);
        endDate.setHours(endHour, 0, 0, 0);
    }

    return { start: startDate, end: endDate };
}

/**
 * Formats a Date object as "HH:MM" (24‑hour, zero‑padded).
 */
function formatTime(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📦 Using Baileys version: ${version.join('.')} (latest: ${isLatest})`);

    const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Firefox', '120.0'],
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('📱 Scan the QR code with WhatsApp (Linked Devices)');
        }

        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            await sendMessagesWithImages(sock);
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)
            ? lastDisconnect.error.output.statusCode
            : undefined;

            if (statusCode === 515) {
                console.log('🔄 Restart required (515). Waiting 5 seconds before reconnecting...');
                setTimeout(() => {
                    console.log('🚀 Attempting to reconnect...');
                    start();
                }, 5000);
            } else if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`🔌 Connection closed. Reason: ${statusCode || 'unknown'}. Reconnecting...`);
                setTimeout(start, 3000);
            } else {
                console.log('🚪 Logged out. Delete the auth folder to start fresh.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

async function sendMessagesWithImages(sock) {
    // const jid = TARGET_PHONE + '@s.whatsapp.net';

    console.log(`🔍 Searching for group: "${TARGET_GROUP_NAME}"...`);
    const groups = await sock.groupFetchAllParticipating();
    let groupJid = null;

    for (const [jid, metadata] of Object.entries(groups)) {
        if (metadata.subject === TARGET_GROUP_NAME) {
            groupJid = jid;
            break;
        }
    }

    if (!groupJid) {
        console.error(`❌ Group "${TARGET_GROUP_NAME}" not found. Exiting.`);
        process.exit(1);
    }
    console.log(`✅ Found group JID: ${groupJid}`);

    // Use groupJid instead of the phone number JID
    const jid = groupJid;

    // Read all image files from the folder
    let imageFiles;
    try {
        const allFiles = await readdir(imagesPath);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
        imageFiles = allFiles.filter(file =>
        imageExtensions.includes(path.extname(file).toLowerCase())
        );
    } catch (err) {
        console.error(`❌ Could not read images folder (${imagesPath}):`, err.message);
        process.exit(1);
    }

    if (imageFiles.length === 0) {
        console.error(`❌ No image files found in ${imagesPath}. Add .jpg/.png/.gif files.`);
        process.exit(1);
    }

    console.log(`🖼️  Found ${imageFiles.length} image(s).`);

    // --- Determine the time block for the caption (once, as it's the same for all images) ---
    const now = new Date();
    const { start, end } = getLastCompletedTwoHourBlock(now);
    const timeRange = `(${formatTime(start)} - ${formatTime(end)})`;
    const DASHBOARD_NAME_MAP = {
        // Transaction dashboards
        '01-dashboard-name':                        '<Dashboard Name 1>',           // Dashboard names customizer. Customize as needed.
        '02-dashboard-name':                        '<Dashboard Name 2>',           // adjust as needed
        '03-dashboard-name':                        '<Dashboard Name 3>',           // adjust as needed
        '04-dashboard-name':                        '<Dashboard Name 4>',           // adjust as needed
        '05-dashboard-name':                        '<Dashboard Name 5>'            // adjust as needed
    };

    for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const imagePath = path.join(imagesPath, imageFile);
        const imageBuffer = await readFile(imagePath);

        // Extract filename without extension
        const rawName = path.basename(imageFile, path.extname(imageFile));

        // Determine caption based on image name
        let caption;
        if (rawName === '13-dt-problems-breakdown') {
            // Check generate-report.js to match the rawName with the file

            // Special caption: always start at 00:00, end at block end (or 23:59 if midnight)
            const now = new Date();
            const { start, end } = getLastCompletedTwoHourBlock(now);
            const startTimeStr = '00:00';
            const endHour = end.getHours();
            const endMinute = end.getMinutes();
            const endTimeStr = (endHour === 0 && endMinute === 0) ? '23:59' : formatTime(end);
            caption = `Dynatrace Problems Breakdown (${startTimeStr} - ${endTimeStr})`;
        } else {
            // Regular caption for all other dashboards
            const now = new Date();
            const { start, end } = getLastCompletedTwoHourBlock(now);
            const timeRange = `(${formatTime(start)} - ${formatTime(end)})`;
            const dashboardName = DASHBOARD_NAME_MAP[rawName] || rawName;
            caption = `Dashboard ${dashboardName} ${timeRange}`;
        }

        console.log(`📤 Sending message ${i+1}/${imageFiles.length} with "${caption}"...`);

        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: caption
        });

        console.log(`✅ Sent "${caption}" to ${TARGET_PHONE}`);
    }


    console.log('🎉 All messages sent. Exiting...');
    process.exit(0);
}

// Run the bot
start().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
