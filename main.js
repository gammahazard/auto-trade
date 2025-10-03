const { setLeverage } = require('./pacificaClient');
const { startWebSocket } = require('./websocketManager');
const { checkTradeDuration } = require('./tradeManager');
const { checkForSignal } = require('./strategy'); // Import the strategy checker

async function main() {
    console.log("--- Starting Fully Automated Trading Bot ---");

    const config = require('./config');
    if (!config.PRIVATE_KEY_STRING || !config.PACIFICA_API_KEY) {
        console.error("FATAL: PRIVATE_KEY or API_KEY missing from .env file. Exiting.");
        process.exit(1);
    }
    
    await setLeverage();

    startWebSocket();

    // This loop now handles both the time-based exit and the status logging
    setInterval(() => {
        checkTradeDuration();
        // We will call checkForSignal here as well to ensure the log prints regularly.
        // The function has a built-in guard to prevent trading if a position is active.
        checkForSignal(); 
    }, 5000); // This now runs every 5 seconds, aligned with your LOG_INTERVAL
}

main();

