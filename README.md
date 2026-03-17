# VIC — Vegas Intelligence Console

Sharp betting intelligence terminal. Runs locally from USB or any folder.
Data (bets, API keys, logs) never leaves your machine.

---

## QUICK START

### Windows
```
Right-click start.ps1 → Run with PowerShell
```
or double-click `start.bat`

### Linux / Mac
```bash
bash start.sh
```

Then open **http://localhost:3747** (browser auto-opens after 2s).

> **First run:** dependencies install to `~/.vic_modules/` (~30 seconds).
> Every run after is instant.

---

## UPDATE FROM GITHUB

### Windows — double-click `update.bat`

### Linux / Mac
```bash
bash update.sh
```

This pulls the latest code from GitHub while keeping your personal data
(`data/` folder — bets, API keys, logs) untouched.

---

## SETUP

1. Start VIC
2. Go to **Settings** (⚙ in top-right)
3. Add your API keys:
   - **The Odds API** — [the-odds-api.com](https://the-odds-api.com) (500 free req/month)
   - **Claude API** — [console.anthropic.com](https://console.anthropic.com) (pay-as-you-go)
4. ESPN, SAO scraper, Open-Meteo weather — **free, no key needed**

---

## PAGES

| Page | Description |
|------|-------------|
| **Home** | Dashboard — games, news, Ask VIC chatbot, recent bets |
| **Legs** | AI edge model — pulls live odds + injuries + public % |
| **Odds** | Live odds from Hard Rock Bet, FanDuel, DraftKings, BetMGM |
| **Scores** | Live scores from ESPN |
| **Props** | Player props with multi-book comparison |
| **Public %** | SAO consensus — ticket %, money %, fade/steam/RLM signals |
| **Alerts** | Line movement monitor — auto-scans every 5 minutes |
| **Intel Feed** | ESPN news, scores, standings, leaders, AI digest |
| **Injuries** | ESPN per-team injury report with AI impact analysis |
| **AI Analysis** | Claude Sonnet + web search — deep game/slate analysis |
| **Weather** | Open-Meteo stadium weather for NFL/MLB outdoor venues |
| **Stats** | ESPN league leaders + standings |
| **Bet Tracker** | Log bets, set results, P/L tracking |
| **CLV** | Closing line value — sharpness indicator |
| **Bankroll** | P/L chart, monthly breakdown, AI performance review |
| **Parlay** | AI parlay finder + manual builder |
| **Tools** | 11 tools: EV, Kelly, odds converter, hedge, arb, sharp money tracker, prop trends, AI scout + more |
| **Logs** | System event log with toggle, filters, export |
| **Settings** | API keys, preferences, system tests |

---

## TECH STACK

- **Backend:** Node.js + Express on `localhost:3747`
- **Frontend:** Plain HTML + CSS + vanilla JS (no framework)
- **Data sources:** The Odds API, ESPN public JSON, SAO scraper, Open-Meteo, Claude API
- **Storage:** JSON files in `data/` folder

---

## DATA & PRIVACY

- All data stored locally in `data/` on your USB/drive
- API keys stored in `data/config.json` — never sent anywhere except the official API endpoints
- `data/` is in `.gitignore` — never committed to GitHub

---

## REPO

```
github.com/YOUR_USERNAME/vic
```

