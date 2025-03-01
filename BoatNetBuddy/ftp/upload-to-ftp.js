const fs = require("fs");
const path = require("path");
const axios = require("axios");
//const Client = require("ssh2-sftp-client");

const LOCAL_DIR = "/home/tom/buddy/ftp/to_upload";


async function logToServer(message) {
  try {
    // Encode the message in case it has spaces or special characters
    await axios.get(`http://log.tomludlow.co.uk/?log=${encodeURIComponent(message)}`);
  } catch (error) {
    // If logging fails, just show it locally.
    console.error('[LogToServer] Failed to send log message:', error.message);
  }
}

const SFTP_CONFIGS = {
  boatnet: {
    host: "192.168.50.1",
    port: 22,
    username: "tom",
    password: "your-password-here",
    remoteFilePath: "/home/tom/BoatNetFTP"
  },
  remote: {
    host: "home394069770.1and1-data.host",
    port: 22,
    username: "your-username-here",
    password: "your-password-here",
    remoteFilePath: "/"
  },
};

async function uploadFiles(server = "remote") {
  //const sftp = new Client();
  const config = SFTP_CONFIGS[server];

  if (!config) {
    console.error(`Invalid server type: ${server}`);
    return;
  }

  try {
    //await sftp.connect(config);
    console.log(`Connected to ${server} SFTP server`);
    logToServer(`Connected to ${server} SFTP server`);

    const files = fs.readdirSync(LOCAL_DIR);

    for (const file of files) {
      const localFilePath = path.join(LOCAL_DIR, file);
      const remoteFilePath = config.remoteFilePath + `/${file}`; // Adjust remote directory as needed

      console.log(`Uploading ${localFilePath} to ${remoteFilePath}`);
      logToServer(`Attempting to upload${localFilePath} to ${remoteFilePath}`);
      /*
      if (fs.lstatSync(localFilePath).isFile()) {
        await sftp.put(localFilePath, remoteFilePath);
        console.log(`Uploaded: ${file}`);
        logToServer(`Uploaded ${localFilePath}`);
      }*/
    }
  } catch (err) {
    console.error(`SFTP error: ${err.message}`);
  } finally {
    //await sftp.end();
  }
}

// Run with a command-line argument: `node uploadSFTP.js remote` or `node uploadSFTP.js boatnet`
const serverType = process.argv[2] || "boatnet";
uploadFiles(serverType);
