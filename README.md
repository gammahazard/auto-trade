# 📉 Pacifica Scalping Bot: High-Frequency Execution Engine

![Runtime](https://img.shields.io/badge/Runtime-Node.js_v18+-43853D?style=for-the-badge&logo=node.js)
![Strategy](https://img.shields.io/badge/Focus-Automated_Risk_Management-red?style=for-the-badge)
![Connectivity](https://img.shields.io/badge/Networking-Resilient_WebSockets-blue?style=for-the-badge)

A high-performance algorithmic trading engine built for the Pacifica exchange. Designed for low-latency execution, this bot leverages Node.js's asynchronous event loop to process market data and execute BTC perpetual futures trades with millisecond precision. It features a fault-tolerant WebSocket architecture and a multi-layered risk management system that enforces server-side stops immediately upon trade entry.

---

## 🏗️ Architectural Core

The bot is designed around a **Resilient Connection Model**, ensuring that the engine automatically reconnects to the exchange WebSockets if a drop occurs, maintaining 100% market visibility.

### Signal Generation: 5-Factor Strategy
All filters must align before trade execution:

| Filter | Description |
| :--- | :--- |
| **15m Trend** | Price relative to 15-minute candle open |
| **1m Momentum** | Current 1-minute candle direction |
| **SMA Proximity** | Price within configured % of 5-period SMA |
| **Order Book Imbalance** | Bid/Ask volume ratio exceeds threshold |
| **Trade Surge** | 2:1 buy/sell trade ratio in window |

### Server-Side Risk Mitigation
* **Immediate TP/SL:** Hard-codes Take Profit and Stop Loss orders directly on the exchange server the moment a position is opened.
* **Time-Based Kill-Switch:** Automatically closes any stale trades exceeding `MAX_TRADE_DURATION_MS`.

---

## ⚙️ Configuration

All parameters in `config.js`:

| Parameter | Default | Description |
| :--- | :---: | :--- |
| `LEVERAGE` | 8x | Position leverage multiplier |
| `COLLATERAL_USD` | $400 | Capital per trade |
| `TAKE_PROFIT_PERCENT` | 0.06% | TP threshold |
| `STOP_LOSS_PERCENT` | 0.03% | SL threshold |
| `MAX_TRADE_DURATION_MS` | 5 min | Kill-switch timeout |
| `IMBALANCE_RATIO` | 1.85 | Min bid/ask volume ratio |
| `SMA_PERIOD` | 5 | Simple moving average period |
| `SMA_PROXIMITY_PERCENT` | 0.1% | Price proximity to SMA |

---

## 📁 Project Structure

```
auto-trade/
├── main.js              # Entry point, orchestrates all modules
├── config.js            # Centralized configuration
├── state.js             # Shared state management
├── strategy.js          # 5-factor signal generation
├── tradeManager.js      # Position lifecycle & kill-switch
├── pacificaClient.js    # Exchange API integration
├── websocketManager.js  # Resilient WebSocket handler
└── README.md
```

---

## 🚀 Deployment

### Prerequisites
* **Node.js v18+** (required for async handling)
* **Pacifica API Key** & **Solana Wallet**

### Setup

```bash
git clone https://github.com/gammahazard/auto-trade.git
cd auto-trade
npm install
```

Create `.env`:
```bash
API_KEY=your_pacifica_api_key
PRIVATE_KEY=your_solana_private_key
```

Run:
```bash
node main.js
```

---

> **⚠️ Risk Disclosure**
>
> This is a high-risk tool utilizing real capital. Test with minimal funds before deploying significant capital. The creators are not responsible for any financial losses.

<div align="center">
  <sub>Developed by <a href="https://github.com/gammahazard">Vanguard Secure Solutions</a></sub>
</div>
