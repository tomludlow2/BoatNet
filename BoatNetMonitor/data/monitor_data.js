const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3009;

const wlan0_rx = "/sys/class/net/wlan0/statistics/rx_bytes";
const wlan0_tx = "/sys/class/net/wlan0/statistics/tx_bytes";
const eth1_rx = "/sys/class/net/eth1/statistics/rx_bytes";
const eth1_tx = "/sys/class/net/eth1/statistics/tx_bytes";

const dataFile = path.join(__dirname, "network_data.json");

// Function to read bytes from system files
const readBytes = (path) => {
    try {
        return parseInt(fs.readFileSync(path, "utf8").trim(), 10);
    } catch (err) {
        console.error(`Error reading ${path}:`, err.message);
        return 0;
    }
};

// Load saved data or initialize
const loadData = () => {
    if (fs.existsSync(dataFile)) {
        try {
            return JSON.parse(fs.readFileSync(dataFile, "utf8"));
        } catch (err) {
            console.error("Error reading saved data:", err.message);
        }
    }
    return {
        totalWlan0ToEth1: 0,
        totalEth1ToWlan0: 0,
        lastWlan0Rx: readBytes(wlan0_rx),
        lastEth1Tx: readBytes(eth1_tx)
    };
};

// Save data to disk
const saveData = (data) => {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
};

// Load previous stats
let stats = loadData();

// Express route to serve network data
app.get("/", (req, res) => {
    const currentWlan0Rx = readBytes(wlan0_rx);
    const currentEth1Tx = readBytes(eth1_tx);

    const forwardedToEth1 = currentWlan0Rx - stats.lastWlan0Rx;
    const forwardedFromEth1 = currentEth1Tx - stats.lastEth1Tx;

    // Update totals and save
    if (forwardedToEth1 > 0) stats.totalWlan0ToEth1 += forwardedToEth1;
    if (forwardedFromEth1 > 0) stats.totalEth1ToWlan0 += forwardedFromEth1;

    stats.lastWlan0Rx = currentWlan0Rx;
    stats.lastEth1Tx = currentEth1Tx;

    saveData(stats);

    res.send(`
        <html>
        <head>
            <title>Network Monitor</title>
            <meta http-equiv="refresh" content="5">
            <style>
                body { font-family: Arial, sans-serif; text-align: center; background: #222; color: #eee; }
                h1 { color: #4CAF50; }
                .box { background: #333; padding: 20px; margin: 10px auto; width: 50%; border-radius: 8px; }
                .highlight { color: #4CAF50; font-size: 20px; }
            </style>
        </head>
        <body>
            <h1>Network Traffic Monitor</h1>
            <div class="box">
                <p>📡 <strong>Forwarded FROM wlan0 TO eth1:</strong> <span class="highlight">${(stats.totalWlan0ToEth1 / (1024 * 1024)).toFixed(2)} MB</span></p>
                <p>🔁 <strong>Forwarded FROM eth1 TO wlan0:</strong> <span class="highlight">${(stats.totalEth1ToWlan0 / (1024 * 1024)).toFixed(2)} MB</span></p>
                <p>🔄 <i>Updating every 5 seconds...</i></p>
            </div>
        </body>
        </html>
    `);
});

// Start the server
app.listen(port, "0.0.0.0", () => {
    console.log(`Network monitor running at http://localhost:${port}/`);
});
