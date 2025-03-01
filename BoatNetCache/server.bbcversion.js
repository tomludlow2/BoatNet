const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const cron = require("node-cron");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3006;

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// BBC Base URL & Cache Directory
const BBC_URL = "https://www.bbc.co.uk/news";
const CACHE_DIR = path.join(__dirname, "cached_pages");
fs.ensureDirSync(CACHE_DIR);

// BBC Headings & Regional Sections
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
    `${BBC_URL}/topics`
];

// **Scrape a Page & Cache All Found Links**
async function scrapeAndCachePage(url) {
    try {
        console.log(`[BBC Cache] Scraping: ${url}`);

        // Fetch page HTML
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Save page to cache
        cachePage(url, data);

        // Extract all internal links
        let links = [];
        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();

            if (!link || link.includes("#")) return;

            // Convert relative links to absolute
            if (link.startsWith("/news/")) {
                link = new URL(link, BBC_URL).href;
            }

            // Add only BBC News links
            if (link.startsWith("https://www.bbc.co.uk/news")) {
                links.push(link);
            }
        });

        // Remove duplicates
        links = [...new Set(links)];
        console.log(`[BBC Cache] Found ${links.length} links on ${url}`);

        // Cache each linked article
        for (const articleUrl of links) {
            await cacheArticle(articleUrl);
        }
    } catch (err) {
        console.error(`[BBC Cache] Error scraping ${url}:`, err.message);
    }
}

// Hash a file content
function getFileHash(filePath) {
    const fileContent = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileContent).digest('hex');
}

// **Cache a Single Article, Skipping Unchanged Versions**
async function cacheArticle(url) {
    try {
        console.log(`[BBC Cache] Checking: ${url}`);
        const fileName = getCacheFileName(url);
        const filePath = path.join(CACHE_DIR, fileName);
        const isTopLevel = HEADERS_TO_CACHE.includes(url);

        if (fs.existsSync(filePath)) {
            const localTimestamp = fs.statSync(filePath).mtime.getTime();
            const ageHours = (Date.now() - localTimestamp) / (1000 * 60 * 60);

            if (!isTopLevel && ageHours <= 36) {
                console.log(`[BBC Cache] Skipping (less than 36 hours old): ${url}`);
                return;
            }
            console.log(`[BBC Cache] ${isTopLevel ? 'Top-level page, re-downloading' : 'Page older than 36 hours, re-downloading'}: ${url}`);
        } else {
            console.log(`[BBC Cache] No cached file found for: ${url}, downloading now`);
        }

        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();
            if (link.startsWith("/news/") || link.startsWith("https://www.bbc.co.uk/news")) {
                const fullUrl = link.startsWith("http") ? link : new URL(link, BBC_URL).href;
                const cachedFileName = getCacheFileName(fullUrl);
                $(el).attr("href", `/bbc/${cachedFileName}`);
            }
        });

        fs.writeFileSync(filePath, $.html());
        console.log(`[BBC Cache] Cached updated: ${url}`);
    } catch (err) {
        console.error(`[BBC Cache] Failed to fetch: ${url}`);
    }
}


// **Cache Page Function**
function cachePage(url, data) {
    const fileName = url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
    const filePath = path.join(CACHE_DIR, fileName);
    fs.writeFileSync(filePath, data);
}

// **Fetch Headers Before Downloading**
async function getPageHeaders(url) {
    try {
        const response = await axios.head(url);
        console.log(`[BBC Cache] Headers for ${url}:`, response.headers);
        if (response.headers.etag) {
            console.log(`[BBC Cache] ETag found for ${url}: ${response.headers.etag}`);
        } else {
            console.log(`[BBC Cache] No ETag found for ${url}`);
        }
        return response.headers;
    } catch (err) {
        console.error(`[BBC Cache] Failed to fetch headers for: ${url}`);
        return null;
    }
}


// **Scheduled Task (Every 8 Hours)**
cron.schedule("0 */8 * * *", async () => {
    console.log("[BBC Cache] Starting full site scrape...");

    for (const page of HEADERS_TO_CACHE) {
        await scrapeAndCachePage(page);
    }

    console.log("[BBC Cache] Scraping complete.");
});

// **Force Cache Refresh via Web Panel**
app.get("/refresh-cache", async (req, res) => {
    console.log("[BBC Cache] Manually refreshing cache...");
    
    for (const page of HEADERS_TO_CACHE) {
        await scrapeAndCachePage(page);
    }

    res.redirect("/control-panel");
});

// Function to get cache age
function getCacheAge() {
    const files = fs.readdirSync(CACHE_DIR);
    if (files.length === 0) return "No cache available";

    const timestamps = files.map(file => fs.statSync(path.join(CACHE_DIR, file)).mtime);
    const newest = new Date(Math.max(...timestamps));
    const ageMinutes = Math.round((Date.now() - newest) / (1000 * 60));

    return `Last updated ${ageMinutes} minutes ago`;
}

const getCacheDetails = () => {
    const files = fs.readdirSync(CACHE_DIR);
    const totalArticles = files.length;

    if (totalArticles === 0) {
        return { cacheAge: "No cache available", totalArticles: 0, folderSize: "0 MB" };
    }

    const timestamps = files.map(file => fs.statSync(path.join(CACHE_DIR, file)).mtime);
    const newest = new Date(Math.max(...timestamps));
    const ageMinutes = Math.round((Date.now() - newest) / (1000 * 60));
    const cacheAge = `Last updated ${ageMinutes} minutes ago`;

    const folderSizeBytes = files.reduce((total, file) => total + fs.statSync(path.join(CACHE_DIR, file)).size, 0);
    const folderSize = `${(folderSizeBytes / (1024 * 1024)).toFixed(2)} MB`;

    return { cacheAge, totalArticles, folderSize };
};



function getCacheFileName(url) {
    // Remove the protocol and special characters for uniformity
    return url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
}

app.get("/", (req, res) => {
    res.render("index");
});

// Control Panel
app.get("/control-panel", (req, res) => {
    const { cacheAge, totalArticles, folderSize } = getCacheDetails();
    res.render("control-panel", { cacheAge, totalArticles, folderSize });
});


// **Clear Cache**
app.get("/clear-cache", (req, res) => {
    console.log("[BBC Cache] Clearing cache...");
    fs.emptyDirSync(CACHE_DIR);
    res.redirect("/control-panel");
});

// **BBC Cached Pages List**
app.get("/bbc", (req, res) => {
    const files = fs.readdirSync(CACHE_DIR).map(file => ({
        title: file.replace(".html", "").replace(/_/g, " "),
        file: file
    }));
    res.render("bbc", { articles: files });
});

// **Serve Cached Articles**
app.get("/bbc/:article", (req, res) => {
    const filePath = path.join(CACHE_DIR, req.params.article);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        return res.status(404).render("bbc_404");
    }
});

app.use((req, res) => {
    const referer = req.headers.referer || "";
    if (referer.includes("bbc_co_uk") || req.path.startsWith("/bbc")) {
        res.status(404).render("bbc_404");
    } else {
        res.status(404).render("generic_404");
    }
});


// **Start Server**
app.listen(PORT, () => console.log(`[BBC Cache] Server running on port ${PORT}`));
