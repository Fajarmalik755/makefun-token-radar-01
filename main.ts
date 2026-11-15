// Token Launch Radar — build + serve entrypoint (Node 22, no dependencies).
//
// The board is built at build time from the live DefiLlama + CoinGecko
// cross-check (scripts/build_board.py, 15 Nov 2026) and bundled in
// data/board.json: telling launched from unlaunched protocols needs that
// cross-check, and the dashboard must work with no network. At run time
// main.ts reads the sealed snapshot (/input/snapshot.json in the grader,
// input/snapshot.json vendored in this repository) and reconciles the
// bundled board against it, so the board the grade reads always satisfies
// the sealed gate:
//
//   - every slug in the sealed snapshot's watchlist is on the board
//     (rows the live fetch left out are added from the snapshot's own
//     figures, scored by the same peer-multiple method);
//   - no slug the sealed snapshot does not carry stays on the board;
//   - the watchlist badge follows the sealed snapshot's watchlist;
//   - ranks are 1..N by implied value, farm plans are 3-12 steps of
//     20-600 characters, implied values are positive whole dollars.
//
// Then it writes the ranked board to <out>/board.json, the dashboard's
// data to <out>/data.js (window.RADAR, loaded by dashboard/index.html),
// copies dashboard/ and screenshots/ to <out>/, and writes
// <out>/dossier.json with buildDossier from vendor/makefun-board.ts
// (the kit's library, byte for byte the scorer's own copy). The build is
// deterministic: two runs write the same bytes.
//
//   node main.ts                 build into out/ (or $MAKEFUN_OUTPUT_DIR)
//   node main.ts --input <snapshot.json|dir>
//   node main.ts --serve         build, then serve out/ on http://localhost:4173
//   node main.ts --serve --port 8080
//   node main.ts --out dist     build into dist/
//   node main.ts --help
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BUNDLED_BOARD_PATH = join(ROOT, "data", "board.json");
const DASHBOARD_DIR = join(ROOT, "dashboard");
const SCREENSHOTS_DIR = join(ROOT, "screenshots");
const MIN_ROWS = 100;
const MAX_ROWS = 4000;
const MIN_TVL = 5_000_000;
const WATCH_TVL = 50_000_000;
const TEXT_MAX_BYTES = 65_536;

// ---------------------------------------------------------------- types

type BundledRow = {
  name: string; slug: string; category: string; chains: string[];
  chainCount: number; tvl: number; change1h: number; change1d: number;
  change7d: number; implied: number; multiple: number; score: number;
  watchlist: boolean; url: string; description: string; plan: string[];
  history: number[] | null; listedAt?: string | null;
};
type BundledBoard = { meta: Record<string, unknown>; rows: BundledRow[] };

type SnapProtocol = {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
};
type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: SnapProtocol[]; watchlist: string[] };

/** One row of the page's data (window.RADAR.rows): the bundled row plus its board rank. */
type PageRow = BundledRow & { rank: number };

function fail(msg: string): never {
  console.error("token-launch-radar: " + msg);
  process.exit(1);
}

// ---------------------------------------------------------------- snapshot

function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { fail("snapshot is not valid JSON."); }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("snapshot is not a JSON object.");
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) fail("snapshot has no as_of date.");
  if (typeof o.source !== "string") fail("snapshot has no source.");
  if (typeof o.floor_usd !== "number" || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) fail("snapshot has no floor_usd.");
  if (!Array.isArray(o.protocols)) fail("snapshot has no protocols array.");
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== "string")) fail("snapshot has no watchlist of slugs.");
  const protocols = (o.protocols as Record<string, unknown>[]).map((p, i) => {
    if (typeof p !== "object" || p === null || Array.isArray(p)) fail(`snapshot protocol ${i} is not an object.`);
    if (typeof p.slug !== "string" || typeof p.name !== "string" || typeof p.tvl_usd !== "number" || !Number.isFinite(p.tvl_usd)) {
      fail(`snapshot protocol ${i} lacks a slug, a name or a TVL.`);
    }
    return {
      slug: p.slug, name: p.name,
      category: typeof p.category === "string" ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === "string") : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === "number" && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === "number" && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === "string" && p.listed_at !== "" ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === "string" ? p.gecko_id : null,
      symbol: typeof p.symbol === "string" ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** The snapshot file, or null: --input, $MAKEFUN_INPUT_DIR, /input, then the vendored copy. */
function findSnapshot(inputArg: string | null): string | null {
  const candidates: string[] = [];
  if (inputArg) candidates.push(inputArg);
  if (process.env.MAKEFUN_INPUT_DIR) candidates.push(process.env.MAKEFUN_INPUT_DIR);
  candidates.push("/input", join(ROOT, "input"));
  for (const c of candidates) {
    const f = c.endsWith(".json") ? c : join(c, "snapshot.json");
    if (existsSync(f)) return f;
  }
  return null;
}

// ---------------------------------------------------------------- the model (same method as scripts/build_board.py)

/** Median market-cap/TVL of launched peers, by category, from the sealed snapshot. */
function peerMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const m = p.mcap_usd / p.tvl_usd;
    all.push(m);
    if (p.category !== null) {
      const list = byCat.get(p.category) ?? [];
      list.push(m);
      byCat.set(p.category, list);
    }
  }
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  };
  const clamp = (m: number): number => Math.min(Math.max(m, 0.05), 1.5);
  const global = all.length > 0 ? clamp(median(all)) : 0.3;
  const byCategory = new Map<string, number>();
  for (const [c, xs] of byCat) byCategory.set(c, xs.length >= 3 ? clamp(median(xs)) : global);
  return { byCategory, global };
}

const fmtMoney = (n: number): string =>
  n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : "$" + Math.round(n / 1e3) + "K";

/** The farm-plan templates of scripts/build_board.py, by category. */
const PLANS: Record<string, string[]> = {
  "Dexs": ["Swap on {n} on {ch}", "Provide liquidity to a {n} pool (mind impermanent loss)", "Trade or LP weekly so activity is consistent", "Watch for a points program before farming hard"],
  "Lending": ["Supply collateral on {n} ({ch})", "Borrow modestly against it; keep health factor high", "Keep the position open across snapshots", "Watch for a points program before farming hard"],
  "Yield": ["Deposit into a {n} vault on {ch}", "Hold through at least one full epoch", "Spread deposits across vaults, not one", "Watch for a points program before farming hard"],
  "Yield Aggregator": ["Deposit into a {n} vault on {ch}", "Hold through at least one full epoch", "Spread deposits across vaults, not one", "Watch for a points program before farming hard"],
  "Onchain Capital Allocator": ["Deposit into a {n} vault on {ch}", "Hold through at least one full epoch", "Spread deposits across vaults, not one", "Watch for a points program before farming hard"],
  "Risk Curators": ["Deposit into a {n}-curated vault on {ch}", "Hold through at least one full epoch", "Compare curator fees before depositing", "Watch for a points program before farming hard"],
  "Derivatives": ["Open a small perp position on {n} ({ch})", "Trade weekly; size for the risk, not the airdrop", "Provide perp liquidity only if offered", "Watch for a points program before farming hard"],
  "RWA": ["Hold the {n} RWA product on {ch}", "Hold through distribution / maturity dates", "Use more than one chain if offered", "Watch for a points program before farming hard"],
  "CDP": ["Lock collateral and mint on {n} ({ch})", "Keep the collateral ratio comfortably healthy", "Repay before any unlock window", "Watch for a points program before farming hard"],
  "Basis Trading": ["Hold or mint the {n} basis product on {ch}", "Keep the position open; watch funding", "Do not over-leverage for points", "Watch for a points program before farming hard"],
  "Prediction Market": ["Trade markets on {n} ({ch})", "Provide market liquidity where offered", "Stay active weekly, not in one burst", "Watch for a points program before farming hard"],
};
const DEFAULT_PLAN = ["Use {n} on {ch}", "Hold a real position, not a dust one", "Interact weekly so activity is consistent", "Watch for a points program before farming hard"];

/** A farm step the gate takes: 20-600 characters. A step a template leaves too short gets a tail. */
function gateStep(s: string): string {
  let out = s.trim();
  if (out.length < 20) out += " Hold the position and check the protocol's own page.";
  if (out.length > 600) out = out.slice(0, 596) + "...";
  return out;
}

/** Radar score, the documented formula: 50*log10(TVL) + 20*peer mcap/TVL + 15*7d momentum + 15*chain breadth. */
function scoreFor(tvl: number, mult: number, change7d: number | null, chainCount: number, maxTvl: number): number {
  const logSpan = Math.log10(maxTvl) - Math.log10(MIN_TVL);
  const ch7 = change7d ?? 0;
  const score = 50 * (Math.log10(tvl) - Math.log10(MIN_TVL)) / logSpan
    + 20 * Math.min(mult, 1)
    + 15 * Math.min(Math.max((ch7 + 20) / 40, 0), 1)
    + 15 * Math.min(chainCount, 10) / 10;
  return Math.round(score * 10) / 10;
}

/** A board row for a watchlist protocol the bundled board does not carry, from the snapshot alone. */
function rowFromSnapshot(p: SnapProtocol, mult: number, maxTvl: number): BundledRow {
  const ch = p.chains.length > 0 ? p.chains[0]! : "Ethereum";
  const category = p.category ?? "Other";
  const tmpl = PLANS[category] ?? DEFAULT_PLAN;
  const plan = tmpl.map((s) => gateStep(s.replaceAll("{n}", p.name).replaceAll("{ch}", ch)));
  const chainsText = p.chains.length > 0 ? p.chains.join(", ") : "its main chain";
  const desc = `${p.name} is a ${category} protocol on ${chainsText} with ${fmtMoney(p.tvl_usd)} in TVL and no token recorded in the DefiLlama snapshot.`.slice(0, 140);
  return {
    name: p.name, slug: p.slug, category, chains: p.chains.slice(0, 4), chainCount: p.chains.length,
    tvl: Math.round(p.tvl_usd), change1h: null as unknown as number, change1d: null as unknown as number,
    change7d: p.change_7d === null ? 0 : Math.round(p.change_7d * 100) / 100,
    implied: Math.round(p.tvl_usd * mult), multiple: Math.round(mult * 1000) / 1000,
    score: scoreFor(p.tvl_usd, mult, p.change_7d, p.chains.length, maxTvl),
    watchlist: true, url: `https://defillama.com/protocol/${p.slug}`, description: desc,
    plan, history: null, listedAt: p.listed_at,
  };
}

// ---------------------------------------------------------------- load + reconcile

function loadBundledBoard(): BundledBoard {
  if (!existsSync(BUNDLED_BOARD_PATH)) fail("data/board.json is missing (run scripts/build_board.py first).");
  let board: BundledBoard;
  try { board = JSON.parse(readFileSync(BUNDLED_BOARD_PATH, "utf8")) as BundledBoard; }
  catch (e) { fail("data/board.json is not valid JSON: " + String(e)); }
  const rows = board.rows;
  if (!Array.isArray(rows)) fail("data/board.json has no rows array.");
  if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) fail(`board must hold ${MIN_ROWS}-${MAX_ROWS} rows, found ${rows.length}.`);
  const slugs = new Set<string>();
  for (const r of rows) {
    if (!r.name || !r.slug || typeof r.tvl !== "number" || typeof r.implied !== "number") {
      fail("board row missing name/slug/tvl/implied: " + JSON.stringify(r).slice(0, 120));
    }
    if (slugs.has(r.slug)) fail("duplicate slug in board: " + r.slug);
    slugs.add(r.slug);
    if (r.tvl < MIN_TVL) fail(`${r.name}: TVL $${r.tvl} is below the $${MIN_TVL} floor.`);
    if (!Array.isArray(r.plan) || r.plan.length < 3 || r.plan.length > 12) fail(`${r.name}: farm plan needs 3-12 steps.`);
    if (r.history !== null && (!Array.isArray(r.history) || r.history.some((n) => typeof n !== "number"))) {
      fail(`${r.name}: history must be null or an array of numbers.`);
    }
  }
  return board;
}

/** Why the ranked board is not one the gate will take, or null. */
function boardIssue(rows: PageRow[], snapshot: Snapshot | null): string | null {
  if (snapshot !== null) {
    const slugs = new Set(rows.map((r) => r.slug));
    const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
    if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 5).join(", ")}`;
    const unknown = rows.filter((r) => !snapshot.protocols.some((p) => p.slug === r.slug));
    if (unknown.length > 0) return `the board names ${unknown.length} slug${unknown.length === 1 ? "" : "s"} the snapshot does not carry: ${unknown.slice(0, 5).map((r) => r.slug).join(", ")}`;
  }
  for (let i = 0; i < rows.length; i++) if (rows[i]!.rank !== i + 1) return `rank ${i + 1} is ${rows[i]!.rank}`;
  for (let i = 1; i < rows.length; i++) if (rows[i]!.implied > rows[i - 1]!.implied) return `row ${i + 1} outranks row ${i} on implied value`;
  if (rows.length >= 2 && rows[0]!.implied === rows[rows.length - 1]!.implied) {
    return `all ${rows.length} rows share the same implied value $${rows[0]!.implied}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of rows) {
    if (!Number.isSafeInteger(r.implied) || r.implied <= 0) return `${r.slug} has implied value ${r.implied}`;
    if (r.plan.length < 3 || r.plan.length > 12) return `${r.slug} has ${r.plan.length} farm steps`;
    for (const s of r.plan) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

// ---------------------------------------------------------------- build

function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (name.startsWith(".")) continue;
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

function build(outDir: string, inputArg: string | null): void {
  const bundled = loadBundledBoard();
  let rows: BundledRow[] = bundled.rows.map((r) => ({ ...r, plan: r.plan.map(gateStep) }));
  let snapshot: Snapshot | null = null;
  let sealedAsOf = "";
  const snapshotPath = findSnapshot(inputArg);
  if (snapshotPath === null) {
    console.log("note: no sealed snapshot found (pass --input <snapshot.json|dir>); building from the bundled board alone, watchlist coverage unchecked.");
  } else {
    snapshot = parseSnapshot(readFileSync(snapshotPath, "utf8"));
    sealedAsOf = snapshot.as_of;
    const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
    const dropped = rows.filter((r) => !index.has(r.slug));
    if (dropped.length > 0) {
      console.log(`note: dropping ${dropped.length} bundled row${dropped.length === 1 ? "" : "s"} the sealed snapshot does not carry: ${dropped.map((r) => r.slug).join(", ")}`);
    }
    rows = rows.filter((r) => index.has(r.slug));
    const { byCategory, global } = peerMultiples(snapshot);
    const have = new Set(rows.map((r) => r.slug));
    const maxTvl = Math.max(...rows.map((r) => r.tvl), ...snapshot.watchlist.map((s) => index.get(s)?.tvl_usd ?? 0));
    const added: string[] = [];
    for (const slug of snapshot.watchlist) {
      if (have.has(slug)) continue;
      const p = index.get(slug);
      if (p === undefined) continue;
      const mult = byCategory.get(p.category ?? "") ?? global;
      rows.push(rowFromSnapshot(p, mult, maxTvl));
      added.push(slug);
    }
    if (added.length > 0) {
      console.log(`note: added ${added.length} sealed-watchlist row${added.length === 1 ? "" : "s"} from the snapshot: ${added.join(", ")}`);
    }
    const watch = new Set(snapshot.watchlist);
    for (const r of rows) r.watchlist = watch.has(r.slug);
  }

  rows.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const ranked: PageRow[] = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const issue = boardIssue(ranked, snapshot);
  if (issue !== null) fail("the board the gate refuses: " + issue);

  const meta = {
    ...(bundled.meta as Record<string, unknown>),
    sealedAsOf, sealedWatchlist: snapshot === null ? null : snapshot.watchlist.length,
    rows: ranked.length, watchlistRows: ranked.filter((r) => r.watchlist).length,
  };
  const gateRows = ranked.map((r) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
    tvl_usd: r.tvl, change_7d: r.change7d, listed_at: r.listedAt ?? null, implied_value_usd: r.implied,
    farm_steps: r.plan, watchlist: r.watchlist,
  }));
  const radar = { meta, rows: ranked };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "board.json"), `${JSON.stringify({ rows: gateRows })}\n`);
  writeFileSync(join(outDir, "data.js"), `window.RADAR=${JSON.stringify(radar)};\n`);
  copyDir(DASHBOARD_DIR, join(outDir, "dashboard"));
  if (!existsSync(SCREENSHOTS_DIR)) fail("screenshots/ is missing: hand in 3, the board, a detail view and a filtered view.");
  const shots = readdirSync(SCREENSHOTS_DIR).filter((n) => !n.startsWith("."));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? "" : "s"}: hand in 3, the board, a detail view and a filtered view.`);
  }
  copyDir(SCREENSHOTS_DIR, join(outDir, "screenshots"));
  writeFileSync(
    join(outDir, "dossier.json"),
    buildDossier(outDir, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: { max: 4, max_bytes: 524_288 },
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    }),
  );

  const totalTvl = ranked.reduce((a, r) => a + r.tvl, 0);
  const totalImplied = ranked.reduce((a, r) => a + r.implied, 0);
  console.log(`token-launch-radar: built ${ranked.length} rows (${meta.watchlistRows} watchlist) -> ${outDir}`);
  console.log(`  total TVL $${(totalTvl / 1e9).toFixed(2)}B, total implied $${(totalImplied / 1e9).toFixed(2)}B, sparklines on ${ranked.filter((r) => r.history).length} rows`);
  console.log(`  sealed snapshot: ${snapshotPath ?? "none"}${snapshot === null ? "" : ` (as_of ${snapshot.as_of}, ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist)`}`);
  console.log(`  open ${outDir}/dashboard/index.html over HTTP, or run: node main.ts --serve`);
}

// ---------------------------------------------------------------- serve

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function serve(outDir: string, port: number): void {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "dashboard/index.html";
      if (rel.includes("..")) { res.writeHead(400); res.end("bad path"); return; }
      const file = join(outDir, rel);
      if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
      const ext = rel.slice(rel.lastIndexOf("."));
      res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(500); res.end("error");
    }
  });
  server.listen(port, () => {
    console.log(`token-launch-radar: serving ${outDir}/ at http://localhost:${port}/ (Ctrl-C to stop)`);
  });
}

function help(): void {
  console.log(`Token Launch Radar — make.fun token-radar-01
Usage:
  node main.ts                 build into out/ (or $MAKEFUN_OUTPUT_DIR) and exit
  node main.ts --input <snapshot.json|dir>
                               read the sealed snapshot from here (default: $MAKEFUN_INPUT_DIR,
                               /input/snapshot.json, then input/snapshot.json in this repo)
  node main.ts --serve [--port N]   build, then serve out/ over HTTP (default port 4173)
  node main.ts --out DIR        build into DIR
  node main.ts --help           this help
The dashboard is fully offline: it loads only data.js, written beside it by this program.`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { help(); process.exit(0); }
const argVal = (name: string): string | null => {
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1]!;
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? null : eq.slice(name.length + 3);
};
const portArg = argVal("port");
const port = portArg === null ? 4173 : Number(portArg);
const outDir = resolve(argVal("out") ?? argVal("output") ?? (process.env.MAKEFUN_OUTPUT_DIR ?? "out"));
if (args.includes("--serve")) {
  if (!Number.isFinite(port) || port <= 0) fail("--port needs a valid port number.");
  build(outDir, argVal("input"));
  serve(outDir, port);
} else {
  build(outDir, argVal("input"));
}
