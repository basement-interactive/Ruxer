// scripts/maybe-rebuild-frontend.mjs
// Skip the ~30-60s frontend rebuild when nothing in the reference client has
// changed. Hashes the build inputs, compares to web/.dist-hash, and either:
//   * MATCH  -> prints a message and exits 0 (web/dist is already current)
//   * MISS   -> runs the full build (rspack + tauri-postbuild + tauri-stage),
//               then writes the new hash so the next run skips.
//
// Usage:
//   node scripts/maybe-rebuild-frontend.mjs            # skip-or-rebuild
//   node scripts/maybe-rebuild-frontend.mjs --force    # always rebuild
//
// Why this is cross-platform Node (not bash/ps1): the frontend build itself
// requires Node + pnpm, so Node is guaranteed present whenever this would run.
// Using Node avoids maintaining two parallel .sh/.ps1 versions of the hashing
// logic. CI calls this script instead of running rspack unconditionally.
//
// Hashed inputs (change any of these -> rebuild):
//   - reference/fluxer/fluxer_app/{src,scripts}/**      (source + build helpers)
//   - reference/fluxer/fluxer_app/package.json          (dep versions / scripts)
//   - reference/fluxer/fluxer_app/pnpm-lock.yaml        (locked dep graph)
//   - reference/fluxer/fluxer_app/rspack.config.mjs     (bundler config)
//   - reference/fluxer/fluxer_app/tsconfig*.json        (TS config affects emit)
//   - reference/fluxer/fluxer_app/postcss.config.*      (CSS pipeline)
//   - this script itself                                (logic change -> rebuild)
//
// NOT hashed (intentionally):
//   - dist/ — that's the OUTPUT; hashing it would be circular.
//   - node_modules/ — covered transitively by pnpm-lock.yaml.
//   - assets/ — doesn't exist in this checkout; if it appears later, add it.

import {createHash} from 'node:crypto';
import {createReadStream, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const APP_DIR = join(REPO_ROOT, 'reference', 'fluxer', 'fluxer_app');
const HASH_FILE = join(REPO_ROOT, 'web', '.dist-hash');
const FORCE = process.argv.includes('--force');

// --- collect the files to hash -------------------------------------------
const HASH_DIRS = ['src', 'scripts'];
const HASH_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'rspack.config.mjs',
];
// Optional files — included only if present.
const HASH_OPTIONAL_GLOBS = ['tsconfig.json', 'postcss.config.mjs', 'postcss.config.js', 'postcss.config.cjs'];

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function hashFile(h, absPath) {
  // Read as a stream so large files (pnpm-lock is ~540KB) don't load fully.
  // We feed the relative path into the hash too, so renaming a file invalidates.
  const rel = relPath(absPath);
  h.update(rel + '\0');
  try {
    const buf = readFileSync(absPath);
    h.update(buf);
  } catch {
    // Binary or odd files — fall back to size + mtime as a fingerprint.
    const st = statSync(absPath);
    h.update(`size=${st.size};mtime=${Math.floor(st.mtimeMs)};`);
  }
  h.update('\0');
}

function relPath(abs) {
  let r = abs;
  if (r.startsWith(REPO_ROOT)) r = r.slice(REPO_ROOT.length).replace(/^[\\/]/, '');
  return r.replace(/\\/g, '/');
}

const h = createHash('sha256');
// Salt the hash with this script's own content (a logic change forces rebuild).
hashFile(h, fileURLToPath(import.meta.url));
for (const sub of HASH_DIRS) {
  const dir = join(APP_DIR, sub);
  if (existsSync(dir)) for (const f of walk(dir)) hashFile(h, f);
}
for (const f of HASH_FILES) {
  const p = join(APP_DIR, f);
  if (existsSync(p)) hashFile(h, p);
}
for (const g of HASH_OPTIONAL_GLOBS) {
  const p = join(APP_DIR, g);
  if (existsSync(p)) hashFile(h, p);
}
const newHash = h.digest('hex');

// --- compare ---------------------------------------------------------------
const webDistExists = existsSync(join(REPO_ROOT, 'web', 'dist', 'index.html'));
if (!FORCE && webDistExists && existsSync(HASH_FILE)) {
  const prev = readFileSync(HASH_FILE, 'utf8').trim();
  if (prev === newHash) {
    console.log(`[frontend] web/dist is current (hash ${newHash.slice(0, 12)}). Skipping rebuild.`);
    process.exit(0);
  }
  console.log(`[frontend] inputs changed (was ${prev.slice(0, 12)}, now ${newHash.slice(0, 12)}). Rebuilding.`);
} else {
  const reason = FORCE ? 'forced (--force)'
    : !webDistExists ? 'web/dist missing'
    : 'no prior hash';
  console.log(`[frontend] rebuilding (${reason}).`);
}

// --- run the build ---------------------------------------------------------
// We invoke the same commands AGENTS.md / CLAUDE.md document, in order:
//   1. rspack production build (emits fluxer_app/dist)
//   2. tauri-postbuild.mjs     (fills index.html placeholders, neutralizes SW)
//   3. tauri-stage.mjs         (copies dist -> web/dist)
// Each step must succeed or we abort without writing the new hash (so the next
// run retries the build rather than caching a broken state).
const PKG_MGR = existsSync(join(APP_DIR, 'pnpm-lock.yaml')) ? 'pnpm'
  : existsSync(join(APP_DIR, 'yarn.lock')) ? 'yarn'
  : 'npm';

function run(label, cmd, args, cwd) {
  console.log(`[frontend] ${label}: ${cmd} ${args.join(' ')}${cwd ? `  (in ${cwd})` : ''}`);
  const r = spawnSync(cmd, args, {cwd, stdio: 'inherit', shell: process.platform === 'win32'});
  if (r.status !== 0) {
    console.error(`[frontend] ${label} failed with exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

// CODEGEN before rspack. The reference client's own `build` script runs a chain
// of generators first — they emit files that are GITIGNORED in the upstream repo
// (SVGMasks.tsx, i18n messages.mjs, ThemeVariableManifest.ts, generated CSS +
// css-type .d.ts, config schemas). A bare `rspack build` fails with "Cannot find
// module '@app/features/ui/components/SVGMasks'" etc. on a clean checkout
// (e.g. CI) because those files don't exist yet. Run the same lightweight
// generators the reference build does (all pure tsx/node — no Rust), then rspack.
// NOTE: `wasm:codegen` is deliberately OMITTED — it compiles a wasm32 crate via
// wasm-bindgen (needs the Rust wasm target + a network download of the CLI). Its
// output (fluxer_app/pkgs/libfluxcore, ~214 KB) is small and stable, so it's
// committed to the repo instead of rebuilt every CI run.
const CODEGEN_STEPS = [
  'generate:colors',
  'generate:message-layout',
  'generate:theme-variables',
  'generate:masks',
  'generate:css-types',
];
for (const step of CODEGEN_STEPS) {
  run(`codegen ${step}`, PKG_MGR, ['run', step], APP_DIR);
}

// i18n compile: the reference's `lingui:compile` script passes `--strict`, which
// FAILS the whole build if ANY locale has a missing translation. This client
// ships partial translations (newly-added UI strings aren't translated into all
// ~40 locales yet), and lingui's normal behaviour for a missing translation is
// to fall back to the source (English) string — which is exactly what we want in
// a build. So run `lingui compile` WITHOUT `--strict`: still emits every
// locale's messages.mjs, just doesn't treat untranslated strings as fatal.
run('codegen lingui compile (non-strict)', PKG_MGR, ['exec', 'lingui', 'compile'], APP_DIR);

// rspack binary path mirrors AGENTS.md (avoid relying on a global rspack).
const RSPACK = join(APP_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'rspack.cmd' : 'rspack');
const RSPACK_BIN = existsSync(RSPACK)
  ? RSPACK
  : PKG_MGR; // fallback: `pnpm exec rspack`
const rspackArgs = existsSync(RSPACK) ? ['build', '--mode', 'production'] : ['exec', 'rspack', 'build', '--mode', 'production'];
run('rspack build', existsSync(RSPACK) ? RSPACK : PKG_MGR, rspackArgs, APP_DIR);
run('tauri-postbuild', process.platform === 'win32' ? 'node.exe' : 'node', ['scripts/tauri-postbuild.mjs'], APP_DIR);
run('tauri-stage', process.platform === 'win32' ? 'node.exe' : 'node', ['scripts/tauri-stage.mjs'], APP_DIR);

// --- record the new hash ---------------------------------------------------
writeFileSync(HASH_FILE, newHash + '\n', 'utf8');
console.log(`[frontend] done. Recorded hash ${newHash.slice(0, 12)} -> web/.dist-hash`);
