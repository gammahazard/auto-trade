// bot/websocketManager.js
const WebSocket = require('ws');
const config = require('./config');
const state = require('./state');
const { walletAddress } = require('./pacificaClient');
const { handleAccountTrade } = require('./tradeManager');
const { checkForSignal } = require('./strategy');

let heartbeatInterval = null;

function startWebSocket() {
    console.log(`\nAttempting to connect to WebSocket at ${config.WEBSOCKET_URL}...`);
    state.ws = new WebSocket(config.WEBSOCKET_URL, { headers: { 'PF-API-KEY': config.PACIFICA_API_KEY } });

    state.ws.on('open', () => {
        console.log('✅ WebSocket connection established.');
        const subscriptions = [
            { source: "book", symbol: config.SYMBOL, agg_level: 1 }, { source: "candle", symbol: config.SYMBOL, interval: "1m" },
            { source: "candle", symbol: config.SYMBOL, interval: "15m" }, { source: "trades", symbol: config.SYMBOL },
            { source: "prices" }, { source: "account_trades", account: walletAddress }
        ];
        subscriptions.forEach(sub => state.ws.send(JSON.stringify({ method: "subscribe", params: sub })));
        
        heartbeatInterval = setInterval(() => {
            if (state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ method: "ping" }));
            }
        }, 30000);
    });

    state.ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            // --- Route messages based on channel ---
            switch (message.channel) {
                case 'pong':
                case 'subscribe':
                    break; // Ignore these
                case 'candle':
                    if (message.data.i === '1m') {
                        state.latest_1m_Candle = message.data;
                        state.priceHistory.push(parseFloat(state.latest_1m_Candle.c));
                        if (state.priceHistory.length > config.SMA_PERIOD) state.priceHistory.shift();
                    } else if (message.data.i === '15m') {
                        state.latest_15m_Candle = message.data;
                    }
                    break;
                case 'book':
                    state.latestOrderBook = message.data;
                    checkForSignal(); // Check for a signal every time the order book updates
                    break;
                case 'prices':
                    const btcData = message.data.find(p => p.symbol === config.SYMBOL);
                    if (btcData) state.latestBtcPrice = btcData;
                    break;
                case 'trades':
                    const now = Date.now();
                    message.data.forEach(trade => state.recentTrades.push({ ...trade, receivedAt: now }));
                    state.recentTrades = state.recentTrades.filter(t => now - t.receivedAt < config.TRADE_SURGE_WINDOW);
                    break;
                case 'account_trades':
                    handleAccountTrade(message.data[0]);
                    break;
                default:
                    // Handle trade execution responses
                    if (message.type === 'create_market_order') {
                        console.log('\n--> Received Trade Execution Response:');
                        console.log(message);
                        if (message.code !== 200) {
                            console.error('❌ TRADE FAILED:', message.err);
                            if (!message.err.includes('No position found')) {
                                state.activeTrade = null;
                            }
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error("❌ An unexpected error occurred in the message handler:", e);
        }
    });

    state.ws.on('error', (error) => console.error('❌ WebSocket error:', error.message));

    state.ws.on('close', (code) => {
        console.log(`🔌 WebSocket connection closed. Code: ${code}. Attempting to reconnect in 5 seconds...`);
        clearInterval(heartbeatInterval);
        setTimeout(startWebSocket, 5000);
    });
}

module.exports = { startWebSocket };