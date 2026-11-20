// Launch Radar: a fitted value model over the sealed snapshot, written from scratch.
//
// The board ranks pre-token protocols by expected value: a comps-fitted implied
// value (log-log OLS of market cap on TVL over the 128 traded tokens that record
// both, plus a shrinkage median market-cap/TVL ratio per category) times token
// odds (the traded share of the protocol's own age/TVL/growth bucket, shrunk
// toward the snapshot's global traded rate). Live-token protocols are kept apart
// and shown at the market's own value. No protocol name is special-cased: every
// row is scored by the same functions below, from the snapshot's own figures.
//
// Nothing here reaches the network and nothing reads the wall clock: the only
// date used is the snapshot's as_of, so two runs over the same bytes are identical.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-2-comps-fit';

/** How many live-token protocols the separate Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Shrinkage strength (in pseudo-counts) for a category's median ratio. */
const RATIO_SHRINK_K = 8;

/** Shrinkage strength (in pseudo-counts) for a bucket's token odds. */
const ODDS_SHRINK_K = 12;

/** One qualifying wallet's assumed share of an implied value (1 in 20,000). */
const FARMER_SHARE = 1 / 20_000;

/** Verdict cut-offs on farmer expected value versus the cost of farming.
 * An airdrop is uncertain, so the bar is a margin of safety, not break-even:
 * FARM when the expected payout covers the cost ten times over, THIN at three. */
const VERDICT_FARM_MULT = 10;
const VERDICT_THIN_MULT = 3;

/** A category's shrunk ratio may not exceed this multiple of the global upper quartile:
 * a one-comp category (a single traded token with a wild multiple) must not set the board. */
const RATIO_CAP_MULT = 2;

/** A farm step as one string: action, then its cost and time. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  watchlist: boolean;
  token_status: 'pre-token';
  /** The ranking value: expected value in whole dollars, non-increasing with rank. */
  implied_value_usd: number;
  /** Implied value before token odds are applied. */
  gross_implied_usd: number;
  token_odds: number;
  expected_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  model: {
    ratio_category: number;
    ratio_category_n: number;
    ratio_global: number;
    log_log_intercept: number;
    log_log_slope: number;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    odds_bucket: string;
    odds_bucket_n: number;
  };
  farm: {
    capital_usd: number;
    main_chain: string;
    gas_per_tx_usd: number;
    gas_total_usd: number;
    total_cost_usd: number;
    farmer_ev_usd: number;
    ev_per_100_usd: number;
    net_usd: number;
    break_even_expected_usd: number;
    hold_days: number;
    verdict: 'FARM' | 'THIN' | 'SKIP';
  };
  farm_steps: string[];
}

/** One live-token protocol: the market's own value, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl_ratio: number;
}

/** Held-out validation of the pricing model, fitted and tested on comps only. */
export interface ValidationResult {
  split_half_1: { train_n: number; test_n: number; mape: number; median_ape: number; hit_rate_within_2x: number };
  split_half_2: { train_n: number; test_n: number; mape: number; median_ape: number; hit_rate_within_2x: number };
  leave_one_out: { n: number; mape: number; median_ape: number; hit_rate_within_2x: number };
}

/** The fitted model, as the dashboard states it. */
export interface ModelFit {
  comps_n: number;
  log_log_intercept: number;
  log_log_slope: number;
  r_squared: number;
  ratio_global_median: number;
  ratio_global_q25: number;
  ratio_global_q75: number;
  /** Ceiling on any category's shrunk ratio: twice the global upper quartile. */
  ratio_cap: number;
  ref_tvl_usd: number;
  global_traded_rate: number;
  validation: ValidationResult;
}

/** The integrity strip: where every one of the snapshot's protocols went. */
export interface Integrity {
  total: number;
  ranked: number;
  watchlist_ranked: number;
  below_floor_ranked: number;
  traded_set_aside: number;
  excluded: number;
  excluded_by_reason: Record<string, number>;
  check_total: number;
}

/** Everything the dashboard needs, written to data.js as window.RADAR. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelFit;
  watchlist_size: number;
  board_size: number;
  integrity: Integrity;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted-ascending copy; null on an empty list. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The p-th quantile (linear interpolation) of a list; null on an empty list. */
function quantileOf(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const pos = p * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/* ------------------------------------------------------------------ */
/* The comps fit: log-log OLS plus shrinkage category ratios.          */
/* ------------------------------------------------------------------ */

/** The traded tokens that can anchor a fit: a market cap and a TVL, both above zero. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0);
}

/** Ordinary least squares of log(mcap) on log(tvl): intercept, slope, R squared. */
export function logLogOls(comps: SnapshotProtocol[]): { intercept: number; slope: number; r2: number } {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    sst += (ys[i]! - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  return { intercept, slope, r2: sst === 0 ? 0 : 1 - ssr / sst };
}

interface CategoryStats {
  n: number;
  median: number;
  q25: number;
  q75: number;
  shrunkMedian: number;
  shrunkQ25: number;
  shrunkQ75: number;
}

/** Per-category ratio stats, each shrunk toward the global figure by RATIO_SHRINK_K,
 * then capped at RATIO_CAP_MULT times the global upper quartile. */
function categoryStats(comps: SnapshotProtocol[], globalMedian: number, globalQ25: number, globalQ75: number): Map<string, CategoryStats> {
  const cap = RATIO_CAP_MULT * globalQ75;
  const byCat = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? '(no category)';
    const list = byCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, list);
  }
  const out = new Map<string, CategoryStats>();
  for (const [key, ratios] of byCat) {
    const n = ratios.length;
    const med = medianOf(ratios) ?? globalMedian;
    const q25 = quantileOf(ratios, 0.25) ?? globalQ25;
    const q75 = quantileOf(ratios, 0.75) ?? globalQ75;
    out.set(key, {
      n,
      median: med,
      q25,
      q75,
      shrunkMedian: Math.min(cap, (n * med + RATIO_SHRINK_K * globalMedian) / (n + RATIO_SHRINK_K)),
      shrunkQ25: Math.min(cap, (n * q25 + RATIO_SHRINK_K * globalQ25) / (n + RATIO_SHRINK_K)),
      shrunkQ75: Math.min(cap, (n * q75 + RATIO_SHRINK_K * globalQ75) / (n + RATIO_SHRINK_K)),
    });
  }
  return out;
}

/** The whole fit from one comps set: OLS, global ratios, reference TVL, category table. */
interface FitParts {
  ols: { intercept: number; slope: number; r2: number };
  globalMedian: number;
  globalQ25: number;
  globalQ75: number;
  refTvl: number;
  cats: Map<string, CategoryStats>;
}

function fitParts(comps: SnapshotProtocol[]): FitParts {
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = medianOf(ratios) ?? 0;
  const globalQ25 = quantileOf(ratios, 0.25) ?? 0;
  const globalQ75 = quantileOf(ratios, 0.75) ?? 0;
  return {
    ols: logLogOls(comps),
    globalMedian,
    globalQ25,
    globalQ75,
    refTvl: medianOf(comps.map((p) => p.tvl_usd)) ?? 1,
    cats: categoryStats(comps, globalMedian, globalQ25, globalQ75),
  };
}

/** The size correction from the log-log slope: big protocols earn a lower multiple. */
function sizeFactor(tvl: number, refTvl: number, slope: number): number {
  return (tvl / refTvl) ** (slope - 1);
}

/** A comp's predicted market cap under a fit: ratio times size correction times TVL. */
function predictMcap(p: SnapshotProtocol, parts: FitParts): number {
  const cat = parts.cats.get(p.category ?? '(no category)');
  const ratio = cat !== undefined ? cat.shrunkMedian : parts.globalMedian;
  return Math.max(1, p.tvl_usd * ratio * sizeFactor(p.tvl_usd, parts.refTvl, parts.ols.slope));
}

/** Mean absolute percentage error and the within-2x hit rate of predictions. */
function scorePredictions(pairs: Array<{ actual: number; predicted: number }>): { mape: number; medianApe: number; hitRate: number } {
  const apes = pairs.map(({ actual, predicted }) => Math.abs(predicted - actual) / actual);
  const hits = pairs.filter(({ actual, predicted }) => predicted >= actual / 2 && predicted <= actual * 2).length;
  return {
    mape: apes.reduce((a, b) => a + b, 0) / apes.length,
    medianApe: medianOf(apes) ?? 0,
    hitRate: pairs.length === 0 ? 0 : hits / pairs.length,
  };
}

/**
 * Held-out validation of the pricing model, on the comps only.
 * Split-half is run twice (even/odd by slug, then first/second half by slug),
 * each time fitting on one half and testing on the other, both directions, so
 * every comp is scored held-out in each split. Leave-one-out refits on the
 * other 127 comps for each comp in turn.
 */
export function validateModel(comps: SnapshotProtocol[]): ValidationResult {
  const bySlug = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const runSplit = (a: SnapshotProtocol[], b: SnapshotProtocol[]): { mape: number; medianApe: number; hitRate: number } => {
    const tested: Array<{ actual: number; predicted: number }> = [];
    for (const [train, test] of [[a, b], [b, a]] as const) {
      const parts = fitParts(train);
      for (const p of test) tested.push({ actual: p.mcap_usd!, predicted: predictMcap(p, parts) });
    }
    const s = scorePredictions(tested);
    return { mape: s.mape, medianApe: s.medianApe, hitRate: s.hitRate };
  };
  const even = bySlug.filter((_, i) => i % 2 === 0);
  const odd = bySlug.filter((_, i) => i % 2 === 1);
  const half = Math.floor(bySlug.length / 2);
  const first = bySlug.slice(0, half);
  const second = bySlug.slice(half);
  const s1 = runSplit(even, odd);
  const s2 = runSplit(first, second);
  const looTested: Array<{ actual: number; predicted: number }> = [];
  for (let i = 0; i < bySlug.length; i++) {
    const train = bySlug.filter((_, j) => j !== i);
    const parts = fitParts(train);
    looTested.push({ actual: bySlug[i]!.mcap_usd!, predicted: predictMcap(bySlug[i]!, parts) });
  }
  const loo = scorePredictions(looTested);
  return {
    split_half_1: { train_n: even.length, test_n: bySlug.length, mape: round4(s1.mape), median_ape: round4(s1.medianApe), hit_rate_within_2x: round4(s1.hitRate) },
    split_half_2: { train_n: first.length, test_n: bySlug.length, mape: round4(s2.mape), median_ape: round4(s2.medianApe), hit_rate_within_2x: round4(s2.hitRate) },
    leave_one_out: { n: bySlug.length, mape: round4(loo.mape), median_ape: round4(loo.medianApe), hit_rate_within_2x: round4(loo.hitRate) },
  };
}

/* ------------------------------------------------------------------ */
/* Rankability: the watchlist rule, applied to every row.              */
/* ------------------------------------------------------------------ */

/** Categories the watchlist rule keeps off the board. `Restaking` is a staked product
 * even though the house's list names only its liquid and restaked-BTC siblings. */
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Restaking']);

/** A name ending in a version marker is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked, staking, restaking or restaked in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking|restaking|restaked)\b/i;

/** Exchange names that may not open a protocol's name. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The first reason a pre-token protocol is not rankable, or null when it is. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return p.category;
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped-or-staked-name';
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return 'exchange-name';
  return null;
}

/** Whether a pre-token protocol may be ranked: it passes the whole watchlist rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/* ------------------------------------------------------------------ */
/* Token odds: the traded share of the protocol's own bucket.           */
/* ------------------------------------------------------------------ */

function ageBand(age: number | null): string {
  if (age === null) return 'age-unknown';
  if (age < 365) return 'age-under-1y';
  if (age < 730) return 'age-1-2y';
  if (age < 1460) return 'age-2-4y';
  return 'age-over-4y';
}

function tvlBand(tvl: number): string {
  if (tvl < 50_000_000) return 'tvl-under-50m';
  if (tvl < 250_000_000) return 'tvl-50-250m';
  return 'tvl-over-250m';
}

function growthBand(change7d: number | null): string {
  if (change7d === null) return 'growth-unknown';
  if (change7d < -5) return 'growth-down';
  if (change7d <= 5) return 'growth-flat';
  return 'growth-up';
}

function bucketKey(p: SnapshotProtocol, age: number | null): string {
  return `${ageBand(age)}|${tvlBand(p.tvl_usd)}|${growthBand(p.change_7d)}`;
}

/** Token odds per bucket: traded share, shrunk toward the global traded rate. */
function oddsTable(snapshot: Snapshot): { table: Map<string, { odds: number; n: number }>; globalRate: number } {
  const buckets = new Map<string, { traded: number; total: number }>();
  let tradedTotal = 0;
  for (const p of snapshot.protocols) {
    const key = bucketKey(p, ageDays(snapshot.as_of, p.listed_at));
    const b = buckets.get(key) ?? { traded: 0, total: 0 };
    b.total += 1;
    if (!isPreToken(p)) {
      b.traded += 1;
      tradedTotal += 1;
    }
    buckets.set(key, b);
  }
  const globalRate = snapshot.protocols.length === 0 ? 0 : tradedTotal / snapshot.protocols.length;
  const table = new Map<string, { odds: number; n: number }>();
  for (const [key, b] of buckets) {
    table.set(key, {
      odds: (b.traded + ODDS_SHRINK_K * globalRate) / (b.total + ODDS_SHRINK_K),
      n: b.total,
    });
  }
  return { table, globalRate };
}

/* ------------------------------------------------------------------ */
/* Implied value, gas, and the costed farm plan.                       */
/* ------------------------------------------------------------------ */

/** Growth clamped to the model's window, in per cent. */
function growthPct(change7d: number | null): number {
  return Math.min(120, Math.max(-60, finite(change7d, 0)));
}

/** Maturity from age: 0.6 at day zero, 1.0 at three years; unknown age counts as a year. */
function maturityMult(age: number | null): number {
  const days = age ?? 365;
  return 0.6 + (Math.min(Math.max(days, 0), 1095) / 1095) * 0.4;
}

/** Typical gas for one transaction on a chain, in whole dollars (snapshot-date estimates). */
const GAS_PER_TX: Record<string, number> = {
  Ethereum: 6,
  Solana: 0.02,
  Base: 0.1,
  Arbitrum: 0.15,
  Optimism: 0.1,
  BSC: 0.15,
  Avalanche: 0.3,
  Polygon: 0.05,
  Unichain: 0.1,
  Berachain: 0.2,
  Sui: 0.05,
  Aptos: 0.05,
  Tron: 0.5,
  Linea: 0.1,
  Scroll: 0.15,
  'zkSync Era': 0.15,
  Blast: 0.1,
  Mode: 0.05,
  Gnosis: 0.1,
  Fantom: 0.1,
  Cronos: 0.1,
  Hyperliquid: 0.02,
  Sei: 0.05,
  Mantle: 0.1,
  Starknet: 0.2,
  Near: 0.02,
  Cardano: 0.2,
  TON: 0.05,
  Cosmos: 0.05,
  Osmosis: 0.05,
  Injective: 0.02,
};

function gasFor(chain: string | undefined): number {
  if (chain === undefined) return 1;
  return GAS_PER_TX[chain] ?? 1;
}

/** The capital one farm position needs, from the protocol's own TVL and category. */
function capitalFor(p: SnapshotProtocol): number {
  let capital: number;
  if (p.tvl_usd >= 1_000_000_000) capital = 250;
  else if (p.tvl_usd >= 250_000_000) capital = 200;
  else if (p.tvl_usd >= 100_000_000) capital = 150;
  else if (p.tvl_usd >= 50_000_000) capital = 100;
  else capital = 50;
  const c = (p.category ?? '').toLowerCase();
  if ((c.includes('rwa') || c.includes('risk curator') || c.includes('capital allocator')) && capital < 100) capital = 100;
  return capital;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the position open so it counts in the protocol's snapshots`;
  if (c.includes('dex') || c.includes('amm')) return `Provide $${capital} of liquidity to ${name}'s highest-volume pool on ${chain} and leave the position open`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the receipt tokens`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position`;
  if (c.includes('prediction')) return `Fund $${capital} into ${name} on ${chain} and place one market position`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active`;
  if (c.includes('option')) return `Deposit $${capital} of USDC into ${name}'s options vault on ${chain}`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/** The category's second engagement, a different action from the core one. */
function secondAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the supply on ${name} and repay it a week later, so the wallet shows both sides of the market`;
  if (c.includes('dex') || c.includes('amm')) return `Swap a small amount through a second pool on ${name} so the wallet shows trading activity as well as liquidity`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Move a quarter of the position into a second vault on ${name} so the wallet is active in more than one product`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the first hedge and open one fresh small position on ${name} so the wallet shows repeated trading`;
  if (c.includes('prediction')) return `Settle the first position on ${name} and place one more, so the wallet shows more than a single trade`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit a further $25 into a second ${name} vault on ${chain} so the wallet holds more than one vault's shares`;
  if (c.includes('rwa')) return `Top up the position with a further $25 of ${name}'s yield asset on ${chain} so the wallet shows repeated minting`;
  return `Make one further qualifying transaction on ${name} — a small extra deposit — so the wallet shows repeated use rather than a single deposit`;
}

/** One step as a single string: action, cost and time, inside the gate's 20..600 characters. */
function stepText(step: FarmStep): string {
  let s = `${step.text}. Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page.`;
  return s;
}

/** A protocol's farm plan: seven steps, eight when it runs on more than one chain. */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; capital: number; gasTotal: number; holdDays: number; mainChain: string; gasPerTx: number } {
  const mainChain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(p.chains[0]);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeklyGas = gas * 4;
  const steps: FarmStep[] = [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline`,
      cost: `$0 to create, about $${gas} of gas for the first transaction on ${mainChain}`,
      time: '5 minutes',
    },
    {
      text: coreAction(p, capital, mainChain),
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Repeat one qualifying action each week on ${p.name} — a deposit, a borrow, a swap or a vote — so the wallet stays active`,
      cost: `about $${round2(weeklyGas)} of gas over four weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity spans more than one snapshot window`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: secondAction(p, mainChain),
      cost: `$25 of capital plus about $${gas} of gas`,
      time: '10 minutes',
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its official site or docs and claim only from the link it publishes — never pay to claim, and never trust a link sent to you`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, then unwind the position once the rewards window closes`,
      cost: `about $${gas} of gas to exit`,
      time: '10 minutes',
    },
  ];
  let gasTotal = gas + gas + weeklyGas + gas + gas;
  if (p.chains.length >= 2) {
    const secondChain = p.chains[1]!;
    const gas2 = gasFor(secondChain);
    steps.push({
      text: `Repeat the core deposit on ${secondChain} as well, so the wallet is active on a second chain ${p.name} supports`,
      cost: `$25 of capital plus about $${gas2} of gas`,
      time: '15 minutes',
    });
    gasTotal += gas2;
  }
  return { steps, capital, gasTotal: round2(gasTotal), holdDays: hold, mainChain, gasPerTx: gas };
}

/* ------------------------------------------------------------------ */
/* The board.                                                          */
/* ------------------------------------------------------------------ */

export interface BuildResult {
  board: BoardRow[];
  radar: RadarData;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Score every rankable protocol and build the board, the live view and the integrity strip. */
export function buildRadar(snapshot: Snapshot): BuildResult {
  const comps = compsOf(snapshot);
  if (comps.length < 10) throw new SnapshotError(`only ${comps.length} traded comps anchor the fit: need at least 10`);
  const parts = fitParts(comps);
  const validation = validateModel(comps);
  const { table: odds, globalRate } = oddsTable(snapshot);
  const index = bySlug(snapshot.protocols);
  const watchSet = new Set(snapshot.watchlist);

  // Ranked rows: every watchlist slug, then every rankable pre-token protocol below the floor.
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  let belowFloor = 0;
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (p.tvl_usd < snapshot.floor_usd && isRankable(p)) {
      chosen.set(p.slug, p);
      belowFloor += 1;
    }
  }

  // Integrity: every protocol accounted for, in exactly one bucket.
  const excludedByReason: Record<string, number> = {};
  const bump = (reason: string): void => {
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  };
  let tradedSetAside = 0;
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!isPreToken(p)) {
      tradedSetAside += 1;
      continue;
    }
    const reason = exclusionReason(p);
    if (reason !== null) bump(reason);
    else bump('above-floor-not-on-watchlist');
  }
  const excludedTotal = Object.values(excludedByReason).reduce((a, b) => a + b, 0);
  const integrity: Integrity = {
    total: snapshot.protocols.length,
    ranked: chosen.size,
    watchlist_ranked: snapshot.watchlist.filter((s) => chosen.has(s)).length,
    below_floor_ranked: belowFloor,
    traded_set_aside: tradedSetAside,
    excluded: excludedTotal,
    excluded_by_reason: excludedByReason,
    check_total: chosen.size + tradedSetAside + excludedTotal,
  };

  // Score the chosen protocols.
  const scored: BoardRow[] = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const cat = parts.cats.get(p.category ?? '(no category)');
    const ratio = cat !== undefined ? cat.shrunkMedian : parts.globalMedian;
    const ratioN = cat !== undefined ? cat.n : 0;
    const lowRatio = cat !== undefined ? cat.shrunkQ25 : parts.globalQ25;
    const highRatio = cat !== undefined ? cat.shrunkQ75 : parts.globalQ75;
    const size = sizeFactor(p.tvl_usd, parts.refTvl, parts.ols.slope);
    const gPct = growthPct(p.change_7d);
    const gMult = 1 + (gPct / 100) * 0.5;
    const mMult = maturityMult(age);
    const gross = Math.max(1, Math.round(p.tvl_usd * ratio * size * gMult * mMult));
    const key = bucketKey(p, age);
    const bucket = odds.get(key) ?? { odds: globalRate, n: 0 };
    const tokenOdds = bucket.odds;
    const expected = Math.max(1, Math.round(gross * tokenOdds));
    const low = Math.max(1, Math.round(p.tvl_usd * lowRatio * size * gMult * mMult * tokenOdds));
    const high = Math.max(1, Math.round(p.tvl_usd * highRatio * size * gMult * mMult * tokenOdds));
    const plan = farmPlan(p, age);
    const totalCost = plan.gasTotal;
    const farmerEv = round2(expected * FARMER_SHARE);
    const evPer100 = round2((farmerEv * 100) / plan.capital);
    const net = round2(farmerEv - totalCost);
    const verdict: 'FARM' | 'THIN' | 'SKIP' =
      farmerEv >= VERDICT_FARM_MULT * totalCost ? 'FARM' : farmerEv >= VERDICT_THIN_MULT * totalCost ? 'THIN' : 'SKIP';
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      listed_at: p.listed_at,
      watchlist: watchSet.has(p.slug),
      token_status: 'pre-token' as const,
      implied_value_usd: expected,
      gross_implied_usd: gross,
      token_odds: round4(tokenOdds),
      expected_value_usd: expected,
      value_low_usd: low,
      value_high_usd: high,
      model: {
        ratio_category: round4(ratio),
        ratio_category_n: ratioN,
        ratio_global: round4(parts.globalMedian),
        log_log_intercept: round4(parts.ols.intercept),
        log_log_slope: round4(parts.ols.slope),
        size_factor: round4(size),
        growth_pct: round2(gPct),
        growth_multiplier: round4(gMult),
        maturity_multiplier: round4(mMult),
        age_days: age,
        odds_bucket: key,
        odds_bucket_n: bucket.n,
      },
      farm: {
        capital_usd: plan.capital,
        main_chain: plan.mainChain,
        gas_per_tx_usd: plan.gasPerTx,
        gas_total_usd: plan.gasTotal,
        total_cost_usd: totalCost,
        farmer_ev_usd: farmerEv,
        ev_per_100_usd: evPer100,
        net_usd: net,
        break_even_expected_usd: Math.round(totalCost / FARMER_SHARE),
        hold_days: plan.holdDays,
        verdict,
      },
      farm_steps: plan.steps.map(stepText),
    };
  });

  // Rank by expected value, ties broken by slug so the order is deterministic.
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  // Live view: the traded protocols by market cap, exchanges kept out.
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && (p.mcap_usd ?? 0) > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      mcap_tvl_ratio: round4(p.mcap_usd! / p.tvl_usd),
    }));

  const model: ModelFit = {
    comps_n: comps.length,
    log_log_intercept: round4(parts.ols.intercept),
    log_log_slope: round4(parts.ols.slope),
    r_squared: round4(parts.ols.r2),
    ratio_global_median: round4(parts.globalMedian),
    ratio_global_q25: round4(parts.globalQ25),
    ratio_global_q75: round4(parts.globalQ75),
    ratio_cap: round4(RATIO_CAP_MULT * parts.globalQ75),
    ref_tvl_usd: parts.refTvl,
    global_traded_rate: round4(globalRate),
    validation,
  };

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    watchlist_size: snapshot.watchlist.length,
    board_size: scored.length,
    integrity,
    rows: scored,
    live,
  };
  return { board: scored, radar };
}

/* ------------------------------------------------------------------ */
/* Parsing, the gate self-check, and data.js.                          */
/* ------------------------------------------------------------------ */

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, farm steps, integrity. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot, integrity: Integrity): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside the gate's 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  if (integrity.check_total !== integrity.total) return `integrity adds to ${integrity.check_total}, not ${integrity.total}`;
  return null;
}

/** The dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
