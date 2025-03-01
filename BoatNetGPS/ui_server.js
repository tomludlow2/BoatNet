// ui_server.js
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { Pool } = require('pg');
const { exec } = require('child_process');

const app = express();
const port = 3005;

const pool = new Pool({
  user: 'tom',
  host: 'localhost',
  database: 'boatnetgps',
  password: 'eNdocarditis1508',
  port: 5432,
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

// Serve local libraries
app.use('/libs', express.static('/home/tom/local_libs'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM gps_data ORDER BY timestamp DESC LIMIT 1');
    const gpsData = rows[0] || { latitude: 'N/A', longitude: 'N/A', timestamp: 'N/A' };
    res.render('view-gps', { gpsData });
  } catch (err) {
    res.render('view-gps', { gpsData: { latitude: 'Error', longitude: 'Error', timestamp: 'Error' } });
  }
});

app.get('/control', (req, res) => {
  res.render('control-panel', { response: null, portInfo: null });
});

app.post('/control', (req, res) => {
  const atCommand = req.body.command;
  let responseSent = false;

  const port = new SerialPort({
    path: '/dev/ttyUSB2',
    baudRate: 115200,
    autoOpen: false,
  });

  port.open((err) => {
    if (err) {
      if (!responseSent) {
        responseSent = true;
        return res.render('control-panel', { response: `Error opening port: ${err.message}`, portInfo: null });
      }
    }

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    port.write(`${atCommand}\r\n`, (err) => {
      if (err && !responseSent) {
        responseSent = true;
        if (port.isOpen) port.close();
        return res.render('control-panel', { response: `Error sending command: ${err.message}`, portInfo: null });
      }
    });

    parser.on('data', (line) => {
      if (!responseSent) {
        responseSent = true;
        res.render('control-panel', { response: line, portInfo: null });
        if (port.isOpen) port.close();
      }
    });

    parser.on('error', (err) => {
      if (!responseSent) {
        responseSent = true;
        res.render('control-panel', { response: `Error: ${err.message}`, portInfo: null });
        if (port.isOpen) port.close();
      }
    });

    port.on('close', () => {
      console.log('Serial port closed successfully.');
    });
  });
});

app.get('/check-port', (req, res) => {
  exec('fuser /dev/ttyUSB2', (error, stdout, stderr) => {
    if (error) {
      if (error.code === 1) {
        return res.render('control-panel', { response: null, portInfo: 'No process is currently using /dev/ttyUSB2.' });
      }
      return res.render('control-panel', { response: null, portInfo: `Error checking port: ${error.message}` });
    }
    if (stderr) {
      return res.render('control-panel', { response: null, portInfo: `stderr: ${stderr}` });
    }
    const portInfo = stdout ? `Processes using /dev/ttyUSB2: ${stdout}` : 'No process is currently using /dev/ttyUSB2.';
    res.render('control-panel', { response: null, portInfo });
  });
});
 
app.get('/gps-history', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM gps_data ORDER BY timestamp DESC');
    res.render('gps-history', { gpsData: rows, error: null });
  } catch (err) {
    res.render('gps-history', { gpsData: [], error: 'Failed to fetch GPS data' });
  }
});


app.post('/gps-history/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;
  try {
    await pool.query('UPDATE gps_data SET latitude = $1, longitude = $2 WHERE id = $3', [latitude, longitude, id]);
    res.redirect('/gps-history');
  } catch (err) {
    res.send(`Error updating GPS data: ${err.message}`);
  }
});

app.post('/gps-history/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM gps_data WHERE id = $1', [id]);
    res.redirect('/gps-history');
  } catch (err) {
    res.send(`Error deleting GPS data: ${err.message}`);
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

app.listen(port, () => {
  console.log(`BoatNetGPS UI running on port ${port}`);
});
