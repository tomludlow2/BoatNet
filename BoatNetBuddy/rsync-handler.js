// syncCachedPages.js
const { exec } = require('child_process');
const axios = require('axios');
// Local directory containing cached pages.
const localPath = '/home/tom/buddy/cached_pages/';
const localPath2 = '/home/tom/buddy/rss_feeds/';
const localPath3 = '/home/tom/buddy/cached_requested';
const localPath4 = '/home/tom/buddy/weather_cache';

// Remote directory on BoatNet.
const remotePath = 'tom@192.168.50.1:/home/tom/BoatNetCache/cached_pages';
const remotePath2 = 'tom@192.168.50.1:/home/tom/BoatNetCache/rss_feeds';
const remotePath3 = 'tom@192.168.50.1:/home/tom/BoatNetCache/cached_requested';
const remotePath4 = 'tom@192.168.50.1:/home/tom/BoatNetCache/weather_cache';


async function logToServer(message) {
  try {
    // Encode the message in case it has spaces or special characters
    await axios.get(`http://log.tomludlow.co.uk/?log=${encodeURIComponent(message)}`);
  } catch (error) {
    // If logging fails, just show it locally.
    console.error('[LogToServer] Failed to send log message:', error.message);
  }
}

function runRsync(local, remote) {
  const command = `rsync -avz ${local} ${remote}`;
  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error('Error running rsync:', error);
      await logToServer(`Rsync error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error('rsync stderr:', stderr);
      await logToServer(`Rsync stderr: ${stderr}`);
    }
    console.log('rsync stdout:', stdout);
    await logToServer(`Rsync completed successfully for ${local} to ${remote}`);
  });
}

runRsync(localPath, remotePath);
runRsync(localPath2, remotePath2);
runRsync(localPath3, remotePath3);
runRsync(localPath4, remotePath4);
