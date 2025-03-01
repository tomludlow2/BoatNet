const express = require("express");
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const app = express();
const port = 3010;

const DATA_LIMIT_MB = 100; // Default per-user limit (MB)
const EXTRA_ALLOCATION_MB = 100; // Additional data per click
const USAGE_FILE = path.join(__dirname, "user_data.json");
const INTERFACE = "wlan0"; // WiFi AP interface

const UNLIMITED_MACS = new Set([
    "00:11:22:33:44:55", // Add MACs that should have unlimited data
    "AA:BB:CC:DD:EE:FF",
]);

// Load or initialize user data
const loadUsage = () => {
    if (fs.existsSync(USAGE_FILE)) {
        return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    }
    return {};
};

// Save user data
const saveUsage = (data) => {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), "utf8");
};

// Get MAC addresses and their assigned IPs
const getConnectedDevices = () => {
    try {
        const result = execSync(`sudo arp -a`).toString();
        const devices = {};
        result.split("\n").forEach((line) => {
            const parts = line.match(/\((.*?)\) at ([0-9A-Fa-f:]+)/);
            if (parts) {
                const ip = parts[1];
                const mac = parts[2].toUpperCase();
                devices[mac] = ip;
            }
        });
        return devices;
    } catch (error) {
        console.error("❌ Error fetching connected devices:", error.message);
        return {};
    }
};

// Get per-MAC data usage
const getUsage = () => {
    try {
        const result = execSync(`iptables -nvx -L FORWARD`).toString();
        const lines = result.split("\n").slice(2);
        const usage = {};

        lines.forEach((line) => {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 8 && parts[8] !== "0.0.0.0/0") {
                const bytes = parseInt(parts[1], 10);
                const ip = parts[8];

                const devices = getConnectedDevices();
                const mac = Object.keys(devices).find((key) => devices[key] === ip);
                if (mac) {
                    usage[mac] = (usage[mac] || 0) + bytes;
                }
            }
        });

        return usage;
    } catch (error) {
        console.error("❌ Error fetching usage:", error.message);
        return {};
    }
};

// Update usage tracking and enforce limits
const enforceLimits = () => {
    console.log("🔍 Checking usage limits...");
    const usage = getUsage();
    let users = loadUsage();

    Object.keys(usage).forEach((mac) => {
        const usedMB = usage[mac] / (1024 * 1024);

        if (!users[mac]) {
            users[mac] = { limit: DATA_LIMIT_MB, used: 0 };
        }

        users[mac].used = usedMB;

        if (!UNLIMITED_MACS.has(mac) && usedMB > users[mac].limit) {
            console.log(`🚨 Blocking ${mac} (Exceeded ${users[mac].limit}MB)`);
            execSync(`sudo iptables -A FORWARD -m mac --mac-source ${mac} -j DROP`);
        }
    });

    saveUsage(users);
    console.log("✅ Limit enforcement complete!");
};

// Web UI to show user stats
app.get("/", (req, res) => {
    let users = loadUsage();
    const devices = getConnectedDevices();

    let tableRows = Object.keys(users).map((mac) => {
        const { used, limit } = users[mac];
        const remaining = UNLIMITED_MACS.has(mac) ? "Unlimited" : Math.max(limit - used, 0).toFixed(2) + " MB";
        const status = used >= limit && !UNLIMITED_MACS.has(mac) ? "❌ Blocked" : "✅ Active";

        return `
            <tr>
                <td>${mac}</td>
                <td>${devices[mac] || "Unknown"}</td>
                <td>${used.toFixed(2)} MB</td>
                <td>${remaining}</td>
                <td>${status}</td>
                <td>
                    ${!UNLIMITED_MACS.has(mac) ? `<button onclick="addData('${mac}')">+100MB</button>` : "∞"}
                </td>
            </tr>
        `;
    });

    res.send(`
        <html>
        <head>
            <title>Network Usage Monitor</title>
            <script>
                function addData(mac) {
                    fetch('/add-data/' + mac, { method: 'POST' }).then(() => location.reload());
                }
            </script>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; background: #222; color: #eee; }
                h1 { color: #4CAF50; }
                table { width: 80%; margin: auto; border-collapse: collapse; }
                th, td { padding: 10px; border: 1px solid #666; }
                .box { background: #333; padding: 20px; margin: 10px auto; width: 60%; border-radius: 8px; }
                button { padding: 5px 10px; background: #4CAF50; color: white; border: none; cursor: pointer; }
                button:hover { background: #388E3C; }
            </style>
        </head>
        <body>
            <h1>Network Usage Monitor</h1>
            <div class="box">
                <table>
                    <tr>
                        <th>MAC Address</th>
                        <th>IP Address</th>
                        <th>Used</th>
                        <th>Remaining</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                    ${tableRows.join("")}
                </table>
            </div>
        </body>
        </html>
    `);
});

// API endpoint to add more data to a user
app.post("/add-data/:mac", (req, res) => {
    let users = loadUsage();
    const mac = req.params.mac;

    if (users[mac]) {
        users[mac].limit += EXTRA_ALLOCATION_MB;
        console.log(`➕ Added ${EXTRA_ALLOCATION_MB}MB to ${mac}`);
        execSync(`sudo iptables -D FORWARD -m mac --mac-source ${mac} -j DROP`); // Unblock user
    }

    saveUsage(users);
    res.sendStatus(200);
});

// Start the server
app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Network usage monitor running at http://localhost:${port}/`);
});

// Run limit checks every 1 min
setInterval(enforceLimits, 60000);

console.log("✅ User data limiter running...");

