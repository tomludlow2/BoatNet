// controllers/indexController.js
const exec = require('child_process').exec;

exports.index = (req, res) => {
    // Fetch routing table
    exec('route -n', (err, routingTable, stderr) => {
        if (err) {
            console.error(`Error fetching routing table: ${stderr}`);
            return res.render('index', { routingTable: 'Error fetching routing table', usbDevices: 'Error fetching USB devices', networkInterfaces: 'Error fetching network interfaces' });
        }

        // Fetch USB devices
        exec('lsusb', (err, usbDevices, stderr) => {
            if (err) {
                console.error(`Error fetching USB devices: ${stderr}`);
                return res.render('index', { routingTable, usbDevices: 'Error fetching USB devices', networkInterfaces: 'Error fetching network interfaces' });
            }

            // Fetch network interfaces
            exec('ifconfig -a', (err, networkInterfaces, stderr) => {
                if (err) {
                    console.error(`Error fetching network interfaces: ${stderr}`);
                    return res.render('index', { routingTable, usbDevices, networkInterfaces: 'Error fetching network interfaces' });
                }

                // Pass data to the view
                res.render('index', { routingTable, usbDevices, networkInterfaces });
            });
        });
    });
};
