# VIC — Vegas Intelligence Console

**The free, open-source alternative to Sports Insights (€£149/mo) and Action Network Pro (€£99/mo).**

VIC is a sharp betting intelligence engine that scrapes public betting percentages, tracks line movement, detects steam and reverse line movement (RLM), monitors injuries and weather, and generates high-confidence picks — all in a slick dark-green terminal aesthetic.

---

## ✅ Features

| Feature | Status |
|---------|--------|
| **Public Betting %** | Live consensus from Covers + Action Network |
| **Line Movement Tracker** | SAO scraper with open/close/current spread |
| **Signal Engine v2** | Steam, RLM, Contrarian, Heavy Public, Sharp Money, Drift |
| **Signal History & Backtest** | Track, grade, and backtest every signal |
| **Telegram Alerts** | Auto-push contrarian signals to your group |
| **Signal of the Day** | Best high-confidence pick per sport |
| **CSV Export** | Download signals for Excel analysis |
| **Public API** | Rate-limited, CORS-enabled developer API with API keys |
| **Syndicate Mode** | Anonymous crowd-sourced signal aggregation |
| **Webhooks** | HMAC-signed subscriptions with retry logic |
| **CLV Tracker** | Real-time closing line value monitoring |
| **Parlay Builder** | Correlation-aware parlay generator |
| **Injury Monitor** | ESPN + Rotowire live injury scraper |
| **Weather Overlay** | Game-time conditions for outdoor sports |
| **News Feed** | ESPN headlines with AI sentiment summary |
| **Unit Tracking** | Full bet log with win/loss, units, and bankroll |

---

## 🚀 Deploy on Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/vic)

1. Click the button above
2. Add your environment variables (see below)
3. (Optional) Add a **Volume** to persist data between deploys
4. Done — your instance is live!

### Environment Variables

Set these in your Railway dashboard after deploying:

| Variable | Required | Description |
|----------|----------|-------------|
| `ODDS_API_KEY` | **Yes** | [The Odds API](https://the-odds-api.com) key |
| `CLAUDE_API_KEY` | No | [Claude/Anthropic](https://console.anthropic.com) key for AI summaries |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram chat/group ID for alerts |
| `DEFAULT_BOOK` | No | Default sportsbook (`hardrockbet`, `betmgm`, `caesars`, etc.) |
| `ODDS_REGION` | No | Region (`us`, `us2`, `uk`, `au`, `eu`) |
| `UNIT_SIZE` | No | Default unit size (default: `100`) |
| `DATA_DIR` | No | Path to persistent data directory (see Volumes below) |

### 📦 Persistence (Volumes)

Railway's filesystem is **ephemeral** — every redeploy wipes local files. To keep your bets, logs, and signal history:

1. Railway Dashboard → **Volumes** → **New Volume**
2. Mount path: `/data`
3. Add the env var: `DATA_DIR=/data`
4. Redeploy

Without a volume, the app works fine but data resets on every git push.

---

## 💻 Local Development

```bash
git clone https://github.com/oddsifylabs/vic.git
cd vic
npm install
node proxy.js
# Open http://localhost:3747
```

Copy the example config:
```bash
cp config.example.json data/config.json
# Edit data/config.json with your API keys
```

---

## 🔐 Security

- API keys are **never** exposed in frontend endpoints — returned as `••••••••`
- `.env` and `data/config.json` are `.gitignore`d
- Public API responses strip all internal scraper metadata
- Webhook payloads are **HMAC-SHA256 signed**

---

## 📝 License

MIT — See [LICENSE](LICENSE)

Built by [Oddsify Labs](https://www.oddsifylabs.com)
