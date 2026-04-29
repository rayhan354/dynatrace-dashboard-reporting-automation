import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';

const AUTH_FOLDER = 'auth_info_baileys'; // Match the folder name from your main script

async function logout() {
    // Check if auth folder exists
    if (!existsSync(AUTH_FOLDER)) {
        console.log('❌ No saved session found. Already logged out locally.');
        process.exit(0);
    }

    try {
        // Load existing credentials
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        // Connect to WhatsApp
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // No QR needed for logout
        });

        // Wait for connection
        sock.ev.on('connection.update', async ({ connection }) => {
            if (connection === 'open') {
                console.log('🔓 Logging out from WhatsApp servers...');

                // Invalidate session remotely
                await sock.logout();
                console.log('✅ Successfully logged out from WhatsApp.');

                // Clean up local files
                await cleanupLocal();
            }

            if (connection === 'close') {
                console.log('📴 Connection closed.');
                process.exit(0);
            }
        });

    } catch (error) {
        console.error('❌ Error during logout:', error.message);
        process.exit(1);
    }
}

async function cleanupLocal() {
    try {
        await rm(AUTH_FOLDER, { recursive: true, force: true });
        console.log(`🗑️  Local session folder "${AUTH_FOLDER}" deleted.`);
    } catch (err) {
        console.log(`⚠️  Could not delete local folder: ${err.message}`);
    }
    process.exit(0);
}

// Handle timeout (if connection hangs)
setTimeout(() => {
    console.log('⏰ Timeout reached. Deleting local files anyway...');
    cleanupLocal();
}, 15000); // 15 seconds timeout

logout();
