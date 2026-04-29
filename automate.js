// automate.js – using cron pattern
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

// Example: run at minute 0 of every 2nd hour (0,2,4,6,8,10,12,14,16,18,20,22)
// Adjust pattern as needed: '0 */2 * * *'
const cronPattern = '0 */2 * * *';

console.log(`🕒 Scheduling reporting with pattern: "${cronPattern}"`);

cron.schedule(cronPattern, () => {
    console.log(`\n⏰ Running reporting at ${new Date().toLocaleString()}`);
    exec('node reporting.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Reporting error: ${error.message}`);
            return;
        }
        if (stderr) console.error(`⚠️ stderr: ${stderr}`);
        console.log(stdout);
    });
});

console.log('✅ Scheduler started. Press Ctrl+C to stop.');
