const config = require('./config');
const state = require('./state');
const { executeTrade } = require('./pacificaClient');

function checkForSignal() {
    if (state.activeTrade) return; // Don't look for new trades if one is active
    if (!state.latestOrderBook || !state.latest_1m_Candle || !state.latest_15m_Candle || !state.latestBtcPrice || state.priceHistory.length < config.SMA_PERIOD) {
        return; // Not enough data to make a decision
    }

    // --- Data & Trend Analysis ---
    const isLongTermTrendUp = parseFloat(state.latestBtcPrice.mark) > parseFloat(state.latest_15m_Candle.o);
    const isLongTermTrendDown = parseFloat(state.latestBtcPrice.mark) < parseFloat(state.latest_15m_Candle.o);
    const bids = state.latestOrderBook.l[0], asks = state.latestOrderBook.l[1];
    if (!bids || !asks || bids.length === 0 || asks.length === 0) return;

    // --- Indicator Calculations ---
    const topBidsVolume = bids.slice(0, config.LEVELS_TO_CHECK).reduce((t, l) => t + parseFloat(l.a), 0);
    const topAsksVolume = asks.slice(0, config.LEVELS_TO_CHECK).reduce((t, l) => t + parseFloat(l.a), 0);
    const buyTrades = state.recentTrades.filter(t => t.d.includes('long'));
    const sellTrades = state.recentTrades.filter(t => t.d.includes('short'));
    const sma = state.priceHistory.reduce((sum, price) => sum + price, 0) / config.SMA_PERIOD;
    
    // MODIFIED: Replaced strict SMA check with a proximity check
    const isPriceNearSMA_Buy = parseFloat(state.latestBtcPrice.mark) < sma * (1 + config.SMA_PROXIMITY_PERCENT);
    const isPriceNearSMA_Sell = parseFloat(state.latestBtcPrice.mark) > sma * (1 - config.SMA_PROXIMITY_PERCENT);

    const isBuyImbalance = topBidsVolume > topAsksVolume * config.IMBALANCE_RATIO;
    const isSellImbalance = topAsksVolume > topBidsVolume * config.IMBALANCE_RATIO;
    const isCandleBullish_1m = parseFloat(state.latest_1m_Candle.c) > parseFloat(state.latest_1m_Candle.o);
    const isCandleBearish_1m = parseFloat(state.latest_1m_Candle.c) < parseFloat(state.latest_1m_Candle.o);
    const isBuySurge = buyTrades.length > sellTrades.length * 2;
    const isSellSurge = sellTrades.length > buyTrades.length * 2;

    logStatus(isLongTermTrendUp, isLongTermTrendDown, topBidsVolume, topAsksVolume, sma, buyTrades, sellTrades);

    // --- Signal Logic ---
    let signal = null;
    // MODIFIED: Using the new proximity check in the signal logic
    if (isLongTermTrendUp && isPriceNearSMA_Buy && isBuyImbalance && isCandleBullish_1m && isBuySurge) signal = 'bid';
    if (isLongTermTrendDown && isPriceNearSMA_Sell && isSellImbalance && isCandleBearish_1m && isSellSurge) signal = 'ask';

    if (signal) {
        console.log(`\n🟢 High-Confidence ${signal.toUpperCase()} Signal! EXECUTING TRADE...`);
        const positionSizeUSD = config.COLLATERAL_USD * config.LEVERAGE;
        const rawOrderAmount = positionSizeUSD / parseFloat(state.latestBtcPrice.mark);
        const multiplier = Math.pow(10, config.LOT_SIZE_PRECISION);
        const adjustedOrderAmount = Math.floor(rawOrderAmount * multiplier) / multiplier;
        if (adjustedOrderAmount > 0) {
            executeTrade(signal, adjustedOrderAmount);
        }
    }
}

function logStatus(isLongTermTrendUp, isLongTermTrendDown, topBidsVolume, topAsksVolume, sma, buyTrades, sellTrades) {
    const now = Date.now();
    if (now - state.lastLogTime > config.LOG_INTERVAL) {
        state.lastLogTime = now;
        const ratio = topAsksVolume > 0 ? (topBidsVolume / topAsksVolume) : topBidsVolume;
        const candleDir_1m = parseFloat(state.latest_1m_Candle.c) > parseFloat(state.latest_1m_Candle.o) ? 'UP' : 'DOWN';
        const trendDir_15m = isLongTermTrendUp ? 'UP' : (isLongTermTrendDown ? 'DOWN' : 'FLAT');
        console.log(`Searching...| 15m Trend:${trendDir_15m} | Price:$${state.latestBtcPrice.mark} (SMA:${sma.toFixed(0)}) | Ratio:${ratio.toFixed(2)} | 1m:${candleDir_1m} | Trades(B/S):${buyTrades.length}/${sellTrades.length}`);
    }
}

module.exports = { checkForSignal };

