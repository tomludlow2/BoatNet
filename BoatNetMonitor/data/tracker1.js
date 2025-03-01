const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const app = express();
const port = 3010;

// Paths to network statistics files
const wlan0_rx = "/sys/class/net/wlan0/statistics/rx_bytes";
const wlan0_tx = "/sys/class/net/wlan0/statistics/tx_bytes";
const eth1_rx = "/sys/class/net/eth1/statistics/rx_bytes";
const eth1_tx = "/sys/class/net/eth1/statistics/tx_bytes";

const dataFile = path.join(__dirname, "network_data.json");

// Middleware for parsing JSON requests
app.use(express.json());

// Read bytes from system files
const readBytes = (filePath) => {
    try {
        return parseInt(fs.readFileSync(filePath, "utf8").trim(), 10);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return 0;
    }
};

// Get list of connected devices from ARP table
const getConnectedDevices = () => {
    try {
        const arpTable = execSync("arp -an").toString();
        return arpTable
            .split("\n")
            .filter(line => /\(([\d.]+)\) at ([\w:]+) /.test(line))
            .map(line => {
                const match = line.match(/\(([\d.]+)\) at ([\w:]+)/);
                return { ip: match[1], mac: match[2].toUpperCase() };
            });
    } catch (err) {
        console.error("Error retrieving ARP table:", err.message);
        return [];
    }
};

// Load existing statistics or initialize new file
const loadData = () => {
    if (fs.existsSync(dataFile)) {
        try {
            let loadedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
            if (!loadedData.devices) loadedData.devices = {}; // Ensure devices object exists
            return loadedData;
        } catch (err) {
            console.error("Error reading saved data:", err.message);
        }
    }
    return {
        totalWlan0ToEth1: 0,
        totalEth1ToWlan0: 0,
        lastWlan0Rx: readBytes(wlan0_rx),
        lastEth1Tx: readBytes(eth1_tx),
        devices: {} // Ensure devices object is always present
    };
};

// Save data to disk
const saveData = (data) => {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
};

// Load previous stats
let stats = loadData();

// Update device statistics
const updateDeviceStats = () => {
    const devices = getConnectedDevices();

    if (!stats.devices) stats.devices = {}; // Ensure the object exists

    devices.forEach(({ mac }) => {
        const rxPath = `/sys/class/net/wlan0/statistics/rx_bytes`;
        const txPath = `/sys/class/net/wlan0/statistics/tx_bytes`;

        const currentRx = readBytes(rxPath);
        const currentTx = readBytes(txPath);

        if (!stats.devices[mac]) {
            stats.devices[mac] = { 
                name: mac, // Default to MAC until renamed
                totalRx: 0, 
                totalTx: 0, 
                lastRx: currentRx, 
                lastTx: currentTx 
            };
        }

        const device = stats.devices[mac];

        const diffRx = currentRx - device.lastRx;
        const diffTx = currentTx - device.lastTx;

        if (diffRx > 0) device.totalRx += diffRx;
        if (diffTx > 0) device.totalTx += diffTx;

        device.lastRx = currentRx;
        device.lastTx = currentTx;
    });

    saveData(stats);
};

// Express route to serve network data
app.get("/", (req, res) => {
    updateDeviceStats();

    const currentWlan0Rx = readBytes(wlan0_rx);
    const currentEth1Tx = readBytes(eth1_tx);

    const forwardedToEth1 = currentWlan0Rx - stats.lastWlan0Rx;
    const forwardedFromEth1 = currentEth1Tx - stats.lastEth1Tx;

    if (forwardedToEth1 > 0) stats.totalWlan0ToEth1 += forwardedToEth1;
    if (forwardedFromEth1 > 0) stats.totalEth1ToWlan0 += forwardedFromEth1;

    stats.lastWlan0Rx = currentWlan0Rx;
    stats.lastEth1Tx = currentEth1Tx;

    saveData(stats);

    let deviceStatsHtml = Object.entries(stats.devices)
        .map(([mac, data]) => `
            <div class="box">
                <p>🖥️ <strong>Device:</strong> ${data.name || mac}</p>
                <p>📥 Downloaded: <span class="highlight">${(data.totalRx / (1024 * 1024)).toFixed(2)} MB</span></p>
                <p>📤 Uploaded: <span class="highlight">${(data.totalTx / (1024 * 1024)).toFixed(2)} MB</span></p>
            </div>
        `).join("");

    res.send(`
        <html>
        <head>
            <title>Network Traffic Monitor</title>
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
            <h2>Per-Device Usage</h2>
            ${deviceStatsHtml}
        </body>
        </html>
    `);
});

// API to rename a device
app.post("/rename", (req, res) => {
    const { mac, name } = req.body;
    if (stats.devices[mac]) {
        stats.devices[mac].name = name;
        saveData(stats);
        res.json({ success: true, message: `Renamed ${mac} to ${name}` });
    } else {
        res.status(404).json({ success: false, message: "Device not found" });
    }
});

// Start the server
app.listen(port, "0.0.0.0", () => {
    console.log(`Network monitor running at http://localhost:${port}/`);
});
