// VIC Shared Utilities
const API = '';

// External link opener — href is the primary mechanism,
// window.open as backup, fallback box or prompt if both blocked
function openLink(url) {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w || w.closed || typeof w.closed === 'undefined') {
    // Show in fallback box if on public.html, else prompt
    const fb = document.getElementById('link-fallback');
    const fu = document.getElementById('fallback-url');
    if (fb && fu) {
      fb.style.display = 'block';
      fu.textContent = url;
    } else {
      prompt('Copy this URL and open in your browser:', url);
    }
  } else {
    // Opened OK — still update fallback box if present
    const fb = document.getElementById('link-fallback');
    const fu = document.getElementById('fallback-url');
    if (fb && fu) { fb.style.display = 'block'; fu.textContent = url; }
  }
}

async function proxyOdds(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API}/proxy/odds/${path}${qs ? '?' + qs : ''}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Odds API error: ${r.status}`);
  return r.json();
}

// ── Claude API helpers ────────────────────────────────
// Model tier strategy from Anthropic pricing docs:
//   Haiku 4.5  ($1/$5)   — quick summaries, simple tasks, high-volume
//   Sonnet 4.6 ($3/$15)  — complex analysis, reasoning, default
// Web search costs $10/1000 — use only when real-time data needed
// Web fetch is FREE — use for specific URLs instead of search

const MODELS = {
  haiku:  'claude-haiku-4-5-20251001',   // Fast, cheap — summaries/simple
  sonnet: 'claude-sonnet-4-6',           // Latest Sonnet — complex analysis
};

// Standard call — uses Sonnet 4.6 (latest) for complex analysis
async function proxyClaude(prompt, maxTokens = 1000, useHaiku = false) {
  const model = useHaiku ? MODELS.haiku : MODELS.sonnet;
  const r = await fetch(`${API}/proxy/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.content[0].text;
}

// Call with web search — $10/1000 searches, use selectively
// Only for AI Sharp Analysis buttons that need real-time injury/news data
async function proxyClaudeWithSearch(prompt, maxTokens = 1200) {
  const r = await fetch(`${API}/proxy/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.sonnet,
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  // Extract text blocks (web search returns mixed content blocks)
  return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

// Quick summary — Haiku for speed/cost (4x faster, 3x cheaper than Sonnet)
async function quickSummary(prompt, maxTokens = 400) {
  return proxyClaude(prompt, maxTokens, true);
}

async function getConfig() {
  const r = await fetch(`${API}/api/config`);
  return r.json();
}

async function saveConfig(cfg) {
  await fetch(`${API}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });
}

async function getBets() {
  const r = await fetch(`${API}/api/bets`);
  return r.json();
}

async function addBet(bet) {
  const r = await fetch(`${API}/api/bets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bet)
  });
  return r.json();
}

async function updateBet(id, data) {
  await fetch(`${API}/api/bets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

async function deleteBet(id) {
  await fetch(`${API}/api/bets/${id}`, { method: 'DELETE' });
}

async function getClv() {
  const r = await fetch(`${API}/api/clv`);
  return r.json();
}

async function addClvEntry(entry) {
  const r = await fetch(`${API}/api/clv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });
  return r.json();
}

async function updateClv(id, data) {
  await fetch(`${API}/api/clv/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

async function deleteClv(id) {
  await fetch(`${API}/api/clv/${id}`, { method: 'DELETE' });
}

function fmtOdds(o) { return o > 0 ? '+' + o : String(o); }
function toImplied(o) {
  o = parseInt(o);
  return o > 0 ? (100 / (o + 100) * 100).toFixed(1) : (Math.abs(o) / (Math.abs(o) + 100) * 100).toFixed(1);
}

function calcProfit(odds, units, result) {
  if (result === 'win') {
    const o = parseInt(odds);
    return o > 0 ? units * (o / 100) : units * (100 / Math.abs(o));
  }
  if (result === 'loss') return -units;
  return 0;
}

function loading(id, msg = 'Loading...') {
  document.getElementById(id).innerHTML =
    `<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span>${msg}</span></div>`;
}

function errMsg(id, msg) {
  const el = document.getElementById(id);
  el.innerHTML += `<div class="err">${msg}</div>`;
}

function edgePips(score, max = 12) {
  return Array.from({ length: max }, (_, i) =>
    `<div class="pip ${i < score ? (score >= 10 ? 'hot' : 'on') : ''}"></div>`
  ).join('');
}

function badgeClass(rec = '') {
  rec = rec.toUpperCase();
  if (rec.includes('STRONG')) return 'b-green';
  if (rec.includes('LEAN')) return 'b-amber';
  if (rec.includes('PASS') || rec.includes('FADE')) return 'b-red';
  return 'b-blue';
}

function setActivePage(name) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === name);
  });
}

async function checkServerStatus() {
  const dot = document.getElementById('srv-dot');
  const txt = document.getElementById('srv-txt');
  try {
    await fetch(`${API}/api/config`);
    if (dot) { dot.className = 'status-dot'; dot.title = 'Server online'; }
    if (txt) txt.textContent = '';
  } catch {
    if (dot) { dot.className = 'status-dot offline'; dot.title = 'Server offline'; }
    if (txt) txt.textContent = 'Offline';
  }
}



// Normalize game object — handles both ESPN and legacy field formats
function normalizeGame(g) {
  if (!g) return g;
  // If already normalized, return as-is
  if (g.away_team) return g;
  // Map ESPN fields to standard fields
  return {
    ...g,
    away_team:    g.awayTeam || g.away || g.away_team || '?',
    home_team:    g.homeTeam || g.home || g.home_team || '?',
    completed:    g.isFinal || g.completed || false,
    commence_time: g.date || g.commence_time || '',
    scores: g.scores || (g.awayScore !== undefined ? [
      { name: g.awayTeam || g.away || '', score: g.awayScore || '0' },
      { name: g.homeTeam || g.home || '', score: g.homeScore || '0' }
    ] : null),
  };
}

// Nav HTML — included in every page
function navHTML(activePage) {

  // ── Page definitions ───────────────────────────────
  // Only pages that are "real" destinations — user's requested set
  const NAV_STRUCTURE = {
    // Always-pinned in footer bar
    pinned: [
      { key:'index',  label:'HOME',     icon:'⌂',  href:'index.html'  },
      { key:'config', label:'SETTINGS', icon:'⚙',  href:'config.html' },
    ],

    // Drawer groups
    groups: [
      {
        label: 'MARKETS',
        icon: '📊',
        pages: [
          { key:'picks',   label:'Legs',       icon:'⚡', href:'picks.html'   },
          { key:'odds',    label:'Odds',        icon:'📈', href:'odds.html'    },
          { key:'scores',  label:'Scores',      icon:'🔴', href:'scores.html'  },
          { key:'props',   label:'Props',       icon:'🎯', href:'props.html'   },
          { key:'public',  label:'Public %',    icon:'👥', href:'public.html'  },
          { key:'signals', label:'Signals',     icon:'🚨', href:'signals.html' },
          { key:'alerts',  label:'Alerts',      icon:'🔔', href:'alerts.html'  },
        ]
      },
      {
        label: 'INTELLIGENCE',
        icon: '🧠',
        pages: [
          { key:'news',     label:'Intel Feed',  icon:'📰', href:'news.html'     },
          { key:'injuries', label:'Injuries',    icon:'🏥', href:'injuries.html' },
          { key:'analysis', label:'AI Analysis', icon:'🤖', href:'analysis.html' },
          { key:'weather',  label:'Weather',     icon:'🌤', href:'weather.html'  },
          { key:'stats',    label:'Stats',       icon:'📋', href:'stats.html'    },
        ]
      },
      {
        label: 'TRACKER',
        icon: '💰',
        pages: [
          { key:'tracker',  label:'Bet Log',     icon:'📝', href:'tracker.html'  },
          { key:'clv',      label:'CLV',         icon:'📈', href:'clv.html'      },
          { key:'backtest', label:'Bankroll',     icon:'💹', href:'backtest.html' },
          { key:'parlay',   label:'Parlay',       icon:'🎰', href:'parlay.html'   },
        ]
      },
      {
        label: 'TOOLS',
        icon: '🔧',
        pages: [
          { key:'tools',   label:'Tools',        icon:'🔧', href:'tools.html'    },
          { key:'logs',    label:'Logs',          icon:'📜', href:'logs.html'     },
        ]
      },
    ]
  };

  const PAGE_NAMES = {
    index:'Dashboard', picks:'Legs', vegas:'Vegas Odds', tracker:'Bet Tracker',
    public:'Public %', odds:'Live Odds', scores:'Scores', props:'Props',
    alerts:'Alerts', news:'Intelligence', injuries:'Injuries', weather:'Weather',
    analysis:'AI Analysis', stats:'Stats', clv:'CLV', parlay:'Parlay',
    backtest:'Bankroll', logs:'Logs', config:'Settings', tools:'Tools'
  };
  const pageName = PAGE_NAMES[activePage] || 'VIC';

  // Find which group the active page belongs to
  const activeGroup = NAV_STRUCTURE.groups.find(g => g.pages.some(p => p.key === activePage));

  // ── Drawer HTML ──────────────────────────────────────
  const drawerHTML = NAV_STRUCTURE.groups.map(g => {
    const isActive = g.pages.some(p => p.key === activePage);
    const links = g.pages.map(p => {
      const active = p.key === activePage ? ' active' : '';
      return `<a class="ndw-link${active}" href="${p.href}">
        <span class="ndw-link-icon">${p.icon}</span>
        <span>${p.label}</span>
        ${p.key === activePage ? '<span class="ndw-active-dot"></span>' : ''}
      </a>`;
    }).join('');
    // Active group starts expanded, others start collapsed
    return `<div class="ndw-group${isActive ? '' : ' collapsed'}">
      <div class="ndw-group-hdr" onclick="toggleDrawerGroup(this)">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;">${g.icon}</span>
          <span class="ndw-group-label">${g.label}</span>
        </div>
        <span class="ndw-toggle-arrow">▼</span>
      </div>
      <div class="ndw-items">${links}</div>
    </div>`;
  }).join('');

  // ── Footer bar quick links (active group pages) ──────
  // Always show: ☰ | HOME | [active group pages] | SETTINGS
  let quickLinks = '';
  if (activeGroup) {
    quickLinks = activeGroup.pages.map(p => {
      const active = p.key === activePage ? ' active' : '';
      return `<a class="tnav-link${active}" href="${p.href}" title="${p.label}">
        <span class="tnav-link-icon">${p.icon}</span>
        <span class="tnav-link-label">${p.label}</span>
      </a>`;
    }).join('');
    // Add separator before the group
    quickLinks = `<span class="tnav-sep">${activeGroup.label}</span>` + quickLinks;
  }

  return `
<header class="top-header">
  <a class="top-header-logo" href="index.html">
    <img src="vic_icon.jpeg" alt="VIC" onerror="this.style.display='none'">
    <span class="vic-name">VIC</span>
  </a>
  <span class="top-header-page">${pageName}</span>
  <div class="top-header-right">
    <div class="srv-status">
      <div class="status-dot" id="srv-dot"></div>
      <span id="srv-txt" style="font-size:11px;"></span>
    </div>
    <a href="config.html" class="top-header-settings" title="Settings">⚙</a>
  </div>
</header>

<!-- Nav Drawer -->
<div class="nav-drawer-backdrop" id="nav-backdrop" onclick="closeNavDrawer()"></div>
<div class="nav-drawer" id="nav-drawer">
  <div class="ndw-header">
    <span class="ndw-title">VIC NAVIGATION</span>
    <button onclick="closeNavDrawer()" class="ndw-close">ESC ✕</button>
  </div>
  <!-- Pinned pages at top of drawer -->
  <div class="ndw-pinned">
    ${NAV_STRUCTURE.pinned.map(p => `
      <a class="ndw-pinned-link${p.key === activePage ? ' active' : ''}" href="${p.href}">
        <span>${p.icon}</span><span>${p.label}</span>
      </a>`).join('')}
  </div>
  <!-- Groups -->
  ${drawerHTML}
</div>

<!-- Footer nav bar -->
<nav class="term-footer-nav">
  <!-- ☰ Menu toggle -->
  <button class="tnav-toggle" onclick="toggleNavDrawer()" id="tnav-toggle-btn" title="Open menu">
    <span class="tnav-toggle-icon" id="tnav-toggle-ico">☰</span>
  </button>

  <!-- HOME — always pinned left -->
  <a class="tnav-pinned${activePage === 'index' ? ' active' : ''}" href="index.html" title="Home">
    <span class="tnav-pin-icon">⌂</span>
    <span class="tnav-pin-label">HOME</span>
  </a>

  <!-- Divider -->
  <div class="tnav-divider"></div>

  <!-- Current group quick links -->
  <div class="tnav-quick" id="tnav-quick">
    ${quickLinks || '<span class="tnav-sep" style="color:#1e4a1e;">SELECT A SECTION</span>'}
  </div>

</nav>
`;
}

function toggleNavDrawer() {
  const drawer   = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-backdrop');
  const icon     = document.getElementById('tnav-toggle-ico');
  const isOpen   = drawer.classList.contains('open');
  if (isOpen) {
    closeNavDrawer();
  } else {
    openNavDrawer();
  }
}

function openNavDrawer() {
  document.getElementById('nav-drawer')?.classList.add('open');
  document.getElementById('nav-backdrop')?.classList.add('open');
  const icon = document.getElementById('tnav-toggle-ico');
  if (icon) icon.textContent = '✕';
}

function closeNavDrawer() {
  document.getElementById('nav-drawer')?.classList.remove('open');
  document.getElementById('nav-backdrop')?.classList.remove('open');
  const icon = document.getElementById('tnav-toggle-ico');
  if (icon) icon.textContent = '☰';
}

function toggleDrawerGroup(hdr) {
  hdr.closest('.ndw-group').classList.toggle('collapsed');
}

// Close drawer on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNavDrawer(); });


// ═══════════════════════════════════════════
// SPORT + LEAGUE SYSTEM
// ═══════════════════════════════════════════
const SPORTS_MAP = {
  // Big 4 + Soccer
  basketball_nba:        { label:'NBA',   short:'NBA',   color:'#c9082a', bg:'rgba(201,8,42,0.12)',    logo:'https://a.espncdn.com/i/espn/misc_logos/500/nba.png' },
  americanfootball_nfl:  { label:'NFL',   short:'NFL',   color:'#013087', bg:'rgba(1,48,135,0.15)',    logo:'https://a.espncdn.com/i/espn/misc_logos/500/nfl.png' },
  baseball_mlb:          { label:'MLB',   short:'MLB',   color:'#002d72', bg:'rgba(0,45,114,0.15)',    logo:'https://a.espncdn.com/i/espn/misc_logos/500/mlb.png' },
  icehockey_nhl:         { label:'NHL',   short:'NHL',   color:'#6b7280', bg:'rgba(107,114,128,0.15)', logo:'https://a.espncdn.com/i/espn/misc_logos/500/nhl.png' },
  soccer_epl:            { label:'EPL',   short:'EPL',   color:'#3d185f', bg:'rgba(61,24,95,0.15)',    logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  soccer_usa_mls:        { label:'MLS',   short:'MLS',   color:'#005293', bg:'rgba(0,82,147,0.15)',    logo:'https://a.espncdn.com/i/leaguelogos/soccer/500/19374.png' },
  // College
  basketball_ncaab:      { label:'NCAAB', short:'NCAAB', color:'#ea580c', bg:'rgba(234,88,12,0.12)',   logo:'https://a.espncdn.com/i/espn/misc_logos/500/ncaa.png' },
  americanfootball_ncaaf:{ label:'NCAAF', short:'NCAAF', color:'#16a34a', bg:'rgba(22,163,74,0.12)',   logo:'https://a.espncdn.com/i/espn/misc_logos/500/ncaa.png' },
  // MMA / UFC
  mma_mixed_martial_arts:{ label:'MMA',   short:'MMA',   color:'#dc2626', bg:'rgba(220,38,38,0.12)',   logo:'https://a.espncdn.com/i/espn/misc_logos/500/mma.png' },
  // Tennis
  tennis_atp_aus_open:   { label:'Tennis',short:'ATP',   color:'#0ea5e9', bg:'rgba(14,165,233,0.12)',  logo:'https://a.espncdn.com/i/espn/misc_logos/500/tennis.png' },
  tennis_wta_aus_open:   { label:'Tennis',short:'WTA',   color:'#d946ef', bg:'rgba(217,70,239,0.12)',  logo:'https://a.espncdn.com/i/espn/misc_logos/500/tennis.png' },
};

const ESPN_NBA_IDS = { 'Hawks':1,'Celtics':2,'Nets':17,'Hornets':30,'Bulls':4,'Cavaliers':5,'Mavericks':6,'Nuggets':7,'Pistons':8,'Warriors':9,'Rockets':10,'Pacers':11,'Clippers':12,'Lakers':13,'Grizzlies':29,'Heat':14,'Bucks':15,'Timberwolves':16,'Pelicans':3,'Knicks':18,'Thunder':25,'Magic':19,'76ers':20,'Suns':21,'Trail Blazers':22,'Kings':23,'Spurs':24,'Raptors':28,'Jazz':26,'Wizards':27 };
const ESPN_NFL_IDS = { 'Cardinals':22,'Falcons':1,'Ravens':33,'Bills':2,'Panthers':29,'Bears':3,'Bengals':4,'Browns':5,'Cowboys':6,'Broncos':7,'Lions':8,'Packers':9,'Texans':34,'Colts':11,'Jaguars':30,'Chiefs':12,'Raiders':13,'Chargers':24,'Rams':14,'Dolphins':15,'Vikings':16,'Patriots':17,'Saints':18,'Giants':19,'Jets':20,'Eagles':21,'Steelers':23,'Seahawks':26,'49ers':25,'Buccaneers':27,'Titans':10,'Commanders':28 };

function getSportInfo(key) {
  return SPORTS_MAP[key] || { label:key.split('_').pop().toUpperCase(), short:key.split('_').pop().toUpperCase(), color:'#00a8ff', bg:'rgba(56,189,248,0.1)', logo:'' };
}

function sportBadge(key) {
  const s = getSportInfo(key);
  return `<span class="sport-badge ${s.short.toLowerCase()}">${s.short}</span>`;
}

function leagueLogo(sportKey, size) {
  const s = getSportInfo(sportKey);
  if (!s.logo) return '';
  const cls = size === 'lg' ? 'league-logo-lg' : 'league-logo';
  return `<img class="${cls}" src="${s.logo}" alt="${s.label}" onerror="this.style.display='none'">`;
}

function teamInitial(name, color) {
  color = color || '#00a8ff';
  const words = name.trim().split(' ');
  const init = words.length >= 2 ? words[words.length-2][0]+words[words.length-1][0] : name.slice(0,2);
  return `<div style="width:32px;height:32px;border-radius:8px;background:${color}22;border:1px solid ${color}44;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${color};flex-shrink:0;">${init.toUpperCase()}</div>`;
}

function teamLogo(teamName, sportKey, size) {
  const s = getSportInfo(sportKey);
  let logoUrl = '';
  if (sportKey === 'basketball_nba') {
    const k = Object.keys(ESPN_NBA_IDS).find(k => teamName.includes(k));
    if (k) logoUrl = `https://a.espncdn.com/i/teamlogos/nba/500/${ESPN_NBA_IDS[k]}.png`;
  } else if (sportKey === 'americanfootball_nfl') {
    const k = Object.keys(ESPN_NFL_IDS).find(k => teamName.includes(k));
    if (k) logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${ESPN_NFL_IDS[k]}.png`;
  }
  if (!logoUrl) return teamInitial(teamName, s.color);
  const cls = size === 'sm' ? 'team-logo-sm' : 'team-logo';
  return `<img class="${cls}" src="${logoUrl}" alt="${teamName}" onerror="this.style.display='none'">`;
}

function sportSectionHeader(sportKey) {
  const s = getSportInfo(sportKey);
  return `<div class="sport-section"><div style="width:4px;height:24px;background:${s.color};border-radius:2px;flex-shrink:0;"></div>${leagueLogo(sportKey)}<span class="sport-section-label" style="color:${s.color};">${s.label}</span><div class="sport-section-bar" style="background:linear-gradient(90deg,${s.color}33,transparent);"></div></div>`;
}

function shortTeamName(name) {
  return name.trim().split(' ').pop();
}

function fmtOdds(o) { return o > 0 ? '+' + o : String(o); }
function toImplied(o) {
  o = parseInt(o);
  return o > 0 ? (100/(o+100)*100).toFixed(1) : (Math.abs(o)/(Math.abs(o)+100)*100).toFixed(1);
}
function calcProfit(odds, units, result) {
  if (result === 'win') { const o = parseInt(odds); return o > 0 ? units*(o/100) : units*(100/Math.abs(o)); }
  if (result === 'loss') return -units;
  return 0;
}
function loading(id, msg) {
  msg = msg || 'Loading...';
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span>${msg}</span></div>`;
}
function edgePips(score, max) {
  max = max || 12;
  return Array.from({length:max},(_,i) => `<div class="pip ${i<score?(score>=10?'hot':'on'):''}"></div>`).join('');
}
function badgeClass(rec) {
  rec = (rec||'').toUpperCase();
  if (rec.includes('STRONG')) return 'b-green';
  if (rec.includes('LEAN')) return 'b-amber';
  if (rec.includes('PASS')||rec.includes('FADE')) return 'b-red';
  return 'b-blue';
}

