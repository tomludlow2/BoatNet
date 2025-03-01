const express = require('express');
const path = require('path');
const axios = require('axios');  // Import axios to fetch data
const app = express();
const port = 3001;

// Serve static files (Leaflet CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Set the view engine
app.set('view engine', 'ejs');

// Serve static files (CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

// Serve local libraries
app.use('/libs', express.static('/home/tom/local_libs'));

// Serve the main map page
app.get('/', async (req, res) => {
  try {
    // Fetch the GPS data from the /gps endpoint
    const gpsResponse = await axios.get('http://localhost:3004/api/gps');
    const gpsData = gpsResponse.data;

    // Pass the GPS data to the EJS template
    res.render('index', {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
    });
  } catch (error) {
    console.error('Failed to fetch GPS data:', error);
    res.status(500).json({ error: 'Failed to retrieve GPS data', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
