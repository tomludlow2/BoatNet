const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Function to fetch GPS data
const getGPSData = () => {
  return new Promise((resolve, reject) => {
    console.log('Initializing GPS module...'); // Debugging message
    
    const port = new SerialPort({
      path: '/dev/ttyUSB2', // Make sure this matches your GPS serial port
      baudRate: 115200,      // Baud rate for the SIM7600G-H module
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    // Send the command to start GPS
    console.log('Sending AT+CGPSINFO command...');
    port.write('AT+CGPSINFO\r\n');  // Request GPS info (GPGGA, GPGLL, etc.)

    // Listen for the first line of GPS info
    parser.on('data', (line) => {
      console.log('Received line:', line); // Debugging message to see incoming data
      if (line.startsWith('+CGPSINFO:')) {
        console.log('Parsing GPS data...'); // Debugging message when parsing starts
        
        const parts = line.split(',');

        // Parsing Latitude and Longitude from the GPS info
        const latitude = parts[0].split(':')[1].trim(); // Extract the latitude part
        const latDirection = parts[1].trim(); // Latitude direction (N/S)
        const longitude = parts[2].trim(); // Longitude
        const lonDirection = parts[3].trim(); // Longitude direction (E/W)

        // Convert latitude and longitude to decimal degrees
        const latDegrees = parseInt(latitude.slice(0, 2)); // Extract the degree part of latitude
        const latMinutes = parseFloat(latitude.slice(2)); // Extract the minutes part of latitude
        let latDecimal = latDegrees + (latMinutes / 60); // Convert to decimal

        const lonDegrees = parseInt(longitude.slice(0, 3)); // Extract the degree part of longitude
        const lonMinutes = parseFloat(longitude.slice(3)); // Extract the minutes part of longitude
        let lonDecimal = lonDegrees + (lonMinutes / 60); // Convert to decimal

        // Adjust the sign for the directions (N/S for latitude, E/W for longitude)
        if (latDirection === 'S') latDecimal = -latDecimal;
        if (lonDirection === 'W') lonDecimal = -lonDecimal;

        // Construct the Google Maps link
        const googleMapsLink = `https://www.google.com/maps?q=${latDecimal},${lonDecimal}`;

        // Resolve the promise with the GPS data and the Google Maps link
        console.log('Resolved GPS data:', {
          latitude: latDecimal,
          longitude: lonDecimal,
          googleMapsLink,
        });
        resolve({
          latitude: latDecimal,
          longitude: lonDecimal,
          googleMapsLink,
        });

        // Close the port after receiving the data
        console.log('Closing port...');
        port.close();
      }
    });

    // If there's an error reading the serial port, reject the promise
    parser.on('error', (err) => {
      console.error('Error reading from port:', err); // More detailed error
      reject(err);
    });
  });
};

module.exports = getGPSData;
