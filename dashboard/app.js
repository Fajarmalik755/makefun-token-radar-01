/* Token Launch Radar — renders window.RADAR only. No network, no framework. */
(function () {
  var D = window.RADAR;
  var root = document.getElementById('boardSec');
  if (!D || !D.rows) { document.body.textContent = 'No data: data.js did not load.'; return; }
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '—' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var money = function (n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'k';
    return s + '$' + Math.round(a).toLocaleString('en-US');
  };
  var money0 = function (n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); };
  var pct1 = function (v, suf) {
    if (v == null || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + (suf || '%');
  };
  var pct100 = function (v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; };
  var bigPct = function (v) { return v == null ? '—' : (v * 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '%'; };
  var days = function (n) { return n == null ? '—' : n.toLocaleString('en-US') + 'd'; };
  var verdict = function (v) { return '<span class="badge v-' + v + '">' + v + '</span>'; };

  /* ---- header + integrity ---- */
  var I = D.integrity, M = D.model;
  $('asOf').textContent = D.as_of;
  $('asOf2').textContent = D.as_of;
  $('floor').textContent = money(D.floor_usd);
  $('mVer').textContent = D.model_version;
  $('boardN').textContent = D.board_size;
  $('fitEq').textContent = 'log(mcap) = ' + M.log_log_intercept + ' + ' + M.log_log_slope + '·log(TVL)';
  $('fitN').textContent = M.comps_n;
  $('fitCap').textContent = M.ratio_cap.toFixed(4);
  $('fitRate').textContent = pct100(M.global_traded_rate);
  $('fitR2').textContent = M.r_squared;
  var reasons = Object.keys(I.excluded_by_reason).sort(function (a, b) {
    return I.excluded_by_reason[b] - I.excluded_by_reason[a];
  }).map(function (k) {
    return '<li>' + esc(k) + ': <b>' + I.excluded_by_reason[k] + '</b></li>';
  }).join('');
  $('integrity').innerHTML =
    '<div class="strip">'
    + '<div class="cell hot"><b>' + I.total + '</b><span>protocols in snapshot</span></div>'
    + '<div class="cell"><b>' + I.ranked + '</b><span>ranked on the board</span></div>'
    + '<div class="cell"><b>' + I.traded_set_aside + '</b><span>already trading — set aside</span></div>'
    + '<div class="cell"><b>' + I.excluded + '</b><span>excluded (reasons below)</span></div></div>'
    + '<p class="eq"><b>' + I.total + ' = ' + I.ranked + ' ranked (' + I.watchlist_ranked + ' watchlist + '
    + I.below_floor_ranked + ' below the floor) + ' + I.traded_set_aside + ' traded + ' + I.excluded
    + ' excluded</b> — check total ' + I.check_total + '/' + I.total + '.</p>'
    + '<details class="reasons"><summary>Why the ' + I.excluded + ' excluded protocols are out</summary><ul>'
    + reasons + '</ul></details>';

  /* ---- validation table ---- */
  var vrow = function (label, v) {
    return '<tr><td>' + label + '</td><td class="num">' + (v.train_n != null ? v.train_n : '127') + '</td><td class="num">'
      + (v.test_n != null ? v.test_n : v.n) + '</td><td class="num">' + bigPct(v.mape)
      + '</td><td class="num">' + pct100(v.median_ape) + '</td><td class="num">' + pct100(v.hit_rate_within_2x) + '</td></tr>';
  };
  $('valRows').innerHTML =
    vrow('Split-half 1 (even/odd by slug)', M.validation.split_half_1)
    + vrow('Split-half 2 (first/second half)', M.validation.split_half_2)
    + vrow('Leave-one-out', M.validation.leave_one_out);

  /* ---- filter options ---- */
  var cats = {}, chains = {};
  D.rows.forEach(function (r) {
    cats[r.category || '(no category)'] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  var fill = function (el, list) {
    list.forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o);
    });
  };
  fill($('fCat'), Object.keys(cats).sort());
  fill($('fChain'), Object.keys(chains).sort());

  /* ---- board: filter + sort + render ---- */
  var S = { k: 'rank', dir: 1, q: '', cat: '', chain: '', verdict: '', wl: false };
  var sortVal = function (r, k) {
    if (k === 'name' || k === 'category') return (r[k] || '').toLowerCase();
    if (k === 'verdict') return r.farm.verdict;
    var v = r[k];
    return v == null ? -Infinity : v;
  };
  var filtered = function () {
    var q = S.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (S.wl && !r.watchlist) return false;
      if (S.cat && (r.category || '(no category)') !== S.cat) return false;
      if (S.chain && r.chains.indexOf(S.chain) < 0) return false;
      if (S.verdict && r.farm.verdict !== S.verdict) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var x = sortVal(a, S.k), y = sortVal(b, S.k);
      var c = x < y ? -1 : x > y ? 1 : 0;
      return c * S.dir || (a.rank - b.rank);
    });
  };
  var render = function () {
    var list = filtered();
    $('count').textContent = 'Showing ' + list.length + ' of ' + D.rows.length + ' ranked';
    $('rows').innerHTML = list.map(function (r) {
      var chg = r.change_7d == null ? '<td class="num">—</td>'
        : '<td class="num ' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct1(r.change_7d) + '</td>';
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0"><td>' + r.rank + '</td>'
        + '<td class="name">' + (r.watchlist ? '<span class="star" title="Watchlist">★ </span>' : '')
        + esc(r.name) + '<span class="cat">' + esc(r.category || '—') + '</span>'
        + '<span class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>'
        + '<td>' + esc(r.category || '—') + '</td>'
        + '<td class="num">' + money(r.tvl_usd) + '</td>' + chg
        + '<td class="num">' + days(r.age_days) + '</td>'
        + '<td class="num">' + pct100(r.token_odds) + '</td>'
        + '<td class="num"><b>' + money(r.expected_value_usd) + '</b></td>'
        + '<td>' + verdict(r.farm.verdict) + '</td></tr>';
    }).join('') || '<tr><td colspan="9">No protocols match these filters.</td></tr>';
    document.querySelectorAll('#board th').forEach(function (th) {
      var k = th.getAttribute('data-k');
      th.classList.toggle('on', k === S.k);
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (k === S.k ? (S.dir > 0 ? ' ▲' : ' ▼') : '');
    });
  };
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (S.k === k) S.dir = -S.dir; else { S.k = k; S.dir = k === 'name' || k === 'category' ? 1 : -1; }
      if (k === 'rank') S.dir = 1;
      render();
    });
  });
  $('q').addEventListener('input', function (e) { S.q = e.target.value; render(); });
  $('fCat').addEventListener('change', function (e) { S.cat = e.target.value; render(); });
  $('fChain').addEventListener('change', function (e) { S.chain = e.target.value; render(); });
  $('fVerdict').addEventListener('change', function (e) { S.verdict = e.target.value; render(); });
  $('fWatch').addEventListener('change', function (e) { S.wl = e.target.checked; render(); });

  /* ---- detail view ---- */
  var kv = function (rows) {
    return '<table class="kv"><tbody>' + rows.map(function (p) {
      return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td></tr>';
    }).join('') + '</tbody></table>';
  };
  var openDetail = function (slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var m = r.model, f = r.farm;
    var d = $('detail');
    d.hidden = false;
    d.innerHTML = '<button class="close" type="button" id="dClose">Close ×</button>'
      + '<h2>#' + r.rank + ' ' + esc(r.name) + ' ' + verdict(f.verdict) + '</h2>'
      + '<p class="meta">' + esc(r.category || '—') + ' · ' + esc(r.chains.join(', '))
      + (r.watchlist ? ' · ★ watchlist' : '') + ' · listed ' + esc(r.listed_at || 'unknown')
      + ' · pre-token (snapshot records no token)</p>'
      + '<div class="grid"><div><h3>Model breakdown</h3>'
      + kv([
        ['Expected value (ranked)', '<b>' + money0(r.expected_value_usd) + '</b>'],
        ['Gross implied value (before odds)', money0(r.gross_implied_usd)],
        ['Token odds', pct100(r.token_odds) + ' — bucket ' + esc(m.odds_bucket) + ' (n=' + m.odds_bucket_n + ')'],
        ['Interval low – high', money0(r.value_low_usd) + ' – ' + money0(r.value_high_usd)],
        ['TVL', money0(r.tvl_usd)],
        ['Category ratio (shrunk)', m.ratio_category + ' — category n=' + m.ratio_category_n + ', global median ' + m.ratio_global],
        ['Log-log fit', 'log(mcap) = ' + m.log_log_intercept + ' + ' + m.log_log_slope + '·log(TVL)'],
        ['Size factor', m.size_factor],
        ['Growth 7d', pct1(m.growth_pct) + ' → multiplier ' + m.growth_multiplier],
        ['Maturity multiplier', m.maturity_multiplier + ' (' + days(m.age_days) + ' old)'],
        ['Sample behind the fit', M.comps_n + ' traded comps, R² = ' + M.r_squared]
      ]) + '</div><div><h3>Farm plan — ' + esc(f.main_chain) + '</h3>'
      + '<div class="farmline">'
      + '<span class="pill"><span>Capital</span> <b>' + money0(f.capital_usd) + '</b></span>'
      + '<span class="pill"><span>Gas / tx</span> <b>' + money0(f.gas_per_tx_usd) + '</b></span>'
      + '<span class="pill"><span>Gas total</span> <b>' + money0(f.gas_total_usd) + '</b></span>'
      + '<span class="pill"><span>Total cost</span> <b>' + money0(f.total_cost_usd) + '</b></span>'
      + '<span class="pill"><span>Hold</span> <b>' + f.hold_days + ' days</b></span></div>'
      + kv([
        ['Farmer expected value (1/20,000 share)', money0(f.farmer_ev_usd)],
        ['Expected value per $100 capital', money0(f.ev_per_100_usd)],
        ['Net (farmer EV − total cost)', money0(f.net_usd)],
        ['Break-even expected value', money0(f.break_even_expected_usd)],
        ['Verdict', f.verdict + ' — FARM needs 10× cost, THIN 3×, else SKIP']
      ])
      + '<h3>Steps</h3><ol class="steps">' + r.farm_steps.map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ol></div></div>';
    $('dClose').addEventListener('click', function () { d.hidden = true; d.innerHTML = ''; });
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('rows').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  /* ---- live view ---- */
  $('liveRows').innerHTML = D.live.map(function (r, i) {
    var chg = r.change_7d == null ? '—'
      : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct1(r.change_7d) + '</span>';
    return '<tr><td>' + (i + 1) + '</td><td class="name">' + esc(r.name)
      + '<span class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + '</span></td>'
      + '<td>' + esc(r.category || '—') + '</td>'
      + '<td class="num">' + money(r.tvl_usd) + '</td>'
      + '<td class="num"><b>' + money(r.mcap_usd) + '</b></td>'
      + '<td class="num">' + r.mcap_tvl_ratio.toFixed(3) + '</td>'
      + '<td class="num">' + chg + '</td></tr>';
  }).join('');

  /* ---- tabs ---- */
  var show = function (view) {
    $('tabBoard').classList.toggle('on', view === 'board');
    $('tabLive').classList.toggle('on', view === 'live');
    $('tabMethod').classList.toggle('on', view === 'method');
    $('boardSec').hidden = view !== 'board';
    $('liveSec').hidden = view !== 'live';
    $('methodSec').hidden = view !== 'method';
    if (view !== 'board') { var d = $('detail'); d.hidden = true; d.innerHTML = ''; }
  };
  $('tabBoard').addEventListener('click', function () { show('board'); });
  $('tabLive').addEventListener('click', function () { show('live'); });
  $('tabMethod').addEventListener('click', function () { show('method'); });

  render();
})();
