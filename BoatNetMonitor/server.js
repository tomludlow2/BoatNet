// server.js
const express = require('express');
const app = express();
const port = 3000;
const exec = require('child_process').exec;
const fs = require('fs');
const axios = require('axios');


const indexController = require('./controllers/indexController');
const serviceController = require('./controllers/serviceController');

// Serve local libraries
app.use('/libs', express.static('/home/tom/local_libs'));


// Set up the view engine (EJS)
app.set('view engine', 'ejs');

// Serve static files from the "public" folder
app.use(express.static('public'));
// Parse form data from POST requests
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', indexController.index);
app.get('/status', serviceController.checkServiceStatus);

//Kiwix service handler:
//app.post('/start-kiwix-all', serviceController.startAllKiwixServers);


// Add route to restart services
app.post('/restart/:service', (req, res) => {
    const service = req.params.service;

    exec(`sudo systemctl restart ${service}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error restarting service: ${stderr}`);
            return res.status(500).json({ message: 'Failed to restart service' });
        }

        res.json({ message: `${service} restarted successfully!` });
    });
});

// Route to get the routing table
app.get('/routing-table', (req, res) => {
    exec('route -n', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error fetching routing table: ${stderr}`);
            return res.status(500).json({ message: 'Failed to fetch routing table' });
        }
        res.json({ routingTable: stdout });
    });
});

// Route to get all network interfaces (wlan*, eth*, ttyAMA*)
app.get('/network-interfaces', (req, res) => {
    exec('ifconfig -a', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error fetching network interfaces: ${stderr}`);
            return res.status(500).json({ message: 'Failed to fetch network interfaces' });
        }
        res.json({ networkInterfaces: stdout });
    });
});

// GPS Endpoint - Fetch data from BoatNetGPS
app.get('/gps', async (req, res) => {
  try {
    const response = await axios.get('http://localhost:3004/api/gps');
    const gpsData = response.data;

    res.json({
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      googleMapsLink: `https://www.google.com/maps?q=${gpsData.latitude},${gpsData.longitude}`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve GPS data from BoatNetGPS', details: error.message });
  }
});

// GPS View Endpoint with Bootstrap Page
app.get('/view-gps', async (req, res) => {
  try {
    const response = await axios.get('http://localhost:3004/api/gps');
    const gpsData = response.data;

    res.render('view-gps', {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      googleMapsLink: `https://www.google.com/maps?q=${gpsData.latitude},${gpsData.longitude}`,
    });
  } catch (error) {
    res.status(500).send('Failed to retrieve GPS data from BoatNetGPS: ' + error.message);
  }
});



// Route to get USB devices and their names (e.g., ttyUSB0, ttyUSB1)
app.get('/usb-devices', (req, res) => {
    exec('lsusb', (err, usbDevices, stderr) => {
        if (err) {
            console.error(`Error fetching USB devices: ${stderr}`);
            return res.status(500).json({ message: 'Failed to fetch USB devices' });
        }

        // Get serial devices (e.g., ttyUSB0, ttyUSB1)
        exec('ls /dev/ttyUSB*', (err, serialDevices, stderr) => {
            if (err) {
                console.error(`Error fetching serial devices: ${stderr}`);
                return res.status(500).json({ message: 'Failed to fetch serial devices' });
            }

            // Combine USB and serial device information
            const devices = {
                usbDevices: usbDevices.trim().split('\n'),
                serialDevices: serialDevices.trim().split('\n')
            };

            res.json(devices);
        });
    });
});


// Route to register USB device as network interface (Switch to RNDIS)
app.post('/register-usb-network/:usbDevice', (req, res) => {
    const usbDevice = req.params.usbDevice;
    console.log("Attempting to start device:", usbDevice);

    // Step 1: Check if the device exists in /dev before attempting to use it
    exec(`ls /dev/${usbDevice}`, (err, stdout, stderr) => {
        if (err || stderr) {
            console.error(`Device ${usbDevice} not found: ${stderr || err}`);
            return res.status(400).json({ message: `Device ${usbDevice} not found` });
        }
        console.log(`Device ${usbDevice} found in /dev/`);

        // Step 2: Switch USB device to RNDIS mode using minicom
        exec(`echo -e "AT+CUSBPIDSWITCH=9011,1,1" | sudo minicom -D /dev/${usbDevice}`, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error switching USB device to RNDIS mode: ${stderr}`);
                return res.status(500).json({ message: 'Failed to register USB device as network interface' });
            }
            console.log(`Device ${usbDevice} switched to RNDIS mode successfully.`);

            // Step 3: Check if the device is now available as a network interface (usb0, eth1, etc.)
            exec(`ifconfig -a`, (err, stdout, stderr) => {
                if (err || stderr) {
                    console.error(`Error fetching network interfaces: ${stderr || err}`);
                    return res.status(500).json({ message: 'Failed to fetch network interfaces' });
                }

                console.log("Current network interfaces:", stdout);

                // Check if the usb device is now listed as a network interface
                const networkInterfacePattern = new RegExp(`usb0|eth1|${usbDevice}`, 'i');
                if (networkInterfacePattern.test(stdout)) {
                    console.log(`Network interface for ${usbDevice} found.`);
                } else {
                    console.log(`No network interface found for ${usbDevice}. It's possible the device is already configured as a network interface.`);
                    return res.status(500).json({ message: `Failed to find network interface for ${usbDevice}` });
                }

                // Step 4: Bring up the device and configure it with DHCP
                const networkInterface = usbDevice === 'ttyUSB2' ? 'eth1' : usbDevice; // Assuming ttyUSB2 is eth1 after registration

                exec(`sudo ip link set ${networkInterface} up && sudo dhclient ${networkInterface}`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`Error bringing up the network interface: ${stderr}`);
                        return res.status(500).json({ message: 'Failed to bring up the network interface' });
                    }
                    console.log(`${networkInterface} successfully brought up with IP configuration.`);
                    res.json({ message: `${networkInterface} registered and network interface brought up successfully!` });
                });
            });
        });
    });
});

// Route to show the current routing table and available interfaces
app.get('/network-routing', (req, res) => {
    exec('route -n', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error fetching routing table: ${stderr}`);
            return res.status(500).json({ message: 'Failed to fetch routing table' });
        }

        exec('ifconfig -a', (err, interfacesStdout, interfacesStderr) => {
            if (err) {
                console.error(`Error fetching interfaces: ${interfacesStderr}`);
                return res.status(500).json({ message: 'Failed to fetch network interfaces' });
            }

            // List available network interfaces
            const interfaces = interfacesStdout.split('\n').filter(line => line.includes('wlan') || line.includes('eth') || line.includes('ttyAMA'));
            res.render('network-routing', {
                routingTable: stdout,
                interfaces: interfaces
            });
        });
    });
});


// Route to enable NAT masquerading on eth1
app.post('/enable-masquerade', (req, res) => {
    const command = 'sudo iptables -t nat -A POSTROUTING -o eth1 -j MASQUERADE';

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error enabling masquerade: ${stderr}`);
            return res.status(500).json({ message: 'Failed to enable masquerade', error: stderr });
        }
        res.json({ message: 'NAT masquerade enabled successfully!' });
    });
});

// Route to enable NAT masquerading on eth1
app.post('/enable-masquerade-0', (req, res) => {
    const command = 'sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE';

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error enabling masquerade: ${stderr}`);
            return res.status(500).json({ message: 'Failed to enable masquerade', error: stderr });
        }
        res.json({ message: 'NAT masquerade enabled successfully!' });
    });
});

// Route to check if masquerade rule exists
app.get('/check-masquerade', (req, res) => {
    const command = 'sudo iptables -t nat -L POSTROUTING -v -n | grep MASQUERADE';

    exec(command, (err, stdout, stderr) => {
        if (err || !stdout) {
            return res.json({ message: 'MASQUERADE rule is NOT present' });
        }
        res.json({ message: 'MASQUERADE rule is present', details: stdout });
    });
});


app.post('/switch-route/:interface', (req, res) => {
    let networkInterface = req.params.interface;

    // Remove any trailing ':' from the interface name
    networkInterface = networkInterface.replace(/:$/, '');

    // Get the IPv4 address of the selected interface
    exec(`ip addr show ${networkInterface} | grep inet | awk '{ print $2 }' | cut -d/ -f1 | head -n 1`, (err, ipStdout, ipStderr) => {
        if (err || !ipStdout) {
            console.error(`Error fetching IP address for ${networkInterface}: ${ipStderr}`);
            return res.status(500).json({ message: `Failed to fetch IP address for ${networkInterface}` });
        }

        const ipAddress = ipStdout.trim();

        // Check if the retrieved IP address is an IPv4 address (not IPv6)
        if (ipAddress.includes(':')) {
            return res.status(400).json({ message: 'Only IPv4 addresses are supported for routing' });
        }

        // If interface is eth0, ensure the default route goes to the correct gateway (192.168.68.1)
        if (networkInterface === 'eth0') {
            exec(`sudo ip route del default && sudo ip route add default via 192.168.68.1 dev eth0`, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Error updating route for eth0: ${stderr}`);
                    return res.status(500).json({ message: 'Failed to switch route for eth0' });
                }

                // Set DNS servers to Google's DNS (or any preferred DNS provider)
                exec(`sudo bash -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf'`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`Error setting DNS for eth0: ${stderr}`);
                        return res.status(500).json({ message: 'Failed to set DNS for eth0' });
                    }
                    exec(`sudo bash -c 'echo "nameserver 8.8.4.4" >> /etc/resolv.conf'`, (err, stdout, stderr) => {
                        if (err) {
                            console.error(`Error adding second DNS server: ${stderr}`);
                            return res.status(500).json({ message: 'Failed to set secondary DNS' });
                        }
                        res.json({ message: `Routing switched to ${networkInterface} with IP ${ipAddress} and DNS set to 8.8.8.8, 8.8.4.4` });
                    });
                });
            });
        } else {
            // For other interfaces, update the default route based on the IP of the selected interface
            exec(`sudo ip route del default && sudo ip route add default via ${ipAddress} dev ${networkInterface}`, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Error updating route: ${stderr}`);
                    return res.status(500).json({ message: 'Failed to switch route' });
                }

                // Set DNS servers to Google's DNS (or any preferred DNS provider)
                exec(`sudo bash -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf'`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`Error setting DNS for ${networkInterface}: ${stderr}`);
                        return res.status(500).json({ message: `Failed to set DNS for ${networkInterface}` });
                    }
                    exec(`sudo bash -c 'echo "nameserver 8.8.4.4" >> /etc/resolv.conf'`, (err, stdout, stderr) => {
                        if (err) {
                            console.error(`Error adding second DNS server: ${stderr}`);
                            return res.status(500).json({ message: 'Failed to set secondary DNS' });
                        }
                        res.json({ message: `Routing switched to ${networkInterface} with IP ${ipAddress} and DNS set to 8.8.8.8, 8.8.4.4` });
                    });
                });
            });
        }
    });
});





// Route to ping the selected network interface
app.post('/ping-network', (req, res) => {
    const networkInterface = req.body.networkInterface;

    if (!networkInterface) {
        return res.status(400).json({ message: 'No network interface selected.' });
    }

    // Get the IP address of the selected network interface
    exec(`ip addr show ${networkInterface} | grep 'inet ' | awk '{ print $2 }' | cut -d'/' -f1`, (err, ipAddress, stderr) => {
        if (err) {
            console.error(`Error fetching IP address for ${networkInterface}: ${stderr}`);
            return res.status(500).json({ message: `Failed to fetch IP address for ${networkInterface}` });
        }

        if (!ipAddress) {
            return res.status(400).json({ message: `No IP address found for ${networkInterface}` });
        }

        // Log the fetched IP address for debugging purposes
        console.log(`IP Address for ${networkInterface}: ${ipAddress}`);

        // Ping a common website (e.g., google.com) from the selected network interface
        exec(`ping -I ${ipAddress.trim()} google.com -c 4`, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error pinging: ${stderr}`);
                return res.status(500).json({ message: 'Error pinging network interface.' });
            }

            res.json({ pingResult: stdout });
        });
    });
});


// Route to get and display Wi-Fi settings
app.get('/wifi-settings', (req, res) => {
    // Optionally fetch current Wi-Fi settings from the hostapd configuration
    exec('cat /etc/hostapd/hostapd.conf', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error fetching Wi-Fi settings: ${stderr}`);
            return res.status(500).json({ message: 'Failed to fetch Wi-Fi settings' });
        }
        
        // Assuming settings are in the following format: 
        // ssid=yourAPname, channel=1, wpa_passphrase=yourPassword
        const wifiSettings = stdout.split('\n').reduce((acc, line) => {
            const [key, value] = line.split('=');
            if (key && value) acc[key.trim()] = value.trim();
            return acc;
        }, {});
        
        res.render('wifi-settings', { wifiSettings });
    });
});

// Route to apply Wi-Fi settings
app.post('/apply-wifi-settings', (req, res) => {
    const { ssid, channel, password } = req.body;

    if (!ssid || !channel || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // Update hostapd.conf file with the new settings
    const newConfig = `interface=wlan0
driver=nl80211
ssid=${ssid}
channel=${channel}
wpa=2
wpa_passphrase=${password}
`;

    // Save the new configuration to hostapd.conf
    exec(`echo "${newConfig}" | sudo tee /etc/hostapd/hostapd.conf`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error updating Wi-Fi settings: ${stderr}`);
            return res.status(500).json({ message: 'Failed to apply Wi-Fi settings' });
        }

        // Restart hostapd to apply changes
        exec('sudo systemctl restart hostapd', (err, stdout, stderr) => {
            if (err) {
                console.error(`Error restarting hostapd: ${stderr}`);
                return res.status(500).json({ message: 'Failed to restart Wi-Fi service' });
            }

            res.json({ message: 'Wi-Fi settings updated successfully!' });
        });
    });
});

// Route to remove the selected default gateway
app.post('/remove-default-gateway', (req, res) => {
    const gateway = req.body.gateway;

    if (!gateway) {
        return res.status(400).json({ message: 'No gateway selected' });
    }

    // Remove the selected default gateway
    exec(`ip route show default | grep ${gateway}`, (err, stdout, stderr) => {
        if (err || stderr || !stdout) {
            console.error(`Gateway ${gateway} not found in the route table. Skipping removal.`);
            return res.json({ message: `${gateway} was not found in the routing table.` });
        }

        exec(`sudo route del default gw ${gateway}`, (err, stdout, stderr) => {
            if (err || stderr) {
                console.error(`Error removing default gateway ${gateway}: ${stderr || err}`);
                return res.status(500).json({ message: `Failed to remove default gateway ${gateway}` });
            }

            res.json({ message: `Successfully removed default gateway ${gateway}` });
        });
    });
});

// Route to fix routing (remove conflicting default gateway and ensure correct one)
app.post('/fix-routing', (req, res) => {
    // Step 1: Try to remove both default gateways if they exist
    exec('sudo route del default gw 192.168.68.1', (err, stdout, stderr) => {
        if (err || stderr) {
            console.log(`Error removing default gateway 192.168.68.1: ${stderr || err}`);
        } else {
            console.log('Removed default gateway 192.168.68.1');
        }

        exec('sudo route del default gw 192.168.225.1', (err, stdout, stderr) => {
            if (err || stderr) {
                console.log(`Error removing default gateway 192.168.225.1: ${stderr || err}`);
            } else {
                console.log('Removed default gateway 192.168.225.1');
            }

            // Step 2: Check the current default gateway for eth1
            exec('ip route show | grep eth1 | grep default', (err, stdout, stderr) => {
                if (err || stderr || !stdout) {
                    console.error(`Error fetching correct gateway for eth1: ${stderr || err}`);
                    // Add a default route for eth1 if it's not present
                    exec('sudo route add default gw 192.168.225.1 eth1', (err, stdout, stderr) => {
                        if (err || stderr) {
                            console.error(`Error adding default gateway for eth1: ${stderr || err}`);
                            return res.status(500).json({ message: 'Failed to add correct default gateway for eth1' });
                        }

                        // Restart dhclient for eth1 if necessary
                        exec('sudo dhclient eth1', (err, stdout, stderr) => {
                            if (err || stderr) {
                                console.error(`Error restarting dhclient for eth1: ${stderr || err}`);
                                return res.status(500).json({ message: 'Failed to restart dhclient for eth1' });
                            }

                            res.json({ message: 'Routing fixed successfully for eth1!' });
                        });
                    });
                } else {
                    // If eth1 already has the correct default route, just skip dhclient restart
                    console.log('eth1 already has the correct default route.');
                    res.json({ message: 'eth1 already has the correct default route.' });
                }
            });
        });
    });
});

// Route to display current DNS settings and allow updating
app.get('/dns', (req, res) => {
    // Read the current DNS settings from /etc/resolv.conf
    fs.readFile('/etc/resolv.conf', 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading resolv.conf:", err);
            return res.status(500).json({ message: 'Failed to read DNS settings' });
        }

        // Parse the current DNS servers from resolv.conf
        const dnsServers = data.split('\n').filter(line => line.startsWith('nameserver')).map(line => line.split(' ')[1]);

        res.render('dns', { dnsServers });
    });
});
// Route to update DNS settings
app.post('/update-dns', (req, res) => {
    const newDns = req.body.dnsServers;

    if (!newDns || newDns.length === 0) {
        return res.status(400).json({ message: 'No DNS servers provided' });
    }

    // Generate the new resolv.conf content
    let resolvConfContent = newDns.map(dns => `nameserver ${dns}`).join('\n');

    // Write the new DNS settings to /etc/resolv.conf with sudo
    exec('echo "' + resolvConfContent + '" | sudo tee /etc/resolv.conf', (err, stdout, stderr) => {
        if (err || stderr) {
            console.error("Error updating resolv.conf:", stderr || err);
            return res.status(500).json({ message: 'Failed to update DNS settings' });
        }

        // Restart systemd-resolved service or networking service
        exec('sudo systemctl restart dnsmasq', (err, stdout, stderr) => {
            if (err || stderr) {
                console.error('Error restarting DNS service:', stderr || err);
                return res.status(500).json({ message: 'Failed to restart DNS service' });
            }

            res.json({ message: 'DNS settings updated successfully!' });
        });
    });
});


// Route to display network stats for all interfaces
app.get('/network-monitoring', (req, res) => {
    // Step 1: Get the list of all interfaces
    exec('ls /sys/class/net', (err, stdout, stderr) => {
        if (err || stderr) {
            console.error('Error fetching network interfaces:', stderr || err);
            return res.status(500).json({ message: 'Failed to fetch network interfaces' });
        }

        // Get an array of interface names (e.g., eth0, wlan0)
        const interfaces = stdout.split('\n').filter(interface => interface.trim() !== '');

        // Step 2: Get stats for each interface using ifstat (with a timeout of 10 seconds)
        const networkStatsPromises = interfaces.map(interface => {
            return new Promise((resolve, reject) => {
                exec(`timeout 10s ifstat -i ${interface} 1 1`, (err, stdout, stderr) => {
                    if (err || stderr) {
                        console.error(`Error fetching stats for ${interface}:`, stderr || err);
                        reject(`Error fetching stats for ${interface}`);
                    } else {
                        const stats = stdout.split('\n')[2].split(/\s+/);
                        resolve({
                            interface: interface,
                            incoming: stats[0], // Incoming bytes
                            outgoing: stats[1], // Outgoing bytes
                        });
                    }
                });
            });
        });

        // Wait for all the stats to be fetched
        Promise.all(networkStatsPromises)
            .then((networkStats) => {
                // Step 3: Get currently connected devices on the Wi-Fi network (with a timeout of 10 seconds)
                exec('timeout 10s iw dev wlan0 station dump', (err, stdout, stderr) => {
                    if (err || stderr) {
                        console.error('Error fetching connected devices:', stderr || err);
                        return res.status(500).json({ message: 'Failed to fetch connected devices' });
                    }

                    // Step 4: Parse the connected devices and get MAC addresses
                    const connectedDevices = stdout.split('\n').filter(line => line.startsWith('Station')).map(line => {
                        const columns = line.split(/\s+/);
                        const mac = columns[1]; // Extract MAC address

                        return { mac }; // Only mac for now
                    });

                    // Step 5: Use arp-scan to get the corresponding IP addresses for each MAC address
                    const ipPromises = connectedDevices.map(device => {
                        return new Promise((resolve, reject) => {
                            exec(`sudo arp-scan --interface=wlan0 --localnet | grep ${device.mac}`, (err, stdout, stderr) => {
                                if (err || stderr) {
                                    console.error('Error fetching IP address from arp-scan:', stderr || err);
                                    reject(`Failed to fetch IP for MAC ${device.mac}`);
                                } else {
                                    const columns = stdout.split(/\s+/);
                                    const ip = columns[0]; // IP address is in the first column
                                    resolve({ mac: device.mac, ip });
                                }
                            });
                        });
                    });

                    // Wait for all IPs to be fetched
                    Promise.all(ipPromises)
                        .then(ipResults => {
                            // Combine the IP address and device info
                            connectedDevices.forEach(device => {
                                const ipInfo = ipResults.find(ipResult => ipResult.mac === device.mac);
                                if (ipInfo) {
                                    device.ip = ipInfo.ip; // Add the IP address to the device
                                } else {
                                    device.ip = 'Unknown'; // If no IP is found, set it to Unknown
                                }
                            });

                            // Step 6: Read users.json and match devices based on MAC or IP address
                            fs.readFile('users.json', 'utf8', (err, data) => {
                                if (err) {
                                    console.error('Error reading users.json:', err);
                                    return res.status(500).send('Internal Server Error');
                                }

                                const usersData = JSON.parse(data);

                                // Link device names to MAC/IP addresses
                                connectedDevices.forEach(device => {
                                    const user = usersData.devices.find(user =>
                                        user.ip === device.ip || user.mac === device.mac
                                    );
                                    if (user) {
                                        device.deviceName = user.deviceName;
                                    } else {
                                        device.deviceName = 'Unknown Device'; // Default name if not found
                                    }
                                });

                                // Step 7: Render the page with network stats and connected devices
                                res.render('network-monitoring', {
                                    networkStats,
                                    connectedDevices,
                                });
                            });
                        })
                        .catch((error) => {
                            console.error('Error fetching IP addresses:', error);
                            res.status(500).json({ message: 'Failed to fetch IP addresses' });
                        });
                });
            })
            .catch((error) => {
                console.error('Error fetching network stats:', error);
                res.status(500).json({ message: 'Failed to fetch network stats' });
            });
    });
});



// Route to display the splash page (user must enter their device name)
app.get('/splash', (req, res) => {
    res.render('splash', { deviceInfo: null });
});

// Route to handle form submission (user submits their device name)
app.post('/submit-name', (req, res) => {
    const deviceName = req.body.deviceName;
    const userIp = req.connection.remoteAddress; // Get the IP address of the user

    // If the IP address is in IPv6 format, convert it to IPv4
    const ipv4Address = userIp.replace(/^::ffff:/, '');

    // Step 2: Run arp-scan to get MAC addresses from the network
    exec(`sudo arp-scan --interface=wlan0 --localnet`, (err, stdout, stderr) => {
        if (err || stderr) {
            console.error('Error fetching MAC addresses:', stderr || err);
            return res.status(500).json({ message: 'Failed to fetch MAC addresses' });
        }

        // Step 3: Parse the output of arp-scan
        const devices = stdout.split('\n').filter(line => line.includes(ipv4Address)).map(line => {
            const columns = line.split(/\s+/);
            return {
                ip: columns[0], // IP address
                mac: columns[1], // MAC address
                deviceName: deviceName // Use the provided device name
            };
        });

        // Step 4: Save the device data to users.json
        fs.readFile('users.json', 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading users.json:', err);
                return res.status(500).send('Internal Server Error');
            }

            let usersData = JSON.parse(data);

            // Add the new device/user to the list
            const newDevice = devices[0] || {
                deviceName: deviceName,
                ip: ipv4Address, // Store the user's IP address
                mac: 'Unknown' // Placeholder for MAC address if not found
            };

            usersData.devices.push(newDevice);

            // Write the updated list back to the users.json file
            fs.writeFile('users.json', JSON.stringify(usersData, null, 2), (err) => {
                if (err) {
                    console.error('Error saving users.json:', err);
                    return res.status(500).send('Internal Server Error');
                }

                // After submitting, render the splash page with device info
                res.render('splash', {
                    deviceInfo: newDevice
                });
            });
        });
    });
});



// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
