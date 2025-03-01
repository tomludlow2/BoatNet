const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const cron = require("node-cron");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3006;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const BBC_URL = "https://www.bbc.co.uk/news";
const GUARDIAN_URL = "https://www.theguardian.com";
const CACHE_DIR = path.join(__dirname, "cached_pages");
const REQUESTED_CACHE_DIR = path.join(__dirname, 'cached_requested', 'cached_requested');
fs.ensureDirSync(REQUESTED_CACHE_DIR);
fs.ensureDirSync(CACHE_DIR);

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
    `${GUARDIAN_URL}/business`,
    `${GUARDIAN_URL}/technology`,
    `${GUARDIAN_URL}/environment`,
    `${GUARDIAN_URL}/culture`,
    `${GUARDIAN_URL}/sport`,
    `${GUARDIAN_URL}/science`
];

const SOURCES = {
    bbc: { label: "BBC News", prefix: "bbc_" },
    guardian: { label: "The Guardian", prefix: "guardian_" }
};

// Scrape and cache page
async function scrapeAndCachePage(url) {
    try {
        console.log(`[News Cache] Scraping: ${url}`);
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        cachePage(url, data);

        let links = [];
        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();
            if (!link || link.includes("#")) return;
            if (link.startsWith("/")) {
                if (url.includes("bbc.co.uk")) link = new URL(link, BBC_URL).href;
                else if (url.includes("theguardian.com")) link = new URL(link, GUARDIAN_URL).href;
            }
            if (link.startsWith(BBC_URL) || link.startsWith(GUARDIAN_URL)) {
                links.push(link);
            }
        });

        links = [...new Set(links)];
        console.log(`[News Cache] Found ${links.length} links on ${url}`);

        for (const articleUrl of links) {
            await cacheArticle(articleUrl);
        }
    } catch (err) {
        console.error(`[News Cache] Error scraping ${url}:`, err.message);
    }
}

function getFileHash(filePath) {
    const fileContent = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileContent).digest('hex');
}

async function cacheArticle(url) {
    try {
        console.log(`[News Cache] Checking: ${url}`);
        const fileName = getCacheFileName(url);
        const filePath = path.join(CACHE_DIR, fileName);
        const isTopLevel = HEADERS_TO_CACHE.includes(url);

        if (fs.existsSync(filePath)) {
            const localTimestamp = fs.statSync(filePath).mtime.getTime();
            const ageHours = (Date.now() - localTimestamp) / (1000 * 60 * 60);

            if (!isTopLevel && ageHours <= 36) {
                console.log(`[News Cache] Skipping (less than 36 hours old): ${url}`);
                return;
            }
            console.log(`[News Cache] ${isTopLevel ? 'Top-level page, re-downloading' : 'Page older than 36 hours, re-downloading'}: ${url}`);
        } else {
            console.log(`[News Cache] No cached file found for: ${url}, downloading now`);
        }

        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();
            if (link.startsWith("/")) {
                if (url.includes("bbc.co.uk")) link = new URL(link, BBC_URL).href;
                else if (url.includes("theguardian.com")) link = new URL(link, GUARDIAN_URL).href;
            }
            if (link.startsWith(BBC_URL) || link.startsWith(GUARDIAN_URL)) {
                const fullUrl = link;
                const cachedFileName = getCacheFileName(fullUrl);
                const prefix = url.includes("theguardian.com") ? '/guardian/' : '/bbc/';
                $(el).attr("href", `${prefix}${cachedFileName}`);
            }
        });

        fs.writeFileSync(filePath, $.html());
        console.log(`[News Cache] Cached updated: ${url}`);
    } catch (err) {
        console.error(`[News Cache] Failed to fetch: ${url}`);
    }
}

function cachePage(url, data) {
    const fileName = url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
    const filePath = path.join(CACHE_DIR, fileName);
    fs.writeFileSync(filePath, data);
}

/*cron.schedule("0 4 * * *", async () => {
    console.log("[News Cache] Starting full site scrape...");
    for (const page of HEADERS_TO_CACHE) {
        await scrapeAndCachePage(page);
    }
    console.log("[News Cache] Scraping complete.");
});*/


app.get("/refresh-cache", async (req, res) => {
    console.log("[News Cache] Manually refreshing cache...");
    for (const page of HEADERS_TO_CACHE) {
        await scrapeAndCachePage(page);
    }
    res.redirect("/control-panel");
});

const getSourceCacheDetails = (prefix) => {
    const files = fs.readdirSync(CACHE_DIR).filter(file => file.startsWith(prefix));
    const totalArticles = files.length;
    if (totalArticles === 0) return { totalArticles: 0, cacheAge: "No cache available", folderSize: "0 MB" };

    const timestamps = files.map(file => fs.statSync(path.join(CACHE_DIR, file)).mtime);
    const newest = new Date(Math.max(...timestamps));
    const ageMinutes = Math.round((Date.now() - newest) / (1000 * 60));
    const cacheAge = `Last updated ${ageMinutes} minutes ago`;
    const folderSizeBytes = files.reduce((total, file) => total + fs.statSync(path.join(CACHE_DIR, file)).size, 0);
    const folderSize = `${(folderSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    return { totalArticles, cacheAge, folderSize };
};

const getCacheDetails = () => {
    const details = {};
    for (const [key, source] of Object.entries(SOURCES)) {
        details[key] = getSourceCacheDetails(source.prefix);
    }
    return details;
};

function getCacheFileName(url) {
    let prefix = "";
    if (url.includes("theguardian.com")) prefix = "guardian_";
    else prefix = "bbc_";
    return prefix + url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
}

app.get("/", (req, res) => res.render("index"));
app.get("/control-panel", (req, res) => res.render("control-panel", { cacheDetails: getCacheDetails(), sources: SOURCES }));

app.get("/refresh-cache/:source", async (req, res) => {
    const sourceKey = req.params.source;
    const source = SOURCES[sourceKey];
    if (!source) return res.status(400).send("Invalid source");
    console.log(`[News Cache] Refreshing cache for ${source.label}...`);
    const sourcePages = HEADERS_TO_CACHE.filter(page => page.includes(sourceKey));
    for (const page of sourcePages) {
        await scrapeAndCachePage(page);
    }
    res.redirect("/control-panel");
});

app.get("/clear-cache/:source", (req, res) => {
    const sourceKey = req.params.source;
    const source = SOURCES[sourceKey];
    if (!source) return res.status(400).send("Invalid source");
    console.log(`[News Cache] Clearing cache for ${source.label}...`);
    const files = fs.readdirSync(CACHE_DIR).filter(file => file.startsWith(source.prefix));
    files.forEach(file => fs.removeSync(path.join(CACHE_DIR, file)));
    res.redirect("/control-panel");
});

app.get("/bbc", (req, res) => {
    const files = fs.readdirSync(CACHE_DIR).filter(file => file.startsWith(SOURCES.bbc.prefix)).map(file => ({
        title: file.replace(".html", "").replace(/_/g, " "),
        file: file
    }));
    res.render("bbc", { articles: files });
});

app.get("/guardian", (req, res) => {
    const files = fs.readdirSync(CACHE_DIR).filter(file => file.startsWith(SOURCES.guardian.prefix)).map(file => ({
        title: file.replace(".html", "").replace(/_/g, " "),
        file: file
    }));
    res.render("guardian", { articles: files });
});

function serveCachedArticle(req, res) {
    const filePath = path.join(CACHE_DIR, req.params.article);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        const referer = req.headers.referer || "";
        if (referer.includes("bbc.co.uk") || req.path.startsWith("/bbc")) {
            res.status(404).render("bbc_404");
        } else if (referer.includes("theguardian.com") || req.path.startsWith("/guardian")) {
            res.status(404).render("guardian_404");
        } else {
            res.status(404).render("generic_404");
        }
    }
}

app.get("/bbc/:article", serveCachedArticle);
app.get("/guardian/:article", serveCachedArticle);


app.use('/cached_requested', express.static(path.join(__dirname, 'cached_requested', 'cached_requested')));
app.get('/websites', (req, res) => {
    try {
        const websites = fs.readdirSync(REQUESTED_CACHE_DIR).filter(dir => {
            const dirPath = path.join(REQUESTED_CACHE_DIR, dir);
            return fs.statSync(dirPath).isDirectory() && fs.readdirSync(dirPath).length > 0;
        }).map(dir => {
            const dirPath = path.join(REQUESTED_CACHE_DIR, dir);
            const matchingFile = fs.readdirSync(dirPath).find(file => file.includes(dir) && file.endsWith('.html'));
            if (matchingFile) {
                const filePath = path.join(dirPath, matchingFile);
                const html = fs.readFileSync(filePath, 'utf-8');
                const $ = cheerio.load(html);
                const pageTitle = $('title').text() || dir;
                return { name: pageTitle, url: `/cached_requested/${dir}/${matchingFile}` };
            }
        }).filter(Boolean);

        res.render('websites', { websites });
    } catch (error) {
        console.error('Error loading websites:', error);
        res.status(500).send('Error loading websites.');
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

app.listen(PORT, () => console.log(`[News Cache] Server running on port ${PORT}`));
