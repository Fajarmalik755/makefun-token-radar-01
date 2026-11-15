# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Fajarmalik755/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Fajarmalik755/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Build the best token launch radar. It reads a sealed snapshot of every protocol and writes a web dashboard that ranks the protocols with no token yet by what their launch would be worth, each with the steps to farm it; an AI judge compares the dashboards two at a time, places go by win rate, and the 10 best share $1,325 in rewards.

## Run it

Requires Node.js 22.18+ (tested on Node 24). No install step, no dependencies, no network at runtime.

```sh
node main.ts                  # build into out/ and exit
node main.ts --serve          # build, then serve out/ at http://localhost:4173
node main.ts --serve --port 8080
```

Then open http://localhost:4173/dashboard/. The page loads only `data.js`, written beside it
by `main.ts`, so it works fully offline. `main.ts` reads the sealed snapshot from
`/input/snapshot.json` when it exists (the grader's mount), else from `input/snapshot.json`,
the competition's sealed snapshot vendored in this repository.

To rebuild the bundled board from live data (needs internet at build time only):

```sh
python3 scripts/build_board.py   # re-fetches DefiLlama + CoinGecko, rewrites data/board.json
node main.ts                     # re-validate against the sealed snapshot and rebuild out/
```

## What it does

- **Board** — 176 protocols with no token recorded, ranked by implied value, with category,
  chains, TVL, 1d/7d change, implied value (TVL × peer multiple) and a 0–100 radar score.
- **Watchlist** — the sealed snapshot's 40 protocols with TVL ≥ $50M, flagged ★ and filterable.
- **Search, sort & filters** — text search, category / chain filters, top-category chips, sort by
  implied value, TVL, score, 7d or 1d change. Deep links: `#detail=<slug>`, `#watch=1`,
  `#cat=<category>`, `#q=<text>`.
- **Detail view** — click any row: description, full chain list, 1h/1d/7d momentum bars, a TVL
  sparkline (daily DefiLlama TVL, ~90 days, on the top 30 rows), the implied-value breakdown,
  and a 4-step farm plan with a copy button and a link to the protocol.
- **My stars** — star protocols; stars persist in `localStorage` and can be filtered.
- **Offline & fast** — one page + one data file, no CDN, no fonts, no images, no logo URLs
  (initials avatars instead).

## Methodology

Snapshot: DefiLlama `api.llama.fi/protocols`, fetched **15 Nov 2026** (9,050 protocols), plus the
CoinGecko coin list for cross-checking. The full, reproducible pipeline is `scripts/build_board.py`.
At build time `main.ts` reconciles that board against the competition's **sealed snapshot of
14 Nov 2026** (`input/snapshot.json`, 758 protocols, 40 on the watchlist), so the board the
grade reads covers the sealed watchlist exactly:

- **2 bundled rows dropped** — `drakewell-usddw` and `wildcat-protocol` are not in the sealed
  snapshot, so they cannot be ranked.
- **13 sealed-watchlist rows added** from the snapshot's own figures (TVL, category, chains, 7d
  change), scored by the same peer-multiple method and given the same 4-step farm plans:
  `axis`, `b14g`, `bittensor-dtao`, `curvance`, `doppler-finance`, `ember`, `hive-protocol`,
  `lightning-network`, `noble`, `plume-vaults`, `reti-pooling`, `saturn`, `usdd`.
- **Watchlist badge follows the sealed snapshot** — the 40 rows it names, not the bundled
  board's own ≥ $50M flag. The bundled figures (TVL, implied value, plans) are otherwise
  untouched.

**A protocol counts as “no token” only if all of these hold:**

1. Neither it nor any sibling in its DefiLlama parent family records a `gecko_id`, `cmcId` or
   market cap. (This alone is not enough: DefiLlama child rows such as Aave V3 or Uniswap V3
   carry no `gecko_id` even though AAVE / UNI obviously trade.)
2. No CoinGecko coin matches its symbol **and** name (word overlap or name substring — this
   catches SKY, GMX and dYdX), no coin name exactly equals the protocol name, and no clean
   single-word coin equals the first/last word of its name (catches Plume, Bittensor, Avant, Mezo).
3. It is not a bridge, liquid-staking / restaking product, wrapped / staked / bridged token,
   CEX, or chain — those are excluded by category and name.

Three manual overrides, each documented in `scripts/build_board.py`:

- **Excluded:** `cooler-loans` (Olympus DAO product; OHM trades), `m0` (its stablecoin M trades),
  `lightning-network` (Bitcoin L2 infrastructure; no launch will ever happen). Note the sealed
  snapshot's watchlist still names `lightning-network`, so `main.ts` adds it back as a ranked row
  — the sealed watchlist is the floor, and the gate requires every one of its slugs on the board.
- **Rescued:** `polymarket-international` — Polymarket has no token; the CoinGecko “Polymarket”
  coin is an unrelated memecoin.

**Implied value** = TVL × the median market-cap/TVL of *launched* peers in the same category
(fallback: the global median, ×1.47). It is an estimate, not a prediction — most of these
protocols may never launch a token.

**Radar score (0–100)** = 50 × log₁₀(TVL) + 20 × peer multiple + 15 × 7d momentum + 15 × chain
breadth. The formula is in `scripts/build_board.py` and in `data/board.json`'s `meta` block.

## Known limits

- **Snapshot, not live data.** TVL and changes are frozen at 15 Nov 2026 (sealed snapshot:
  14 Nov 2026). A protocol that launches a token after that date will still appear here until
  the board is rebuilt.
- **Token detection is heuristic.** It cross-checks three sources, but a token that trades only
  off CoinGecko / CoinMarketCap, or a same-name memecoin, can still fool it either way. The
  manual overrides above cover the famous cases found by hand-checking the top of the board.
- **No points-program data.** The snapshot does not say which protocols run points programs,
  so every farm plan ends with “check for a points program first” rather than inventing one.
- **History only for the top 30.** Daily TVL sparklines are bundled for the 30 largest rows
  (12 points over ~90 days); other rows show the 1h/1d/7d bars instead, to stay well under the
  size cap.
- **1d/7d only.** DefiLlama's protocol list carries no 1-month change, so momentum is 1h/1d/7d.

## Files

| File | What it is |
| --- | --- |
| `main.ts` | Build + serve entrypoint (Node 22, zero deps). Reconciles the bundled board with the sealed snapshot, writes `out/` (`board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`). |
| `data/board.json` | The bundled board: 165 rows from the 15 Nov 2026 fetch, each with implied value + farm plan. |
| `input/snapshot.json` | The competition's sealed snapshot (14 Nov 2026, 758 protocols, 40 watchlist), vendored so `node main.ts` works with no kit. Stored compact (one line) — it parses to the identical snapshot; the file is data, not code. |
| `dashboard/` | The dashboard: `index.html`, `app.css`, `app.js` — static, no network. |
| `screenshots/` | The three screenshots: the board, a protocol's detail view, a filtered view. |
| `vendor/makefun-board.ts` | The kit's dossier library, byte for byte — `main.ts` writes `dossier.json` with it. |
| `scripts/build_board.py` | Build-time fetcher + filter. Rebuilds `data/board.json` from live DefiLlama/CoinGecko data. |
| `.makefun/owner.json` | The claim file naming the payout wallet. |
| `out/` | Generated build output (not committed). |
| `LICENSE` | MIT. |

---

<sub>Entered on [make.fun](https://make.fun/?ref=25xq9bc4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
