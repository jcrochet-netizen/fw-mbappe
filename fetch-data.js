#!/usr/bin/env node
/**
 * Football Whispers – Players widget data fetcher
 * --------------------------------------------------
 * Pulls data from the SportMonks Football API (same token as the DataBetting project)
 * for 4 players, aggregates two stat blocks each, and writes:
 *   - data.json                  (raw computed data, for reference / re-use)
 *   - index.html                 (self-contained widget with the data baked in)
 *
 * Two stat blocks per player:
 *   1. Season 2025/2026, all CLUB competitions combined → matches, goals, assists
 *   2. National team since the 2022 World Cup (matches played after 2022-12-18)
 *      → country, matches, goals, assists
 *
 * Re-run any time to refresh the numbers:  node fetch-data.js
 */

const fs = require("fs");
const path = require("path");

// Load token from a local .env file if present (kept out of git).
function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

// SportMonks token — supplied via env var or .env (never hard-coded / committed).
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
if (!API_TOKEN) {
  console.error(
    "✗ Missing SPORTMONKS_API_TOKEN.\n" +
      "  Create a .env file next to this script with:\n" +
      "    SPORTMONKS_API_TOKEN=your_token_here\n" +
      "  (see .env.example)"
  );
  process.exit(1);
}

const BASE = "https://api.sportmonks.com/v3/football";

// The 4 players, with confirmed SportMonks IDs.
// clubSeason = the SportMonks season name to treat as the current campaign.
// MLS (Messi) uses calendar-year seasons, so there is no "2025/2026" → use "2026".
const PLAYERS = [
  { id: 997, label: "Harry Kane", clubSeason: "2025/2026", seasonLabel: "2025/2026" },
  { id: 96611, label: "Kylian Mbappé", clubSeason: "2025/2026", seasonLabel: "2025/2026" },
  { id: 580, label: "Cristiano Ronaldo", clubSeason: "2025/2026", seasonLabel: "2025/2026" },
  { id: 184798, label: "Lionel Messi", clubSeason: "2026", seasonLabel: "2026 · MLS" },
];

// 2022 World Cup final was 2022-12-18. "Since the World Cup" = matches starting after that.
const WC_CUTOFF = "2022-12-18";

function num(detailValue) {
  // SportMonks detail values are objects like { total: 12, ... }
  if (!detailValue) return 0;
  if (typeof detailValue === "number") return detailValue;
  return detailValue.total ?? 0;
}

function detailMap(block) {
  const map = {};
  for (const d of block.details || []) {
    const name = d.type?.name;
    if (name) map[name] = d.value;
  }
  return map;
}

function isClubFriendly(leagueName) {
  return /friendl/i.test(leagueName || "");
}

async function fetchPlayer(id) {
  const url =
    `${BASE}/players/${id}?api_token=${API_TOKEN}` +
    `&include=statistics.details.type;statistics.season.league;statistics.team`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SportMonks ${res.status} ${res.statusText} for player ${id}`);
  }
  const json = await res.json();
  return json.data;
}

function aggregate(player, cfg) {
  const stats = player.statistics || [];

  // --- Block 1: current club season, all competitions combined (no friendlies) ---
  const club = { matches: 0, goals: 0, assists: 0, competitions: [] };
  for (const s of stats) {
    const season = s.season || {};
    const team = s.team || {};
    if (season.name !== cfg.clubSeason) continue;
    if (team.type === "national") continue; // club comps only here
    if (isClubFriendly(season.league?.name)) continue; // skip club friendlies
    const d = detailMap(s);
    const m = num(d["Appearances"]);
    const g = num(d["Goals"]);
    const a = num(d["Assists"]);
    if (m === 0 && g === 0 && a === 0) continue;
    club.matches += m;
    club.goals += g;
    club.assists += a;
    club.competitions.push({
      name: season.league?.name || "—",
      matches: m,
      goals: g,
      assists: a,
    });
  }

  // --- Block 2: national team since the 2022 World Cup ---
  const national = {
    country: null,
    matches: 0,
    goals: 0,
    assists: 0,
    competitions: [],
  };
  for (const s of stats) {
    const team = s.team || {};
    const season = s.season || {};
    if (team.type !== "national") continue;
    // keep only competition-seasons that started after the 2022 WC final
    const start = season.starting_at;
    if (!start || start <= WC_CUTOFF) continue;
    const d = detailMap(s);
    const m = num(d["Appearances"]);
    const g = num(d["Goals"]);
    const a = num(d["Assists"]);
    if (m === 0 && g === 0 && a === 0) continue;
    national.country = team.name || national.country;
    national.matches += m;
    national.goals += g;
    national.assists += a;
    national.competitions.push({
      name: season.league?.name || "—",
      season: season.name,
      matches: m,
      goals: g,
      assists: a,
    });
  }

  return {
    id: player.id,
    name: (player.display_name || player.name || "").trim(),
    image: player.image_path,
    season: cfg.seasonLabel,
    club,
    national,
  };
}

async function main() {
  console.log("Fetching SportMonks data for 4 players…\n");
  const out = [];
  for (const p of PLAYERS) {
    process.stdout.write(`  • ${p.label} (#${p.id}) … `);
    const raw = await fetchPlayer(p.id);
    const agg = aggregate(raw, p);
    out.push(agg);
    console.log(
      `OK — ${agg.season}: ${agg.club.matches} M / ${agg.club.goals} B / ${agg.club.assists} PD` +
        ` | ${agg.national.country} since WC22: ${agg.national.matches} M / ${agg.national.goals} B / ${agg.national.assists} PD`
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "SportMonks Football API v3",
    players: out,
  };

  fs.writeFileSync(
    path.join(__dirname, "data.json"),
    JSON.stringify(payload, null, 2)
  );
  console.log("\n✓ data.json written");

  const html = buildHtml(payload);
  fs.writeFileSync(path.join(__dirname, "index.html"), html);
  console.log("✓ index.html written (self-contained widget)");
}

// ---------------------------------------------------------------------------
// Widget HTML (data baked in, no external JS, ready to embed)
// ---------------------------------------------------------------------------
function buildHtml(payload) {
  const dataLiteral = JSON.stringify(payload);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Football Whispers – Legends</title>
<style>
  /* Palette Football Whispers (extraite du thème du site) */
  :root {
    --fw-green: #01644a;     /* vert signature FW */
    --fw-green-2: #077356;
    --fw-green-lt: #44bd32;  /* vert vif */
    --fw-gold: #e8a72c;      /* or/ambre FW */
    --fw-ink: #1b1b1b;       /* quasi-noir, titres & valeurs */
    --fw-muted: #6c757d;     /* gris texte secondaire */
    --fw-line: #e6e8ea;      /* bordures claires */
    --fw-panel: #f5f6f7;     /* fond des cellules de stats */
    --fw-bg: #ffffff;
  }
  * { box-sizing: border-box; }
  .fw-widget {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--fw-bg);
    color: var(--fw-ink);
    max-width: 800px;
    margin: 0 auto;
    padding: 14px;
    border: 1px solid var(--fw-line);
    border-radius: 12px;
  }
  .fw-grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(4, 1fr);
  }
  .fw-card {
    background: var(--fw-bg);
    border: 1px solid var(--fw-line);
    border-radius: 10px;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .fw-top {
    position: relative; height: 46px;
    background: linear-gradient(135deg, var(--fw-green) 0%, var(--fw-green-2) 100%);
  }
  .fw-avatar {
    position: absolute; left: 50%; bottom: -26px; transform: translateX(-50%);
    width: 56px; height: 56px; border-radius: 50%;
    border: 2.5px solid var(--fw-bg); background: var(--fw-panel);
    object-fit: cover; object-position: top center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  }
  .fw-name {
    margin-top: 30px; padding: 0 6px; text-align: center;
    font-size: 12.5px; font-weight: 800; line-height: 1.1; color: var(--fw-ink);
  }
  .fw-flag {
    text-align: center; color: var(--fw-muted); font-size: 10px;
    font-weight: 600; margin-top: 2px; padding-bottom: 8px;
  }
  .fw-block { padding: 0 8px 8px; }
  .fw-block-title {
    font-size: 8.5px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.4px; color: var(--fw-muted);
    display: flex; align-items: center; gap: 4px; margin: 6px 0 5px;
  }
  .fw-bar { width: 3px; height: 10px; border-radius: 2px; }
  .fw-bar.club { background: var(--fw-green); }
  .fw-bar.nat { background: var(--fw-gold); }
  .fw-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .fw-stat {
    background: var(--fw-panel);
    border-radius: 7px; padding: 6px 2px; text-align: center;
  }
  .fw-stat.club { box-shadow: inset 0 -2px 0 rgba(1,100,74,0.35); }
  .fw-stat.nat { box-shadow: inset 0 -2px 0 rgba(232,167,44,0.45); }
  .fw-stat .v { font-size: 16px; font-weight: 800; line-height: 1; color: var(--fw-ink); }
  .fw-stat .l {
    font-size: 8px; font-weight: 700; color: var(--fw-muted);
    text-transform: uppercase; letter-spacing: 0.3px; margin-top: 3px;
  }
  .fw-foot {
    margin-top: 11px; text-align: center; color: var(--fw-muted); font-size: 9.5px;
  }
  .fw-foot a { color: var(--fw-green); text-decoration: none; font-weight: 600; }
  .fw-caption {
    font-size: 11px; font-weight: 600; color: var(--fw-ink); margin-bottom: 5px;
  }
  .fw-caption .fw-legend { color: var(--fw-muted); font-weight: 500; }
  /* Replis responsive : on garde une seule ligne le plus longtemps possible */
  @media (max-width: 540px) {
    .fw-grid { grid-template-columns: repeat(2, 1fr); }
    .fw-stat .v { font-size: 18px; }
    .fw-stat .l, .fw-block-title { font-size: 9px; }
  }
</style>
</head>
<body>
  <div class="fw-widget" id="fw-widget">
    <div class="fw-grid" id="fw-grid"></div>
    <div class="fw-foot">
      <div class="fw-caption">Current club season · For country since the 2022 World Cup
        &nbsp;—&nbsp; <span class="fw-legend">M&nbsp;matches · G&nbsp;goals · A&nbsp;assists</span></div>
      Data by <a href="https://www.sportmonks.com" target="_blank" rel="noopener">SportMonks</a> ·
      updated <span id="fw-date"></span>
    </div>
  </div>

<script>
  const FW_DATA = ${dataLiteral};

  function block(label, kind, s) {
    return \`
      <div class="fw-block">
        <div class="fw-block-title"><span class="fw-bar \${kind}"></span>\${label}</div>
        <div class="fw-stats">
          <div class="fw-stat \${kind}"><div class="v">\${s.matches}</div><div class="l">M</div></div>
          <div class="fw-stat \${kind}"><div class="v">\${s.goals}</div><div class="l">G</div></div>
          <div class="fw-stat \${kind}"><div class="v">\${s.assists}</div><div class="l">A</div></div>
        </div>
      </div>\`;
  }

  function card(p) {
    return \`
      <div class="fw-card">
        <div class="fw-top"><img class="fw-avatar" src="\${p.image}" alt="\${p.name}" loading="lazy" /></div>
        <div class="fw-name">\${p.name}</div>
        <div class="fw-flag">\${p.national.country || ''}</div>
        \${block('Season ' + p.season, 'club', p.club)}
        \${block('Country · since 2022 WC', 'nat', p.national)}
      </div>\`;
  }

  document.getElementById('fw-grid').innerHTML = FW_DATA.players.map(card).join('');
  document.getElementById('fw-date').textContent =
    new Date(FW_DATA.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
</script>
</body>
</html>
`;
}

main().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
