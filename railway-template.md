# Deploy and Host VegasIntelligenceConsole on Railway

VegasIntelligenceConsole (VIC) is a sharp betting intelligence engine that scrapes public betting percentages, tracks line movement, detects steam and reverse line movement, monitors injuries and weather, and generates high-confidence picks — all wrapped in a slick dark-green terminal aesthetic.

## About Hosting VegasIntelligenceConsole

VIC is a Node.js/Express application that proxies and aggregates sports betting data from multiple public sources. To host it, you need a server environment with Node.js 20+, outbound internet access for API calls, and optionally a persistent volume to retain signal history, bet logs, and backtest data across redeploys. Railway handles all of this automatically: Nixpacks builds the app from your GitHub repo, the healthcheck endpoint ensures clean startups, and a single click adds persistent storage if you need it.

## Common Use Cases

- **Sharp bettor dashboard** — Monitor public betting splits, line movement, and contrarian signals in real time
- **Automated alert system** — Push high-confidence picks to Telegram when steam or reverse line movement is detected
- **Historical backtesting** — Track signal accuracy, win rates, and closing line value over time

## Dependencies for VegasIntelligenceConsole Hosting

- **The Odds API** — Live odds and public betting percentages (free tier available)
- **Anthropic Claude** — AI-generated pick summaries and sentiment analysis

### Deployment Dependencies

- [Get The Odds API key](https://the-odds-api.com)
- [Get Anthropic Claude API key](https://console.anthropic.com)
- [Create a Telegram bot](https://t.me/BotFather) (optional, for alerts)

## Why Deploy VegasIntelligenceConsole on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying VegasIntelligenceConsole on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
