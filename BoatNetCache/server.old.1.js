const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const cron = require("node-cron");
const path = require("path");
const express = require("express");

const app = express();
const PORT = 3006;

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));



// BBC Base URL & Cache Directory
const BBC_URL = "https://www.bbc.co.uk/news";
const CACHE_DIR = path.join(__dirname, "cached_pages");
fs.ensureDirSync(CACHE_DIR);

// Function to scrape top articles & linked pages
async function scrapeBBCArticles() {
    console.log("[BBC Cache] Scraping articles...");

    try {
        const { data } = await axios.get(BBC_URL);
        const $ = cheerio.load(data);

        // Extract article links
        let links = [];
        $("a[href]").each((_, el) => {
            const link = $(el).attr("href");
            if (link.startsWith("/news/") && !link.includes("#")) {
                links.push(new URL(link, BBC_URL).href);
            }
        });

        // Remove duplicates & limit to top 200
        links = [...new Set(links)].slice(0, 200);

        console.log(`[BBC Cache] Found ${links.length} unique articles.`);

        // Fetch & Cache each article
        for (const link of links) {
            await cacheArticleAndLinks(link);
        }

        console.log("[BBC Cache] Completed caching articles.");
    } catch (err) {
        console.error("[BBC Cache] Error scraping BBC:", err.message);
    }
}

// Function to cache an article + internal links (one level down)
async function cacheArticleAndLinks(url) {
    try {
        console.log(`[BBC Cache] Checking: ${url}`);

        const fileName = url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
        const filePath = path.join(CACHE_DIR, fileName);

        // Check if cached file exists
        if (fs.existsSync(filePath)) {
            // Fetch headers to check Last-Modified date
            const headers = await getPageHeaders(url);
            if (headers && headers["last-modified"]) {
                const serverTimestamp = new Date(headers["last-modified"]).getTime();
                const localTimestamp = fs.statSync(filePath).mtime.getTime();

                if (serverTimestamp <= localTimestamp) {
                    console.log(`[BBC Cache] Skipping unchanged: ${url}`);
                    return; // Skip if the cached version is up to date
                }
            }
        }

        // If the page is new or has changed, fetch it
        console.log(`[BBC Cache] Downloading: ${url}`);
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Modify links to point to cached versions
        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();

            if (link.startsWith("/news/")) {
                const fullUrl = new URL(link, BBC_URL).href;
                const cachedFileName = fullUrl.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
                $(el).attr("href", `/bbc/${cachedFileName}`);
            }
        });

        // Save modified page
        fs.writeFileSync(filePath, $.html());
        console.log(`[BBC Cache] Cached updated: ${url}`);

        // Fetch linked articles (subpages)
        let internalLinks = [];

        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();
            if (link.startsWith("/news/") || link.startsWith("https://www.bbc.co.uk/news")) {
                internalLinks.push(new URL(link, BBC_URL).href);
            }
        });

        internalLinks = [...new Set(internalLinks)].slice(0, 5);
        console.log(`[BBC Cache] Found ${internalLinks.length} linked pages for ${url}`);

        for (const subLink of internalLinks) {
            await cacheLinkedPage(subLink);
        }
    } catch (err) {
        console.error(`[BBC Cache] Failed to fetch: ${url}`);
    }
}


async function getPageHeaders(url) {
    try {
        const response = await axios.head(url); // Fetch headers only
        return response.headers;
    } catch (err) {
        console.error(`[BBC Cache] Failed to fetch headers for: ${url}`);
        return null;
    }
}



// Function to cache linked sub-pages
async function cacheLinkedPage(url) {
    try {
        console.log(`[BBC Cache] Checking linked page: ${url}`);

        const fileName = url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
        const filePath = path.join(CACHE_DIR, fileName);

        // Check if the file exists and has changed
        if (fs.existsSync(filePath)) {
            const headers = await getPageHeaders(url);
            if (headers && headers["last-modified"]) {
                const serverTimestamp = new Date(headers["last-modified"]).getTime();
                const localTimestamp = fs.statSync(filePath).mtime.getTime();

                if (serverTimestamp <= localTimestamp) {
                    console.log(`[BBC Cache] Skipping unchanged linked page: ${url}`);
                    return;
                }
            }
        }

        // Fetch and cache if changed
        console.log(`[BBC Cache] Downloading linked page: ${url}`);
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Modify links to cached versions
        $("a[href]").each((_, el) => {
            let link = $(el).attr("href").trim();
            if (link.startsWith("/news/") || link.startsWith("https://www.bbc.co.uk/news")) {
                const cachedFileName = link.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
                $(el).attr("href", `/bbc/${cachedFileName}`);
            }
        });

        // Save the modified page
        fs.writeFileSync(filePath, $.html());
        console.log(`[BBC Cache] Cached updated linked page: ${url}`);
    } catch (err) {
        console.error(`[BBC Cache] Failed to fetch linked page: ${url}`);
    }
}




// Schedule scraping every 8 hours
cron.schedule("0 */8 * * *", scrapeBBCArticles);

// Initial run
scrapeBBCArticles();

// Function to get cache age
function getCacheAge() {
    const files = fs.readdirSync(CACHE_DIR);
    if (files.length === 0) return "No cache available";

    const timestamps = files.map(file => fs.statSync(path.join(CACHE_DIR, file)).mtime);
    const newest = new Date(Math.max(...timestamps));
    const ageMinutes = Math.round((Date.now() - newest) / (1000 * 60));

    return `Last updated ${ageMinutes} minutes ago`;
}

// Landing Page
app.get("/", (req, res) => {
    res.render("index");
});

// BBC News Cached Index
app.get("/bbc", (req, res) => {
    const files = fs.readdirSync(CACHE_DIR).map(file => ({
        title: file.replace(".html", "").replace(/_/g, " "),
        file: file
    }));
    res.render("bbc", { articles: files });
});

// Control Panel
app.get("/control-panel", (req, res) => {
    res.render("control-panel", { cacheAge: getCacheAge() });
});

// Force Cache Refresh
app.get("/refresh-cache", async (req, res) => {
    await scrapeBBCArticles();
    res.redirect("/control-panel");
});

// Clear Cache
app.get("/clear-cache", (req, res) => {
    fs.emptyDirSync(CACHE_DIR);
    res.redirect("/control-panel");
});

// Serve Cached Articles
app.get("/bbc/:article", (req, res) => {
    const filePath = path.join(CACHE_DIR, req.params.article);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Article not found" });
    }
    res.sendFile(filePath);
});


app.listen(PORT, () => console.log(`[BBC Cache] Server running on port ${PORT}`));
