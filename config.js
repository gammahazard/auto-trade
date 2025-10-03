const path = require('path');
// This now assumes the .env file is in the root directory where the script is run
require('dotenv').config();

module.exports = {
    // --- Trade Configuration ---
    SYMBOL: 'BTC',
    LEVERAGE: 8,
    COLLATERAL_USD: 400,
    TAKE_PROFIT_PERCENT: 0.06,
    STOP_LOSS_PERCENT: 0.03,
    MAX_TRADE_DURATION_MS: 5 * 60 * 1000,
    IMBALANCE_RATIO: 1.85,
    LEVELS_TO_CHECK: 5,
    TRADE_SURGE_WINDOW: 3000,
    SLIPPAGE: '0.5',
    LOT_SIZE_PRECISION: 5,
    SMA_PERIOD: 5,
    LOG_INTERVAL: 5000,
    SMA_PROXIMITY_PERCENT: 0.001, // Added for the proximity check in strategy.js

    // --- API Info & Keys ---
    API_URL: 'https://api.pacifica.fi/api/v1',
    WEBSOCKET_URL: 'wss://ws.pacifica.fi/ws',
    PRIVATE_KEY_STRING: process.env.PRIVATE_KEY,
    PACIFICA_API_KEY: process.env.API_KEY,
};

