/**
 * rss-cacher.js
 *
 * Fetches and caches RSS articles from working sources only,
 * removing any that returned 404 or other errors previously.
 *
 * 1) Resets the cache on each run by removing the rss_feeds folder.
 * 2) Logs each successful save to both console and remote server.
 * 3) Logs a final message once all feeds have been processed.
 */

const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const axios = require('axios');

// Create an instance of the RSS parser
const parser = new Parser();

/**
 * Recreate the 'rss_feeds' folder, removing it if it already exists.
 */
const FEEDS_DIR = path.join(__dirname, 'rss_feeds');
if (fs.existsSync(FEEDS_DIR)) {
  fs.rmSync(FEEDS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(FEEDS_DIR);

/**
 * Sends a GET request to the remote log endpoint with the given message.
 */
async function logToServer(message) {
  try {
    // Encode the message in case it has spaces or special characters
    await axios.get(`http://log.tomludlow.co.uk/?log=${encodeURIComponent(message)}`);
  } catch (error) {
    // If logging fails, just show it locally
    console.error("[logToServer] Failed to send log message:", error.message);
  }
}

/**
 * A curated list of ONLY the feeds that previously worked.
 * (Removed all that returned 404, 401, 403, or parse errors.)
 */
const rssSources = [
  // Raspberry Pi
  { name: 'RaspberryPiOfficial',     url: 'https://www.raspberrypi.com/news/feed/' },
  { name: 'RaspberryPiSpy',         url: 'https://www.raspberrypi-spy.co.uk/feed/' },
  { name: 'PiMyLifeUp',             url: 'https://pimylifeup.com/feed/' },
  { name: 'TomHardwareRaspberryPi', url: 'https://www.tomshardware.com/feeds/all?name=Raspberry+Pi' },
  { name: 'HackadayRaspberryPi',    url: 'https://hackaday.com/tag/raspberry-pi/feed/' },
  { name: 'TheMagPi',               url: 'https://magpi.raspberrypi.com/feed' },
  { name: 'CNXSoftwareRPi',         url: 'https://www.cnx-software.com/tag/raspberry-pi/feed/' },
  { name: 'RasPiTV',                url: 'https://raspi.tv/feed/' },

  // Sailing
  { name: 'SailMagazine',           url: 'https://www.sailmagazine.com/.rss/full/' },
  { name: 'PracticalBoatOwner',     url: 'https://www.pbo.co.uk/feed' },
  { name: 'YachtingMonthly',        url: 'https://www.yachtingmonthly.com/feed' },
  { name: 'AllAtSea',              url: 'https://www.allatsea.co.uk/feed/' },
  { name: 'YachtingWorld',          url: 'https://www.yachtingworld.com/feed' },
  { name: 'ScuttlebuttSailingNews', url: 'https://www.sailingscuttlebutt.com/feed/' },
  { name: 'MySailing',             url: 'https://www.mysailing.com.au/feed/' },
  { name: 'SailingToday',           url: 'https://www.sailingtoday.co.uk/feed' },

  // Formula 1
  { name: 'MotorsportF1',          url: 'https://www.motorsport.com/rss/f1/news/' },
  { name: 'AutosportF1',           url: 'https://www.autosport.com/rss/f1/news' },
  { name: 'BBCSportF1',            url: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml' },
  { name: 'ESPNF1',                url: 'https://www.espn.com/espn/rss/f1/news' },
  { name: 'GrandPrix247',          url: 'https://www.grandprix247.com/feed/' },

  // Healthcare
  { name: 'BBCHealth',             url: 'http://feeds.bbci.co.uk/news/health/rss.xml' },
  { name: 'PhysOrgHealth',         url: 'https://phys.org/rss-feed/health-news/' },
  { name: 'MedicalXpressHealth',   url: 'https://medicalxpress.com/rss-feed/health-news/' },
  { name: 'NYTHealth',             url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml' },
  { name: 'CDCNewsroom',           url: 'https://tools.cdc.gov/api/v2/resources/media/404952.rss' },
];

/**
 * Fetch and cache articles for each source in rssSources.
 */
async function fetchRSSArticles() {
  for (const feed of rssSources) {
    try {
      console.log(`Fetching feed: ${feed.name} from ${feed.url}`);

      // Parse the feed
      const data = await parser.parseURL(feed.url);

      // Trim to ~25 articles
      const articles = data.items.slice(0, 25);

      // Build file path
      const outputFilePath = path.join(FEEDS_DIR, `${feed.name}.json`);

      // Write articles to disk
      fs.writeFileSync(outputFilePath, JSON.stringify(articles, null, 2), 'utf-8');

      // Log success to console
      const successMsg = `Saved ${articles.length} articles from ${feed.name} -> ${outputFilePath}`;
      console.log(successMsg);

      // Log success to remote server
      await logToServer(successMsg);
    } catch (error) {
      // Log any errors locally
      console.error(`Error fetching feed: ${feed.name} - ${error.message}`);
    }
  }
}

// If invoked directly (via `node rss-cacher.js`), run fetchRSSArticles
if (require.main === module) {
  fetchRSSArticles()
    .then(async () => {
      console.log('RSS caching complete!');
      await logToServer('RSS caching complete!');
    })
    .catch((err) => console.error(`RSS caching encountered an error: ${err}`));
}

// Export if you want to reuse fetchRSSArticles in other scripts
module.exports = { fetchRSSArticles };
