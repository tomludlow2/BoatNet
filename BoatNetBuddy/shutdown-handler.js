const { exec } = require("child_process");

async function pollCommand() {
  try {
    const response = await fetch("http://log.tomludlow.co.uk/command");
    const data = await response.json();

    // Check if we got { "command": "shutdown" }
    if (data.command === "shutdown") {
      console.log("Shutdown command received. Shutting down...");
      exec("sudo shutdown -h now", (error) => {
        if (error) {
          console.error("Failed to shut down:", error);
        }
      });
    }
  } catch (error) {
    console.error("Error polling shutdown command:", error);
  }
}

// Immediately poll once on startup (optional)
pollCommand();

// Poll every 30 seconds
setInterval(pollCommand, 30_000);
