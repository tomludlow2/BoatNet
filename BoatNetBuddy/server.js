const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { exec, execSync } = require('child_process');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

function getLocalIp() {
  try {
    const output = execSync('ifconfig wlan0').toString();
    return output;
  } catch (e) {
    return 'Unknown IP at wlan0';
  }
}

async function logToServer(message) {
  try {
    // Encode the message in case it has spaces or special characters
    await axios.get(`http://log.tomludlow.co.uk/?log=${encodeURIComponent(message)}`);
  } catch (error) {
    // If logging fails, just show it locally.
    console.error('[LogToServer] Failed to send log message:', error.message);
  }
}

// ===========================================================
// GET /:  Scan for and display available WiFi networks
// ===========================================================
app.get('/', (req, res) => {
  exec("sudo nmcli -t -f SSID,BSSID dev wifi list --rescan yes", (err, stdout) => {
    if (err) return res.status(500).send('Error scanning for networks');
    const lines = stdout.split('\n');
    const networks = lines.map(line => line.split(':')[0].trim()).filter(net => net && net !== '*');

    let html = '<h1>Select WiFi Network</h1><form method="post" action="/connect">';
    networks.forEach(net => html += `<input type="radio" name="ssid" value="${net}" required>${net}<br>`);
    html += 'Password: <input type="password" name="password"><br><button type="submit">Send</button></form>';
    res.send(html);
  });
});

// ===========================================================
// GET /manual: Provide a manual SSID/password entry form
// ===========================================================
app.get('/manual', (req, res) => {
  let html = '<h1>Manual WiFi Setup</h1><form method="post" action="/connect">';
  html += 'SSID: <input type="text" name="ssid" required><br>';
  html += 'Password: <input type="password" name="password"><br>';
  html += '<button type="submit">Connect</button></form>';
  res.send(html);
});

app.get('/boatnet', (req, res) => {
  let html = '<h1>Manual WiFi Setup</h1><form method="post" action="/connect">';
  html += 'SSID: <input type="text" name="ssid" value="BoatNet" required><br>';
  html += 'Password: <input type="password" name="password" value="SaintMartin"><br>';
  html += '<button type="submit">Connect</button></form>';
  res.send(html);
});

app.get('/pixel', (req, res) => {
  let html = '<h1>Manual WiFi Setup</h1><form method="post" action="/connect">';
  html += 'SSID: <input type="text" name="ssid" value="Pixelwifi" required><br>';
  html += 'Password: <input type="password" name="password" value="SaintMartin"><br>';
  html += '<button type="submit">Connect</button></form>';
  res.send(html);
});

// ===========================================================
// POST /connect: Attempt WiFi connection, then conditionally start services
// ===========================================================
app.post('/connect', async (req, res) => {
  const { ssid, password } = req.body;
  console.log(`Attempting to connect to SSID: ${ssid}, with password: ${password}`);

  // Ensure wlan0 is in managed mode
  exec("sudo nmcli dev set wlan0 managed yes", (errSetManaged, outSetManaged, errStrManaged) => {
    console.log('Set wlan0 to managed mode:', outSetManaged, errStrManaged);

    // Disable then enable WiFi
    exec("sudo nmcli radio wifi off && sudo nmcli radio wifi on", (errWiFiToggle, outWiFiToggle, errStrWiFiToggle) => {
      console.log('Toggled WiFi:', outWiFiToggle, errStrWiFiToggle);

      // Rescan networks
      console.log('Rescanning for networks...');
      exec('sudo nmcli dev wifi rescan', (errRescan, outRescan, errStrRescan) => {
        console.log('Rescan output:', outRescan, errStrRescan);

        // Delay briefly for scanning
        setTimeout(() => {
          console.log('Listing available networks...');
          exec('sudo nmcli dev wifi list --rescan no', (errList, outList, errStrList) => {
            console.log('Available networks:', outList);
            if (errList) {
              console.error('Error listing networks:', errList, errStrList);
            }

            // Now attempt connection
            console.log(`Connecting to SSID: ${ssid}`);
            exec(`sudo nmcli dev wifi connect "${ssid}" password "${password}"`, async (errConnect, stdoutConnect, stderrConnect) => {
              const localIp = getLocalIp();
              console.log('nmcli connect output:', stdoutConnect);
              console.error('nmcli connect errors:', stderrConnect);

              if (errConnect) {
                console.log('nmcli connect error object:', errConnect);
                return res.send(`Failed to connect to '${ssid}'. Restarting AP mode.`);
              }

              // ======= SUCCESS: Connected to the WiFi network =======
              try {
                console.log(`Connected successfully to: ${ssid}`);
                exec("sudo systemctl start shutdown-handler");

                // 1) Log we connected
                logToServer(`Connected to WiFi at ${localIp}, SSID: ${ssid}`);

                // 2) Conditional service starts based on SSID
                if (ssid === 'BoatNet') {
                  console.log("Starting FTP service for 'BoatNet'");
                  exec("cd /home/tom/buddy/ftp && /usr/bin/node upload-to-ftp.js boatnet", async (errRsync, stdoutRsync, stderrRsync) => {
                    if (errRsync) {
                      console.error('Error starting FTP:', stderrRsync);
                      logToServer(`Failed to start FTP: ${stderrRsync}`);
                    } else {
                      console.log('FTP started successfully:', stdoutRsync);
                      logToServer('FTP started successfully');
                    }
                  });
                } else if (ssid === 'TomWiFi') {
                  console.log("Services not started because SSID is 'TomWiFi'");
                  await logToServer("Skipped services for SSID 'TomWiFi'");
                } else {
                  console.log("Attempting to start caches");
                  exec("sudo systemctl start news-cacher", async (errServices, stdoutServices, stderrServices) => {
                    if (errServices) {
                      console.error('Error starting services:', stderrServices);
                      await logToServer(`Failed to start services: ${stderrServices}`);
                    } else {
                      console.log('Services started successfully:', stdoutServices);
                      await logToServer('Services started successfully');
                    }
                  });
                }

                // 3) Immediately respond to the user
                return res.send(`Connected to '${ssid}'. Systemd services conditionally started.`);
              } catch (error) {
                console.error("Error during final steps:", error);
                res.status(500).send('Connected but failed to initiate systemd caching services.');
              }
            });
          });
        }, 10000); // 10-second delay
      });
    });
  });
});

app.listen(3000, () => console.log('BoatNetBuddy WiFi AP server running on port 3000'));
