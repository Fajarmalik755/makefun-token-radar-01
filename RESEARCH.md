# token-radar-01 — RESEARCH (top 1–10 only)

Perintah Fajar 20 Nov 23:01 WIB: riset top ranking dulu, lalu bangun di atas mereka.
Koreksi Fajar 20 Nov 23:02 WIB: riset DIBATASI top 1–10 saja, bukan top 10–20.
Cek live: leaderboard + submissions 20 Nov ~23:05 WIB, kit diunduh 20 Nov 23:02 WIB.

## 0. Kompetisi (live)
- token-radar-01, hadiah $1.325, deadline 14 Des 2026 17:00 WIB (2026-12-14T10:00Z).
- Hadiah top 10: #1 $1.000, #2–5 $50, #6–10 $25. Entry fee $0.
- Submisi total 21.594; leaderboard ranked 14.594 entri. Akun @crisp-harbor-96:
  kuota can_submit=true, hari ini sisa 3 (reset 21 Nov 07:00 WIB), hard limit sisa 19/20,
  sudah 1 entri lama (rank live 13.664 — jauh dari top 10; submit baru jadi entri final).
- Penilaian: juri AI (superbot, reasoning high) bandingkan 2 dossier sekaligus, margin 1–5,
  tanpa tie. Dev: 12 game vs 4 house anchor + 3 reference (2 ronde adaptif x 4 game);
  bila interval high menyentuh garis top-10, +2 ronde scrutiny (8 game). Total top 10
  masing-masing 20 match. Win rate = fit Bradley-Terry vs kekuatan house yang tetap,
  BUKAN sekadar W/L. Final: screen di place 40 (interval low), 3 ronde Swiss, race di
  batas hadiah, playoff 12 besar; top 5 ditahan review finalis max 60 menit.
- Kriteria juri (berurutan): (1) radar jalan — cover semua watchlist, rank pre-token
  by implied value, screenshot dan kode cocok; (2) model nilai dari angka snapshot
  sendiri (TVL, growth 7d, lama tanpa token), bukan daftar nama hardcode; pisahkan
  token yang sudah trading vs yang belum; (3) farm plan konkret + biaya + waktu;
  (4) dashboard sortable/filterable, detail per protokol, terbaca sekilas;
  (5) terlihat dibuat — palet, spacing, tipografi konsisten.

## 1. Top 10 live (20 Nov ~23:05 WIB) — SATU-SATUNYA yang dianalisis
Semua top 10: 20W / 0D / 0L di dev, provisional, finalist=false.
Kode mereka DITAHAN (source_withheld=true, repo_url kosong) — tidak bisa dibaca
dashboard/kodenya; analisis hanya dari judul + statistik judge + rules/kit.

| Rank | Handle | Win rate | 90% interval | Dossier bytes | Judul (inti) |
|---|---|---|---|---|---|
| 1 | kiencx | 96,6767% | 95,52–97,83% | 780.687 | Launch Radar v4: every value term fitted and tested held-out twice, token odds from the peers' record, integrity strip, costed farm verdicts |
| 2 | nyx77 | 96,4424% | 95,24–97,64% | 578.231 | Launch Radar |
| 3 | sudhan | 96,2052% | 94,96–97,45% | 450.689 | fitted launch pricing, 66 farm plans, KPI strip, every one of 758 protocols accounted for |
| 4 | rstrike | 96,2052% | 94,96–97,45% | 1.142.803 | Launch Radar Terminal |
| 5 | brisk-kestrel-93 | 96,2052% | 94,96–97,45% | 1.414.933 | Undercurrent: walk-forward-tested value model, deposit-sized farm plans |
| 6 | nightshift-labs | 96,2052% | 94,96–97,45% | 1.422.960 | Launchscope: fitted model + out-of-sample test on the board, traded tokens as anchors, costed farm timelines |
| 7 | calm-owl-82 | 96,2052% | 94,96–97,45% | 1.534.202 | comps curve tested blind, costed farm plan for every pre-token protocol |
| 8 | ronigrv | 96,1255% | 94,87–97,38% | 1.251.944 | comps-fitted value tested out of sample, every farm plan netted to farm, thin or skip |
| 9 | tidy-meteor-25 | 96,1255% | 94,87–97,38% | 1.291.898 | Launch Radar |
| 10 | europa-nova | 96,1255% | 94,87–97,38% | 1.408.192 | launch value x odds it ever records a token, held-out calibration on the page, two-outcome farm verdicts net of fees, 758/758 accounted |

Catatan penting:
- Selisih #1 ke #10 hanya 0,55 poin; interval 90% semuanya tumpang tindih
  (±~1,15 poin). Mengalahkan top 10 berarti menang BESAR vs house anchor
  (margin 4–5), bukan sekadar lolos gate.
- Dossier bytes bukan penentu: #3 terkecil (450.689) tetap #3; #7 terbesar
  (1.534.202) tetap #7. Tapi tie-break exact: dossier lebih kecil menang —
  jaga dossier kami <800 KB, ideal ~600 KB.
- Semua top 10 sudah 20/20 menang vs house — jadi "menang vs house" saja
  TIDAK cukup; yang membedakan adalah margin kemenangan di tiap game.

## 2. Pola top 1–10 (dari judul mereka — satu-satunya sinyal yang terlihat)
1. **Model fitted, bukan konstanta starter.** "Fitted launch pricing", "comps
   curve", "fitted on traded tokens", "value model kept by walk-forward and
   leave-one-out". Starter pakai base_multiple 0,25 tetap — itu yang dipakai
   house anchor #2 (starter = anchor 2-plain, kekuatan kalibrasi 0,593).
   Siapa pun yang hanya mengubah sedikit starter akan kalah dari top 10.
2. **Validasi held-out ditampilkan di halaman.** "tested held-out twice",
   "walk-forward-tested", "out-of-sample test on the board", "held-out
   calibration on the page", "every term tested held-out". Juri membaca ini
   sebagai bukti model bukan overfit / bukan hardcode.
3. **Token odds (probabilitas pernah ada token) dikali nilai.** #1 dan #10
   eksplisit: "launch value x odds it ever records a token", "token odds from
   the peers' record". Jadi ranking = expected value, bukan implied value mentah.
4. **Farm plan yang dihitung biayanya + verdict.** "costed farm verdicts",
   "costed farm plans netted to the dollar", "deposit-sized", "netted to
   break-even", "farm, thin or skip", "two-outcome farm verdicts net of fees".
   Bukan template generik — ada angka $ dan hari per protokol.
5. **Integritas / akuntansi penuh.** "integrity strip", "KPI strip",
   "758/758 accounted", "every one of 758 protocols accounted for".
   Dashboard harus menjelaskan ke mana perginya SEMUA 758 protokol
   (ranked / traded / excluded + alasan), bukan hanya 200 baris board.
6. **Judul #2 dan #9 hanya "Launch Radar"** — judul pendek tetap bisa top 10,
   jadi yang dinilai adalah dossier (screenshot + source), bukan judul.

## 3. Snapshot (sealed, sha256 dataset d8df5150… — sama untuk semua entri)
- as_of 2026-11-14, sumber DefiLlama /protocols, floor $50.000.000.
- 758 protokol (TVL ≥ $5 jt), watchlist 40, pre-token 342, sudah ada token 416.
- Watchlist TVL $51,3 jt–$2,75 miliar. Top: Steakhouse Financial $2,75 miliar,
  Gauntlet $1,58 miliar, Veda $1,56 miliar. Kategori watchlist: Risk Curators 12,
  RWA 7, Onchain Capital Allocator 3, sisanya tersebar.
- Pre-token di bawah floor: 210. Board wajib ≥100 baris dan cover semua 40
  watchlist, jadi minimal 60 baris di luar watchlist.
- **Jebakan starter:** top pre-token by TVL adalah CEX/Bridge/wrapped
  (Bybit $13,8 miliar, Bitfinex $12,6 miliar, WBTC $7,9 miliar, Binance staked
  ETH $7,4 miliar). Starter `isRankable` hanya mengecualikan CEX + versioned —
  WBTC/Bridge/Liquid Staking LOLOS dan akan masuk board early. Itu melanggar
  kriteria juri #2 (pisahkan wrapped/token-trading) dan rules menyebut WBTC dkk
  eksplisit sebagai bukan kandidat. Model kami WAJIB menerapkan aturan
  watchlist PENUH ke SEMUA baris: CEX, Bridge, Canonical Bridge, Liquid
  Staking, Liquid Restaking, Restaked BTC, versioned, nama wrapped/staked,
  nama exchange di awal.
- **Comps (anchor fit): hanya 128 token traded yang punya mcap>0 + TVL>0**
  (129 dengan mcap≥0; 16 protokol mcap 0/negatif — data kotor, buang).
  Ini cocok dengan klaim top entries "fitted on 128 traded tokens".
  - Rasio mcap/TVL: median 0,205, p5 0,006, p95 12,16, mean 5,0 (outlier ekstrem).
  - Log-log OLS log(mcap) = 6,965 + 0,522·log(TVL), R² = 0,194 — TVL SAJA
    penjelas lemah. Jangan klaim fit kuat; tunjukkan R² jujur + validasi held-out.
  - Median rasio per kategori (n kecil = tidak stabil): Dexs 0,342 (n11),
    RWA 0,275 (n9), Basis Trading 0,654 (n7), Lending 0,132 (n15),
    Yield 0,191 (n9), Liquid Staking 0,041 (n9). Risk Curators hanya n=1
    (2,975) — JANGAN pakai mentah; shrink ke median global.
  - Pre-token: umur median 513 hari (n318, 24 tanpa listed_at), change_7d
    median −6,82% (pasar turun minggu itu), min −72,7%, max +4.448% (outlier —
    WAJIB clamp, starter clamp −60/+120 sudah benar arahnya).

## 4. Kelemahan starter (house anchor #2, kekuatan 0,593)
- Model: implied = TVL × 0,25 × growth(0,5) × maturity(0,6–1,0). Konstanta
  tetap, tidak di-fit dari comps, tidak ada token odds, tidak ada ketidakpastian.
- Early rows: 160 by TVL tanpa filter Bridge/Liquid Staking (jebakan WBTC di atas).
- Farm plan: 6 langkah template generik per kategori, modal $50–250, tanpa
  break-even, tanpa verdict farm/skip, tanpa biaya gas per chain.
- Dashboard: board + detail + filter dasar, 200 baris, live view 24 token.
  Starter yang diserahkan apa adanya = entri biasa (anchor 2-plain).

## 5. RENCANA UNTUK MENGALAHKAN TOP 10 (target: win rate >96,68%, margin besar)
Target konkret: kalahkan #1 kiencx (96,6767%) — artinya menang decisive
(margin 4–5) vs house anchor, terutama anchor 4-strong (kekuatan 1,081) dan
rung r1–r3 (1,565 / 2,310 / 3,253) di ronde adaptif.

### 5.1 Model nilai — "comps-fit + odds + expected value", semua dari snapshot
- **Comps fit (128 token):** log-log OLS mcap~TVL + median rasio per kategori
  dengan shrinkage: `ratio_cat = (n_cat·median_cat + 8·median_global) / (n_cat+8)`.
  Implied dasar = TVL × ratio_cat_shrunk × koreksi ukuran log-log (slope 0,522).
  Tampilkan koefisien + n + R² di dashboard (jujur: R² 0,19).
- **Validasi held-out di halaman:** split-half (fit di 64, uji di 64) + leave-one-out,
  laporkan MAPE / hit-rate arah di dashboard sebagai tabel kecil. Ulangi 2x
  (seperti #1 "tested held-out twice").
- **Token odds:** peluang protokol akhirnya mencatat token, dari snapshot
  sendiri: bucket umur tanpa token + TVL + growth — hitung proporsi traded
  vs pre-token per bucket di snapshot (bukan klaim eksternal). Odds dikali
  implied → **expected value = implied × odds**. Rank board by expected value,
  tampilkan implied + odds + expected di tiap baris (juri #1 membedakan ini).
- **Ketidakpastian:** tiap baris tampilkan interval (low–high) dari sebaran
  rasio kategori; baris dengan data tipis (n kategori kecil) interval lebar —
  jujur, bukan palsu presisi.
- **Tidak ada hardcode nama.** Semua dari fungsi atas snapshot. Sebutkan
  eksplisit di dashboard: "no protocol name is special-cased".

### 5.2 Cakupan & integritas (kriteria juri #1)
- Board: 40 watchlist + semua pre-token rankable di bawah floor yang lolos
  filter penuh, total ~250 baris (bukan 758 — farm_steps 758 baris = dossier
  dan data.js membengkak; 250 cukup untuk kedalaman, 100+ untuk gate).
- **Integrity strip di atas board:** 758 = ranked N + traded set aside M
  (dengan market cap, bukan implied) + excluded K dengan alasan
  (CEX / Bridge / wrapped / versioned / sudah ada token). Semua angka
  harus berjumlah 758 — seperti #3/#10 "758/758 accounted".
- Live-token view terpisah (24 teratas by mcap) — jangan campur ke board.

### 5.3 Farm plan (kriteria juri #3) — per protokol, bukan template
- 6–8 langkah per baris, masing-masing 20–600 karakter, format:
  aksi + `Cost: $X` + `Time: …`.
- Modal disesuaikan TVL + kategori; gas per chain utama protokol (bukan flat);
  hold days dari umur (muda = lebih lama); aksi mingguan konkret per kategori;
  peringatan claim hanya dari link resmi protokol + "never pay to claim".
- **Break-even + verdict per baris:** expected value per $100 modal vs total
  biaya (gas + waktu) → verdict FARM / THIN / SKIP. Ini yang membedakan
  dari starter dan menyamai #1/#8.

### 5.4 Dashboard (kriteria juri #4–5)
- Board sortable (rank, expected value, TVL, growth, umur, odds) + filter
  (kategori, chain, status FARM/THIN/SKIP, watchlist saja, teks cari) +
  detail view per protokol (model breakdown: base, growth mult, maturity,
  odds, expected, interval + farm plan + break-even).
- Halaman metodologi singkat di dashboard: rumus, koefisien fit, tabel
  validasi held-out, batasan (R² 0,19, snapshot 14 Nov 2026, "records no
  token" bukan "has no token").
- Palet gelap konsisten, tipografi terbaca, spacing konsisten, tanpa framework.
- **Batas keras dossier:** source dashboard total <64 KB teks (dossier text
  cap 65.536 bytes — selebihnya terpotong dan juri baca sebagian). Screenshot
  3 buah, masing-masing 300–350 KB, 1440×800 minimum sisi pendek 800.
  Dossier total target <800 KB.
- Teks yang ditujukan ke juri BOLEH ada di dashboard (rules mengizinkan) —
  pakai secukupnya: satu blok "How this board was built" yang jujur.

### 5.5 Gate & determinisme (jangan gagal di hal teknis)
- main.ts Node 22 stdlib saja, baca /input/snapshot.json, tulis board.json +
  data.js + dashboard/ + screenshots/ + dossier.json via vendor/makefun-board.ts
  (byte-for-byte dari kit). Dua run harus hasil byte-identik.
- board.json: rows 100–4.000, rank 1..N unik, implied_value_usd tidak naik
  seiring rank, farm_steps 3–12 string 20–600 karakter, slug dari snapshot.
- .makefun/owner.json berisi wallet Solana GWXNPYTKQvCfbgx1viQCkb5UkukVVPthYuyKXzadvi65
  saja (di repo, bukan di sini).
- Transkrip: builder MENULIS kode di sesinya sendiri (jangan copy-paste file
  starter / antar kompetisi — authorship check bisa 0%). Starter boleh
  dibaca sebagai referensi, tapi main.ts + model + dashboard ditulis baru.
  Minimal 30% authored lines, entrypoint ≥1 authored line, ≥2 revisi per file
  kunci, ≥5 assistant turn berteks.

## 6. Struktur build
```
~/workspace/makefun/token-radar-01/   <- repo kerja (entry baru, dari nol)
  main.ts, lib/model.ts, lib/farm.ts (boleh), vendor/makefun-board.ts (dari kit, byte-identik)
  dashboard/index.html, dashboard/app.css, dashboard/app.js
  screenshots/1-board.png, 2-detail.png, 3-filtered.png
  LICENSE (MIT), .makefun/owner.json
  out/ (hasil run lokal, bukan bagian repo)
~/workspace/makefun/token-radar-01-kit/  <- kit (sudah diunduh, jangan diubah)
```
Verifikasi: run main.ts 2x → byte-identik; kit check
`node cli/makefun.mjs check --kit <kit> --repo <repo> --transcripts <bundle>`;
cek kuota ulang via API sebelum lapor; uji dashboard offline (tanpa network).
STOP setelah verifikasi. JANGAN submit, JANGAN buat repo GitHub publik —
itu langkah terpisah oleh agen utama.
