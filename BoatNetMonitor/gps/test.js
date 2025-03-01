const { SerialPort } = require('serialport');  // Correct import for v13+
const { ReadlineParser } = require('@serialport/parser-readline');

// Set the serial port for the GPS (usually /dev/ttyUSB2 or similar)
const port = new SerialPort({
  path: '/dev/ttyUSB2',  // Replace with the correct port
  baudRate: 115200,      // Baud rate for SIM7600G-H
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// Send AT command to check GPS status
port.write('AT+CGPSINFO\r\n');  // Request GPS info (GPGGA, GPGLL, etc.)

parser.on('data', (line) => {
  console.log('Received:', line);
  if (line.startsWith('+CGPSINFO:')) {
    // Parse the GPS data from the response
    const parts = line.split(',');
    const lat = parts[3]; // Latitude
    const lon = parts[4]; // Longitude
    const status = parts[0]; // GPS status (should be "1" for GPS fixed)

    if (status === '1') {
      console.log(`GPS Fix: Latitude: ${lat}, Longitude: ${lon}`);
    } else {
      console.log('Waiting for GPS fix...');
    }

    // Close the port after receiving the first valid GPS info
    port.close(() => {
      console.log('Port closed successfully.');
    });
  }
});

// Error handling
port.on('error', (err) => {
  console.error('Error:', err);
});
