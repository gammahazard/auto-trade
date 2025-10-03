// bot/fullyAutomatedBot.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const axios = require('axios');
const WebSocket = require('ws');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const crypto = require('crypto');
const nacl = require('tweetnacl');

// --- Trade Configuration ---
const SYMBOL = 'BTC';
const LEVERAGE = 20;
const COLLATERAL_USD = 200;
const TAKE_PROFIT_PERCENT = 0.04;
const STOP_LOSS_PERCENT = 0.04;
const MAX_TRADE_DURATION_MS = 2.5 * 60 * 1000;
const IMBALANCE_RATIO = 1.5;
const LEVELS_TO_CHECK = 5;
const TRADE_SURGE_WINDOW = 3000;
const SLIPPAGE = '0.5';
const LOT_SIZE_PRECISION = 5;

// --- Bot State ---
let activeTrade = null; // null | { id, entryTime, isExiting }
let latest_1m_Candle = null;
let latest_15m_Candle = null;
let latestOrderBook = null;
let recentTrades = [];
let latestBtcPrice = null;
let heartbeatInterval = null;
let ws = null;
let lastLogTime = 0;
const LOG_INTERVAL = 5000;
const SMA_PERIOD = 5;
let priceHistory = [];

// --- API Info & Keys ---
const API_URL = 'https://api.pacifica.fi/api/v1';
const WEBSOCKET_URL = 'wss://ws.pacifica.fi/ws';
const PRIVATE_KEY_STRING = process.env.PRIVATE_KEY;
const PACIFICA_API_KEY = process.env.API_KEY;

if (!PRIVATE_KEY_STRING || !PACIFICA_API_KEY) { console.error("Keys missing."); process.exit(1); }

const privateKeyBytes = bs58.decode(PRIVATE_KEY_STRING);
const keypair = Keypair.fromSecretKey(privateKeyBytes);
const walletAddress = keypair.publicKey.toBase58();

async function main() {
    await setLeverage();
    startWebSocket();
}

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

async function setLeverage() {
    console.log(`Attempting to set leverage for ${SYMBOL} to ${LEVERAGE}x...`);
    try {
        const operationData = { symbol: SYMBOL, leverage: LEVERAGE };
        const signedPayload = await createSignedPayload(operationData, 'update_leverage');
        const response = await axios.post(`${API_URL}/account/leverage`, signedPayload, {
            headers: { 'PF-API-KEY': PACIFICA_API_KEY, 'Content-Type': 'application/json' }
        });
        if (response.data.success) {
            console.log(`✅ Leverage successfully set to ${LEVERAGE}x.`);
        } else {
            throw new Error(JSON.stringify(response.data));
        }
    } catch (error) {
        console.warn('⚠️  Warning: Could not set leverage. This is expected if a position is already open or leverage is already set. Continuing...');
    }
}

async function executeTrade(side, amount, isExit = false) {
    const tradeType = isExit ? 'EXIT' : 'ENTRY';
    console.log(`--- EXECUTING ${tradeType} TRADE: ${side.toUpperCase()} ${amount} ${SYMBOL} ---`);
    try {
        const operationData = {
            symbol: SYMBOL, amount: amount.toString(), side, reduce_only: isExit,
            slippage_percent: SLIPPAGE, client_order_id: crypto.randomUUID()
        };
        const signedPayload = await createSignedPayload(operationData, 'create_market_order');
        const tradeRequest = { id: crypto.randomUUID(), params: { create_market_order: signedPayload } };
        ws.send(JSON.stringify(tradeRequest));
    } catch (error) {
        console.error(`❌ Error executing trade:`, error);
        if (activeTrade) { activeTrade = null; }
    }
}

async function setTPSL(trade) {
    console.log(`--- Setting Server-Side TP/SL for position ID ${trade.i}... ---`);
    try {
        const amount = parseFloat(trade.a);
        const entryPrice = parseFloat(trade.o);
        const positionValue = entryPrice * amount;
        const priceMoveForTP = (COLLATERAL_USD * TAKE_PROFIT_PERCENT) / positionValue;
        const priceMoveForSL = (COLLATERAL_USD * STOP_LOSS_PERCENT) / positionValue;
        let takeProfitPrice, stopLossPrice;
        if (trade.ts.includes('long')) {
            takeProfitPrice = entryPrice * (1 + priceMoveForTP);
            stopLossPrice = entryPrice * (1 - priceMoveForSL);
        } else {
            takeProfitPrice = entryPrice * (1 - priceMoveForTP);
            stopLossPrice = entryPrice * (1 + priceMoveForSL);
        }
        const operationData = {
            symbol: trade.s,
            side: trade.ts.includes('long') ? 'ask' : 'bid',
            take_profit: { stop_price: Math.round(takeProfitPrice).toString() },
            stop_loss: { stop_price: Math.round(stopLossPrice).toString() }
        };
        const signedPayload = await createSignedPayload(operationData, 'set_position_tpsl');
        const response = await axios.post(`${API_URL}/positions/tpsl`, signedPayload, {
            headers: { 'PF-API-KEY': PACIFICA_API_KEY, 'Content-Type': 'application/json' }
        });
        if (response.data.success) {
            console.log(`✅ Server-Side TP @ $${Math.round(takeProfitPrice)} and SL @ $${Math.round(stopLossPrice)} placed successfully.`);
        } else {
            throw new Error(JSON.stringify(response.data));
        }
    } catch (error) {
        console.error('❌ Error setting TP/SL:', error.response ? error.response.data : error.message);
        activeTrade = null;
    }
}

function startWebSocket() {
    console.log(`\nAttempting to connect to WebSocket at ${WEBSOCKET_URL}...`);
    ws = new WebSocket(WEBSOCKET_URL, { headers: { 'PF-API-KEY': PACIFICA_API_KEY } });

    ws.on('open', () => {
        console.log('✅ WebSocket connection established.');
        const subscriptions = [
            { source: "book", symbol: SYMBOL, agg_level: 1 }, { source: "candle", symbol: SYMBOL, interval: "1m" },
            { source: "candle", symbol: SYMBOL, interval: "15m" }, { source: "trades", symbol: SYMBOL },
            { source: "prices" }, { source: "account_trades", account: walletAddress }
        ];
        subscriptions.forEach(sub => ws.send(JSON.stringify({ method: "subscribe", params: sub })));
        heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ method: "ping" }));
            }
        }, 30000);
    });

    ws.on('message', async (data) => {
        try { // NEW: Wrap message handler in a try/catch block
            const message = JSON.parse(data.toString());
            if (message.type === 'create_market_order') {
                console.log('\n--> Received Trade Execution Response:');
                console.log(message);
                if (message.code !== 200) {
                    console.error('❌ TRADE FAILED:', message.err);
                    if(activeTrade && message.err.includes('No position found')) {
                    } else {
                         activeTrade = null;
                    }
                }
                return;
            }
            if (message.channel === 'pong' || message.channel === 'subscribe') return;
            if (message.channel === 'candle') {
                if (message.data.i === '1m') {
                    latest_1m_Candle = message.data;
                    priceHistory.push(parseFloat(latest_1m_Candle.c));
                    if (priceHistory.length > SMA_PERIOD) {
                        priceHistory.shift();
                    }
                }
                else if (message.data.i === '15m') { latest_15m_Candle = message.data; }
            }
            if (message.channel === 'book') latestOrderBook = message.data;
            if (message.channel === 'prices') {
                const btcData = message.data.find(p => p.symbol === SYMBOL);
                if (btcData) latestBtcPrice = btcData;
            }
            if (message.channel === 'trades') {
                const now = Date.now();
                message.data.forEach(trade => recentTrades.push({ ...trade, receivedAt: now }));
                recentTrades = recentTrades.filter(t => now - t.receivedAt < TRADE_SURGE_WINDOW);
            }
            if (message.channel === 'account_trades') {
                const myTrade = message.data[0];
                if (myTrade && myTrade.s === SYMBOL) {
                    if (!activeTrade && (myTrade.ts === 'open_long' || myTrade.ts === 'open_short')) {
                        console.log('✅ ENTRY TRADE CONFIRMED:', myTrade);
                        activeTrade = { id: myTrade.i, entryTime: Date.now(), isExiting: false };
                        await setTPSL(myTrade);
                    }
                    else if (activeTrade && (myTrade.ts === 'close_long' || myTrade.ts === 'close_short')) {
                        console.log('✅ EXIT TRADE CONFIRMED. Position closed.');
                        activeTrade = null;
                    }
                }
            }

            if (activeTrade && !activeTrade.isExiting && (Date.now() - activeTrade.entryTime > MAX_TRADE_DURATION_MS)) {
                activeTrade.isExiting = true;
                console.log(`--- TIME LIMIT EXCEEDED! Closing position after 5 minutes... ---`);
                try {
                    const response = await axios.get(`${API_URL}/positions`, { headers: {'PF-API-KEY': PACIFICA_API_KEY}, params: {account: walletAddress} });
                    const currentPosition = response.data.data.find(p => p.symbol === SYMBOL);
                    if (currentPosition) {
                        const exitSide = currentPosition.side === 'bid' ? 'ask' : 'bid';
                        await executeTrade(exitSide, parseFloat(currentPosition.amount), true);
                    } else {
                        console.log("Position appears to be already closed. Resetting state.");
                        activeTrade = null;
                    }
                } catch (e) {
                    console.error("Error fetching position to close by time:", e.message);
                    activeTrade = null;
                }
                return;
            }

            if (message.channel === 'book' && !activeTrade) {
                if (!latestOrderBook || !latest_1m_Candle || !latest_15m_Candle || !latestBtcPrice || priceHistory.length < SMA_PERIOD) return;

                const isLongTermTrendUp = parseFloat(latestBtcPrice.mark) > parseFloat(latest_15m_Candle.o);
                const isLongTermTrendDown = parseFloat(latestBtcPrice.mark) < parseFloat(latest_15m_Candle.o);
                const bids = latestOrderBook.l[0], asks = latestOrderBook.l[1];
                if (!bids || !asks || bids.length === 0 || asks.length === 0) return;
                const topBidsVolume = bids.slice(0, LEVELS_TO_CHECK).reduce((t, l) => t + parseFloat(l.a), 0);
                const topAsksVolume = asks.slice(0, LEVELS_TO_CHECK).reduce((t, l) => t + parseFloat(l.a), 0);
                const buyTrades = recentTrades.filter(t => t.d.includes('long'));
                const sellTrades = recentTrades.filter(t => t.d.includes('short'));
                const sma = priceHistory.reduce((sum, price) => sum + price, 0) / SMA_PERIOD;
                const isPriceBelowSMA = parseFloat(latestBtcPrice.mark) < sma;
                const isPriceAboveSMA = parseFloat(latestBtcPrice.mark) > sma;
                const now = Date.now();
                if (now - lastLogTime > LOG_INTERVAL) {
                    lastLogTime = now;
                    const ratio = topAsksVolume > 0 ? (topBidsVolume / topAsksVolume) : topBidsVolume;
                    const candleDir_1m = parseFloat(latest_1m_Candle.c) > parseFloat(latest_1m_Candle.o) ? 'UP' : 'DOWN';
                    const trendDir_15m = isLongTermTrendUp ? 'UP' : (isLongTermTrendDown ? 'DOWN' : 'FLAT');
                    console.log(`Searching...| 15m Trend:${trendDir_15m} | Price:$${latestBtcPrice.mark} (SMA:${sma.toFixed(0)}) | Ratio:${ratio.toFixed(2)} | 1m:${candleDir_1m} | Trades(B/S):${buyTrades.length}/${sellTrades.length}`);
                }
                const isBuyImbalance = topBidsVolume > topAsksVolume * IMBALANCE_RATIO;
                const isSellImbalance = topAsksVolume > topBidsVolume * IMBALANCE_RATIO;
                const isCandleBullish_1m = parseFloat(latest_1m_Candle.c) > parseFloat(latest_1m_Candle.o);
                const isCandleBearish_1m = parseFloat(latest_1m_Candle.c) < parseFloat(latest_1m_Candle.o);
                const isBuySurge = buyTrades.length > sellTrades.length * 2;
                const isSellSurge = sellTrades.length > buyTrades.length * 2;
                let signal = null;
                if (isLongTermTrendUp && isPriceBelowSMA && isBuyImbalance && isCandleBullish_1m && isBuySurge) signal = 'bid';
                if (isLongTermTrendDown && isPriceAboveSMA && isSellImbalance && isCandleBearish_1m && isSellSurge) signal = 'ask';
                if (signal) {
                    console.log(`\n🟢 High-Confidence ${signal.toUpperCase()} Signal! EXECUTING TRADE...`);
                    const positionSizeUSD = COLLATERAL_USD * LEVERAGE;
                    const rawOrderAmount = positionSizeUSD / parseFloat(latestBtcPrice.mark);
                    const multiplier = Math.pow(10, LOT_SIZE_PRECISION);
                    const adjustedOrderAmount = Math.floor(rawOrderAmount * multiplier) / multiplier;
                    if (adjustedOrderAmount > 0) {
                         await executeTrade(signal, adjustedOrderAmount);
                    }
                }
            }
        } catch (e) {
            console.error("❌ An unexpected error occurred in the message handler:", e);
        }
    });

    ws.on('error', (error) => { console.error('❌ WebSocket error:', error.message); });

    // NEW: Automatic Reconnection Logic
    ws.on('close', (code) => {
        console.log(`🔌 WebSocket connection closed. Code: ${code}. Attempting to reconnect in 5 seconds...`);
        clearInterval(heartbeatInterval);
        setTimeout(startWebSocket, 5000); // Wait 5 seconds before trying to reconnect
    });
}

main();

