// /home/tom/BoatNetSplash/server.js

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const port = 3003;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use('/libs', express.static('/home/tom/local_libs'));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/libs/fontawesome', express.static('/home/tom/local_libs/fontawesome'));
app.use(express.static('public'));
// Function to get IP and MAC address
const getNetworkInfo = () => {
    const interfaces = os.networkInterfaces();
    let ip = 'Unknown';
    let mac = 'Unknown';

    for (const iface of Object.values(interfaces)) {
        for (const entry of iface) {
            if (!entry.internal && entry.family === 'IPv4') {
                ip = entry.address;
                mac = entry.mac;
                break;
            }
        }
    }
    return { ip, mac };
};

// Render landing page
app.get('/', (req, res) => {
    res.render('landing', { deviceInfo: null });
});

// Handle device name submission
app.post('/submit-name', (req, res) => {
    const deviceName = req.body.deviceName;
    const networkInfo = getNetworkInfo();

    res.render('landing', { deviceInfo: { deviceName, ip: networkInfo.ip, mac: networkInfo.mac } });
});

// Start server
app.listen(port, () => {
    console.log(`BoatNetSplash server running at http://localhost:${port}`);
});
