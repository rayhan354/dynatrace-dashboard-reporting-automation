const puppeteer = require('puppeteer-core');
const path = require('path');
const pLimit = require('@esm2cjs/p-limit').default;
const fs = require('fs');

// ========== GLOBAL CONFIGURATION ==========
const LOGIN_URL = 'https://<DT-LINK-URL>/login';
    // <DT-LINK-URL> is https://<cluster-id>.dynatrace-managed.com/
    // If you're using SaaS, <DT-LINK-URL> is https://<env-id>.apps.dynatrace.com/ or change 'apps' to 'live' if having issues

const config = require('./config.json');
const USERNAME = config.username;
const PASSWORD = config.password;
const LINK_FALLBACK = config.linkfallback;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TIMEZONE_OFFSET = '+07:00';  // Common offset for all dashboards

// ========== DASHBOARD LIST ==========
const dashboards = [
    {
        name: '01-dashboard-name',
        baseUrl: 'https://<DT-LINK-URL>/#dashboard;gf=<MZ-ID>;id=<dashboard-id>',
        // MZ ID is the management zone ID or simply change to "all" if none set.
        // <dashboard-id> is ur dashboard ID. You'd better fuck off if you don't understand what this is for.

        viewportWidth: 2032,
        viewportHeight: 1450 // See "What to fix.txt" for details.
    },
    {
        name: '02-dashboard-name',
        baseUrl: 'https://<DT-LINK-URL>/#dashboard;gf=<MZ-ID>;id=<dashboard-id-2>', 
        viewportWidth: 2032,
        viewportHeight: 1450
    },
    {
        name: '03-dashboard-name',
        baseUrl: 'https://<DT-LINK-URL>/#dashboard;gf=<MZ-ID>;id=<dashboard-id-3>',
        viewportWidth: 2032,
        viewportHeight: 1450
    },
    {
        name: '04-dashboard-name',
        baseUrl: 'https://<DT-LINK-URL>/#dashboard;gf=<MZ-ID>;id=<dashboard-id-4>',
        viewportWidth: 1982,
        viewportHeight: 1750
    },
    {
        name: '05-dashboard-name',
        baseUrl: 'https://<DT-LINK-URL>/#dashboard;gf=<MZ-ID>;id=<dashboard-id-5>',
        viewportWidth: 2032,
        viewportHeight: 1350
    }

    // Add as much as you need.
    ];

// ========== HELPER FUNCTIONS (same as before) ==========
function getLastCompletedTwoHourBlock(now, offset) {
    let hour = now.getHours();
    let date = new Date(now);

    // let startHour = endHour - 2;
    let startDate = new Date(date);
    let endDate = new Date(date);

    let startHour, endHour;

    if (hour >= 2) {
        // Normal case: last completed block ended at the previous even hour
        endHour = Math.floor(hour / 2) * 2;
        startHour = endHour - 2;
        startDate.setHours(startHour, 0, 0, 0);
        endDate.setHours(endHour, 0, 0, 0);
    } else {
        // hour is 0 or 1: block ended at 00:00 today, started at 22:00 yesterday
        endHour = 0;
        startHour = 22;
        startDate.setDate(date.getDate() - 1); // yesterday
        startDate.setHours(startHour, 0, 0, 0);
        endDate.setHours(endHour, 0, 0, 0);   // today 00:00
    }

    startDate.setHours(startHour, 0, 0, 0);
    endDate.setHours(endHour, 0, 0, 0);

    const format = (dt) => {
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const hh = String(dt.getHours()).padStart(2, '0');
        const mi = String(dt.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00${offset}`;
    };

    return {
        start: format(startDate),
        end: format(endDate)
    };
}

function buildDashboardUrl(baseUrl, now, offset) {
    const { start, end } = getLastCompletedTwoHourBlock(now, offset);
    const gtfValue = `${start}%20to%20${end}`;
    let base = baseUrl;
    base = base.replace(/;gtf=[^;]*/, '');
    base = base.replace(/;$/, '');
    return `${base};gtf=${gtfValue}`;
}

async function waitForDashboardDataComplete(page, maxTimeoutSeconds = 300) {
    console.log('⏳ Waiting for all dashboard tiles to load...');

    // Wait for the grid to exist
    await page.waitForSelector('.grid-dashboard');

    // Wait for all tiles to have data-tile-loading="false" and for the spinner to disappear
    try {
        await page.waitForFunction(
            () => {
                // Find all tiles that have data-tile-loading attribute
                const tiles = document.querySelectorAll('[data-tile-loading]');
                if (tiles.length === 0) return true; // no tiles, assume loaded

                // Check if any tile still has loading="true"
                const anyLoading = Array.from(tiles).some(tile => tile.getAttribute('data-tile-loading') === 'true');
                if (anyLoading) return false;

                // Also ensure the global spinner is gone
                const spinner = document.querySelector('.dOt-c');
                const spinnerVisible = spinner && spinner.offsetParent !== null;

                // Also ensure the global spinner is gone part 2
                const spinner2 = document.querySelector('.dBj-a');
                const spinnerVisible2 = spinner2 && spinner2.offsetParent !== null;
                return !spinnerVisible && !spinnerVisible2;
            },
            { timeout: maxTimeoutSeconds * 1000, polling: 500 }
        );
        console.log('✅ All tiles loaded'); // (data-tile-loading=false) and spinner hidden
    } catch (e) {
        console.warn(`⚠️ Timeout waiting for tiles to load after ${maxTimeoutSeconds}s, continuing...`);
    }

    // DOM Detection
    try {
        await page.waitForFunction(
            () => {
                return new Promise(resolve => {
                    let timeout;
                    const observer = new MutationObserver(() => {
                        clearTimeout(timeout);
                        timeout = setTimeout(() => {
                            observer.disconnect();
                            resolve(true);
                        }, 300);
                    });
                    const target = document.querySelector('[data-tile-loading="false"]');
                    if (!target) return false; // still waiting for it to appear

                    observer.observe((target), {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true
                    });
                    // Trigger initial timeout
                    timeout = setTimeout(() => {
                        observer.disconnect();
                        resolve(true);
                    }, 300);
                });
            },
            { timeout: 10000, polling: 500 }
        );
        console.log('✅ DOM stable');
    } catch (e) {
        console.warn('⚠️ Timeout waiting, continuing anyway...');
    }

    console.log('✅ Dashboard ready for capture');
}

async function enforceSidebarCollapsed(page) {
    console.log('🖱️ Forcing sidebar to collapsed state...');

    // 1. Move mouse to a safe area first to avoid hover conflicts
    await page.mouse.move(10, 10);

    // 2. Wait for root element
    await page.waitForSelector('[data-cache="root"]', { timeout: 10000 });

    // 3. Attempt to click the collapse arrow if present (often the most reliable method)
    const arrowClicked = await page.evaluate(() => {
        // Look for the collapse/expand toggle (arrow icon)
        const arrow = document.querySelector('[uitestid="gwt-debug-arrow"]');
        if (arrow) {
            arrow.click();
            return true;
        }
        return false;
    });

    if (arrowClicked) {
        console.log('   ↳ Clicked collapse arrow');
        // Wait for animation
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        await page.mouse.move(0, 0);
    } else {
        console.log('   ↳ No collapse arrow found, falling back to class manipulation');
        // 4. Class-based fallback
        await page.evaluate(() => {
            const root = document.querySelector('[data-cache="root"]');
            if (root) {
                root.classList.remove('du-h');
                root.classList.add('du-i');
            }
            const nav = document.querySelector('[data-cache="navmenu"]');
            if (nav) {
                nav.classList.remove('dql-h');
                // Do NOT add dql-i unless you confirm it's the correct collapsed class
            }
        });
        await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    }

    // 5. Wait for grid to shift to left edge (near 0)
    try {
        await page.waitForFunction(
            () => {
                const grid = document.querySelector('.grid-dashboard');
                if (!grid) return false;
                const rect = grid.getBoundingClientRect();
                return rect.left <= 20;
            },
            { timeout: 5000, polling: 200 }
        );
        console.log('   ↳ Grid left edge near 0 (sidebar collapsed)');
    } catch {
        console.warn('   ⚠️ Grid left edge still > 20, sidebar may not be fully collapsed');
    }

    // 6. Final repaint
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    const finalLeft = await page.evaluate(() => {
        const grid = document.querySelector('.grid-dashboard');
        return grid ? grid.getBoundingClientRect().left : 'unknown';
    });
    console.log(`   ↳ Final grid left edge: ${finalLeft}px`);
}

function unionBox(boxA, boxB) {
    const minX = Math.min(boxA.x, boxB.x);
    const minY = Math.min(boxA.y, boxB.y);
    const maxX = Math.max(boxA.x + boxA.width, boxB.x + boxB.width);
    const maxY = Math.max(boxA.y + boxA.height, boxB.y + boxB.height);
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

// ========== MAIN ==========
(async () => {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: 'new',
            slowMo: 30, // to prevent missed loading
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();
        // await page.setViewport({ width: 4000, height: 3000 });

        // --- LOGIN ONCE ---
        console.log('🔐 Logging in...');
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
        await page.waitForSelector('#user', { timeout: 10000 });
        await page.type('#user', USERNAME);
        await page.type('#password', PASSWORD);
        await Promise.all([
            page.click('input[type="submit"]'),
                          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);
        console.log('✅ Login successful');

        // --- PROCESS EACH DASHBOARD IN PARALLEL (with concurrency limit) ---
        const limit = pLimit(3); // max 6 dashboards at the same time

        const dashboardTasks = dashboards.map((dashboard, idx) =>
        limit(async () => {
            const page = await browser.newPage(); // fresh page per dashboard
            try {
                console.log(`\n📊 Processing dashboard ${idx+1}: ${dashboard.name}`);

                // Set viewport for this dashboard
                await page.setViewport({
                    width: dashboard.viewportWidth || 3840,
                    height: dashboard.viewportHeight || 2160
                });

                // Build and navigate
                const dashboardUrl = buildDashboardUrl(dashboard.baseUrl, new Date(), TIMEZONE_OFFSET);
                console.log(`Navigating to: ${dashboardUrl}`);
                await page.goto(dashboardUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                // Wait for load and collapse sidebar
                await waitForDashboardDataComplete(page, 60);
                await enforceSidebarCollapsed(page);

                // Capture screenshot (same logic as original)
                await page.waitForSelector('[data-cache="topbar"]', { timeout: 10000 });
                await page.waitForSelector('.grid-dashboard', { timeout: 10000 });
                const grid = await page.$('.grid-dashboard');
                const gridBox = await grid.boundingBox();
                const topbar = await page.$('[data-cache="topbar"]');
                const topbarBox = await topbar.boundingBox();
                const clip = {
                    x: 0,
                    y: 0,
                    width: gridBox.width + topbarBox.x,
                    height: gridBox.height + topbarBox.y
                };

                // const outputPath = path.join(__dirname, `${dashboard.name}.png`);

                let outputPath;
                try {
                    const target = path.join(__dirname, '..', 'send-dashboard', 'images');
                    fs.mkdirSync(target, { recursive: true });
                    outputPath = path.join(target, `${dashboard.name}.png`);
                } catch(e) {
                    outputPath = path.join(__dirname, `${dashboard.name}.png`);
                }

                await page.screenshot({ path: outputPath, clip: clip });
                console.log(`✅ Saved: ${outputPath}`);

            } catch (err) {
                console.error(`❌ Dashboard ${dashboard.name} failed:`, err.message);
                // Fallback full‑page screenshot
                // try {
                //     await page.screenshot({ path: `${dashboard.name}_full.jpg`, fullPage: true, type: 'jpeg' });
                // } catch (fallbackErr) {
                //     console.error(`   Fallback also failed:`, fallbackErr.message);
                // }
                // Your screenshot will likely fucked if you enable this block
            } finally {
                await page.close();
            }
        })
        );

        await Promise.all(dashboardTasks);

        console.log('\n🎉 All dashboards processed successfully!');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        if (browser) await browser.close();
    }
})();
