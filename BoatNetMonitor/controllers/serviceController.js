const { exec } = require('child_process');

exports.checkServiceStatus = (req, res) => {
    const services = [
        'hostapd', 'dnsmasq', 'ssh', 'set-static-ip.service', 'unblock-wlan.service',
        'BoatNetCache.service', 'BoatNetGPS.service', 'BoatNetGPSUIServer.service',
        'BoatNetMaps.service', 'BoatNetSplash.service', 'BoatNetWiki.service', 'BoatNetMonitor'
    ];
    const serviceStatus = {};

    let promises = services.map((service) => {
        return new Promise((resolve) => {
            exec(`systemctl is-active ${service}`, (err, stdout) => {
                serviceStatus[service] = stdout.trim() === 'active' ? 'Running' : 'Stopped';
                resolve();
            });
        });
    });

    Promise.all(promises)
        .then(() => res.render('status', { serviceStatus }))
        .catch((error) => {
            console.error(error);
            res.status(500).send('Error checking service status');
        });
};
