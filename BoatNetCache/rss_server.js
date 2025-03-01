const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const cron = require("node-cron");
const path = require("path");
const express = require("express");

const app = express();
const PORT = 3006;

// Load sources
const SOURCES_FILE = path.join(__dirname, "sources.json");
const sources = fs.readJsonSync(SOURCES_FILE);

// Directory for cached articles
const CACHE_DIR = path.join(__dirname, "cache");
fs.ensureDirSync(CACHE_DIR);

// Fetch and cache articles for all sources
async function fetchAndCacheArticles() {
    console.log("[News Cache] Fetching articles...");

    for (const source of sources) {
        console.log(`[News Cache] Fetching from: ${source.name}`);

        try {
            const { data } = await axios.get(source.rss);
            const $ = cheerio.load(data, { xmlMode: true });

            // Extract article links
            const articles = [];
            $("item").each((_, el) => {
                const title = $(el).find("title").text();
                const link = $(el).find("link").text();
                const pubDate = $(el).find("pubDate").text();
                articles.push({ title, link, pubDate });
            });

            // Create site cache directory
            const siteCacheDir = path.join(CACHE_DIR, source.name.replace(/[^a-zA-Z0-9]/g, "_"));
            fs.ensureDirSync(siteCacheDir);

            for (const article of articles) {
                try {
                    const { data: pageContent } = await axios.get(article.link);
                    const $ = cheerio.load(pageContent);

                    // Extract article content
                    const paragraphs = $(source.articleSelector)
                        .map((_, p) => $(p).text())
                        .get()
                        .join("\n");

                    // Save article
                    const fileName = `${article.title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
                    const filePath = path.join(siteCacheDir, fileName);
                    fs.writeFileSync(filePath, `Title: ${article.title}\nDate: ${article.pubDate}\n\n${paragraphs}`);

                    console.log(`[News Cache] Cached: ${article.title}`);
                } catch (err) {
                    console.error(`[News Cache] Failed to fetch article: ${article.link}`);
                }
            }
        } catch (err) {
            console.error(`[News Cache] Error fetching RSS from ${source.name}:`, err.message);
        }
    }

    console.log("[News Cache] Completed caching.");
}

// Schedule fetch every 8 hours
cron.schedule("0 */8 * * *", fetchAndCacheArticles);

// Initial fetch on startup
fetchAndCacheArticles();

// Express API
app.get("/news", (req, res) => {
    const sites = fs.readdirSync(CACHE_DIR);
    res.json(sites);
});

app.get("/news/:site", (req, res) => {
    const site = req.params.site;
    const siteCacheDir = path.join(CACHE_DIR, site);

    if (!fs.existsSync(siteCacheDir)) {
        return res.status(404).json({ error: "Site not found" });
    }

    const articles = fs.readdirSync(siteCacheDir).map(file => ({
        title: file.replace(".txt", "").replace(/_/g, " "),
        file: file
    }));

    res.json(articles);
});

app.get("/news/:site/:article", (req, res) => {
    const { site, article } = req.params;
    const filePath = path.join(CACHE_DIR, site, article);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Article not found" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    res.send(`<pre>${content}</pre>`);
});

app.listen(PORT, () => console.log(`[News Cache] Server running on port ${PORT}`));
