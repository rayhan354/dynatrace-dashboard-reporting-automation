// dynatrace-fetch.js
import fetch from 'node-fetch';

const DT_CLUSTER_ID = process.env.DT_CLUSTER_ID;
const DT_ENV_ID = process.env.DT_ENV_ID;
const DT_API_TOKEN = process.env.DT_API_TOKEN;
const DT_LINK_FALLBACK = process.env.DT_LINK_FALLBACK; // e.g., 'dynatrace.company.com:9999'

// ========== BASE URL FALLBACK LIST ==========
const BASE_URLS = [
    `https://${DT_CLUSTER_ID}.dynatrace-managed.com/e/${DT_ENV_ID}/api/v2`,
    `https://${DT_LINK_FALLBACK}/e/${DT_ENV_ID}/api/v2` // or simply https://${DT_LINK_FALLBACK}/api/v2
].filter(Boolean); // remove any undefined entries

const MAX_RETRIES_PER_URL = 0;
const RETRY_DELAY_MS = 500;

// Cache the working base URL for the current session
let cachedBaseUrl = null;

/**
 * Reset the cached base URL at the start of a new fetch operation.
 */
function resetCachedBaseUrl() {
    cachedBaseUrl = null;
}

async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES_PER_URL) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 || response.status >= 500) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response;
        } catch (err) {
            lastError = err;
            if (attempt === maxRetries) break;
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
            console.warn(`   ⚠️ Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

/**
 * Execute a request with fallback URLs. If a cached base URL exists, it is used exclusively.
 * Otherwise, tries URLs in order and caches the first successful one.
 */
async function tryWithFallback(requestFn) {
    // If we already found a working base URL, use it directly
    if (cachedBaseUrl) {
        return await requestFn(cachedBaseUrl);
    }

    let lastError;
    for (const baseUrl of BASE_URLS) {
        try {
            console.log(`   🌐 Trying base URL: ${baseUrl}`);
            const response = await requestFn(baseUrl);
            // Success! Cache this URL for subsequent requests
            cachedBaseUrl = baseUrl;
            console.log(`   ✅ Cached working base URL: ${baseUrl}`);
            return response;
        } catch (err) {
            console.warn(`   ❌ Failed with ${baseUrl}: ${err.message}`);
            lastError = err;
        }
    }
    throw new Error(`All base URLs failed. Last error: ${lastError?.message}`);
}

export async function fetchAllProblemIds(fromISO, toISO) {
    resetCachedBaseUrl(); // fresh start for this report

    let allProblems = [];
    let nextPageKey = null;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Api-Token ${DT_API_TOKEN}`
    };

    do {
        const response = await tryWithFallback(async (baseUrl) => {
            const url = new URL(`${baseUrl}/problems`);
            if (nextPageKey) {
                url.searchParams.set('nextPageKey', nextPageKey);
            } else {
                url.searchParams.set('from', fromISO);
                url.searchParams.set('to', toISO);
                url.searchParams.set('pageSize', 500);
                url.searchParams.set('sort', '+startTime');
            }
            console.log(`🌐 Request URL: ${url.toString()}`);
            return await fetchWithRetry(url.toString(), { headers });
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dynatrace API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        allProblems.push(...data.problems);
        nextPageKey = data.nextPageKey;
    } while (nextPageKey);

    return allProblems;
}

export async function fetchProblemDetail(problemId) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Api-Token ${DT_API_TOKEN}`
    };

    const response = await tryWithFallback(async (baseUrl) => {
        const url = `${baseUrl}/problems/${problemId}`;
        return await fetchWithRetry(url, { headers });
    });

    if (!response.ok) return null;
    return await response.json();
}
