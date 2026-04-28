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

VIC is Railway-ready. You can deploy manually or publish it as a reusable template.

### Option A — One-Click Template (for users)

**You must bring your own API keys.** VIC does not include any paid keys.
- [The Odds API](https://the-odds-api.com) — free tier available
- [Anthropic Claude](https://console.anthropic.com) — you supply your own key

Once the template is published, anyone can deploy their own VIC instance in seconds.

> **To publish the template:**
> 1. Push this repo to GitHub (`oddsifylabs/vic`)
> 2. Go to [Railway Dashboard](https://railway.app/dashboard) → **New Project** → **Deploy from GitHub repo**
> 3. Select the `vic` repo → Railway will auto-detect `railway.json` and `Procfile`
> 4. After the first deploy succeeds, open the project → **Create Template**
> 5. Copy the template URL (e.g. `https://railway.app/template/XXXXXX`)
> 6. Paste that URL into the README button below and commit

```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID)
```

### Option B — Manual Deploy (for you, right now)

1. [Railway Dashboard](https://railway.app/dashboard) → **New** → **GitHub Repo**
2. Select `oddsifylabs/vic`
3. Add the environment variables below
4. (Optional) Add a **Volume** mounted at `/data` and set `DATA_DIR=/data`
5. Deploy — done!

### Environment Variables

Set these in your Railway dashboard after deploying:

| Variable | Required | Description |
|----------|----------|-------------|
| `ODDS_API_KEY` | **Yes** | Your own [The Odds API](https://the-odds-api.com) key (free tier available) |
| `CLAUDE_API_KEY` | **Yes** | Your own [Claude/Anthropic](https://console.anthropic.com) key |
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

Copy the example config and fill in your own API keys:
```bash
cp .env.example .env
# Edit .env with your ODDS_API_KEY and CLAUDE_API_KEY
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
