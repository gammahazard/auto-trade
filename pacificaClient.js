const axios = require('axios');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const config = require('./config');
const state = require('./state');

// --- Keypair Setup ---
const privateKeyBytes = bs58.decode(config.PRIVATE_KEY_STRING);
const keypair = Keypair.fromSecretKey(privateKeyBytes);
const walletAddress = keypair.publicKey.toBase58();

// --- Authentication ---
function sortJsonKeys(value) {
    if (typeof value !== 'object' || value === null) return value;
    if (Array.isArray(value)) return value.map(sortJsonKeys);
    return Object.keys(value).sort().reduce((acc, key) => {
        acc[key] = sortJsonKeys(value[key]);
        return acc;
    }, {});
};

async function createSignedPayload(operationData, operationType) {
    const timestamp = Date.now();
    const expiry_window = 30000;
    const dataToSign = { timestamp, expiry_window, type: operationType, data: operationData };
    const sortedMessage = sortJsonKeys(dataToSign);
    const compactJson = JSON.stringify(sortedMessage);
    const messageBytes = Buffer.from(compactJson, 'utf-8');
    const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signatureB58 = bs58.encode(signatureBytes);
    return { account: walletAddress, signature: signatureB58, timestamp, expiry_window, ...operationData };
}

// --- API Functions ---
async function setLeverage() {
    console.log(`Attempting to set leverage for ${config.SYMBOL} to ${config.LEVERAGE}x...`);
    try {
        const operationData = { symbol: config.SYMBOL, leverage: config.LEVERAGE };
        const signedPayload = await createSignedPayload(operationData, 'update_leverage');
        const response = await axios.post(`${config.API_URL}/account/leverage`, signedPayload, {
            headers: { 'PF-API-KEY': config.PACIFICA_API_KEY, 'Content-Type': 'application/json' }
        });
        if (response.data.success) {
            console.log(`✅ Leverage successfully set to ${config.LEVERAGE}x.`);
        } else {
            throw new Error(JSON.stringify(response.data));
        }
    } catch (error) {
        console.warn('⚠️  Warning: Could not set leverage. This is expected if a position is already open or leverage is already set. Continuing...');
    }
}

async function setTPSL(trade) {
    console.log(`--- Setting Server-Side TP/SL for position ID ${trade.i}... ---`);
    try {
        const amount = parseFloat(trade.a);
        const entryPrice = parseFloat(trade.o);

        // --- THIS IS THE CORRECTED CALCULATION ---
        // 1. Calculate the target PnL in USD
        const takeProfitInUSD = config.COLLATERAL_USD * config.TAKE_PROFIT_PERCENT;
        const stopLossInUSD = config.COLLATERAL_USD * config.STOP_LOSS_PERCENT;

        // 2. Calculate the required price change per coin to hit the USD target
        const priceChangeForTP = takeProfitInUSD / amount;
        const priceChangeForSL = stopLossInUSD / amount;

        let takeProfitPrice, stopLossPrice;

        if (trade.ts.includes('long')) { // It's a long position
            takeProfitPrice = entryPrice + priceChangeForTP;
            stopLossPrice = entryPrice - priceChangeForSL;
        } else { // It's a short position
            takeProfitPrice = entryPrice - priceChangeForTP;
            stopLossPrice = entryPrice + priceChangeForSL;
        }
        // ------------------------------------------

        const operationData = {
            symbol: trade.s,
            side: trade.ts.includes('long') ? 'ask' : 'bid',
            take_profit: { stop_price: Math.round(takeProfitPrice).toString() },
            stop_loss: { stop_price: Math.round(stopLossPrice).toString() }
        };

        const signedPayload = await createSignedPayload(operationData, 'set_position_tpsl');
        const response = await axios.post(`${config.API_URL}/positions/tpsl`, signedPayload, {
            headers: { 'PF-API-KEY': config.PACIFICA_API_KEY, 'Content-Type': 'application/json' }
        });

        if (response.data.success) {
            console.log(`✅ Server-Side TP @ $${Math.round(takeProfitPrice)} and SL @ $${Math.round(stopLossPrice)} placed successfully.`);
        } else {
            throw new Error(JSON.stringify(response.data));
        }
    } catch (error) {
        console.error('❌ Error setting TP/SL:', error.response ? error.response.data : error.message);
        console.log('--- SAFETY: TP/SL failed. Closing position immediately to prevent risk. ---');
        const exitSide = trade.ts.includes('long') ? 'ask' : 'bid';
        await executeTrade(exitSide, parseFloat(trade.a), true);
        state.activeTrade = null;
    }
}

async function executeTrade(side, amount, isExit = false) {
    const tradeType = isExit ? 'EXIT' : 'ENTRY';
    const amountStr = amount.toFixed(config.LOT_SIZE_PRECISION);
    console.log(`--- EXECUTING ${tradeType} TRADE: ${side.toUpperCase()} ${amountStr} ${config.SYMBOL} ---`);
    try {
        const operationData = {
            symbol: config.SYMBOL, amount: amountStr, side, reduce_only: isExit,
            slippage_percent: config.SLIPPAGE, client_order_id: crypto.randomUUID()
        };
        const signedPayload = await createSignedPayload(operationData, 'create_market_order');
        const tradeRequest = { id: crypto.randomUUID(), params: { create_market_order: signedPayload } };
        state.ws.send(JSON.stringify(tradeRequest));
    } catch (error) {
        console.error(`❌ Error executing trade:`, error);
        if (state.activeTrade) { state.activeTrade = null; }
    }
}

async function getOpenPosition() {
    try {
        const response = await axios.get(`${config.API_URL}/positions`, {
            headers: { 'PF-API-KEY': config.PACIFICA_API_KEY },
            params: { account: walletAddress }
        });
        return response.data.data.find(p => p.symbol === config.SYMBOL);
    } catch (error) {
        console.error("Error fetching open positions:", error.message);
        return null;
    }
}

module.exports = {
    walletAddress,
    setLeverage,
    setTPSL,
    executeTrade,
    getOpenPosition,
};
