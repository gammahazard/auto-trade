// bot/state.js
module.exports = {
    activeTrade: null, // null | { id, entryTime, isExiting }
    latest_1m_Candle: null,
    latest_15m_Candle: null,
    latestOrderBook: null,
    recentTrades: [],
    latestBtcPrice: null,
    priceHistory: [],
    lastLogTime: 0,
    ws: null, // WebSocket instance
};