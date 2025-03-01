// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const getGPSData = require('./gps');
const app = express();
const port = 3004;
const path = require('path');

app.use(bodyParser.json());

// Serve static files (CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

// Serve local libraries
app.use('/libs', express.static('/home/tom/local_libs'));

// PostgreSQL connection setup
const pool = new Pool({
  user: 'tom',
  host: 'localhost',
  database: 'boatnetgps',
  password: 'yourpasswordhere',
  port: 5432,
});

// Create GPS table if it doesn't exist
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS gps_data (
    id SERIAL PRIMARY KEY,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

pool.query(createTableQuery)
  .then(() => console.log('GPS data table is ready'))
  .catch(err => console.error('Error creating table:', err));

// Function to probe and store GPS data
const probeAndStoreGPSData = async () => {
  try {
    const gpsData = await getGPSData();
    console.log(gpsData);
    if (isNaN(gpsData.latitude) || isNaN(gpsData.longitude)) {
      console.log('Skipping storage of invalid GPS data.');
      return;
    }
    await pool.query('INSERT INTO gps_data (latitude, longitude) VALUES ($1, $2)', [gpsData.latitude, gpsData.longitude]);
    console.log('GPS data stored:', gpsData);
  } catch (err) {
    console.error('Error probing/storing GPS data:', err);
  }
};

// Schedule GPS data probing every 10 minutes
setInterval(probeAndStoreGPSData, 10 * 60 * 1000);

// API to get the latest GPS data
app.get('/api/gps', async (req, res) => {
  const probeNow = req.query.probe_now === 'true';
  if (probeNow) {
    try {
      const gpsData = await getGPSData();
      console.log(gpsData);
      if (isNaN(gpsData.latitude) || isNaN(gpsData.longitude)) {
        return res.status(500).json({ error: 'Invalid GPS data received' });
      }
      await pool.query('INSERT INTO gps_data (latitude, longitude) VALUES ($1, $2)', [gpsData.latitude, gpsData.longitude]);
      return res.json(gpsData);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch live GPS data' });
    }
  }

  try {
    const { rows } = await pool.query('SELECT * FROM gps_data WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY timestamp DESC LIMIT 1');
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'No valid GPS data available' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch GPS data' });
  }
});


// API to get historical GPS data in GeoJSON format
app.get('/api/gps/history', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT latitude, longitude, timestamp FROM gps_data ORDER BY timestamp');
    const geoJSON = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: rows.map(row => [row.longitude, row.latitude]),
        },
        properties: {}
      }]
    };
    res.json(geoJSON);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch historical GPS data' });
  }
});

app.post('/gps-history/delete-invalid', async (req, res) => {
  try {
    await pool.query('DELETE FROM gps_data WHERE latitude IS NULL OR longitude IS NULL OR latitude = \'NaN\' OR longitude = \'NaN\'');
    res.redirect('/gps-history');
  } catch (err) {
    res.send(`Error deleting invalid GPS data: ${err.message}`);
  }
});


// Start the server
app.listen(port, () => {
  console.log(`BoatNetGPS API server running on port ${port}`);
});
