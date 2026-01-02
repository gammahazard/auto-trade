# 📉 Pacifica Scalping Bot: High-Frequency Execution Engine

![Runtime](https://img.shields.io/badge/Runtime-Node.js_v18+-43853D?style=for-the-badge&logo=node.js)
![Strategy](https://img.shields.io/badge/Focus-Automated_Risk_Management-red?style=for-the-badge)
![Connectivity](https://img.shields.io/badge/Networking-Resilient_WebSockets-blue?style=for-the-badge)

A high-performance algorithmic trading engine built for the Pacifica exchange. Designed for low-latency execution, this bot leverages Node.js's asynchronous event loop to process market data and execute BTC perpetual futures trades with millisecond precision. It features a fault-tolerant WebSocket architecture and a multi-layered risk management system that enforces server-side stops immediately upon trade entry.

---

## 🏗️ Architectural Core

The bot is designed around a **Resilient Connection Model**, ensuring that the engine automatically reconnects to the exchange WebSockets if a drop occurs, maintaining 100% market visibility.

### Intelligence Features
* **Multi-Factor Signal Generation:** Analyzes five distinct filters (15m Trend, 1m Momentum, 5m SMA, Order Book Imbalance, and Trade Surges) to find high-probability entries.
* **Server-Side Risk Mitigation:** Hard-codes Take Profit (TP) and Stop Loss (SL) orders directly on the exchange server the moment a position is opened.
* **Time-Based Safety:** Implements an automated "kill-switch" to close any stale trades that exceed a configured duration.

---

## ⚙️ Logic & Configuration

All operational parameters are controlled via a centralized `bot/config.js` to allow for rapid strategy tuning.

### Performance Parameters
| Parameter | Description |
| :--- | :--- |
| **Leverage & Collateral** | Dynamic allocation of capital with built-in position sizing calculations. |
| **Order Book Depth** | Analyzes up to 5 price levels for deep-liquidity scalping. |
| **Trade Surge Window** | Tracks trade volume spikes within precise millisecond windows to identify aggressive market entries. |

---

## 🚀 Deployment

### Prerequisites
* **Node.js (v18+):** Required for asynchronous event-loop handling.
* **Solana Wallet Integration:** Securely handles wallet authentication via local `.env` configuration.

### Initialization

**1. Clone & Install**
```bash
git clone [https://github.com/gammahazard/auto-trade.git](https://github.com/gammahazard/auto-trade.git)
cd auto-trade
npm install
```

**2. Configure Environment**
Create a `.env` file in the root directory and populate it with your specific keys:
```bash
PACIFICA_API_KEY=your_api_key
SOLANA_PRIVATE_KEY=your_wallet_private_key
```

**3. Execution**
Start the engine via the entry point:
```bash
node bot/main.js
```

---

> **⚠️ Risk Disclosure**
>
> This is a high-risk tool utilizing real capital. It is strongly recommended to test with very small amounts of capital before deploying with significant funds. The creators are not responsible for any financial losses.

<div align="center">
  <sub>Developed by Vanguard Secure Solutions</sub>
</div>
