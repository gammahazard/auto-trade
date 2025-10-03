const config = require('./config');
const state = require('./state');
const { setTPSL, executeTrade, getOpenPosition } = require('./pacificaClient');

function handleAccountTrade(myTrade) {
    if (myTrade && myTrade.s === config.SYMBOL) {
        if (!state.activeTrade && (myTrade.ts === 'open_long' || myTrade.ts === 'open_short')) {
            console.log('✅ ENTRY TRADE CONFIRMED:', myTrade);
            state.activeTrade = { id: myTrade.i, entryTime: Date.now(), isExiting: false };
            setTPSL(myTrade); // Set TP/SL immediately after confirmation
        }
        else if (state.activeTrade && (myTrade.ts === 'close_long' || myTrade.ts === 'close_short')) {
            console.log('✅ EXIT TRADE CONFIRMED. Position closed.');
            state.activeTrade = null;
        }
    }
}

async function checkTradeDuration() {
    if (state.activeTrade && !state.activeTrade.isExiting && (Date.now() - state.activeTrade.entryTime > config.MAX_TRADE_DURATION_MS)) {
        state.activeTrade.isExiting = true;
        console.log(`--- TIME LIMIT EXCEEDED! Closing position after ${config.MAX_TRADE_DURATION_MS / 60000} minutes... ---`);
        
        const currentPosition = await getOpenPosition();
        if (currentPosition) {
            const exitSide = currentPosition.side === 'bid' ? 'ask' : 'bid';
            await executeTrade(exitSide, parseFloat(currentPosition.amount), true);
            // THIS IS THE FIX: Immediately reset the state after sending the closing order.
            console.log("Time-based exit order sent. Resetting state to search for new opportunities.");
            state.activeTrade = null; 
        } else {
            console.log("Position appears to be already closed. Resetting state.");
            state.activeTrade = null;
        }
    }
}

module.exports = { handleAccountTrade, checkTradeDuration };