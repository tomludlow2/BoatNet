const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dayjs = require('dayjs');

// Dictionary of Leeward Islands with their latitude and longitude
const islandCoordinates = {
    'anguilla': { lat: 18.2, lon: -63.1 },
    'antigua': { lat: 17.05, lon: -61.8 },
    'barbuda': { lat: 17.64, lon: -61.84 },
    'montserrat': { lat: 16.72, lon: -62.19 },
    'nevis': { lat: 17.15, lon: -62.58 },
    'st_barts': { lat: 17.9, lon: -62.82 },
    'st_eustatius': { lat: 17.48, lon: -62.98 },
    'st_kitts': { lat: 17.3, lon: -62.73 },
    'st_martin': { lat: 18.07, lon: -63.05 },
    'saba': { lat: 17.63, lon: -63.23 },
    'st_maarten': { lat: 18.04, lon: -63.06 },
};

const CACHE_DIR = path.join(__dirname, 'weather_cache');

async function logToServer(message) {
  try {
    // Encode the message in case it has spaces or special characters
    await axios.get(`http://log.tomludlow.co.uk/?log=${encodeURIComponent(message)}`);
  } catch (error) {
    // If logging fails, just show it locally.
    console.error("[LogToServer] Failed to send log message:", error.message);
  }
}

// Function to fetch weather forecast for a single island
async function fetchWeatherForecast(islandName) {
    const island = islandCoordinates[islandName.toLowerCase()];
    
    if (!island) {
        console.error(`Island '${islandName}' not found in the coordinates dictionary.`);
        return;
    }

    const { lat, lon } = island;
    const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,temperature_80m,temperature_120m,temperature_180m,uv_index,is_day,sunshine_duration&forecast_days=16&cell_selection=sea`;

    try {
        console.log(`Fetching weather forecast for ${islandName}...`);

        const response = await axios.get(API_URL);
        const data = response.data;

        // Ensure cache directory exists
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }

        const timestamp = dayjs().format('DD_MM_HH_mm');
        const filename = `${islandName.toLowerCase()}_${timestamp}.json`;
        const filepath = path.join(CACHE_DIR, filename);

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

        console.log(`✅ Weather forecast for ${islandName} saved: ${filename}`);
        logToServer(`Weather forecast for ${islandName} saved: ${filename}`);
    } catch (error) {
        console.error(`❌ Failed to fetch weather forecast for ${islandName}:`, error.message);
        logToServer(`Failed to fetch weather forecast for ${islandName}:`);
    }
}

// Function to fetch weather forecasts for all islands sequentially
async function getWeatherForecast(option) {
    if (option.toLowerCase() === 'all') {
        console.log('Fetching weather forecasts for all Leeward Islands...');
        for (const island of Object.keys(islandCoordinates)) {
            await fetchWeatherForecast(island);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Add 1 second delay to avoid rate limiting
        }
        console.log('✅ All forecasts downloaded.');
    } else {
        await fetchWeatherForecast(option);
    }
}

// Command-line support: node fetchWeatherForecast.js all or node fetchWeatherForecast.js anguilla
if (require.main === module) {
    const option = process.argv[2];
    if (!option) {
        console.error('Please provide an island name or "all". Example: node fetchWeatherForecast.js all');
        process.exit(1);
    }
    getWeatherForecast(option);
}

module.exports = { fetchWeatherForecast, getWeatherForecast, islandCoordinates };
