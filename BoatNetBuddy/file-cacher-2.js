const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { performance } = require("perf_hooks");
const cheerio = require("cheerio");

const CACHE_DIR = path.join(__dirname, "cached_requested");
fs.ensureDirSync(CACHE_DIR);

async function readSources() {
  const sources = [
    '/boot/cache-list.json',
    '/home/tom/buddy/cache-list.json',
    'https://log.tomludlow.co.uk/cache-list'
  ];
  let combined = [];
  for (const src of sources) {
    try {
      const content = src.startsWith('http') ? (await axios.get(src)).data :
                     (fs.existsSync(src) ? JSON.parse(fs.readFileSync(src, 'utf-8')) : []);
      if (Array.isArray(content)) combined.push(...content);
    } catch (err) {
      console.warn(`[Source] Failed to load: ${src}`);
    }
  }
  return combined;
}

let filesCachedCount = 0;
const visited = new Set();

const to_process = new Set();


async function scrapeAndCachePage(url, links = false) {
  if(visited.has(url)) return;
  visited.add(url);

  try {
    console.log(`[Page Cache]: ${url}`);
    let response = await axios.get(url, {timeout: 10000});
    let data  = response.data;
    let $ = cheerio.load(data);
    cachePage(url, data);
    filesCachedCount++;

    let recursive_links = new Set();
    if(links == true) {
      $("a[href]").each((_, el) => {
        let link = $(el).attr("href")?.trim();
        to_process.add(link);
      });
    }
    
    $.root().empty();
    $ = null;
    data = null;
    response = null;
  } catch (err) {
    console.error(`[Page Cache] Error: ${err}`);
  }
}

function cachePage(url, data) {
  const filePath = path.join(CACHE_DIR, getCacheFileName(url));
  const dir = path.dirname(filePath);
  
  // Ensure the directory exists
  fs.ensureDirSync(dir);

  // Write the file
  fs.writeFileSync(filePath, data);
  console.log(`[Page Cache] Written ${url} to ${filePath}`);
}

function extractDomainAndTLD(url) {
  try {
    const parsedUrl = new URL(url);
    const hostnameParts = parsedUrl.hostname.split('.');
    if (hostnameParts.length < 2) {
      throw new Error('Invalid URL');
    }
    const tld = hostnameParts.pop();
    const domain = hostnameParts.pop();
    return domain + "_" + tld;
    //return { domain, tld };
  } catch (error) {
    console.error(`Error parsing URL: ${error.message}`);
    return null;
  }
}

function getCacheFileName(url) {
  const prefix = url.replace(/[^a-zA-Z0-9]/g, "_") + "/";
  return prefix + url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
}


(async function main() {
  const startTime = performance.now();
  const pages = await readSources();
  for (const { url } of pages) {
    await scrapeAndCachePage(url, true);
  }
  console.log(to_process);
  const endTime = performance.now();
  console.log(`[Cache] Completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds.`);
})();