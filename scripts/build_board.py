#!/usr/bin/env python3
"""Build dashboard/board.json for the Token Launch Radar.

Build-time only: fetches the live DefiLlama protocol list and the CoinGecko
coin list, filters to protocols with no launched token, and writes a trimmed,
fully offline snapshot. The dashboard itself never touches the network.

Token test (a protocol HAS a token if any fires):
  A. any member of its DefiLlama parent family has gecko_id / cmcId / mcap.
  B. its symbol matches a CoinGecko coin AND the coin name shares a word
     (len>=3) with the protocol/parent name, or the coin name is a substring
     of the protocol name (catches SKY/GMX/dYdX, whose token lives on the
     parent protocol and whose DefiLlama child rows carry no gecko_id).
  C1. a CoinGecko coin name exactly equals the protocol name.
  C2. a multi-word CoinGecko coin name whose words (one non-generic, len>=4)
      all appear in the protocol/parent name words.
  C3. a single-word CoinGecko coin with a clean id (no "-2" suffix) equal to
      the first or last word of the protocol name (catches Plume, Bittensor,
      Avant, Mezo; generic/memecoin words are stoplisted).
Plus category exclusions (CEX, bridges, liquid staking/restaking, wrapped /
staked / bridged products, chains) and a small manual list with reasons
(see MANUAL_EXCLUDE / MANUAL_RESCUE below).

Run:  python3 scripts/build_board.py [--no-history]
Writes: dashboard/board.json
"""
import json, math, re, sys, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from statistics import median

ROOT = __file__.rsplit("/", 2)[0] + "/"
OUT = ROOT + "dashboard/board.json"
SNAPSHOT_DATE = "2026-11-15"
MIN_TVL = 5_000_000
WATCH_TVL = 50_000_000

EXCL_CAT = {"CEX", "CeDeFi", "Chain", "Bridge", "Canonical Bridge",
            "Cross Chain Bridge", "Liquid Staking", "Liquid Restaking",
            "Staking Pool", "Restaking", "Restaked BTC", "Anchor BTC",
            "Decentralized BTC", "Stablecoin Wrapper"}
NAME_EXCL = re.compile(r"\bwrapped\b|\bbridge\b|\bstaked\b|\bweth\b|\bwbtc\b|\bsteth\b|\bcbeth\b", re.I)
GENERIC = {"protocol", "finance", "defi", "token", "coin", "network", "chain",
           "labs", "capital", "markets", "yield", "liquid", "staking", "vault",
           "trade", "swap", "bridge", "usd", "turbo", "potato", "rocket",
           "light", "block", "frost", "community", "native", "manifest",
           "merchant", "phoenix", "fusion", "strata", "tessera", "prime",
           "orange", "ultra", "fire", "rock", "shift"}

# Manual overrides, each with a reason (auditable; see README methodology).
MANUAL_EXCLUDE = {
    # product of Olympus DAO; OHM trades, but the name carries no "Olympus".
    "cooler-loans": "Olympus DAO product; OHM token trades",
    # stablecoin M trades and governance POWER exists: the product IS a token.
    "m0": "stablecoin issuer whose stablecoin M trades",
    # Bitcoin L2 infrastructure: no token will ever launch, not farmable.
    "lightning-network": "Bitcoin L2 infrastructure, no launch plausible",
}
# Protocols the automatic rules wrongly flag as launched.
MANUAL_RESCUE = {
    # No token as of Nov 2026; CoinGecko's "Polymarket" coin is an unrelated memecoin.
    "polymarket-international": "Polymarket has no token; CoinGecko POLY coin is unrelated",
}

def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def words(s):
    return [w.lower() for w in re.findall(r"[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+", s or "") if w]

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "token-launch-radar/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def token_reason(p, ctx):
    fam = p.get("parentProtocol") or ("solo#" + p["slug"])
    if ctx["fam_token"].get(fam):
        return "A family gecko/cmc/mcap"
    sym = (p.get("symbol") or "").lower()
    pw = {w for w in words(p.get("name")) + words((p.get("parentProtocol") or "").replace("parent#", "").replace("-", " ")) if len(w) >= 3}
    nn = norm(p.get("name"))
    if sym and sym != "-":
        for c in ctx["by_sym"].get(sym, []):
            cn = norm(c["name"])
            cw = {w for w in words(c["name"]) if len(w) >= 3 and w not in GENERIC}
            if (cw & pw) or (len(cn) >= 3 and (cn in nn or nn in cn)):
                return f"B symbol+word {c['id']}"
    if len(nn) >= 4 and nn in ctx["by_name"]:
        return f"C1 exact-name {ctx['by_name'][nn][0]['id']}"
    pwords = words(p.get("name"))
    # C2: multi-word coins, looked up by shared word (indexed, not scanned).
    cands = {}
    for w in pw:
        for c in ctx["multi_by_word"].get(w, ()):
            cands[c["id"]] = c
    for c in cands.values():
        cw = words(c["name"])
        if all(len(w) >= 3 and w in pw for w in cw) and any(len(w) >= 4 and w not in GENERIC for w in cw):
            return f"C2 multiword {c['id']}"
    # C3: single-word clean-id coin equal to first/last word of the name.
    for w in {pwords[0] if pwords else "", pwords[-1] if pwords else ""}:
        c = ctx["single"].get(w)
        if c:
            return f"C3 single-word {c['id']}"
    return None

PLANS = {
    "Dexs": ["Swap on {n} on {ch}", "Provide liquidity to a {n} pool (mind impermanent loss)",
             "Trade or LP weekly so activity is consistent", "Watch for a points program before farming hard"],
    "Lending": ["Supply collateral on {n} ({ch})", "Borrow modestly against it; keep health factor high",
                "Keep the position open across snapshots", "Watch for a points program before farming hard"],
    "Yield": ["Deposit into a {n} vault on {ch}", "Hold through at least one full epoch",
              "Spread deposits across vaults, not one", "Watch for a points program before farming hard"],
    "Yield Aggregator": ["Deposit into a {n} vault on {ch}", "Hold through at least one full epoch",
                         "Spread deposits across vaults, not one", "Watch for a points program before farming hard"],
    "Onchain Capital Allocator": ["Deposit into a {n} vault on {ch}", "Hold through at least one full epoch",
                                  "Spread deposits across vaults, not one", "Watch for a points program before farming hard"],
    "Risk Curators": ["Deposit into a {n}-curated vault on {ch}", "Hold through at least one full epoch",
                      "Compare curator fees before depositing", "Watch for a points program before farming hard"],
    "Derivatives": ["Open a small perp position on {n} ({ch})", "Trade weekly; size for the risk, not the airdrop",
                    "Provide perp liquidity only if offered", "Watch for a points program before farming hard"],
    "RWA": ["Hold the {n} RWA product on {ch}", "Hold through distribution / maturity dates",
            "Use more than one chain if offered", "Watch for a points program before farming hard"],
    "CDP": ["Lock collateral and mint on {n} ({ch})", "Keep the collateral ratio comfortably healthy",
            "Repay before any unlock window", "Watch for a points program before farming hard"],
    "Basis Trading": ["Hold or mint the {n} basis product on {ch}", "Keep the position open; watch funding",
                      "Do not over-leverage for points", "Watch for a points program before farming hard"],
    "Prediction Market": ["Trade markets on {n} ({ch})", "Provide market liquidity where offered",
                          "Stay active weekly, not in one burst", "Watch for a points program before farming hard"],
}
DEFAULT_PLAN = ["Use {n} on {ch}", "Hold a real position, not a dust one",
                "Interact weekly so activity is consistent", "Watch for a points program before farming hard"]

def farm_plan(p):
    ch = (p.get("chains") or ["Ethereum"])[0]
    tmpl = PLANS.get(p.get("category"), DEFAULT_PLAN)
    return [s.format(n=p["name"], ch=ch) for s in tmpl]

def hist_for(slug):
    """Last ~90d of daily TVL, downsampled to 12 points (or None)."""
    try:
        d = get_json(f"https://api.llama.fi/protocol/{slug}")
        pts = [(x["date"], x["totalLiquidityUSD"]) for x in d.get("tvl", []) if x.get("totalLiquidityUSD")]
        if len(pts) < 12:
            return None
        pts = pts[-90:]
        step = len(pts) / 12
        return [round(pts[int(i * step)][1]) for i in range(12)]
    except Exception:
        return None

def main():
    no_hist = "--no-history" in sys.argv
    protos = get_json("https://api.llama.fi/protocols")
    coins = get_json("https://api.coingecko.com/api/v3/coins/list")
    by_sym, by_name = defaultdict(list), defaultdict(list)
    for c in coins:
        by_sym[c["symbol"].lower()].append(c)
        by_name[norm(c["name"])].append(c)
    fams = defaultdict(list)
    for p in protos:
        fams[p.get("parentProtocol") or ("solo#" + p["slug"])].append(p)
    single, multi_by_word = {}, defaultdict(list)
    for c in coins:
        cn = norm(c["name"])
        cw = words(c["name"])
        if len(cw) == 1 and len(cn) >= 5 and c["id"] == cn and cn not in GENERIC:
            single.setdefault(cn, c)
        elif len(cw) >= 2 and all(len(w) >= 3 for w in cw):
            for w in set(cw):
                multi_by_word[w].append(c)
    ctx = {"by_sym": by_sym, "by_name": by_name, "coins": coins, "single": single,
           "multi_by_word": multi_by_word,
           "fam_token": {f: any(m.get("gecko_id") or m.get("cmcId") or m.get("mcap") for m in mem)
                         for f, mem in fams.items()}}
    # Peer multiples: median mcap/TVL among launched protocols, by category.
    launched = [p for p in protos if (p.get("mcap") or 0) > 0 and (p.get("tvl") or 0) > 0 and token_reason(p, ctx)]
    by_cat = defaultdict(list)
    for p in launched:
        by_cat[p.get("category")].append(p["mcap"] / p["tvl"])
    global_mult = median([p["mcap"] / p["tvl"] for p in launched]) if launched else 0.3
    peer = {c: (median(v) if len(v) >= 3 else global_mult) for c, v in by_cat.items()}
    peer = {c: min(max(m, 0.05), 1.5) for c, m in peer.items()}
    global_mult = min(max(global_mult, 0.05), 1.5)

    kept, excluded = [], []
    for p in protos:
        tvl = p.get("tvl") or 0
        if tvl < MIN_TVL:
            continue
        slug = p["slug"]
        reason = None
        if slug in MANUAL_EXCLUDE:
            reason = "manual: " + MANUAL_EXCLUDE[slug]
        elif slug not in MANUAL_RESCUE:
            reason = token_reason(p, ctx)
        if reason:
            excluded.append((p["name"], round(tvl / 1e6, 1), reason))
            continue
        if (p.get("category") in EXCL_CAT) or NAME_EXCL.search(p.get("name") or ""):
            excluded.append((p["name"], round(tvl / 1e6, 1), "category/name: " + str(p.get("category"))))
            continue
        kept.append(p)
    kept.sort(key=lambda x: -x["tvl"])
    max_tvl = kept[0]["tvl"] if kept else 1
    log_span = math.log10(max_tvl) - math.log10(MIN_TVL)

    rows = []
    for p in kept:
        tvl = p["tvl"]
        mult = peer.get(p.get("category"), global_mult)
        ch7 = p.get("change_7d") or 0
        score = round(
            50 * (math.log10(tvl) - math.log10(MIN_TVL)) / log_span
            + 20 * min(mult, 1.0)
            + 15 * min(max((ch7 + 20) / 40, 0), 1)
            + 15 * min(len(p.get("chains") or []), 10) / 10, 1)
        desc = (p.get("description") or "").strip().replace("\n", " ")
        rows.append({
            "name": p["name"], "slug": p["slug"], "category": p.get("category") or "Other",
            "chains": (p.get("chains") or [])[:4],
            "chainCount": len(p.get("chains") or []),
            "tvl": round(tvl), "change1h": round(p.get("change_1h") or 0, 2),
            "change1d": round(p.get("change_1d") or 0, 2),
            "change7d": round(ch7, 2),
            "implied": round(tvl * mult), "multiple": round(mult, 3),
            "score": score, "watchlist": tvl >= WATCH_TVL,
            "url": p.get("url") or "", "description": desc[:140],
            "plan": farm_plan(p), "history": None,
        })
    if not no_hist:
        top = [r for r in rows[:30]]
        with ThreadPoolExecutor(max_workers=8) as ex:
            for r, h in zip(top, ex.map(hist_for, [r["slug"] for r in top])):
                r["history"] = h
        print(f"history: {sum(1 for r in top if r['history'])} / {len(top)} top rows have sparklines")
    board = {
        "meta": {"title": "Token Launch Radar", "source": "DefiLlama",
                 "snapshotDate": SNAPSHOT_DATE, "fetchedFrom": "https://api.llama.fi/protocols",
                 "minTvlUsd": MIN_TVL, "watchlistTvlUsd": WATCH_TVL,
                 "globalMultiple": round(global_mult, 3),
                 "method": "no-token = no gecko/cmc/mcap on the protocol or its DefiLlama parent family, "
                           "no CoinGecko coin matching symbol+name, exact name, or clean single-word name; "
                           "bridges, liquid staking/restaking, wrapped/staked/bridged products, CEXs and "
                           "chains excluded; manual overrides listed in scripts/build_board.py",
                 "score": "50*log10(TVL) + 20*peer mcap/TVL + 15*7d momentum + 15*chain breadth (0-100)",
                 "implied": "TVL x median mcap/TVL of launched peers in the same category (fallback: global median)"},
        "rows": rows,
    }
    with open(OUT, "w") as f:
        json.dump(board, f, separators=(",", ":"))
    print(f"kept={len(rows)} watchlist(>=50M)={sum(1 for r in rows if r['watchlist'])} "
          f"totalTVL=${sum(r['tvl'] for r in rows)/1e9:.2f}B board.json bytes={len(json.dumps(board, separators=(',', ':')))}")
    print("top 10:")
    for r in rows[:10]:
        print(f"  ${r['tvl']/1e6:,.0f}M {r['name'][:38]:38} {r['category'][:20]:20} implied=${r['implied']/1e6:,.0f}M score={r['score']}")
    print(f"excluded with token/category: {len(excluded)} (top 5: {excluded[:5]})")

if __name__ == "__main__":
    main()
