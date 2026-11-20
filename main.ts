// Token Launch Radar: snapshot in, ranked board + dashboard data + dossier out.
//
// Reads the sealed snapshot, scores it with the fitted model in lib/model.ts,
// and writes the grader's /output: board.json, data.js, a copy of dashboard/,
// a copy of screenshots/, and dossier.json from the vendored make.fun library.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
// The grader runs it with /input mounted and /output writable, no network,
// and runs it twice: both runs must write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** --name <value> out of the arguments, or the fallback. */
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = option('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot, radar.integrity);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
if (dashboardFiles.length === 0) fail('dashboard/ is empty: the dashboard builder has not delivered index.html, app.css and app.js yet');
if (!dashboardFiles.includes('index.html')) fail('dashboard/ holds no index.html');
if (!dashboardFiles.some((f) => f.endsWith('.css'))) fail('dashboard/ holds no .css file');
if (!dashboardFiles.some((f) => f.endsWith('.js'))) fail('dashboard/ holds no .js file');

const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const m = radar.model;
const v = m.validation;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} board rows (${radar.integrity.watchlist_ranked} watchlist + ${radar.integrity.below_floor_ranked} below the floor)\n` +
    `token radar: integrity ${radar.integrity.check_total}/${radar.integrity.total} (ranked ${radar.integrity.ranked}, traded set aside ${radar.integrity.traded_set_aside}, excluded ${radar.integrity.excluded})\n` +
    `token radar: comps fit n=${m.comps_n} log(mcap) = ${m.log_log_intercept} + ${m.log_log_slope}·log(tvl), R²=${m.r_squared}; split-half MAPE ${v.split_half_1.mape}/${v.split_half_2.mape}, LOO MAPE ${v.leave_one_out.mape}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
