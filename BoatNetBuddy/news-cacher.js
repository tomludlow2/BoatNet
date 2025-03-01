const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");
const { performance } = require("perf_hooks");
const { exec, execSync } = require('child_process');

const BBC_URL = "https://www.bbc.co.uk/news";
const GUARDIAN_URL = "https://www.theguardian.com";
const CACHE_DIR = path.join(__dirname, "cached_pages");
fs.ensureDirSync(CACHE_DIR);
fs.emptyDirSync(CACHE_DIR);

const HEADERS_TO_CACHE = [
    BBC_URL,
    `${BBC_URL}/uk`,
    `${BBC_URL}/england`,
    `${BBC_URL}/scotland`,
    `${BBC_URL}/wales`,
    `${BBC_URL}/northern_ireland`,
    `${BBC_URL}/localnews`,
    `${BBC_URL}/world`,
    `${BBC_URL}/business`,
    `${BBC_URL}/technology`,
    `${BBC_URL}/science_and_environment`,
    `${BBC_URL}/entertainment_and_arts`,
    `${BBC_URL}/health`,
    `${BBC_URL}/education`,
    `${BBC_URL}/in_depth`,
    `${BBC_URL}/topics`,
    `${GUARDIAN_URL}/uk`,
    `${GUARDIAN_URL}/world`,
    `${GUARDIAN_URL}/uk/business`,
    `${GUARDIAN_URL}/uk/commentisfree`,
    `${GUARDIAN_URL}/uk-news`,
    `${GUARDIAN_URL}/uk/culture`,
    `${GUARDIAN_URL}/politics`,
    `${GUARDIAN_URL}/americas`,
    `${GUARDIAN_URL}/us-news`
];

const visited = new Set();
let filesCachedCount = 0;
const MAX_CONCURRENCY = 5; // Number of pages to process simultaneously

// Task Queue for Concurrent Requests
const queue = [];
const articleQueue = [];
let articleQueueMaxBBC = 20;
let articleQueueMaxGuardian =20;
let activeRequests = 0;
let activeArticleRequests = 0;

async function logToServer(message) {
  try {
    await axios.get(`http://log.tomludlow.co.uk/?log=${encodeURIComponent(message)}`);
  } catch (error) {
    console.error('[LogToServer] Failed to send log message:', error.message);
  }
}

function cachePage(url, data) {
  const filePath = path.join(CACHE_DIR, getCacheFileName(url));
  fs.writeFileSync(filePath, data);
  console.log(`[News Cache] Cached: ${url}`);
}

function getCacheFileName(url) {
  const prefix = url.includes("theguardian.com") ? "guardian_" : "bbc_";
  return prefix + url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
}

async function scrapeAndCachePage(url) {
  if (visited.has(url)) return;
  visited.add(url);

  try {
    console.log(`[News Cache] Scraping: ${url}`);
    let response = await axios.get(url, { timeout: 10000 });
    let data = response.data;

    let $ = cheerio.load(data);
    cachePage(url, data);
    filesCachedCount++;

    // Collect internal links
    let links = [];
    $("a[href]").each((_, el) => {
      let link = $(el).attr("href")?.trim();
      if( !link || link.includes("#")) return;
      if (link?.startsWith("/")) {
        if( url.includes("bbc.co.uk")) link = new URL(link, BBC_URL).href;
        else if( url.includes("theguardian.com")) link = new URL(link.BBC_URL).href;
        link = new URL(link, url).href;

        if( link.includes("bbc.co.uk") || link.includes("theguardian.com")) {
          const fullUrl = link;
          const cachedFileName = getCacheFileName(fullUrl);
          const prefix = url.includes("theguardian") ? '/guardian/' : '/bbc/';
          $(el).attr("href", `${prefix}${cachedFileName}`);
        }      
      }
      if ((link?.includes("bbc.co.uk/news") || link?.includes("theguardian.com")) && !visited.has(link)) {
        links.push(link);
      }
    });

    links = [...new Set(links)]

    for (const articleUrl of links) {
      console.log(`Adding ${articleUrl} to article queue`);
      addToArticleQueue(articleUrl)
    }

    // Free up memory by clearing DOM references
    $.root().empty();
    $ = null;
    data = null;
    response = null;
    links = null;

  } catch (err) {
    console.error(`[News Cache] Error scraping ${url}:`, err.message);
  }
}


// Add these new global counters
const MAX_TOTAL_ARTICLES = 800;
const MAX_BBC_ARTICLES = MAX_TOTAL_ARTICLES / 2; // 200
const MAX_GUARDIAN_ARTICLES = MAX_TOTAL_ARTICLES / 2; // 200

let bbcArticlesCached = 0;
let guardianArticlesCached = 0;

async function cacheArticle(url) {
  if (visited.has(url)) return;
  visited.add(url);

  const isBBC = url.includes("bbc.co.uk");
  const isGuardian = url.includes("theguardian.com");

  // Stop if source-specific limit reached
  if ((isBBC && bbcArticlesCached >= MAX_BBC_ARTICLES) ||
      (isGuardian && guardianArticlesCached >= MAX_GUARDIAN_ARTICLES)) {
    return;
  }

  try {
    console.log(`\t[News Cache AQ]: ${url}`);
    const fileName = getCacheFileName(url);
    const filePath = path.join(CACHE_DIR, fileName);

    let response = await axios.get(url, { timeout: 15000 });
    let data = response.data;
    let $ = cheerio.load(data);

    // Adjust Links for Offline Viewing
    $("a[href]").each((_, el) => {
      let link = $(el).attr("href")?.trim();
      if (link?.startsWith("/")) {
        if (url.includes("bbc.co.uk")) {
          link = new URL(link, BBC_URL).href;
        } else if (url.includes("theguardian.com")) {
          link = new URL(link, GUARDIAN_URL).href;
        }
        if( link.includes("bbc.co.uk") || link.includes("theguardian.com")) {
          const fullUrl = link;
          const cachedFileName = getCacheFileName(fullUrl);
          const prefix = url.includes("theguardian") ? '/guardian/' : '/bbc/';
          $(el).attr("href", `${prefix}${cachedFileName}`);
        } 
      }
    });

    // Save Article
    fs.writeFileSync(filePath, $.html());

    // Increment Counters
    if (isBBC) bbcArticlesCached++;
    if (isGuardian) guardianArticlesCached++;

    console.log(`\t[News Cache AQ] - Success | BBC: ${bbcArticlesCached}, Guardian: ${guardianArticlesCached}`);

    // Free memory
    $.root().empty();
    $ = null;
    response = null;
    data = null;

    if (bbcArticlesCached >= MAX_BBC_ARTICLES && guardianArticlesCached >= MAX_GUARDIAN_ARTICLES) {
      console.log(`[News Cache] Reached total article limit (200 BBC & 200 Guardian).`);
      await logToServer(`[News Cache] Reached total article limit (200 BBC & 200 Guardian).`);
    }

  } catch (err) {
    console.log(`\t[News Cache AQ] - Error - ${err.message}`);
  }
}

function getCacheFileName(url) {
    let prefix = "";
    if (url.includes("theguardian.com")) prefix = "guardian_";
    else prefix = "bbc_";
    return prefix + url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
}


function addToArticleQueue(url) {
  articleQueue.push(url);
  processArticleQueue();
}

function addToQueue(url) {
  if (!visited.has(url)) {
    queue.push(url);
    processQueue();
  }
}

async function processQueue() {
  while (queue.length > 0 && activeRequests < 2) {
    const url = queue.shift();
    activeRequests++;
    await scrapeAndCachePage(url);
    activeRequests--;

    // Periodically run garbage collection to clear memory
    if (global.gc) {
      global.gc();
    }

    if( queue.length % 10 === 0 ) {
      await logToServer(`[News Cache] Total Main Queue Remaining: ${queue.length}`);
    }

    // Give Node.js time to handle garbage collection
    await new Promise((resolve) => setImmediate(resolve));
  }

  /*if (queue.length === 0 && activeRequests === 0 && articleQueue.length === 0 && activeArticleRequests === 0) {
    console.log(`[News Cache] Scrape complete. Total files cached: ${filesCachedCount}`);
    await logToServer(`[News Cache] Scrape complete. Total files cached: ${filesCachedCount}`);
    process.exit(0);
  }*/
}

async function processArticleQueue() {
  console.log(`\t\t\t\tCurrent Article Queue Length: ${articleQueue.length}`);

  while (
    articleQueue.length > 0 && 
    activeArticleRequests < MAX_CONCURRENCY && 
    (bbcArticlesCached < MAX_BBC_ARTICLES || guardianArticlesCached < MAX_GUARDIAN_ARTICLES)
  ) {
    const url = articleQueue.shift();
    activeArticleRequests++;
    await cacheArticle(url);
    activeArticleRequests--;

    if (global.gc) global.gc(); // Optional Garbage Collection

    if (articleQueue.length % 10 === 0) {
      await logToServer(`[News Cache] Articles remaining: ${articleQueue.length}`);
    }

    if (bbcArticlesCached >= MAX_BBC_ARTICLES && guardianArticlesCached >= MAX_GUARDIAN_ARTICLES) {
      console.log(`[News Cache] Both BBC and Guardian article limits reached.`);
      break;
    }

    await new Promise(resolve => setImmediate(resolve)); // Let Node.js breathe
  }

  if (bbcArticlesCached >= MAX_BBC_ARTICLES && guardianArticlesCached >= MAX_GUARDIAN_ARTICLES) {
    console.log(`[News Cache] Total article limit reached (200 BBC, 200 Guardian).`);
    await logToServer(`[News Cache] Total article limit reached (200 BBC, 200 Guardian).`);
  }
}



(async function main() {
  await logToServer(`Starting to Cache News Files, this could take some time...`);
  const startTime = performance.now();

  // Start scraping with concurrency
  HEADERS_TO_CACHE.forEach((url) => addToQueue(url));
  await processQueue();
  await processArticleQueue();

  const endTime = performance.now();
  console.log(`[News Cache] Total time taken: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
  await logToServer(`[News Cache] Total time taken: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
  exec("sudo systemctl start postprocess");
})();
