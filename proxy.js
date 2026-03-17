const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const PORT = 3747;
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BETS_FILE = path.join(DATA_DIR, 'bets.json');
const CLV_FILE = path.join(DATA_DIR, 'clv.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const LINE_SNAP_FILE = path.join(DATA_DIR, 'line_snapshots.json');
const PARLAY_FILE = path.join(DATA_DIR, 'parlays.json');
const SCRAPE_CACHE_FILE = path.join(DATA_DIR, 'scrape_cache.json');
const CLV_SNAP_FILE    = path.join(DATA_DIR, 'clv_snapshots.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Root redirects to lock screen
app.get('/', (req, res) => res.redirect('/lock.html'));

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
function loadBets() {
  try { return JSON.parse(fs.readFileSync(BETS_FILE, 'utf8')); } catch { return []; }
}
function saveBets(bets) { fs.writeFileSync(BETS_FILE, JSON.stringify(bets, null, 2)); }
function loadClv() {
  try { return JSON.parse(fs.readFileSync(CLV_FILE, 'utf8')); } catch { return []; }
}
function saveClv(clv) { fs.writeFileSync(CLV_FILE, JSON.stringify(clv, null, 2)); }
function loadAlerts() {
  try { return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); } catch { return []; }
}
function saveAlerts(a) { fs.writeFileSync(ALERTS_FILE, JSON.stringify(a, null, 2)); }
function loadParlays() {
  try { return JSON.parse(fs.readFileSync(PARLAY_FILE, 'utf8')); } catch { return []; }
}
function saveParlays(p) { fs.writeFileSync(PARLAY_FILE, JSON.stringify(p, null, 2)); }
// CLV snapshots: { "TeamName|sportKey": { odds, book, ts, game } }
function loadCLVSnaps() {
  try { return JSON.parse(fs.readFileSync(CLV_SNAP_FILE, 'utf8')); } catch { return {}; }
}
function saveCLVSnaps(s) {
  try { fs.writeFileSync(CLV_SNAP_FILE, JSON.stringify(s, null, 2)); } catch(e) {}
}
async function snapshotOddsForTeam(team, sportKey) {
  // Store current odds for a team so we have them even after game ends
  const cfg = loadConfig();
  if (!cfg.oddsKey || !team) return;
  const snaps = loadCLVSnaps();
  const key   = `${team.toLowerCase()}|${sportKey}`;
  // Don't re-snapshot too frequently (within 30 min)
  if (snaps[key] && (Date.now() - snaps[key].ts) < 30 * 60 * 1000) return;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${cfg.oddsKey}&regions=us,us2&markets=h2h,spreads&oddsFormat=american&bookmakers=hardrockbet,fanduel,draftkings,betmgm`;
    const r = await fetch(url);
    if (!r.ok) return;
    const games = await r.json();
    if (!Array.isArray(games)) return;
    for (const game of games) {
      const isAway = game.away_team?.toLowerCase().includes(team.toLowerCase());
      const isHome = game.home_team?.toLowerCase().includes(team.toLowerCase());
      if (!isAway && !isHome) continue;
      const side = isAway ? game.away_team : game.home_team;
      let bestOdds = null, bestBook = null;
      for (const book of (game.bookmakers || [])) {
        for (const mkt of (book.markets || [])) {
          if (!['h2h','spreads'].includes(mkt.key)) continue;
          const out = mkt.outcomes?.find(o => o.name === side);
          if (!out) continue;
          if (bestOdds === null || Math.abs(out.price) < Math.abs(bestOdds)) {
            bestOdds = out.price; bestBook = book.key;
          }
        }
        if (bestOdds !== null) break;
      }
      if (bestOdds !== null) {
        snaps[key] = { odds: bestOdds, book: bestBook, team: side,
          game: `${game.away_team} @ ${game.home_team}`,
          ts: Date.now(), date: new Date().toLocaleDateString() };
        saveCLVSnaps(snaps);
        addLog('info', 'CLV', `Odds snapshot: ${side}`, `${bestOdds} @ ${bestBook}`);
        return snaps[key];
      }
    }
  } catch(e) {}
}

function loadSnapshots() {
  try { return JSON.parse(fs.readFileSync(LINE_SNAP_FILE, 'utf8')); } catch { return {}; }
}
function saveSnapshots(s) { fs.writeFileSync(LINE_SNAP_FILE, JSON.stringify(s, null, 2)); }
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// In-memory logging state — avoid disk read on every request
let _loggingEnabled = true;  // default ON until config says otherwise
let _logsCache = null;        // lazy-loaded cache

// Load logging enabled state from config once at startup
try {
  const startCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (startCfg.loggingEnabled === false) _loggingEnabled = false;
} catch(e) {}

function loadLogs() {
  if (_logsCache !== null) return _logsCache;
  try {
    _logsCache = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  } catch(e) {
    _logsCache = [];
  }
  return _logsCache;
}

function saveLogs(logs) {
  _logsCache = logs;
  try { fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2)); } catch(e) {}
}

function addLog(level, source, message, detail = '') {
  try {
    if (!_loggingEnabled) return;
    const logs = loadLogs();
    logs.unshift({ id: Date.now(), ts: new Date().toISOString(), level, source, message, detail: detail || '' });
    if (logs.length > 2000) logs.splice(2000);
    saveLogs(logs);
  } catch(e) { /* never crash on logging */ }
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Skip log API calls (prevents loops) and static files
    if (req.path.startsWith('/api/logs')) return;
    if (req.path.match(/\.(html|css|js|ico|jpeg|jpg|png|svg|woff|woff2)$/)) return;
    const ms = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    addLog(level, 'HTTP', `${req.method} ${req.path} → ${res.statusCode}`, `${ms}ms`);
  });
  next();
});

// ── LOGGING API ──────────────────────────────────────
// GET /api/logs  — fetch logs with optional filters
app.get('/api/logs', (req, res) => {
  const limit  = parseInt(req.query.limit)  || 500;
  const level  = req.query.level            || 'all';
  const source = req.query.source           || 'all';
  const search = (req.query.search || '').toLowerCase();
  let logs = loadLogs();
  if (level  !== 'all') logs = logs.filter(l => l.level  === level);
  if (source !== 'all') logs = logs.filter(l => l.source === source);
  if (search)           logs = logs.filter(l =>
    l.message.toLowerCase().includes(search) ||
    l.detail.toLowerCase().includes(search)  ||
    l.source.toLowerCase().includes(search)
  );
  res.json(logs.slice(0, limit));
});

// GET /api/logs/:id — get single log entry detail
app.get('/api/logs/entry/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const log = loadLogs().find(l => l.id === id);
  if (!log) return res.status(404).json({ error: 'Log entry not found' });
  res.json(log);
});

// GET /api/logs/stats — counts by source + level
app.get('/api/logs/stats', (req, res) => {
  const logs = loadLogs();
  const bySource = {};
  const byLevel  = { info: 0, warn: 0, error: 0 };
  logs.forEach(l => {
    bySource[l.source] = (bySource[l.source] || 0) + 1;
    if (byLevel[l.level] !== undefined) byLevel[l.level]++;
    else byLevel.info++;
  });
  res.json({ total: logs.length, bySource, byLevel, oldest: logs[logs.length-1]?.ts || null });
});

// DELETE /api/logs — clear all logs
app.delete('/api/logs', (req, res) => {
  saveLogs([]);
  addLog('info', 'System', 'Logs cleared', 'Manual clear via settings');
  res.json({ ok: true });
});

// DELETE /api/logs/source/:source — clear logs for one source
app.delete('/api/logs/source/:source', (req, res) => {
  const source = req.params.source;
  const logs = loadLogs().filter(l => l.source !== source);
  saveLogs(logs);
  addLog('info', 'System', `Logs cleared for ${source}`, 'Manual clear via settings');
  res.json({ ok: true, remaining: logs.length });
});

// DELETE /api/logs/level/:level — clear logs by level (error/warn/info)
app.delete('/api/logs/level/:level', (req, res) => {
  const level = req.params.level;
  const logs = loadLogs().filter(l => l.level !== level);
  saveLogs(logs);
  res.json({ ok: true, remaining: logs.length });
});

// GET /api/logs/enabled — check if logging is enabled
app.get('/api/logs/enabled', (req, res) => {
  res.json({ enabled: _loggingEnabled });
});

// POST /api/logs/enabled — toggle logging
app.post('/api/logs/enabled', (req, res) => {
  const cfg = loadConfig();
  const newState = req.body.enabled !== false;
  cfg.loggingEnabled = newState;
  _loggingEnabled = newState;  // update in-memory flag immediately
  saveConfig(cfg);
  if (newState) addLog('info', 'System', 'Logging enabled', 'User toggled ON');
  res.json({ ok: true, enabled: newState });
});

// Config endpoints
app.get('/api/config', (req, res) => res.json(loadConfig()));
app.post('/api/config', (req, res) => { saveConfig(req.body); res.json({ ok: true }); });

// Bets endpoints
app.get('/api/bets', (req, res) => res.json(loadBets()));
app.post('/api/bets', async (req, res) => {
  const bets = loadBets();
  const bet  = { ...req.body, id: Date.now(), date: new Date().toLocaleDateString() };
  bets.push(bet); saveBets(bets); res.json(bet);
  // Auto-snapshot current odds for CLV tracking (async, don't block response)
  if (bet.odds && bet.sport) {
    const SPORT_KEYS = {
      NBA:'basketball_nba',   NFL:'americanfootball_nfl', MLB:'baseball_mlb',
      NHL:'icehockey_nhl',    NCAAB:'basketball_ncaab',  EPL:'soccer_epl',
      NCAAB2:'baseball_college_baseball', TENNIS:'tennis_atp',
    };
    const sportKey  = SPORT_KEYS[bet.sport] || 'basketball_nba';
    const teamGuess = (bet.bet || '').replace(/^(over|under)\s+[\d.]+\s*/i,'')
      .replace(/\s*[@\/\(\[].*/g,'').replace(/\s+(ml|vs\.?|puck line).*/gi,'')
      .replace(/\s+[+-]\d+(\.\d+)?\s*$/i,'').trim();
    if (teamGuess.length >= 3) {
      snapshotOddsForTeam(teamGuess, sportKey).catch(() => {});
    }
  }
});
app.put('/api/bets/:id', (req, res) => {
  let bets = loadBets();
  const idx = bets.findIndex(b => b.id == req.params.id);
  if (idx !== -1) { bets[idx] = { ...bets[idx], ...req.body }; saveBets(bets); }
  res.json({ ok: true });
});
app.delete('/api/bets/:id', (req, res) => {
  saveBets(loadBets().filter(b => b.id != req.params.id)); res.json({ ok: true });
});

// CLV endpoints
app.get('/api/clv', (req, res) => res.json(loadClv()));
app.post('/api/clv', (req, res) => {
  const clv = loadClv();
  const entry = { ...req.body, id: Date.now(), date: new Date().toLocaleDateString() };
  clv.push(entry); saveClv(clv); res.json(entry);
});
// POST /api/clv/snapshot-pending — snapshot odds for all pending bets
app.post('/api/clv/snapshot-pending', async (req, res) => {
  const bets = loadBets().filter(b => b.result === 'pending' && b.odds && b.sport);
  const SPORT_KEYS = {
    NBA:'basketball_nba', NFL:'americanfootball_nfl', MLB:'baseball_mlb',
    NHL:'icehockey_nhl', NCAAB:'basketball_ncaab', EPL:'soccer_epl'
  };
  let snapped = 0;
  for (const bet of bets) {
    const sportKey  = SPORT_KEYS[bet.sport] || 'basketball_nba';
    const teamGuess = (bet.bet || '').replace(/^(over|under)\s+[\d.]+\s*/i,'')
      .replace(/\s*[@\/\(\[].*/g,'').replace(/\s+(ml|vs\.?|puck line).*/gi,'')
      .replace(/\s+[+-]\d+(\.\d+)?\s*$/i,'').trim();
    if (teamGuess.length >= 3) {
      const result = await snapshotOddsForTeam(teamGuess, sportKey).catch(() => null);
      if (result) snapped++;
    }
  }
  res.json({ ok: true, snapped, total: bets.length });
});

// GET /api/clv/snapshots — return all stored CLV snapshots
app.get('/api/clv/snapshots', (req, res) => res.json(loadCLVSnaps()));

// GET /api/clv/closing/:sport/:team
// CLV closing line strategy:
//   1. Check Odds API SCORES endpoint for completed games (has closing line data)
//   2. If game is still upcoming/live — fetch current pre-game odds (best available)
//   3. Return odds + whether game is final so UI can show correct status
app.get('/api/clv/closing/:sport/:team', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.oddsKey) return res.json({ error: 'No odds API key', odds: null });

  const sportParam = req.params.sport;
  const team = decodeURIComponent(req.params.team).toLowerCase().trim();
  if (!team || team.length < 2) return res.json({ ok: false, error: 'Team name too short' });

  const ALL_SPORTS = ['basketball_nba','americanfootball_nfl','baseball_mlb','icehockey_nhl','basketball_ncaab','baseball_college_baseball','tennis_atp'];
  const SPORT_FALLBACKS = {
    'basketball_nba':       ['basketball_nba'],
    'americanfootball_nfl': ['americanfootball_nfl'],
    'baseball_mlb':         ['baseball_mlb'],
    'icehockey_nhl':        ['icehockey_nhl'],
    'soccer_epl':           ['soccer_epl'],
    'basketball_ncaab':     ['basketball_ncaab'],
    'all':                  ALL_SPORTS,
  };
  const sportsToTry = SPORT_FALLBACKS[sportParam] || ALL_SPORTS;

  // Team fuzzy match helper
  function teamMatches(apiTeam, query) {
    if (!apiTeam || !query) return false;
    const a = apiTeam.toLowerCase();
    const q = query.toLowerCase().trim();
    if (a.includes(q) || q.includes(a)) return true;
    const apiWords   = a.split(' ');
    const queryWords = q.split(' ');
    for (const qw of queryWords) {
      if (qw.length < 3) continue;
      for (const aw of apiWords) {
        if (aw.length < 3) continue;
        if (aw === qw || aw.includes(qw) || qw.includes(aw)) return true;
      }
    }
    return false;
  }

  try {
    // Step 0: Check our own CLV snapshot store first (most reliable for closed games)
    const clvSnaps = loadCLVSnaps();
    const snapKeys = Object.keys(clvSnaps);
    for (const key of snapKeys) {
      const snap = clvSnaps[key];
      if (!snap.team) continue;
      const snapTeam = snap.team.toLowerCase();
      if (snapTeam.includes(team) || team.split(' ').some(w => w.length > 3 && snapTeam.includes(w))) {
        addLog('info', 'CLV', `Snap hit: ${snap.team}`, `${snap.odds} @ ${snap.book} (${snap.date})`);
        return res.json({
          ok: true, odds: snap.odds, book: snap.book,
          team: snap.team, game: snap.game || snap.team,
          isFinal: false, status: 'SNAPSHOT',
          snapDate: snap.date
        });
      }
    }

    // Step 1: Try Odds API /scores endpoint — returns completed + in-progress games
    // The scores endpoint returns last_h2h which IS the closing line data
    for (const sport of sportsToTry) {
      try {
        const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${cfg.oddsKey}&daysFrom=3`;
        const sr = await fetch(scoresUrl);
        if (!sr.ok) continue;
        const scores = await sr.json();
        if (!Array.isArray(scores)) continue;

        for (const game of scores) {
          const awayMatch = teamMatches(game.away_team, team);
          const homeMatch = teamMatches(game.home_team, team);
          if (!awayMatch && !homeMatch) continue;

          const side      = awayMatch ? game.away_team : game.home_team;
          const isComplete = game.completed || false;

          // For completed games, fetch the historical odds (closing line)
          // Use /odds endpoint with the specific event
          try {
            const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${game.id}/odds?apiKey=${cfg.oddsKey}&regions=us,us2&markets=h2h,spreads&oddsFormat=american&bookmakers=hardrockbet,fanduel,draftkings,betmgm`;
            const or = await fetch(oddsUrl);
            if (or.ok) {
              const oddsData = await or.json();
              let bestOdds = null, bestBook = null;
              for (const book of (oddsData.bookmakers || [])) {
                for (const market of (book.markets || [])) {
                  if (!['h2h','spreads'].includes(market.key)) continue;
                  const outcome = market.outcomes?.find(o => o.name === side);
                  if (!outcome) continue;
                  if (bestOdds === null || Math.abs(outcome.price) < Math.abs(bestOdds)) {
                    bestOdds = outcome.price;
                    bestBook = book.key;
                  }
                }
                if (bestOdds !== null) break;
              }
              if (bestOdds !== null) {
                addLog('info', 'CLV', `Closing line: ${side}`, `${bestOdds} @ ${bestBook} (${isComplete ? 'FINAL' : 'LIVE'})`);
                return res.json({
                  ok: true, odds: bestOdds, book: bestBook,
                  team: side, game: `${game.away_team} @ ${game.home_team}`,
                  isFinal: isComplete,
                  status: isComplete ? 'FINAL' : 'LIVE'
                });
              }
            }
          } catch(e) {}

          // Event odds not available — game too old or not in API
          // Return scores data we have as confirmation game was found
          if (isComplete) {
            return res.json({
              ok: false, team: side, isFinal: true,
              game: `${game.away_team} @ ${game.home_team}`,
              error: 'Game final but closing odds not in API — enter manually'
            });
          }
        }
      } catch(e) { continue; }
    }

    // Step 2: Game not in scores — try live pre-game odds as best available line
    for (const sport of sportsToTry) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${cfg.oddsKey}&regions=us,us2&markets=h2h,spreads&oddsFormat=american&bookmakers=hardrockbet,fanduel,draftkings,betmgm`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const games = await r.json();
        if (!Array.isArray(games)) continue;

        for (const game of games) {
          const awayMatch = teamMatches(game.away_team, team);
          const homeMatch = teamMatches(game.home_team, team);
          if (!awayMatch && !homeMatch) continue;

          const side = awayMatch ? game.away_team : game.home_team;
          let bestOdds = null, bestBook = null;

          for (const mktKey of ['h2h', 'spreads']) {
            for (const book of (game.bookmakers || [])) {
              const market = book.markets?.find(m => m.key === mktKey);
              const outcome = market?.outcomes?.find(o => o.name === side);
              if (!outcome) continue;
              if (bestOdds === null || Math.abs(outcome.price) < Math.abs(bestOdds)) {
                bestOdds = outcome.price;
                bestBook = book.key;
              }
            }
            if (bestOdds !== null) break;
          }

          if (bestOdds !== null) {
            addLog('info', 'CLV', `Pre-game line: ${side}`, `${bestOdds} @ ${bestBook}`);
            return res.json({
              ok: true, odds: bestOdds, book: bestBook,
              team: side, game: `${game.away_team} @ ${game.home_team}`,
              isFinal: false, status: 'PRE-GAME'
            });
          }
        }
      } catch(e) { continue; }
    }

    addLog('info', 'CLV', `No odds found for: ${team}`, `Sports tried: ${sportsToTry.join(',')}`);
    return res.json({ ok: false, error: `No current odds found for "${team}" — game may be completed and removed from API`, odds: null });

  } catch(e) {
    addLog('error', 'CLV', `Closing odds fetch failed`, e.message);
    res.json({ error: e.message, odds: null });
  }
});

app.put('/api/clv/:id', (req, res) => {
  let clv = loadClv();
  const idx = clv.findIndex(e => e.id == req.params.id);
  if (idx !== -1) { clv[idx] = { ...clv[idx], ...req.body }; saveClv(clv); }
  res.json({ ok: true });
});
app.delete('/api/clv/:id', (req, res) => {
  saveClv(loadClv().filter(e => e.id != req.params.id)); res.json({ ok: true });
});

// Alerts endpoints
app.get('/api/alerts', (req, res) => res.json(loadAlerts()));
app.post('/api/alerts', (req, res) => {
  const alerts = loadAlerts();
  const alert = { ...req.body, id: Date.now(), createdAt: new Date().toISOString(), triggered: false };
  alerts.push(alert); saveAlerts(alerts); res.json(alert);
});
app.put('/api/alerts/:id', (req, res) => {
  let alerts = loadAlerts();
  const idx = alerts.findIndex(a => a.id == req.params.id);
  if (idx !== -1) { alerts[idx] = { ...alerts[idx], ...req.body }; saveAlerts(alerts); }
  res.json({ ok: true });
});
app.delete('/api/alerts/:id', (req, res) => {
  saveAlerts(loadAlerts().filter(a => a.id != req.params.id)); res.json({ ok: true });
});

// Parlays endpoints
app.get('/api/parlays', (req, res) => res.json(loadParlays()));
app.post('/api/parlays', (req, res) => {
  const parlays = loadParlays();
  const parlay = { ...req.body, id: Date.now(), date: new Date().toLocaleDateString() };
  parlays.push(parlay); saveParlays(parlays); res.json(parlay);
});
app.delete('/api/parlays/:id', (req, res) => {
  saveParlays(loadParlays().filter(p => p.id != req.params.id)); res.json({ ok: true });
});

// Line snapshots — store current lines for movement detection
app.post('/api/snapshots', (req, res) => {
  const snaps = loadSnapshots();
  const { gameId, market, team, bookmaker, odds, point } = req.body;
  const key = `${gameId}_${market}_${team}_${bookmaker}`;
  if (!snaps[key]) {
    snaps[key] = { openOdds: odds, openPoint: point, currentOdds: odds, currentPoint: point, history: [{ odds, point, ts: Date.now() }] };
  } else {
    snaps[key].currentOdds = odds;
    snaps[key].currentPoint = point;
    snaps[key].history = snaps[key].history || [];
    snaps[key].history.push({ odds, point, ts: Date.now() });
    if (snaps[key].history.length > 50) snaps[key].history = snaps[key].history.slice(-50);
  }
  saveSnapshots(snaps);
  res.json({ key, ...snaps[key] });
});
app.get('/api/snapshots', (req, res) => res.json(loadSnapshots()));

// Line movement detection — compare current vs stored snapshot
app.get('/api/line-movement', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.oddsKey) return res.json({ moves: [] });
  const sports = ['basketball_nba','baseball_mlb','icehockey_nhl','americanfootball_nfl','soccer_epl','soccer_usa_mls'];
  const snaps = loadSnapshots();
  const moves = [];
  for (const sport of sports) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${cfg.oddsKey}&regions=us,us2&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=hardrockbet,fanduel,draftkings`;
      const r = await fetch(url);
      if (!r.ok) continue;
  
      if (!Array.isArray(games)) continue;
      games.forEach(g => {
        g.bookmakers?.forEach(bk => {
          bk.markets?.forEach(m => {
            m.outcomes?.forEach(o => {
              const key = `${g.id}_${m.key}_${o.name}_${bk.key}`;
              const snap = snaps[key];
              if (snap) {
                const oddsMove = o.price - snap.openOdds;
                const pointMove = o.point !== undefined ? (o.point - (snap.openPoint || o.point)) : 0;
                if (Math.abs(oddsMove) >= 10 || Math.abs(pointMove) >= 0.5) {
                  moves.push({
                    sport: sport.replace('americanfootball_','').replace('soccer_usa_','').replace('soccer_','').toUpperCase(),
                    game: `${g.away_team} @ ${g.home_team}`,
                    commenceTime: g.commence_time,
                    market: m.key, team: o.name, bookmaker: bk.key,
                    openOdds: snap.openOdds, currentOdds: o.price, oddsMove,
                    openPoint: snap.openPoint, currentPoint: o.point, pointMove,
                    severity: Math.abs(oddsMove) >= 20 ? 'sharp' : 'notable'
                  });
                }
              } else {
                // First time — store snapshot
                snaps[key] = { openOdds: o.price, openPoint: o.point, currentOdds: o.price, currentPoint: o.point, history: [{ odds: o.price, point: o.point, ts: Date.now() }] };
              }
            });
          });
        });
      });
    } catch(e) {}
  }
  saveSnapshots(snaps);
  res.json({ moves, ts: Date.now() });
});

// Scores / live data endpoint
app.get('/api/scores/:sport', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.oddsKey) return res.status(400).json({ error: 'No API key' });
  const sport = req.params.sport;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${cfg.oddsKey}&daysFrom=1`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Odds API proxy (expanded)
app.get('/proxy/odds/*', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.oddsKey) return res.status(400).json({ error: 'No Odds API key configured.' });
  const apiPath = req.params[0];
  const queryStr = new URLSearchParams({ ...req.query, apiKey: cfg.oddsKey }).toString();
  const url = `https://api.the-odds-api.com/v4/${apiPath}?${queryStr}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const remaining = r.headers.get('x-requests-remaining') || '?';
    const used = r.headers.get('x-requests-used') || '?';
    addLog('info', 'OddsAPI', `GET ${apiPath}`, `Status:${r.status} Remaining:${remaining} Used:${used}`);
    res.json(data);
  } catch(e) {
    addLog('error', 'OddsAPI', `GET ${apiPath} FAILED`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Claude API proxy — enhanced with prompt caching + model tiering
// Sonnet 4.6 ($3/$15) = default for analysis
// Haiku 4.5 ($1/$5)  = fast/cheap for simple tasks
// Prompt caching reduces cost 90% on cache hits
app.post('/proxy/claude', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.claudeKey) return res.status(400).json({ error: 'No Claude API key configured.' });

  // Default to Sonnet 4.6 if no model specified
  const body = { ...req.body };
  if (!body.model) body.model = 'claude-sonnet-4-6';

  // Upgrade outdated model strings to latest equivalents
  if (body.model === 'claude-sonnet-4-20250514') body.model = 'claude-sonnet-4-6';

  const model = body.model;

  // Build headers — always enable prompt caching (90% cost reduction on cache hits)
  const betas = ['prompt-caching-2024-07-31'];
  // Add web search beta only if needed
  if (body.tools?.some(t => t.name === 'web_search')) betas.push('web-search-2025-03-05');
  // Add code execution beta for free when using with web search/fetch
  if (body.tools?.some(t => t.name === 'web_fetch')) betas.push('web-search-2025-03-05');

  // Add cache_control to system prompt if it's a plain string
  // This caches the system context across calls — major cost saving
  if (body.system && typeof body.system === 'string' && body.system.length > 100) {
    body.system = [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }];
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': betas.join(',')
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (data.error) {
      addLog('error', 'ClaudeAPI', `FAILED`, `${data.error.type}: ${data.error.message}`);
    } else {
      const inputT  = data.usage?.input_tokens || 0;
      const outputT = data.usage?.output_tokens || 0;
      const cacheR  = data.usage?.cache_read_input_tokens || 0;
      const cacheW  = data.usage?.cache_creation_input_tokens || 0;
      const savings = cacheR > 0 ? ` Cache:${cacheR}t saved` : '';
      addLog('info', 'ClaudeAPI', `OK`, `Model:${model} In:${inputT} Out:${outputT}${savings}`);
    }
    res.json(data);
  } catch(e) {
    addLog('error', 'ClaudeAPI', `FAILED`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Export bets as CSV
app.get('/api/export/bets', (req, res) => {
  const bets = loadBets();
  const rows = [['Date','Bet','Sport','BetType','Book','Odds','Units','EdgeScore','Result','PL']];
  bets.forEach(b => rows.push([b.date, b.bet, b.sport, b.betType||'', b.book||'', b.odds||'', b.units||1, b.score||'', b.result, (b.profit||0).toFixed(2)]));
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vic_bets.csv"');
  res.send(csv);
});

// ─────────────────────────────────────────────
// SCRAPE CACHE helpers
// ─────────────────────────────────────────────
function loadScrapeCache() {
  try { return JSON.parse(fs.readFileSync(SCRAPE_CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveScrapeCache(c) { fs.writeFileSync(SCRAPE_CACHE_FILE, JSON.stringify(c, null, 2)); }
function getCached(key, maxAgeMs = 10 * 60 * 1000) {
  const cache = loadScrapeCache();
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < maxAgeMs) return entry.data;
  return null;
}
function setCache(key, data) {
  const cache = loadScrapeCache();
  cache[key] = { data, ts: Date.now() };
  saveScrapeCache(cache);
}

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache'
};

// ─────────────────────────────────────────────
// WEB SCRAPING ENDPOINTS
// ─────────────────────────────────────────────

// ESPN injury scraper
app.get('/api/scrape/injuries/:sport', async (req, res) => {
  const sportMap = {
    nba: 'https://www.espn.com/nba/injuries',
    nfl: 'https://www.espn.com/nfl/injuries',
    mlb: 'https://www.espn.com/mlb/injuries',
    nhl: 'https://www.espn.com/nhl/injuries',
    epl: 'https://www.espn.com/soccer/injuries/_/league/eng.1',
    mls: 'https://www.espn.com/soccer/injuries/_/league/usa.1'
  };
  const sport = req.params.sport.toLowerCase();
  const url = sportMap[sport];
  if (!url) return res.status(400).json({ error: 'Unknown sport' });

  const cacheKey = `injuries_${sport}`;
  const cached = getCached(cacheKey, 8 * 60 * 1000);
  if (cached) { addLog('info', 'Scraper', `Injuries ${sport.toUpperCase()} (cached)`, ''); return res.json(cached); }

  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });
    // 404 = ESPN page moved or sport off-season — return empty gracefully
    if (r.status === 404) {
      const result = { sport, url, count: 0, injuries: [], text: 'No injury data available (ESPN 404 — may be off-season).', scrapedAt: new Date().toISOString() };
      addLog('info', 'Scraper', `Injuries ${sport.toUpperCase()}`, 'ESPN 404 — off-season or URL changed');
      return res.json(result);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);
    const injuries = [];

    // Selector set 1: standard ESPN ResponsiveTable
    $('div.ResponsiveTable').each((_, table) => {
      const teamName = $(table).find('div.Table__Title, .Table__Title').text().trim();
      $(table).find('tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const player = $(cells[0]).text().trim();
          const pos    = $(cells[1]).text().trim();
          const status = $(cells[2]).text().trim();
          const comment= cells.length > 3 ? $(cells[3]).text().trim() : '';
          if (player && player.length > 2) injuries.push({ team: teamName, player, pos, status, comment, source: 'ESPN' });
        }
      });
    });

    // Selector set 2: alternate ESPN layout
    if (!injuries.length) {
      $('[class*="injury"], [class*="Injury"]').each((_, el) => {
        const player = $(el).find('[class*="name"], [class*="Name"]').first().text().trim();
        const status = $(el).find('[class*="status"], [class*="Status"]').first().text().trim();
        const team   = $(el).find('[class*="team"], [class*="Team"]').first().text().trim();
        if (player) injuries.push({ player, status, team, source: 'ESPN' });
      });
    }

    // Selector set 3: any table with injury keywords
    if (!injuries.length) {
      $('table').each((_, tbl) => {
        $(tbl).find('tr').each((_, row) => {
          const text = $(row).text().replace(/\s+/g, ' ').trim();
          if (text.length > 5 && /Out|Questionable|Probable|DTD|IR|Day-to-Day/i.test(text)) {
            injuries.push({ raw: text, source: 'ESPN' });
          }
        });
      });
    }

    const textSummary = injuries.map(i => i.raw || [i.player, i.team ? `(${i.team})` : '', `— ${i.status}`, i.comment || i.injury || ''].filter(Boolean).join(' ')).join('\n');
    const result = { sport, url, count: injuries.length, injuries, text: textSummary || 'No structured injuries found.', scrapedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    addLog('info', 'Scraper', `Injuries ${sport.toUpperCase()}`, `${injuries.length} players found`);
    res.json(result);
  } catch(e) {
    addLog('error', 'Scraper', `Injuries ${sport.toUpperCase()} FAILED`, e.message);
    // Return empty rather than 500 so dashboard doesn't break
    res.json({ sport, count: 0, injuries: [], text: `Scrape failed: ${e.message}`, error: e.message, scrapedAt: new Date().toISOString() });
  }
});

// Rotowire injury scraper (more detailed)
app.get('/api/scrape/rotowire/:sport', async (req, res) => {
  // Rotowire current URL structure (verified March 2026)
  const sportMap = {
    nba: 'https://www.rotowire.com/basketball/nba-injuries.php',
    nfl: 'https://www.rotowire.com/football/nfl-injuries.php',
    mlb: 'https://www.rotowire.com/baseball/injury-report.php',
    nhl: 'https://www.rotowire.com/hockey/nhl-injuries.php'
  };
  const sport = req.params.sport.toLowerCase();

  // EPL/MLS not on Rotowire — return empty gracefully, not 400
  if (!sportMap[sport]) {
    addLog('info', 'Scraper', `Rotowire ${sport.toUpperCase()}`, 'Not available on Rotowire');
    return res.json({ sport, count: 0, injuries: [], text: `Rotowire does not cover ${sport.toUpperCase()}.`, scrapedAt: new Date().toISOString() });
  }

  const url = sportMap[sport];
  const cacheKey = `rotowire_${sport}`;
  const cached = getCached(cacheKey, 10 * 60 * 1000);
  if (cached) { addLog('info', 'Scraper', `Rotowire ${sport.toUpperCase()} (cached)`, ''); return res.json(cached); }

  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });

    // 404 — Rotowire moved or off-season, return empty
    if (r.status === 404) {
      addLog('info', 'Scraper', `Rotowire ${sport.toUpperCase()}`, '404 — off-season or URL changed');
      return res.json({ sport, count: 0, injuries: [], text: 'Rotowire returned 404 — sport may be off-season.', scrapedAt: new Date().toISOString() });
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const html = await r.text();
    const $ = cheerio.load(html);
    const injuries = [];

    // Selector set 1: current Rotowire structure (2025-26)
    $('ul.list-injury li, .injury-list li, [class*="injury-item"], [class*="player-injury"]').each((_, el) => {
      const player = $(el).find('[class*="name"], [class*="player"]').first().text().trim();
      const team   = $(el).find('[class*="team"]').first().text().trim();
      const status = $(el).find('[class*="status"]').first().text().trim();
      const injury = $(el).find('[class*="injury"], [class*="detail"]').first().text().trim();
      if (player) injuries.push({ player, team, status, injury, source: 'Rotowire' });
    });

    // Selector set 2: old table format
    if (!injuries.length) {
      $('tr.injured-players, tr[class*="injury"]').each((_, row) => {
        const player = $(row).find('[class*="name"]').text().trim();
        const team   = $(row).find('[class*="team"]').text().trim();
        const pos    = $(row).find('[class*="pos"]').text().trim();
        const status = $(row).find('[class*="status"]').text().trim();
        const injury = $(row).find('[class*="injury"]').text().trim();
        if (player) injuries.push({ player, team, pos, status, injury, source: 'Rotowire' });
      });
    }

    // Selector set 3: generic table rows with status keywords
    if (!injuries.length) {
      $('table tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        const text  = $(row).text().replace(/\s+/g, ' ').trim();
        if (cells.length >= 3 && /Out|Questionable|IR|DTD|Probable|Day-to-Day/i.test(text)) {
          injuries.push({ raw: text, source: 'Rotowire' });
        }
      });
    }

    // Selector set 4: any news/update divs with injury info
    if (!injuries.length) {
      $('[class*="news-update"], [class*="player-news"], .news-item').each((_, el) => {
        const player = $(el).find('[class*="player-name"], h3, h4, [class*="name"]').first().text().trim();
        const detail = $(el).find('[class*="detail"], [class*="body"], p').first().text().trim();
        if (player && detail && /Out|Questionable|IR|DTD|injured|fracture|surgery|sprain/i.test(detail)) {
          injuries.push({ player, injury: detail.slice(0, 200), source: 'Rotowire' });
        }
      });
    }

    const textSummary = injuries.map(i => i.raw || [i.player, i.team ? `(${i.team})` : '', i.status ? `— ${i.status}` : '', i.injury || ''].filter(Boolean).join(' ')).join('\n');
    const result = { sport, url, count: injuries.length, injuries, text: textSummary || 'No structured injuries found on Rotowire.', scrapedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    addLog('info', 'Scraper', `Rotowire ${sport.toUpperCase()}`, `${injuries.length} players`);
    res.json(result);
  } catch(e) {
    addLog('error', 'Scraper', `Rotowire ${sport.toUpperCase()} FAILED`, e.message);
    // Return empty not 500 — don't cascade errors to dashboard
    res.json({ sport, count: 0, injuries: [], text: `Rotowire scrape failed: ${e.message}`, error: e.message, scrapedAt: new Date().toISOString() });
  }
});

// CBS Sports news scraper — recent player/team news
app.get('/api/scrape/news/:sport', async (req, res) => {
  const sportMap = {
    nba: 'https://www.cbssports.com/nba/injuries/',
    nfl: 'https://www.cbssports.com/nfl/injuries/',
    mlb: 'https://www.cbssports.com/mlb/injuries/',
    nhl: 'https://www.cbssports.com/nhl/injuries/'
  };
  const sport = req.params.sport.toLowerCase();
  const url = sportMap[sport] || `https://www.cbssports.com/${sport}/injuries/`;

  const cacheKey = `news_${sport}`;
  const cached = getCached(cacheKey, 12 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);
    const items = [];

    $('table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const player = $(cells[0]).text().trim();
        const status = $(cells[1]).text().trim();
        const comment = $(cells[2] || cells[1]).text().trim();
        if (player && status) items.push({ player, status, comment });
      }
    });

    const result = { sport, count: items.length, items, scrapedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    addLog('info', 'Scraper', `CBS ${sport.toUpperCase()}`, `${items.length} items`);
    res.json(result);
  } catch(e) {
    addLog('error', 'Scraper', `CBS ${sport.toUpperCase()} FAILED`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Generic URL scraper — fetch any URL and return clean text
app.post('/api/scrape/url', async (req, res) => {
  const { url, selector } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer
    $('script,style,nav,footer,header,iframe,noscript,.ad,.ads,.advertisement').remove();

    let text = '';
    if (selector) {
      text = $(selector).text();
    } else {
      // Extract main content
      text = $('main, article, .content, #content, .main-content, body').first().text();
    }

    // Clean up whitespace
    text = text.replace(/\s{3,}/g, '\n\n').replace(/\t/g, ' ').trim().slice(0, 8000);
    addLog('info', 'Scraper', `URL scrape`, url.substring(0, 60));
    res.json({ url, text, length: text.length, scrapedAt: new Date().toISOString() });
  } catch(e) {
    addLog('error', 'Scraper', `URL scrape FAILED`, `${url} — ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// API-SPORTS.IO PROXY (free tier: 100 req/day)
// Covers NBA, NFL, MLB, NHL, EPL, MLS
// ─────────────────────────────────────────────
async function apiSports(endpoint, params = {}) {
  const cfg = loadConfig();
  if (!cfg.sportsApiKey) throw new Error('No API-Sports key configured');
  const qs = new URLSearchParams(params).toString();
  const url = `https://v1.american-football.api-sports.io/${endpoint}${qs ? '?' + qs : ''}`;
  // Determine correct base URL per sport
  const r = await fetch(url, {
    headers: { 'x-rapidapi-key': cfg.sportsApiKey, 'x-rapidapi-host': 'v1.american-football.api-sports.io' }
  });
  return r.json();
}

// Unified sports data endpoint — routes to correct API-Sports base
app.get('/api/sports-data/:league/:endpoint', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.sportsApiKey) return res.status(400).json({ error: 'No API-Sports key. Add it in Settings.' });

  const leagueHostMap = {
    nba:  { host: 'v2.nba.api-sports.io',             base: 'https://v2.nba.api-sports.io' },
    nfl:  { host: 'v1.american-football.api-sports.io', base: 'https://v1.american-football.api-sports.io' },
    mlb:  { host: 'v1.baseball.api-sports.io',          base: 'https://v1.baseball.api-sports.io' },
    nhl:  { host: 'v1.hockey.api-sports.io',             base: 'https://v1.hockey.api-sports.io' },
    epl:  { host: 'v3.football.api-sports.io',           base: 'https://v3.football.api-sports.io' },
    mls:  { host: 'v3.football.api-sports.io',           base: 'https://v3.football.api-sports.io' },
  };

  const league = req.params.league.toLowerCase();
  const endpoint = req.params.endpoint;
  const info = leagueHostMap[league];
  if (!info) return res.status(400).json({ error: 'Unknown league' });

  const qs = new URLSearchParams(req.query).toString();
  const url = `${info.base}/${endpoint}${qs ? '?' + qs : ''}`;
  const cacheKey = `sportsapi_${league}_${endpoint}_${qs}`;
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const r = await fetch(url, {
      headers: { 'x-rapidapi-key': cfg.sportsApiKey, 'x-rapidapi-host': info.host }
    });
    const data = await r.json();
    const remaining = r.headers.get('x-ratelimit-requests-remaining') || '?';
    addLog('info', 'SportsAPI', `${league.toUpperCase()} ${endpoint}`, `Remaining: ${remaining}`);
    setCache(cacheKey, data);
    res.json(data);
  } catch(e) {
    addLog('error', 'SportsAPI', `${league.toUpperCase()} ${endpoint} FAILED`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Convenience: get today's injuries from best available source
app.get('/api/live-injuries/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const results = { sport, sources: [], combined: [], scrapedAt: new Date().toISOString() };

  // Try ESPN
  try {
    const espnR = await fetch(`http://localhost:${PORT}/api/scrape/injuries/${sport}`);
    if (espnR.ok) {
      const espn = await espnR.json();
      if (espn.injuries?.length) {
        results.sources.push('ESPN');
        results.espn = espn.injuries;
        results.combined.push(...espn.injuries.map(i => ({ ...i, source: 'ESPN' })));
      }
    }
  } catch(e) {}

  // Try Rotowire — only for NBA/NFL/MLB/NHL (not EPL/MLS)
  const rotowireSports = ['nba','nfl','mlb','nhl'];
  if (rotowireSports.includes(sport)) {
    try {
      const rwR = await fetch(`http://localhost:${PORT}/api/scrape/rotowire/${sport}`);
      if (rwR.ok) {
        const rw = await rwR.json();
        if (rw.injuries?.length) {
          results.sources.push('Rotowire');
          results.rotowire = rw.injuries;
          results.combined.push(...rw.injuries.map(i => ({ ...i, source: 'Rotowire' })));
        }
      }
    } catch(e) {}
  }

  // Try CBS Sports as additional fallback
  try {
    const cbsMap = { nba:'nba', nfl:'nfl', mlb:'mlb', nhl:'nhl' };
    const cbsSlug = cbsMap[sport];
    if (cbsSlug) {
      const cbsR = await fetch(`http://localhost:${PORT}/api/scrape/news/${sport}`);
      if (cbsR.ok) {
        const cbs = await cbsR.json();
        if (cbs.injuries?.length && !results.combined.length) {
          results.sources.push('CBS Sports');
          results.combined.push(...cbs.injuries.map(i => ({ ...i, source: 'CBS Sports' })));
        }
      }
    }
  } catch(e) {}

  // Format combined as plain text for Claude
  results.count = results.combined.length;
  results.text = results.combined.length
    ? results.combined.map(i =>
        i.raw ? i.raw :
        `${i.player || ''}${i.team ? ' ('+i.team+')' : ''} — ${i.status || ''} — ${i.injury || i.comment || ''} [${i.source}]`
      ).filter(Boolean).join('\n')
    : `No injury data available for ${sport.toUpperCase()} right now.`;

  res.json(results);
});

// Today's games context — scrapes ESPN scoreboard for context
app.get('/api/live-context/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const espnMap = {
    nba: 'https://www.espn.com/nba/scoreboard',
    nfl: 'https://www.espn.com/nfl/scoreboard',
    mlb: 'https://www.espn.com/mlb/scoreboard',
    nhl: 'https://www.espn.com/nhl/scoreboard',
    epl: 'https://www.espn.com/soccer/scoreboard/_/league/eng.1',
    mls: 'https://www.espn.com/soccer/scoreboard/_/league/usa.1'
  };
  const url = espnMap[sport];
  if (!url) return res.status(400).json({ error: 'Unknown sport' });

  const cacheKey = `context_${sport}`;
  const cached = getCached(cacheKey, 3 * 60 * 1000); // 3 min
  if (cached) return res.json(cached);

  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });
    const html = await r.text();
    const $ = cheerio.load(html);
    $('script,style,nav,footer,header,iframe').remove();
    const text = $('body').text().replace(/\s{3,}/g, '\n').trim().slice(0, 5000);
    const result = { sport, url, text, scrapedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Scrape cache management
app.delete('/api/scrape/cache', (req, res) => {
  saveScrapeCache({});
  res.json({ ok: true });
});
app.get('/api/scrape/cache/status', (req, res) => {
  const cache = loadScrapeCache();
  const keys = Object.keys(cache);
  const status = keys.map(k => ({
    key: k,
    age: Math.round((Date.now() - cache[k].ts) / 1000 / 60) + ' min ago',
    size: JSON.stringify(cache[k].data).length
  }));
  res.json({ count: keys.length, entries: status });
});

// GET /api/sao/test — quick connectivity check
app.get('/api/sao/test', async (req, res) => {
  try {
    const r = await fetch('https://www.scoresandodds.com/nba', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) {
      const text = await r.text();
      const hasData = text.includes('consensus') || text.includes('spread') || text.includes('moneyline');
      return res.json({ ok: true, status: r.status, hasData, message: 'SAO reachable' });
    }
    return res.json({ ok: false, status: r.status, message: `SAO returned ${r.status}` });
  } catch(e) {
    return res.json({ ok: false, message: e.message });
  }
});


app.listen(PORT, () => {
  // Write startup log so logs.json is created immediately
  addLog('info', 'System', `VIC server started on port ${PORT}`, `v3 ready`);
  console.log('\n==========================================');
  console.log('   VIC -- Vegas Intelligence Console     ');
  console.log('   Running at http://localhost:' + PORT + '     ');
  console.log('==========================================\n');
  console.log('Open your browser to: http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.\n');
});

// ─────────────────────────────────────────────
// ACTION NETWORK — Public Betting % Scraper
// ActionNetwork is JS-rendered — we try multiple
// sources and filter out CSS/JS garbage.
// Falls back cleanly so UI can offer manual paste.
// ─────────────────────────────────────────────
app.get('/api/public-betting/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const cacheKey = `public_${sport}`;
  const cached = getCached(cacheKey, 6 * 60 * 1000);
  if (cached) { addLog('info','PublicBetting',`${sport.toUpperCase()} (cached)`,''); return res.json(cached); }

  const sportSlugMap = {
    nba: { an: 'nba', covers: 'basketball/nba' },
    nfl: { an: 'nfl', covers: 'football/nfl' },
    mlb: { an: 'mlb', covers: 'baseball/mlb' },
    nhl: { an: 'nhl', covers: 'hockey/nhl' },
  };
  const slugs = sportSlugMap[sport];
  let games = [];

  // Helper: is a text node CSS/JS garbage?
  const isGarbage = (text) => {
    if (!text || text.length < 3) return true;
    // CSS/JS patterns
    if (/{.*:.*}/.test(text)) return true;          // CSS rules
    if (/function\s*\(/.test(text)) return true;    // JS functions
    if (/webkit|flexbox|display:|font-size:|margin:|padding:/.test(text.toLowerCase())) return true;
    if (text.length > 500) return true;             // Too long to be useful data
    if (/^[.#\[>~+*]/.test(text.trim())) return true; // CSS selectors
    return false;
  };

  // Try Covers.com — simpler HTML structure
  if (slugs) {
    const coversUrl = `https://www.covers.com/sport/${slugs.covers}/matchups`;
    try {
      const r = await fetch(coversUrl, { headers: SCRAPE_HEADERS });
      if (r.ok) {
        const html = await r.text();
        const $ = cheerio.load(html);
        // Remove all script/style tags first
        $('script,style,noscript,link').remove();

        // Look for matchup rows with percentages
        $('[class*="matchup"], [class*="game"], [class*="picks"], article').each((_, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.includes('%') && !isGarbage(text) && text.length < 300) {
            const pctMatches = text.match(/\d{1,3}%/g);
            if (pctMatches && pctMatches.length >= 1) {
              games.push({ raw: text.slice(0, 200), source: 'Covers' });
            }
          }
        });

        // Fallback: any td/span with just a % value
        if (!games.length) {
          $('td, [class*="percent"], [class*="public"]').each((_, el) => {
            const text = $(el).text().trim();
            if (/^\d{1,3}%$/.test(text) || /\d{1,3}%.*\d{1,3}%/.test(text)) {
              if (!isGarbage(text)) games.push({ raw: text, source: 'Covers' });
            }
          });
        }
      }
    } catch(e) {}
  }

  // Try ActionNetwork — JS rendered but sometimes returns partial data
  if (games.length < 3 && slugs) {
    const anUrl = `https://www.actionnetwork.com/${slugs.an}/public-betting-information`;
    try {
      const r = await fetch(anUrl, { headers: { ...SCRAPE_HEADERS, 'Accept': 'text/html,application/xhtml+xml' } });
      if (r.ok) {
        const html = await r.text();
        const $ = cheerio.load(html);
        $('script,style,noscript,link,head').remove();

        // Only look at specific data containers, not body-level CSS
        $('table tr, [class*="game-row"], [class*="matchup-row"], [class*="public-bet"]').each((_, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.includes('%') && !isGarbage(text) && text.length < 400) {
            games.push({ raw: text.slice(0, 250), source: 'ActionNetwork' });
          }
        });
      }
    } catch(e) {}
  }

  // Deduplicate and filter
  const seen = new Set();
  games = games.filter(g => {
    if (isGarbage(g.raw)) return false;
    if (seen.has(g.raw)) return false;
    seen.add(g.raw);
    return true;
  }).slice(0, 30);

  const result = {
    sport, count: games.length, games,
    text: games.map(g => g.raw).join('\n'),
    jsBlocked: games.length === 0, // flag for UI to show manual paste
    scrapedAt: new Date().toISOString()
  };

  if (games.length) setCache(cacheKey, result);
  addLog(games.length ? 'info' : 'warn', 'PublicBetting', `${sport.toUpperCase()}`,
    games.length ? `${games.length} entries scraped` : 'JS-blocked — manual paste needed');
  res.json(result);
});

// ─────────────────────────────────────────────
// ESPN PLAYER STATS Scraper
// ─────────────────────────────────────────────
app.get('/api/player-stats', async (req, res) => {
  const { name, sport } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  const cacheKey = `pstats_${(sport||'nba')}_${name.toLowerCase().replace(/\s+/g,'_')}`;
  const cached = getCached(cacheKey, 20 * 60 * 1000);
  if (cached) return res.json(cached);

  const sportMap = { nba:'nba', nfl:'nfl', mlb:'mlb', nhl:'nhl' };
  const espnSport = sportMap[(sport||'nba').toLowerCase()] || 'nba';

  try {
    // Step 1: search ESPN
    const searchUrl = `https://www.espn.com/search/_/q/${encodeURIComponent(name)}`;
    const sR = await fetch(searchUrl, { headers: SCRAPE_HEADERS });
    const sHtml = await sR.text();
    const $s = cheerio.load(sHtml);
    let playerUrl = '';
    $s(`a[href*="/${espnSport}/player/"]`).each((_, el) => {
      if (!playerUrl) playerUrl = $s(el).attr('href') || '';
    });
    if (!playerUrl) throw new Error('Player not found on ESPN');
    if (!playerUrl.startsWith('http')) playerUrl = 'https://www.espn.com' + playerUrl;

    // Step 2: fetch player page
    const pR = await fetch(playerUrl, { headers: SCRAPE_HEADERS });
    const pHtml = await pR.text();
    const $ = cheerio.load(pHtml);

    const playerName = $('h1').first().text().trim() || name;
    const team = $('[class*="TeamName"], [class*="team-name"]').first().text().trim() || '';
    const pos  = $('[class*="Position"], [class*="position"]').first().text().trim() || '';

    let statText = `PLAYER: ${playerName} | TEAM: ${team} | POSITION: ${pos}\n\n`;
    let tableCount = 0;
    $('table').each((i, tbl) => {
      const headers = [];
      $(tbl).find('thead th').each((_, th) => headers.push($(th).text().trim()));
      const rows = [];
      $(tbl).find('tbody tr').slice(0,5).each((_, row) => {
        const cells = [];
        $(row).find('td').each((_, td) => cells.push($(td).text().trim()));
        if (cells.length) rows.push(cells.join(' | '));
      });
      if (headers.length && rows.length) {
        const label = i === 0 ? 'SEASON STATS' : i === 1 ? 'GAME LOG' : `STATS ${i}`;
        statText += `${label}:\n${headers.join(' | ')}\n${rows.join('\n')}\n\n`;
        tableCount++;
      }
    });

    // Also grab bio/info
    const bio = $('[class*="Bio"], [class*="bio"], [class*="PlayerStats"]').first().text().replace(/\s+/g,' ').trim().slice(0,300);
    if (bio) statText += `BIO: ${bio}\n`;

    const result = { playerName, team, pos, url: playerUrl, statText, tableCount, scrapedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    addLog('info','PlayerStats',`${playerName}`,`${tableCount} tables`);
    res.json(result);
  } catch(e) {
    addLog('error','PlayerStats',`FAILED: ${name}`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Full context endpoint — injuries + public % combined
app.get('/api/full-context/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const shortMap = { basketball_nba:'nba', americanfootball_nfl:'nfl', baseball_mlb:'mlb', icehockey_nhl:'nhl', soccer_epl:'epl', soccer_usa_mls:'mls' };
  const short = shortMap[sport] || sport;
  let fullText = '';

  try {
    const injR = await fetch(`http://localhost:${PORT}/api/live-injuries/${short}`);
    if (injR.ok) { const d = await injR.json(); if (d.text) fullText += `INJURIES (live):\n${d.text.slice(0,1500)}\n\n`; }
  } catch(e) {}

  try {
    const pubR = await fetch(`http://localhost:${PORT}/api/public-betting/${short}`);
    if (pubR.ok) { const d = await pubR.json(); if (d.text) fullText += `PUBLIC BETTING % (live):\n${d.text.slice(0,1000)}\n\n`; }
  } catch(e) {}

  res.json({ sport: short, fullText, scrapedAt: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// NEWS FEED — ESPN + Rotowire + CBS Sports
// ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════
// NEWS & INTELLIGENCE — ESPN Public JSON API + SAO
// ESPN API: no key needed, real JSON, always works
// SAO: server-side rendered news section at bottom of pages
// ═══════════════════════════════════════════════════════

// ESPN API sport+league mapping
const ESPN_API_MAP = {
  nba:    { sport:'basketball',    league:'nba',                     short:'NBA'   },
  nfl:    { sport:'football',      league:'nfl',                     short:'NFL'   },
  mlb:    { sport:'baseball',      league:'mlb',                     short:'MLB'   },
  nhl:    { sport:'hockey',        league:'nhl',                     short:'NHL'   },
  ncaab:  { sport:'basketball',    league:'mens-college-basketball',  short:'NCAAB' },
  ncaaf:  { sport:'football',      league:'college-football',         short:'NCAAF' },
  ncaab2: { sport:'baseball',      league:'college-baseball',         short:'NCAAB2'},
  epl:    { sport:'soccer',        league:'eng.1',                   short:'EPL'   },
  mls:    { sport:'soccer',        league:'usa.1',                   short:'MLS'   },
  tennis: { sport:'tennis',        league:'atp',                     short:'ATP'   },
};

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports';

async function espnFetch(url, cacheMins = 5) {
  const cacheKey = `espn_${url.replace(/https?:\/\/[^/]+/,'').replace(/[^a-z0-9]/gi,'_').slice(0,80)}`;
  const cached = getCached(cacheKey, cacheMins * 60 * 1000);
  if (cached) return cached;
  const ctrl = new AbortController();
  const tmt  = setTimeout(() => ctrl.abort(), 5000); // 5s timeout — never block forever
  try {
    const r = await fetch(url, {
      headers: { 'Accept':'application/json', 'User-Agent':'Mozilla/5.0' },
      signal: ctrl.signal
    });
    clearTimeout(tmt);
    if (!r.ok) throw new Error(`ESPN API HTTP ${r.status}: ${url}`);
    const data = await r.json();
    setCache(cacheKey, data);
    return data;
  } catch(e) {
    clearTimeout(tmt);
    throw e;
  }
}

// ── ESPN NEWS (JSON API — always works, no scraping) ──
// GET /api/news/:sport
app.get('/api/news/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const em = ESPN_API_MAP[sport];
  if (!em) return res.json({ sport, count:0, items:[], error:`Sport ${sport} not supported` });

  const cacheKey = `news_${sport}`;
  const cached   = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return res.json(cached);

  const items = [];

  // ESPN JSON API — clean structured news
  try {
    const url = `${ESPN_BASE}/${em.sport}/${em.league}/news?limit=20`;
    const data = await espnFetch(url, 5);
    (data.articles || []).forEach(a => {
      items.push({
        headline:    a.headline || a.title || '',
        desc:        a.description || a.byline || '',
        link:        a.links?.web?.href || a.links?.mobile?.href || '',
        time:        a.published ? new Date(a.published).toLocaleString() : '',
        published:   a.published || '',
        images:      a.images?.[0]?.url || '',
        author:      a.byline || '',
        categories:  (a.categories||[]).map(c=>c.description||c.type).filter(Boolean).slice(0,3),
        source:      'ESPN',
        sport
      });
    });
    addLog('info','NewsAPI',`ESPN ${em.short}`,`${items.length} articles`);
  } catch(e) {
    addLog('warn','NewsAPI',`ESPN ${em.short} failed`,e.message);
  }

  // SAO news section — with 3s timeout so it never blocks dashboard load
  try {
    const saoSport = { nba:'nba', nfl:'nfl', mlb:'mlb', nhl:'nhl', ncaab:'ncaab', ncaaf:'ncaaf', ncaab2:'ncaab', tennis:'tennis' }[sport];
    if (saoSport) {
      const ctrl = new AbortController();
      const tmt  = setTimeout(() => ctrl.abort(), 3000); // 3s max
      const saoUrl = `https://www.scoresandodds.com/${saoSport}`;
      const r = await fetch(saoUrl, { headers: SCRAPE_HEADERS, signal: ctrl.signal });
      clearTimeout(tmt);
      if (r.ok) {
        const html = await r.text();
        const $ = cheerio.load(html);
        $('a[href*="actionnetwork.com"]').each((_, el) => {
          const headline = $(el).text().trim();
          const link     = $(el).attr('href') || '';
          const parent   = $(el).closest('div,article,li');
          const time     = parent.find('time,[class*="date"]').text().trim();
          if (headline && headline.length > 20 && !items.find(i=>i.headline===headline)) {
            items.push({ headline, desc:'', link, time, published:'', source:'SAO/ActionNetwork', sport });
          }
        });
      }
    }
  } catch(e) {}

  const result = { sport, count:items.length, items:items.slice(0,25), scrapedAt:new Date().toISOString() };
  if (items.length) setCache(cacheKey, result);
  res.json(result);
});

// ── ESPN SCOREBOARD (live scores + game status) ───────
// GET /api/espn/scores/:sport
app.get('/api/espn/scores/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const em    = ESPN_API_MAP[sport];
  if (!em) return res.json({ sport, games:[], error:'Sport not supported' });
  try {
    const url  = `${ESPN_BASE}/${em.sport}/${em.league}/scoreboard`;
    const data = await espnFetch(url, 1);
    const games = (data.events||[]).map(e => {
      const comp  = e.competitions?.[0];
      const away  = comp?.competitors?.find(t=>t.homeAway==='away');
      const home  = comp?.competitors?.find(t=>t.homeAway==='home');
      const odds  = comp?.odds?.[0];
      return {
        id:         e.id,
        name:       e.name,
        shortName:  e.shortName,
        date:       e.date,
        status:     e.status?.type?.description || '',
        statusShort:e.status?.type?.shortDetail || '',
        clock:      e.status?.displayClock || '',
        period:     e.status?.period || 0,
        isLive:     e.status?.type?.state === 'in',
        isFinal:    e.status?.type?.completed || false,
        // Normalized fields (matches what all pages expect)
        away_team:  away?.team?.displayName || '',
        home_team:  home?.team?.displayName || '',
        completed:  e.status?.type?.completed || false,
        commence_time: e.date,
        date:       e.date,
        // Score array in legacy format pages check
        scores: (away?.score !== undefined && home?.score !== undefined) ? [
          { name: away?.team?.displayName || '', score: away?.score || '0' },
          { name: home?.team?.displayName || '', score: home?.score || '0' }
        ] : null,
        // Additional useful fields
        awayTeam:   away?.team?.displayName || '',
        homeTeam:   home?.team?.displayName || '',
        awayScore:  away?.score || '0',
        homeScore:  home?.score || '0',
        awayAbbr:   away?.team?.abbreviation || '',
        homeAbbr:   home?.team?.abbreviation || '',
        awayRecord: away?.records?.[0]?.summary || '',
        homeRecord: home?.records?.[0]?.summary || '',
        awayLogo:   away?.team?.logo || '',
        homeLogo:   home?.team?.logo || '',
        isLive:     e.status?.type?.state === 'in',
        isFinal:    e.status?.type?.completed || false,
        statusText: e.status?.type?.description || '',
        clock:      e.status?.displayClock || '',
        period:     e.status?.period || 0,
        spread:     odds?.details || '',
        overUnder:  odds?.overUnder || '',
        venue:      comp?.venue?.fullName || '',
        source:     'ESPN'
      };
    });
    res.json({ sport, count:games.length, games, scrapedAt:new Date().toISOString() });
  } catch(e) {
    addLog('error','ESPN API',`Scores ${sport.toUpperCase()} failed`,e.message);
    res.json({ sport, games:[], error:e.message });
  }
});

// ── ESPN INJURIES (JSON API) ───────────────────────────
// GET /api/espn/injuries/:sport
// ESPN injuries are per-team at sports.core.api.espn.com/v2/sports/{s}/leagues/{l}/teams/{id}/injuries
// We fetch the teams list first, then loop each team's injuries endpoint
app.get('/api/espn/injuries/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const em    = ESPN_API_MAP[sport];
  if (!em) return res.json({ sport, count:0, injuries:[], error:`Sport ${sport} not in ESPN map` });

  // Map sport to ESPN core API league string
  const leagueMap = {
    nba:'nba', nfl:'nfl', mlb:'mlb', nhl:'nhl',
    ncaab:'mens-college-basketball', ncaaf:'college-football',
    epl:'eng.1', mls:'usa.1'
  };
  const league = leagueMap[sport];
  if (!league) return res.json({ sport, count:0, injuries:[], error:'League not mapped' });

  const cacheKey = `espn_inj_${sport}`;
  const cached   = getCached(cacheKey, 8 * 60 * 1000);
  if (cached) { addLog('info','ESPN API',`Injuries ${em.short} (cache)`,`${cached.count}`); return res.json(cached); }

  const injuries = [];

  try {
    // Step 1: get teams list
    const teamsUrl  = `${ESPN_CORE}/${em.sport}/leagues/${league}/teams?limit=50`;
    const teamsData = await espnFetch(teamsUrl, 60);
    const teams     = teamsData.items || [];

    // Step 2: for each team, fetch injuries (parallel, max 8 at once to avoid rate limit)
    const chunks = [];
    for (let i = 0; i < teams.length; i += 8) chunks.push(teams.slice(i, i+8));

    for (const chunk of chunks) {
      await Promise.allSettled(chunk.map(async (teamRef) => {
        try {
          // teamRef is { $ref: 'https://sports.core.api.espn.com/...' }
          const teamUrl  = teamRef['$ref'];
          const teamId   = teamUrl?.match(/teams\/([^?/]+)/)?.[1];
          const teamData = await espnFetch(teamUrl, 60);
          const teamName = teamData.displayName || teamData.name || '';

          if (!teamId) return;

          const injUrl  = `${ESPN_CORE}/${em.sport}/leagues/${league}/teams/${teamId}/injuries?limit=50`;
          const injData = await espnFetch(injUrl, 8);

          (injData.items || []).forEach(injRef => {
            // Each item is a $ref — we parse inline if fields available or use ref
            const inj = injRef;
            const player   = inj.athlete?.displayName || inj.athlete?.shortName || '';
            const status   = inj.status || inj.type || '';
            const details  = inj.details;
            const injType  = details?.type || details?.fantasyStatus?.description || '';
            const comment  = details?.shortComment || inj.shortComment || details?.returnDate || '';
            const pos      = inj.athlete?.position?.abbreviation || '';
            const ret      = details?.returnDate ? ` · Return: ${details.returnDate}` : '';

            if (player && status) {
              injuries.push({
                player, team: teamName, position: pos,
                status, injury: injType,
                comment: comment + ret,
                source: 'ESPN',
                sport
              });
            }
          });
        } catch(e) { /* skip individual team errors */ }
      }));
    }

    const text = injuries.map(i =>
      `${i.player} (${i.team}${i.position?' - '+i.position:''}) — ${i.status}${i.injury?' — '+i.injury:''}${i.comment?' — '+i.comment:''}`
    ).join('\n');

    const result = { sport, count:injuries.length, injuries, text:text||'No injuries found', source:'ESPN', scrapedAt:new Date().toISOString() };
    if (injuries.length) setCache(cacheKey, result);
    addLog('info','ESPN API',`Injuries ${em.short}`,`${injuries.length} players from ${teams.length} teams`);
    res.json(result);

  } catch(e) {
    addLog('error','ESPN API',`Injuries ${em.short} failed`,e.message);
    res.json({ sport, count:0, injuries:[], text:`ESPN injuries failed: ${e.message}`, error:e.message });
  }
});

// ── ESPN STANDINGS ─────────────────────────────────────
// GET /api/espn/standings/:sport
app.get('/api/espn/standings/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const em    = ESPN_API_MAP[sport];
  if (!em) return res.json({ sport, standings:[], error:'Sport not supported' });
  try {
    const url  = `${ESPN_BASE}/${em.sport}/${em.league}/standings`;
    const data = await espnFetch(url, 30);
    const groups = (data.children || [data]).map(g => ({
      name:  g.name || g.abbreviation || 'Standings',
      teams: (g.standings?.entries || []).map(e => ({
        team:  e.team?.displayName || '',
        abbr:  e.team?.abbreviation || '',
        logo:  e.team?.logos?.[0]?.href || '',
        stats: Object.fromEntries((e.stats||[]).map(s=>[s.abbreviation||s.name, s.displayValue]))
      }))
    })).filter(g=>g.teams.length);
    addLog('info','ESPN API',`Standings ${em.short}`,`${groups.length} groups`);
    res.json({ sport, groups, scrapedAt:new Date().toISOString() });
  } catch(e) {
    addLog('error','ESPN API',`Standings ${em.short} failed`,e.message);
    res.json({ sport, groups:[], error:e.message });
  }
});

// ── ESPN TEAM LEADERS / TOP PERFORMERS ────────────────
// GET /api/espn/leaders/:sport
app.get('/api/espn/leaders/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const em    = ESPN_API_MAP[sport];
  if (!em) return res.json({ sport, leaders:[], error:'Sport not supported' });
  try {
    const url  = `${ESPN_BASE}/${em.sport}/${em.league}/leaders`;
    const data = await espnFetch(url, 30);
    const leaders = (data.categories||[]).map(cat => ({
      category:    cat.displayName || cat.name,
      abbreviation:cat.abbreviation,
      leaders:     (cat.leaders||[]).slice(0,5).map(l => ({
        rank:    l.rank,
        player:  l.athlete?.displayName || '',
        team:    l.team?.displayName || l.team?.abbreviation || '',
        value:   l.displayValue || l.value,
        logo:    l.athlete?.headshot?.href || ''
      }))
    }));
    res.json({ sport, count:leaders.length, leaders, scrapedAt:new Date().toISOString() });
  } catch(e) {
    res.json({ sport, leaders:[], error:e.message });
  }
});

// ── ALL-SPORTS NEWS COMBINED ───────────────────────────
// GET /api/news-all
app.get('/api/news-all', async (req, res) => {
  const sports = ['nba','nfl','mlb','nhl','ncaab','ncaab2','tennis'];
  const all    = [];
  await Promise.allSettled(sports.map(async sport => {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/news/${sport}`);
      if (r.ok) {
        const d = await r.json();
        d.items?.forEach(item => all.push({ ...item, sport }));
      }
    } catch(e) {}
  }));
  all.sort((a,b) => (b.published||b.time||'').localeCompare(a.published||a.time||''));
  res.json({ count:all.length, items:all.slice(0,50), scrapedAt:new Date().toISOString() });
});



// ─────────────────────────────────────────────
// WEATHER — Open-Meteo (free, no key needed)
// Stadium coordinates for NFL + MLB outdoor venues
// ─────────────────────────────────────────────
const STADIUMS = {
  // NFL outdoor stadiums
  'Buffalo Bills': { lat: 42.7738, lon: -78.7870, name: 'Highmark Stadium', surface: 'grass', city: 'Orchard Park, NY' },
  'Chicago Bears': { lat: 41.8623, lon: -87.6167, name: 'Soldier Field', surface: 'grass', city: 'Chicago, IL' },
  'New York Giants': { lat: 40.8135, lon: -74.0745, name: 'MetLife Stadium', surface: 'turf', city: 'East Rutherford, NJ' },
  'New York Jets': { lat: 40.8135, lon: -74.0745, name: 'MetLife Stadium', surface: 'turf', city: 'East Rutherford, NJ' },
  'Kansas City Chiefs': { lat: 39.0489, lon: -94.4839, name: 'GEHA Field', surface: 'grass', city: 'Kansas City, MO' },
  'Green Bay Packers': { lat: 44.5013, lon: -88.0622, name: 'Lambeau Field', surface: 'grass', city: 'Green Bay, WI' },
  'Cleveland Browns': { lat: 41.5061, lon: -81.6995, name: 'Huntington Bank Field', surface: 'grass', city: 'Cleveland, OH' },
  'Pittsburgh Steelers': { lat: 40.4468, lon: -80.0158, name: 'Acrisure Stadium', surface: 'grass', city: 'Pittsburgh, PA' },
  'Denver Broncos': { lat: 39.7439, lon: -105.0201, name: 'Empower Field', surface: 'grass', city: 'Denver, CO' },
  'Seattle Seahawks': { lat: 47.5952, lon: -122.3316, name: 'Lumen Field', surface: 'turf', city: 'Seattle, WA' },
  'San Francisco 49ers': { lat: 37.4033, lon: -121.9694, name: "Levi's Stadium", surface: 'grass', city: 'Santa Clara, CA' },
  'Cincinnati Bengals': { lat: 39.0954, lon: -84.5160, name: 'Paycor Stadium', surface: 'turf', city: 'Cincinnati, OH' },
  'Philadelphia Eagles': { lat: 39.9008, lon: -75.1675, name: 'Lincoln Financial Field', surface: 'grass', city: 'Philadelphia, PA' },
  'Washington Commanders': { lat: 38.9078, lon: -76.8645, name: 'Northwest Stadium', surface: 'grass', city: 'Landover, MD' },
  'Jacksonville Jaguars': { lat: 30.3239, lon: -81.6373, name: 'EverBank Stadium', surface: 'grass', city: 'Jacksonville, FL' },
  'Tennessee Titans': { lat: 36.1665, lon: -86.7713, name: 'Nissan Stadium', surface: 'turf', city: 'Nashville, TN' },
  'Tampa Bay Buccaneers': { lat: 27.9760, lon: -82.5033, name: 'Raymond James Stadium', surface: 'grass', city: 'Tampa, FL' },
  'Carolina Panthers': { lat: 35.2258, lon: -80.8528, name: 'Bank of America Stadium', surface: 'grass', city: 'Charlotte, NC' },
  'Baltimore Ravens': { lat: 39.2780, lon: -76.6227, name: 'M&T Bank Stadium', surface: 'grass', city: 'Baltimore, MD' },
  'Detroit Lions': { lat: 42.3400, lon: -83.0456, name: 'Ford Field', surface: 'turf', city: 'Detroit, MI', indoor: true },
  'Miami Dolphins': { lat: 25.9580, lon: -80.2389, name: 'Hard Rock Stadium', surface: 'grass', city: 'Miami Gardens, FL' },
  'New Orleans Saints': { lat: 29.9511, lon: -90.0812, name: 'Caesars Superdome', surface: 'turf', city: 'New Orleans, LA', indoor: true },
  'Atlanta Falcons': { lat: 33.7554, lon: -84.4010, name: 'Mercedes-Benz Stadium', surface: 'turf', city: 'Atlanta, GA', indoor: true },
  'Indianapolis Colts': { lat: 39.7601, lon: -86.1639, name: 'Lucas Oil Stadium', surface: 'turf', city: 'Indianapolis, IN', indoor: true },
  'Minnesota Vikings': { lat: 44.9737, lon: -93.2575, name: 'U.S. Bank Stadium', surface: 'turf', city: 'Minneapolis, MN', indoor: true },
  'Los Angeles Rams': { lat: 33.9534, lon: -118.3392, name: 'SoFi Stadium', surface: 'turf', city: 'Inglewood, CA', indoor: true },
  'Los Angeles Chargers': { lat: 33.9534, lon: -118.3392, name: 'SoFi Stadium', surface: 'turf', city: 'Inglewood, CA', indoor: true },
  'Dallas Cowboys': { lat: 32.7474, lon: -97.0945, name: 'AT&T Stadium', surface: 'turf', city: 'Arlington, TX', indoor: true },
  'Houston Texans': { lat: 29.6847, lon: -95.4107, name: 'NRG Stadium', surface: 'grass', city: 'Houston, TX', indoor: true },
  'Arizona Cardinals': { lat: 33.5276, lon: -112.2626, name: 'State Farm Stadium', surface: 'grass', city: 'Glendale, AZ', indoor: true },
  'Las Vegas Raiders': { lat: 36.0909, lon: -115.1833, name: 'Allegiant Stadium', surface: 'turf', city: 'Las Vegas, NV', indoor: true },
  // MLB stadiums
  'New York Yankees': { lat: 40.8296, lon: -73.9262, name: 'Yankee Stadium', surface: 'grass', city: 'Bronx, NY' },
  'Boston Red Sox': { lat: 42.3467, lon: -71.0972, name: 'Fenway Park', surface: 'grass', city: 'Boston, MA' },
  'Chicago Cubs': { lat: 41.9484, lon: -87.6553, name: 'Wrigley Field', surface: 'grass', city: 'Chicago, IL' },
  'Chicago White Sox': { lat: 41.8300, lon: -87.6340, name: 'Guaranteed Rate Field', surface: 'grass', city: 'Chicago, IL' },
  'Los Angeles Dodgers': { lat: 34.0739, lon: -118.2400, name: 'Dodger Stadium', surface: 'grass', city: 'Los Angeles, CA' },
  'San Francisco Giants': { lat: 37.7786, lon: -122.3893, name: "Oracle Park", surface: 'grass', city: 'San Francisco, CA' },
  'Colorado Rockies': { lat: 39.7559, lon: -104.9942, name: 'Coors Field', surface: 'grass', city: 'Denver, CO' },
  'Texas Rangers': { lat: 32.7512, lon: -97.0832, name: 'Globe Life Field', surface: 'grass', city: 'Arlington, TX', indoor: true },
  'Kansas City Royals': { lat: 39.0517, lon: -94.4803, name: 'Kauffman Stadium', surface: 'grass', city: 'Kansas City, MO' },
  'Cleveland Guardians': { lat: 41.4962, lon: -81.6852, name: 'Progressive Field', surface: 'grass', city: 'Cleveland, OH' },
  'Philadelphia Phillies': { lat: 39.9061, lon: -75.1665, name: 'Citizens Bank Park', surface: 'grass', city: 'Philadelphia, PA' },
  'Pittsburgh Pirates': { lat: 40.4469, lon: -80.0057, name: 'PNC Park', surface: 'grass', city: 'Pittsburgh, PA' },
  'Cincinnati Reds': { lat: 39.0975, lon: -84.5077, name: 'Great American Ball Park', surface: 'grass', city: 'Cincinnati, OH' },
  'Baltimore Orioles': { lat: 39.2838, lon: -76.6218, name: 'Camden Yards', surface: 'grass', city: 'Baltimore, MD' },
  'Detroit Tigers': { lat: 42.3390, lon: -83.0485, name: 'Comerica Park', surface: 'grass', city: 'Detroit, MI' },
  'Minnesota Twins': { lat: 44.9817, lon: -93.2776, name: 'Target Field', surface: 'grass', city: 'Minneapolis, MN' },
  'Seattle Mariners': { lat: 47.5914, lon: -122.3323, name: 'T-Mobile Park', surface: 'turf', city: 'Seattle, WA' },
  'Oakland Athletics': { lat: 37.7516, lon: -122.2005, name: 'Oakland Coliseum', surface: 'grass', city: 'Sacramento, CA' },
  'San Diego Padres': { lat: 32.7073, lon: -117.1567, name: 'Petco Park', surface: 'grass', city: 'San Diego, CA' },
  'Arizona Diamondbacks': { lat: 33.4455, lon: -112.0667, name: 'Chase Field', surface: 'grass', city: 'Phoenix, AZ', indoor: true },
};

app.get('/api/weather/:team', async (req, res) => {
  const team = decodeURIComponent(req.params.team);
  const stadium = STADIUMS[team];
  if (!stadium) return res.status(404).json({ error: `Stadium not found for: ${team}` });

  const cacheKey = `weather_${team.replace(/\s+/g,'_')}`;
  const cached = getCached(cacheKey, 20 * 60 * 1000); // 20 min cache
  if (cached) return res.json(cached);

  try {
    // Open-Meteo free API — supports both 'weathercode' (legacy) and 'weather_code' (v1)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weathercode,cloud_cover&wind_speed_unit=mph&temperature_unit=fahrenheit&forecast_days=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!r.ok) {
      const errText = await r.text().catch(() => r.status);
      throw new Error(`Open-Meteo HTTP ${r.status}: ${String(errText).slice(0,100)}`);
    }

    const data = await r.json();

    // Support both current (new) and current_weather (legacy) response shapes
    const cur = data.current || data.current_weather || {};
    if (!cur || Object.keys(cur).length === 0) {
      throw new Error(`Open-Meteo returned empty current block. Keys: ${Object.keys(data).join(',')}`);
    }

    const wmoCode = (code) => {
      if (code === 0)  return 'Clear';
      if (code <= 3)   return 'Partly cloudy';
      if (code <= 49)  return 'Foggy';
      if (code <= 59)  return 'Drizzle';
      if (code <= 69)  return 'Rain';
      if (code <= 79)  return 'Snow';
      if (code <= 82)  return 'Rain showers';
      if (code <= 86)  return 'Snow showers';
      if (code <= 99)  return 'Thunderstorm';
      return 'Unknown';
    };

    const windSpeed = cur.wind_speed_10m  || cur.windspeed  || 0;
    const windGusts = cur.wind_gusts_10m  || 0;
    const precip    = cur.precipitation   || 0;
    const temp      = cur.temperature_2m  || cur.temperature || 70;
    const wCode     = cur.weathercode     || cur.weather_code || 0;

    let impact = 0;
    const factors = [];
    if (windSpeed >= 20)  { impact += 2; factors.push(`Strong wind ${Math.round(windSpeed)}mph → fade totals`); }
    else if (windSpeed >= 15) { impact += 1; factors.push(`Moderate wind ${Math.round(windSpeed)}mph → slight total pressure`); }
    if (windGusts >= 25)  { impact += 1; factors.push(`Gusts to ${Math.round(windGusts)}mph → unpredictable passing`); }
    if (precip > 0.1)     { impact += 2; factors.push(`Precip ${precip.toFixed(2)}" → run game, lower totals`); }
    if (temp <= 20)       { impact += 2; factors.push(`Extreme cold ${Math.round(temp)}°F → major scoring suppressor`); }
    else if (temp <= 35)  { impact += 1; factors.push(`Cold ${Math.round(temp)}°F → ball handling issues`); }
    if (temp >= 95)       { impact += 1; factors.push(`Extreme heat ${Math.round(temp)}°F → fatigue factor`); }

    const recommendation = impact >= 4 ? 'STRONG: Fade the total'
                         : impact >= 2 ? 'LEAN: Consider under'
                         : 'MINIMAL: Weather not a factor';

    const result = {
      team, stadium: stadium.name, city: stadium.city,
      indoor: stadium.indoor || false, surface: stadium.surface,
      weather: {
        temp: Math.round(temp), humidity: cur.relative_humidity_2m || 0,
        precip: precip.toFixed(2), windSpeed: Math.round(windSpeed),
        windGusts: Math.round(windGusts), windDirection: cur.wind_direction_10m || 0,
        cloudCover: cur.cloud_cover || 0, condition: wmoCode(wCode), code: wCode
      },
      bettingImpact: { score: impact, maxScore: 8, factors, recommendation },
      scrapedAt: new Date().toISOString()
    };

    setCache(cacheKey, result);
    addLog('info', 'Weather', `${team}`, `${Math.round(windSpeed)}mph, ${Math.round(temp)}°F, impact:${impact}/8`);
    res.json(result);

  } catch(e) {
    const detail = e.name === 'AbortError' ? 'Request timed out after 8s' : e.message;
    addLog('error', 'Weather', `FAILED: ${team}`, detail);
    res.status(500).json({ error: detail });
  }
});

// Weather for multiple teams at once
app.post('/api/weather-batch', async (req, res) => {
  const { teams } = req.body;
  if (!teams?.length) return res.json([]);
  const results = [];
  for (const team of teams) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/weather/${encodeURIComponent(team)}`);
      if (r.ok) results.push(await r.json());
    } catch(e) {}
  }
  res.json(results);
});

// List all teams with stadium data
app.get('/api/weather-teams', (req, res) => {
  res.json(Object.keys(STADIUMS).map(team => ({
    team,
    stadium: STADIUMS[team].name,
    city: STADIUMS[team].city,
    indoor: STADIUMS[team].indoor || false
  })));
});

// ─────────────────────────────────────────────
// DAILY BRIEFING — Claude-generated morning summary
// ─────────────────────────────────────────────
app.get('/api/daily-briefing', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.claudeKey) return res.status(400).json({ error: 'No Claude key' });

  const cacheKey = `daily_briefing_${new Date().toLocaleDateString().replace(/\//g,'-')}`;
  const cached = getCached(cacheKey, 4 * 60 * 60 * 1000); // 4hr cache
  if (cached) return res.json(cached);

  // Gather live context
  let context = `Today: ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}\n\n`;
  for (const sport of ['nba','nfl','mlb','nhl']) {
    try {
      const injR = await fetch(`http://localhost:${PORT}/api/live-injuries/${sport}`);
      if (injR.ok) { const d = await injR.json(); if (d.text?.length > 20) context += `${sport.toUpperCase()} INJURIES:\n${d.text.slice(0,600)}\n\n`; }
    } catch(e) {}
  }

  try {
    const claudeR = await fetch(`${cfg.claudeKey ? 'http://localhost:'+PORT : ''}/proxy/claude`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'claude-sonnet-4-6', max_tokens:1000,
        messages:[{ role:'user', content:`You are a sharp betting analyst. Generate a concise daily betting briefing for today based on this data:

${context}

Format:
DAILY BRIEFING — [Date]

KEY INJURIES AFFECTING LINES:
[3-5 bullet points — only high-impact injuries]

TODAY'S BETTING THEMES:
[3-4 actionable themes for today — e.g. "Back home dogs in NBA", "Fade cold-weather totals in NFL"]

SPORTS TO FOCUS ON TODAY:
[Which sport/slate has the most value today and why]

BANKROLL NOTE:
[1 sentence — e.g. "Moderate day, 2-3 bets max at 1 unit each"]

Keep it sharp, concise, and actionable.` }]
      })
    });
    const d = await claudeR.json();
    const text = d.content?.[0]?.text || 'Briefing unavailable.';
    const result = { text, generatedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Today's schedule from Odds API
app.get('/api/today-schedule', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.oddsKey) return res.status(400).json({ error: 'No Odds API key' });
  const sports = ['basketball_nba','americanfootball_nfl','baseball_mlb','icehockey_nhl','basketball_ncaab','mma_mixed_martial_arts','tennis_atp_us_open','tennis_wta_us_open'];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  const games = [];
  for (const sport of sports) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${cfg.oddsKey}&regions=us,us2&markets=h2h,totals&oddsFormat=american&bookmakers=hardrockbet,fanduel&commenceTimeFrom=${todayStr}T00:00:00Z&commenceTimeTo=${tomorrowStr}T23:59:59Z`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data)) data.forEach(g => games.push({ ...g, sportKey: sport }));
    } catch(e) {}
  }
  games.sort((a,b) => new Date(a.commence_time) - new Date(b.commence_time));
  res.json(games);
});

// ═══════════════════════════════════════════════════════
// API-SPORTS — FULLY CORRECTED IMPLEMENTATION
// ───────────────────────────────────────────────────────
// KEY FACTS (from official docs):
//   Dashboard key header : x-apisports-key
//   RapidAPI key headers : x-rapidapi-key + x-rapidapi-host
//   We support BOTH — auto-detected by key length/format
//
// CORRECT BASE URLS (NOT the v2.nba ones):
//   NBA      → v1.basketball.api-sports.io   (league 12, season "2024-2025")
//   NFL      → v1.american-football.api-sports.io (league 1, season 2024)
//   MLB      → v1.baseball.api-sports.io     (league 1, season 2025)
//   NHL      → v1.hockey.api-sports.io       (league 57, season "2024-2025")
//   EPL      → v3.football.api-sports.io     (league 39, season 2024)
//   MLS      → v3.football.api-sports.io     (league 253, season 2025)
// ═══════════════════════════════════════════════════════

const SA = {
  nba: { host:'v1.basketball.api-sports.io',          base:'https://v1.basketball.api-sports.io',          league:12,  season:'2024-2025' },
  nfl: { host:'v1.american-football.api-sports.io',   base:'https://v1.american-football.api-sports.io',   league:1,   season:2024        },
  mlb: { host:'v1.baseball.api-sports.io',            base:'https://v1.baseball.api-sports.io',            league:1,   season:2025        },
  nhl: { host:'v1.hockey.api-sports.io',              base:'https://v1.hockey.api-sports.io',              league:57,  season:'2024-2025' },
  epl: { host:'v3.football.api-sports.io',            base:'https://v3.football.api-sports.io',            league:39,  season:2024        },
  mls: { host:'v3.football.api-sports.io',            base:'https://v3.football.api-sports.io',            league:253, season:2025        },
};

// Build the correct auth headers based on key source
// Dashboard keys (api-football.com) use x-apisports-key
// Both header names are accepted, so we send both to be safe
function saHeaders(key, host) {
  return {
    'x-apisports-key': key,       // Direct / dashboard key
    'x-rapidapi-key':  key,       // RapidAPI key (same value)
    'x-rapidapi-host': host,      // RapidAPI host
  };
}

async function callSA(sport, endpoint, params = {}, cacheMins = 15) {
  const cfg = loadConfig();
  if (!cfg.sportsApiKey) throw new Error('No API-Sports key configured in Settings');
  const sc = SA[sport];
  if (!sc) throw new Error(`Unknown sport: ${sport}`);
  const qs = new URLSearchParams(params).toString();
  const url = `${sc.base}/${endpoint}${qs ? '?' + qs : ''}`;
  const cacheKey = `sa2_${sport}_${endpoint}_${qs}`;
  const cached = getCached(cacheKey, cacheMins * 60 * 1000);
  if (cached) {
    addLog('info', 'SportsAPI', `${sport.toUpperCase()} /${endpoint} (cache)`, '');
    return cached;
  }
  const r = await fetch(url, { headers: saHeaders(cfg.sportsApiKey, sc.host) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch(e) { throw new Error(`Non-JSON response (${r.status}): ${text.slice(0,200)}`); }

  if (data.errors && Object.keys(data.errors).length) {
    const errMsg = JSON.stringify(data.errors);
    throw new Error(`API-Sports error: ${errMsg}`);
  }

  const remaining = r.headers.get('x-ratelimit-requests-remaining') || data.paging?.remaining || '?';
  addLog('info', 'SportsAPI', `${sport.toUpperCase()} /${endpoint}`, `${data.results||0} results · ${remaining} quota left`);
  setCache(cacheKey, data);
  return data;
}

// ── DIAGNOSTIC — test connection and show raw response ──────
// GET /api/sportsapi/test/:sport
app.get('/api/sportsapi/test/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const cfg   = loadConfig();
  if (!cfg.sportsApiKey) return res.json({ ok:false, error:'No API-Sports key in Settings' });
  const sc = SA[sport];
  if (!sc) return res.json({ ok:false, error:`Unknown sport: ${sport}` });

  const url = `${sc.base}/status`;
  try {
    const r = await fetch(url, { headers: saHeaders(cfg.sportsApiKey, sc.host) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text.slice(0,500) }; }
    const remaining = r.headers.get('x-ratelimit-requests-remaining');
    const limit      = r.headers.get('x-ratelimit-requests-limit');
    res.json({ ok: r.ok, status: r.status, remaining, limit, url, sport, host: sc.host, response: data });
  } catch(e) {
    res.json({ ok:false, error: e.message, url, sport, host: sc.host });
  }
});

// ── QUOTA ────────────────────────────────────────────────────
app.get('/api/sportsapi/quota', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.sportsApiKey) return res.json({ error:'No key', remaining:null });
  // Basketball endpoint is lightest for quota check
  const url = 'https://v1.basketball.api-sports.io/status';
  try {
    const r = await fetch(url, { headers: saHeaders(cfg.sportsApiKey, 'v1.basketball.api-sports.io') });
    const remaining = r.headers.get('x-ratelimit-requests-remaining');
    const limit      = r.headers.get('x-ratelimit-requests-limit') || '100';
    const data       = await r.json();
    const used = data?.response?.requests?.current || (parseInt(limit) - parseInt(remaining || 0));
    addLog('info', 'SportsAPI', 'Quota Check', `${remaining}/${limit} remaining`);
    res.json({ remaining: parseInt(remaining||0), limit: parseInt(limit), used, ok: r.ok, account: data?.response?.account || {} });
  } catch(e) {
    res.json({ error: e.message, remaining: null });
  }
});

// ── STANDINGS ────────────────────────────────────────────────
// GET /api/sportsapi/standings/:sport
app.get('/api/sportsapi/standings/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const sc    = SA[sport];
  if (!sc) return res.json({ error:`Unknown sport: ${sport}`, response:[] });
  try {
    // Football (EPL/MLS) uses different endpoint name
    const endpoint  = ['epl','mls'].includes(sport) ? 'standings' : 'standings';
    const data = await callSA(sport, endpoint, { league: sc.league, season: sc.season }, 30);
    res.json(data);
  } catch(e) {
    addLog('error', 'SportsAPI', `Standings ${sport.toUpperCase()} FAILED`, e.message);
    res.json({ error: e.message, response: [] });
  }
});

// ── TODAY'S GAMES ────────────────────────────────────────────
// GET /api/sportsapi/games-today/:sport
app.get('/api/sportsapi/games-today/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const sc    = SA[sport];
  if (!sc) return res.json({ error:`Unknown sport: ${sport}`, response:[] });
  const today = new Date().toISOString().split('T')[0];
  try {
    const endpoint = ['epl','mls'].includes(sport) ? 'fixtures' : 'games';
    const data = await callSA(sport, endpoint, { date: today, league: sc.league, season: sc.season }, 5);
    res.json(data);
  } catch(e) {
    addLog('error', 'SportsAPI', `Games Today ${sport.toUpperCase()} FAILED`, e.message);
    res.json({ error: e.message, response: [] });
  }
});

// ── LIVE GAMES ───────────────────────────────────────────────
// GET /api/sportsapi/live/:sport
app.get('/api/sportsapi/live/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const sc    = SA[sport];
  if (!sc) return res.json({ error:`Unknown sport: ${sport}`, response:[] });
  try {
    const endpoint = ['epl','mls'].includes(sport) ? 'fixtures' : 'games';
    const data = await callSA(sport, endpoint, { live: 'all' }, 1);
    res.json(data);
  } catch(e) {
    addLog('error', 'SportsAPI', `Live ${sport.toUpperCase()} FAILED`, e.message);
    res.json({ error: e.message, response: [] });
  }
});

// ── PLAYER STATS ─────────────────────────────────────────────
// GET /api/sportsapi/player-stats/:sport?name=Jokic&season=2024-2025
app.get('/api/sportsapi/player-stats/:sport', async (req, res) => {
  const sport  = req.params.sport.toLowerCase();
  const sc     = SA[sport];
  if (!sc) return res.json({ error:`Unknown sport: ${sport}`, response:[] });
  const { name, id, season } = req.query;
  if (!name && !id) return res.json({ error:'Provide ?name= or ?id=', response:[] });

  try {
    const useSeason = season || sc.season;
    let playerId = id;

    // Step 1: search for player by name if no ID provided
    if (!playerId && name) {
      const searchData = await callSA(sport, 'players', { search: name, league: sc.league, season: useSeason }, 60);
      const first = searchData?.response?.[0];
      if (!first) return res.json({ error: `Player not found: "${name}"`, response: [] });
      playerId = first?.player?.id ?? first?.id;
    }

    // Step 2: get stats for that player
    const statsEndpoint = ['epl','mls'].includes(sport) ? 'players' : 'players/statistics';
    const statsParams   = { id: playerId, season: useSeason, league: sc.league };
    const stats = await callSA(sport, statsEndpoint, statsParams, 15);
    res.json(stats);
  } catch(e) {
    addLog('error', 'SportsAPI', `Player Stats ${sport.toUpperCase()} FAILED`, e.message);
    res.json({ error: e.message, response: [] });
  }
});

// ── INJURIES ─────────────────────────────────────────────────
// GET /api/sportsapi/injuries/:sport?team=Lakers
app.get('/api/sportsapi/injuries/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const sc    = SA[sport];
  if (!sc) return res.json({ sport, count:0, injuries:[], text:`Sport ${sport} not supported`, scrapedAt: new Date().toISOString() });

  try {
    const params = { league: sc.league, season: sc.season };
    if (req.query.team) params.team = req.query.team;
    const data = await callSA(sport, 'injuries', params, 10);

    const injuries = (data?.response || []).map(i => ({
      player: i.player?.name  || i.name  || '?',
      team:   i.team?.name    || i.team  || '?',
      status: i.type          || i.status || '?',
      injury: i.reason        || i.comment || '',
      source: 'API-Sports'
    }));

    addLog('info', 'SportsAPI', `Injuries ${sport.toUpperCase()}`, `${injuries.length} players`);
    res.json({
      sport, count: injuries.length, injuries,
      text: injuries.map(i => `${i.player} (${i.team}) — ${i.status}${i.injury?' - '+i.injury:''}`).join('\n') || 'No injuries found.',
      scrapedAt: new Date().toISOString()
    });
  } catch(e) {
    addLog('error', 'SportsAPI', `Injuries ${sport.toUpperCase()} FAILED`, e.message);
    res.json({ sport, count:0, injuries:[], text:`API-Sports failed: ${e.message}`, error: e.message, scrapedAt: new Date().toISOString() });
  }
});

// ── TEAM SEARCH ──────────────────────────────────────────────
app.get('/api/sportsapi/team/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const sc    = SA[sport];
  if (!sc) return res.json({ error:`Unknown sport: ${sport}`, response:[] });
  const { name, id } = req.query;
  try {
    const params = name ? { name, league: sc.league, season: sc.season } : { id, season: sc.season };
    const data = await callSA(sport, 'teams', params, 60);
    res.json(data);
  } catch(e) {
    res.json({ error: e.message, response: [] });
  }
});

// ── COMBINED INJURIES (ESPN + Rotowire + API-Sports) ─────────
app.get('/api/live-injuries-full/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const cfg   = loadConfig();
  const results = { sport, sources:[], combined:[], scrapedAt: new Date().toISOString() };

  // Source 1: ESPN JSON API — best source, always works
  try {
    const r = await fetch(`http://localhost:${PORT}/api/espn/injuries/${sport}`);
    if (r.ok) {
      const d = await r.json();
      if (d.injuries?.length) {
        results.sources.push('ESPN API');
        results.combined.push(...d.injuries.map(i => ({ ...i, source:'ESPN API' })));
      }
    }
  } catch(e) {}

  // Source 2: ScoresAndOdds — server-side rendered, scrapes cleanly
  if (['nba','nfl','mlb','nhl','ncaab','ncaaf','wnba'].includes(sport)) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/sao/injuries/${sport}`);
      if (r.ok) {
        const d = await r.json();
        if (d.injuries?.length) {
          const existing = new Set(results.combined.map(i => (i.player||'').toLowerCase()));
          const newOnes  = d.injuries.filter(i => !existing.has((i.player||'').toLowerCase()));
          if (newOnes.length) {
            results.sources.push('ScoresAndOdds');
            results.combined.push(...newOnes);
          }
        }
      }
    } catch(e) {}
  }

  // API-Sports removed — not pulling data

  results.count = results.combined.length;
  results.text  = results.combined.length
    ? results.combined.map(i => i.raw ? i.raw : `${i.player||''}${i.team?` (${i.team})`:''}  — ${i.status||''} — ${i.injury||i.comment||''} [${i.source}]`).filter(Boolean).join('\n')
    : `No injury data available for ${sport.toUpperCase()}.`;

  res.json(results);
});

// ═══════════════════════════════════════════════════════
// SCORESANDODDS.COM SCRAPER
// Server-side rendered — cheerio parses cleanly.
// Covers: NBA, NFL, MLB, NHL, NCAAB, NCAAF, WNBA
// Data: scores, spreads, totals, ML, line movements,
//       injuries, consensus picks
// ═══════════════════════════════════════════════════════

const SAO_SPORTS = {
  nba:   'nba',  nfl:  'nfl',  mlb:  'mlb',
  nhl:   'nhl',  ncaab:'ncaab',ncaaf:'ncaaf', wnba:'wnba'
};

// ── SCORES + ODDS ─────────────────────────────────────
// GET /api/sao/games/:sport
// Returns parsed games with scores, spread, total, ML, line movements
app.get('/api/sao/games/:sport', async (req, res) => {
  const sport  = req.params.sport.toLowerCase();
  const slug   = SAO_SPORTS[sport];
  if (!slug) return res.json({ error:`Sport ${sport} not supported`, games:[] });

  const cacheKey = `sao_games_${sport}`;
  const cached   = getCached(cacheKey, 3 * 60 * 1000); // 3 min cache
  if (cached) { addLog('info','SAO',`Games ${sport.toUpperCase()} (cache)`,''); return res.json(cached); }

  const url = `https://www.scoresandodds.com/${slug}`;
  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $    = cheerio.load(html);
    const games = [];

    // Each game is a table or section with two team rows
    $('table').each((_, tbl) => {
      const rows = $(tbl).find('tr');
      if (rows.length < 2) return;

      const teamRows = [];
      rows.each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 3) return;
        const teamLink = $(cells[0]).find('a').first();
        const teamName = teamLink.text().trim() || $(cells[0]).text().trim();
        if (!teamName || teamName.length < 2) return;

        // Score is often in a separate cell or in the row text
        const scoreText = $(cells[1]).text().trim();
        const score = parseInt(scoreText) || null;

        // Line movement cell (3 values: open, middle, current)
        const lineCell = $(cells[2]).text().replace(/\s+/g,' ').trim();
        const lineMoves = lineCell.match(/-?\+?\d+\.?\d*/g)?.slice(0,3) || [];

        // Spread
        const spreadCell = $(cells[3])?.text().trim() || '';
        const spread = spreadCell.match(/-?\+?\d+\.?\d*/)?.[0] || null;
        const spreadOdds = spreadCell.match(/(-?\d+)\s*$/)?.[1] || null;

        // Total
        const totalCell = $(cells[4])?.text().trim() || '';
        const total = totalCell.match(/[ou](\d+\.?\d*)/i)?.[1] || totalCell.match(/\d+\.?\d*/)?.[0] || null;

        // Moneyline
        const mlCell = $(cells[5])?.text().trim() || '';
        const ml = mlCell.match(/-?\+?\d+/)?.[0] || null;

        if (teamName) {
          teamRows.push({ team:teamName, score, spread:spread?parseFloat(spread):null, spreadOdds:spreadOdds?parseInt(spreadOdds):null, total:total?parseFloat(total):null, ml:ml?parseInt(ml):null, lineMoves, rawLine: lineCell });
        }
      });

      if (teamRows.length >= 2) {
        const statusText = $(tbl).prev().text().trim() || $(tbl).find('th').first().text().trim();
        const isLive   = /live|in progress|quarter|period|inning|halftime/i.test(statusText);
        const isFinal  = /final/i.test(statusText);

        games.push({
          away:       teamRows[0].team,
          home:       teamRows[1].team,
          awayScore:  teamRows[0].score,
          homeScore:  teamRows[1].score,
          status:     isFinal ? 'final' : isLive ? 'live' : 'upcoming',
          spread:     teamRows[1].spread,   // home spread
          spreadOdds: teamRows[1].spreadOdds,
          total:      teamRows[0].total || teamRows[1].total,
          awayML:     teamRows[0].ml,
          homeML:     teamRows[1].ml,
          awayLineMoves: teamRows[0].lineMoves,
          homeLineMoves: teamRows[1].lineMoves,
          sport, source: 'ScoresAndOdds'
        });
      }
    });

    const result = { sport, count:games.length, games, scrapedAt:new Date().toISOString(), url };
    if (games.length) setCache(cacheKey, result);
    addLog('info','SAO',`Games ${sport.toUpperCase()}`,`${games.length} games`);
    res.json(result);
  } catch(e) {
    addLog('error','SAO',`Games ${sport.toUpperCase()} FAILED`,e.message);
    res.json({ sport, count:0, games:[], error:e.message, scrapedAt:new Date().toISOString() });
  }
});

// ── ODDS PAGE (dedicated odds view) ──────────────────
// GET /api/sao/odds/:sport
app.get('/api/sao/odds/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const slug  = SAO_SPORTS[sport];
  if (!slug) return res.json({ error:`Sport not supported`, games:[] });

  const cacheKey = `sao_odds_${sport}`;
  const cached   = getCached(cacheKey, 3 * 60 * 1000);
  if (cached) return res.json(cached);

  const url = `https://www.scoresandodds.com/${slug}/odds`;
  try {
    const r    = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $    = cheerio.load(html);
    const games = [];

    $('table').each((_, tbl) => {
      const rows = $(tbl).find('tr');
      const teamRows = [];
      rows.each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) return;
        const name = $(cells[0]).find('a').text().trim() || $(cells[0]).text().trim();
        if (!name || name.length < 2) return;
        // Collect all numeric data from row
        const nums = $(row).text().match(/-?\+?\d+\.?\d*/g) || [];
        teamRows.push({ team:name, nums });
      });
      if (teamRows.length >= 2) {
        games.push({
          away: teamRows[0].team, home: teamRows[1].team,
          awayNums: teamRows[0].nums, homeNums: teamRows[1].nums,
          sport, source:'ScoresAndOdds'
        });
      }
    });

    const result = { sport, count:games.length, games, url, scrapedAt:new Date().toISOString() };
    if (games.length) setCache(cacheKey, result);
    res.json(result);
  } catch(e) {
    res.json({ sport, count:0, games:[], error:e.message });
  }
});

// ── INJURIES ─────────────────────────────────────────
// GET /api/sao/injuries/:sport
app.get('/api/sao/injuries/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const slug  = SAO_SPORTS[sport];
  if (!slug) return res.json({ sport, count:0, injuries:[], text:'Sport not supported' });

  const cacheKey = `sao_inj_${sport}`;
  const cached   = getCached(cacheKey, 10 * 60 * 1000);
  if (cached) return res.json(cached);

  const url = `https://www.scoresandodds.com/${slug}/injuries`;
  try {
    const r    = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $    = cheerio.load(html);
    $('script,style').remove();
    const injuries = [];

    // SAO injury tables: Team header, then player rows
    let currentTeam = '';
    $('h2, h3, [class*="team"], table tr').each((_, el) => {
      const tag = el.name;
      if (tag === 'h2' || tag === 'h3') {
        const t = $(el).text().trim();
        if (t && t.length < 50 && !t.includes('%')) currentTeam = t;
        return;
      }
      const cells = $(el).find('td');
      if (cells.length >= 3) {
        const player = $(cells[0]).text().trim();
        const pos    = $(cells[1]).text().trim();
        const status = $(cells[2]).text().trim();
        const injury = $(cells[3])?.text().trim() || '';
        if (player && player.length > 1 && /out|questionable|probable|ir|dtd/i.test(status)) {
          injuries.push({ player, pos, status, injury, team:currentTeam, source:'ScoresAndOdds' });
        }
      }
    });

    const text = injuries.map(i => `${i.player} (${i.team}) — ${i.status}${i.injury?' - '+i.injury:''}`).join('\n');
    const result = { sport, count:injuries.length, injuries, text:text||'No injuries found', url, scrapedAt:new Date().toISOString() };
    if (injuries.length) setCache(cacheKey, result);
    addLog('info','SAO',`Injuries ${sport.toUpperCase()}`,`${injuries.length} players`);
    res.json(result);
  } catch(e) {
    addLog('error','SAO',`Injuries ${sport.toUpperCase()} FAILED`,e.message);
    res.json({ sport, count:0, injuries:[], text:`SAO scrape failed: ${e.message}`, error:e.message });
  }
});

// ── CONSENSUS PICKS (public betting %) ───────────────
// GET /api/sao/consensus/:sport
// Parses SAO consensus-picks page — server-side rendered HTML
// Returns structured games with away/home names + bet%/money% per market
app.get('/api/sao/consensus/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  const slug  = SAO_SPORTS[sport];
  if (!slug) return res.json({ sport, count:0, games:[], error:'Sport not supported' });

  const cacheKey = `sao_cons_${sport}`;
  const cached   = getCached(cacheKey, 4 * 60 * 1000); // 4 min
  if (cached) { addLog('info','SAO',`Consensus ${sport.toUpperCase()} (cache)`,`${cached.count} games`); return res.json(cached); }

  const url = `https://www.scoresandodds.com/${slug}/consensus-picks`;
  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $    = cheerio.load(html);

    // SAO consensus page structure:
    // Each game block contains team names from img alt or link text
    // and percentage splits in list items: "ABBR X%  ABBR" and "Y% Z% % of Money"
    const games = [];

    // Find all game sections — each game has two team logo+name combos and percentage rows
    // The page uses a repeating pattern: team imgs, then li items with the % data
    // We parse the raw text which has: "ABBR % of Bets ABBR  X%  Y%  Z% W%  % of Money"
    const bodyText = $('body').text();

    // Extract team pair + percentages using the known pattern from SAO list items
    const gameBlocks = [];

    $('li').each((_, el) => {
      const text = $(el).text().replace(/\s+/g,' ').trim();
      // Bet pct pattern: abbr, of Bets, abbr, 4 numbers
      const betMatch = text.match(/(\w+)(?:\s*\([^)]*\))?\s*%\s*of\s*Bets\s*(\w+)(?:\s*\([^)]*\))?\s*(\d{1,3})%\s*(\d{1,3})%\s*(\d{1,3})%\s*(\d{1,3})%\s*%\s*of\s*Money/i);
      if (betMatch) {
        gameBlocks.push({
          away: betMatch[1], home: betMatch[2],
          awayBetPct: parseInt(betMatch[3]), homeBetPct: parseInt(betMatch[4]),
          awayMoneyPct: parseInt(betMatch[5]), homeMoneyPct: parseInt(betMatch[6]),
          rawText: text.slice(0,200)
        });
        return;
      }
      // Partial pattern: only bet% present (no money%)
      const partMatch = text.match(/(\w+)(?:\s*\([^)]*\))?\s*%\s*of\s*Bets\s*(\w+)(?:\s*\([^)]*\))?\s*(\d{1,3})%\s*(\d{1,3})%/i);
      if (partMatch) {
        gameBlocks.push({
          away: partMatch[1], home: partMatch[2],
          awayBetPct: parseInt(partMatch[3]), homeBetPct: parseInt(partMatch[4]),
          awayMoneyPct: null, homeMoneyPct: null,
          rawText: text.slice(0,200)
        });
      }
    });

    // Deduplicate and group by game pair (away+home) — SAO shows spread/total/ML separately
    const gameMap = {};
    gameBlocks.forEach(b => {
      const key = `${b.away}_${b.home}`;
      if (!gameMap[key]) {
        gameMap[key] = { away:b.away, home:b.home, markets:[], rawText: b.rawText, sport };
      }
      gameMap[key].markets.push({
        awayBetPct: b.awayBetPct, homeBetPct: b.homeBetPct,
        awayMoneyPct: b.awayMoneyPct, homeMoneyPct: b.homeMoneyPct,
      });
    });

    // Convert to array, use first market as primary bet%
    const gamesArr = Object.values(gameMap).map(g => {
      const primary = g.markets[0] || {};
      // Find RLM: bet% favors one side, money% favors other
      const betFav   = primary.awayBetPct > primary.homeBetPct ? 'away' : 'home';
      const moneyFav = primary.awayMoneyPct && primary.awayMoneyPct > primary.homeMoneyPct ? 'away' : 'home';
      const hasRLM   = primary.awayMoneyPct && betFav !== moneyFav && Math.max(primary.awayBetPct, primary.homeBetPct) >= 60;
      const maxBet   = Math.max(primary.awayBetPct||0, primary.homeBetPct||0);
      const signal   = hasRLM ? 'rlm' : maxBet >= 80 ? 'steam' : maxBet >= 65 ? 'fade' : 'none';

      return {
        ...g,
        awayBetPct:   primary.awayBetPct,
        homeBetPct:   primary.homeBetPct,
        awayMoneyPct: primary.awayMoneyPct,
        homeMoneyPct: primary.homeMoneyPct,
        signal, hasRLM, maxBet,
        allMarkets: g.markets
      };
    });

    // Build text summary
    const text = gamesArr.map(g =>
      `${g.away} vs ${g.home} | Bets: ${g.away} ${g.awayBetPct}% / ${g.home} ${g.homeBetPct}%` +
      (g.awayMoneyPct ? ` | Money: ${g.away} ${g.awayMoneyPct}% / ${g.home} ${g.homeMoneyPct}%` : '') +
      ` | Signal: ${g.signal.toUpperCase()}`
    ).join('\n');

    const result = { sport, count:gamesArr.length, games:gamesArr, text, url, scrapedAt:new Date().toISOString() };
    if (gamesArr.length) setCache(cacheKey, result);
    addLog('info','SAO',`Consensus ${sport.toUpperCase()}`,`${gamesArr.length} games parsed`);
    res.json(result);
  } catch(e) {
    addLog('error','SAO',`Consensus ${sport.toUpperCase()} FAILED`,e.message);
    res.json({ sport, count:0, games:[], text:'', error:e.message, url, scrapedAt:new Date().toISOString() });
  }
});


// ── LINE MOVEMENTS ─────────────────────────────────────
// GET /api/sao/line-movement/:sport
app.get('/api/sao/line-movement/:sport', async (req, res) => {
  const sport = req.params.sport.toLowerCase();
  try {
    const r   = await fetch(`http://localhost:${PORT}/api/sao/games/${sport}`);
    const data = await r.json();
    const moves = [];
    (data.games || []).forEach(g => {
      if (!g.awayLineMoves || g.awayLineMoves.length < 2) return;
      const open = parseFloat(g.awayLineMoves[0]);
      const curr = parseFloat(g.awayLineMoves[g.awayLineMoves.length-1]);
      const change = Math.round((curr - open) * 10) / 10;
      if (Math.abs(change) >= 5) moves.push({ away:g.away, home:g.home, type:'spread', openLine:open, currentLine:curr, change, sport, detectedAt:new Date().toISOString(), source:'SAO' });
    });
    res.json({ sport, count:moves.length, moves, scrapedAt:new Date().toISOString() });
  } catch(e) { res.json({ sport, count:0, moves:[], error:e.message }); }
});
