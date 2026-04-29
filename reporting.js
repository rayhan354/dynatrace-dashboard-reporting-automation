// reporting.js – run export → (future: problems-breakdown) → send
const { execSync } = require('child_process');
const path = require('path');

console.log('📋 Starting reporting workflow...\n');

try {
    // Step 1: Capture dashboards
    console.log('📸 Step 1: Capturing dashboards...');
    execSync('node export-dashboard.js', {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'dashboard-capture'),
             timeout: 10 * 60 * 1000  // 10 minutes
    });
    console.log('✅ Dashboard capture complete.\n');

    // Step 2 (placeholder): Problems breakdown (future integration)
    console.log('🔍 Step 2: Generating problems breakdown...');
    execSync('node generate-report.js', {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'problems-breakdown')
    });
    console.log('✅ Problems breakdown complete.\n');

    // Step 3: Send via WhatsApp (DEPRECATED!!! TOS VIOLATION!!!)
    // console.log('📤 Step 3: Sending images via WhatsApp...');
    // execSync('node send-dashboard.js', {
    //     stdio: 'inherit',
    //     cwd: path.join(__dirname, 'send-dashboard')
    // });
    // console.log('✅ WhatsApp send complete.\n');

    console.log('🎉 Reporting workflow finished successfully.');
} catch (error) {
    console.error('❌ Reporting workflow failed:', error.message);
    process.exit(1);
}
