#!/usr/bin/env node
// scripts/check-models.mjs
// Detect drift between the static model lists in voice-core (models.ts) and
// each provider's public documentation. Runs without any API key: it fetches
// the public models / deprecations pages, flattens them to text and looks for
// every id we ship. If a provider key is present in the environment it also
// pulls the live /models list through voice-core's listModels() and merges
// that into the report. Keys are read from process.env only and never printed.
//
// Usage: node scripts/check-models.mjs [--out report.md] [--timeout-ms 20000]
// Exit 1 when at least one severe finding exists, 0 otherwise (warnings and
// "unverifiable" rows do not fail the run).
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const distDir = path.join(root, 'packages/voice-core/dist');

// ---- CLI -------------------------------------------------------------------
const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) { console.error(`${flag} needs a value`); process.exit(2); }
  return v;
}
const outPath = argValue('--out', null);
const timeoutMs = Number(argValue('--timeout-ms', '20000'));

// ---- load the static lists from the built package ---------------------------
let core;
try {
  core = await import(pathToFileURL(path.join(distDir, 'index.js')).href);
} catch (e) {
  console.error(`Cannot load ${distDir}. Run "npm run build:core" first.\n${e.message}`);
  process.exit(2);
}
const { STT_MODELS, POLISH_MODELS, DEFAULT_MODEL, DEFAULT_POLISH_MODEL,
  RETIRED_MODEL_REPLACEMENTS, MODEL_LIST_VERIFIED_AT, listModels } = core;

// ---- public documentation pages, per provider --------------------------------
// `models[0]` is the primary models page (fallback hosts may follow it via
// `altModels`); `extraModels` pages (pricing etc.) are additive presence
// sources; `deprecations` pages raise warnings.
const SOURCES = {
  groq: {
    models: ['https://console.groq.com/docs/models'],
    extraModels: [],
    deprecations: ['https://console.groq.com/docs/deprecations'],
    envKey: 'GROQ_API_KEY',
  },
  openai: {
    models: ['https://developers.openai.com/api/docs/models'],
    extraModels: ['https://developers.openai.com/api/docs/pricing'],
    deprecations: ['https://developers.openai.com/api/docs/deprecations'],
    envKey: 'OPENAI_API_KEY',
  },
  gemini: {
    models: ['https://ai.google.dev/gemini-api/docs/models'],
    extraModels: [],
    deprecations: ['https://ai.google.dev/gemini-api/docs/deprecations'],
    envKey: 'GEMINI_API_KEY',
  },
  claude: {
    // platform.claude.com redirects to the current path; docs.anthropic.com is
    // the historical host and is tried only if the first one fails.
    models: ['https://platform.claude.com/docs/en/about-claude/models/overview',
             'https://docs.anthropic.com/en/docs/about-claude/models/overview'],
    extraModels: [],
    deprecations: ['https://platform.claude.com/docs/en/about-claude/model-deprecations',
                   'https://docs.anthropic.com/en/docs/about-claude/model-deprecations'],
    envKey: 'ANTHROPIC_API_KEY',
  },
};
const PROVIDERS = Object.keys(SOURCES);

// ---- fetch + flatten ------------------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
/** Visible text: tags, scripts and styles removed. Full text: tags removed but
 *  script bodies kept, because some docs sites (Groq) ship the model table as
 *  JSON inside a <script> and render it client-side. */
function flatten(body, contentType) {
  const isHtml = /html/i.test(contentType || '') || /<\s*(html|body|div)\b/i.test(body.slice(0, 4000));
  if (!isHtml) {
    const t = decodeEntities(body).replace(/[ \t]+/g, ' ').trim();
    return { visible: t, full: t };
  }
  const noStyle = body.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const strip = (s) => decodeEntities(
    s.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(p|li|tr|h\d|div|section|td|th)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '))
    .replace(/\\u002F/g, '/').replace(/\\n/g, '\n')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return {
    visible: strip(noStyle.replace(/<script[\s\S]*?<\/script>/gi, ' ')),
    full: strip(noStyle),
  };
}

/** Returns { ok, visible, full, status, url, reason }. Never throws. */
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow', signal: ctrl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; vocium-check-models)',
        'accept-language': 'en',
        accept: 'text/html,text/markdown,text/plain;q=0.9,*/*;q=0.8',
      },
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, status: res.status, url: res.url, reason: `HTTP ${res.status}` };
    const { visible, full } = flatten(body, res.headers.get('content-type'));
    // A JS shell renders nothing server-side: almost no visible text and no
    // embedded data either. Treat as unverifiable rather than "model missing".
    if (visible.length < 500 && full.length < 2000) {
      return { ok: false, status: res.status, url: res.url, reason: 'no server-rendered content (JS shell)' };
    }
    return { ok: true, status: res.status, url: res.url, visible, full };
  } catch (e) {
    const reason = e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (e.cause?.message || e.message);
    return { ok: false, status: 0, url, reason };
  } finally { clearTimeout(timer); }
}

/** Try each URL in order; the first reachable one wins. */
async function fetchFirstOk(urls) {
  const failures = [];
  for (const u of urls) {
    const p = await fetchPage(u);
    if (p.ok) return { page: p, failures };
    failures.push(`${u}: ${p.reason}`);
  }
  return { page: null, failures };
}

// ---- id matching ----------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Model ids must stand alone: "whisper-large-v3" must not match inside
// "whisper-large-v3-turbo", "gpt-6" not inside "gpt-6.1-sol".
const idRegex = (id) => new RegExp(`(?<![A-Za-z0-9._/-])${esc(id)}(?![A-Za-z0-9._/-])`, 'i');
function containsId(text, id) { return idRegex(id).test(text); }
const mdSafe = (s) => s.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|').replace(/`/g, "'");

// ---- deprecations-page interpretation --------------------------------------
// Deprecation pages are tables that mention an id either as the deprecated
// subject or as the recommended replacement / an active model with a
// "not sooner than" date. Only the former is a warning; the latter is noise.
// The id immediately after a "replacement" cue, a date, or "N/A" (the
// shutdown-date column) sits in the replacement column.
const REPLACEMENT_CUE_RE =
  /(in favou?r of|recommend\w*(\s+\w+){0,3}|replacement(\s+model(\s+id)?)?|migrat\w*\s+to|successor|\bor\b|\band\b|\bto\b|N\/A|\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\W{0,8}$/i;
const STATUS_OK_RE = /no shutdown date|not sooner than|\bactive\b/i;
const DATE_RE = /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;
// A token that looks like another model id ends the current table row.
const MODEL_TOKEN_RE = /\b[a-z][a-z0-9]*(?:[-/.][a-z0-9]+)*[-/.][a-z0-9]*\d[a-z0-9.-]*\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** All forms parse to UTC midnight so the printed day never shifts with the local zone. */
function parseDate(s) {
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) return new Date(Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], MONTHS.indexOf(m[1].toLowerCase()), +m[2]));
  return null;
}
// Groq-style table where one row lists two replacements on separate lines:
// "<date>\n <replacement-a>\n <replacement-b>". The second one is preceded by a
// model token rather than a date; it is still the replacement column as long
// as no shutdown date follows it (a row subject is always followed by one).
const SECOND_REPLACEMENT_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4})\s*\n\s*[^\n]*\d[^\n]*\n\s*$/;
const hasDate = (s) => new RegExp(DATE_RE.source, 'i').test(s);

/** Row context for each occurrence of `id` in the visible text. */
function deprecationHits(text, id) {
  const re = new RegExp(idRegex(id).source, 'gi');
  const hits = [];
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 90), m.index);
    const afterFull = text.slice(m.index + id.length, m.index + id.length + 240);
    let after = afterFull;
    const next = MODEL_TOKEN_RE.exec(after.slice(1));
    if (next) after = after.slice(0, next.index + 1);
    const asReplacement = REPLACEMENT_CUE_RE.test(before) || (SECOND_REPLACEMENT_RE.test(before) && !hasDate(after));
    const activeRow = STATUS_OK_RE.test(after);
    // Markdown table: the id in the last of >= 3 cells is the replacement column.
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    let lineEnd = text.indexOf('\n', m.index); if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const cells = line.trim().startsWith('|') ? line.split('|').map((c) => c.trim()).filter(Boolean) : [];
    const inLastCell = cells.length >= 3 && containsId(cells[cells.length - 1], id) && !containsId(cells.slice(0, -1).join(' '), id);
    // Shutdown dates live in the same table row or the same prose sentence,
    // so look at the whole line when there is one, else the raw window.
    const dateSource = line.length > 20 && line.length <= 400 ? line : before.slice(-40) + id + afterFull;
    const dates = [...dateSource.matchAll(DATE_RE)].map((d) => parseDate(d[0])).filter(Boolean);
    const context = line.length > 20 && line.length <= 240 ? line : `…${before.slice(-70)}${id}${after.slice(0, 110)}…`;
    hits.push({ benign: asReplacement || activeRow || inLastCell, dates, context: mdSafe(context) });
  }
  return hits;
}

// ---- gather ids per provider ----------------------------------------------
function collectIds(provider) {
  const rows = new Map(); // id -> Set(roles)
  const add = (id, role) => { if (!rows.has(id)) rows.set(id, new Set()); rows.get(id).add(role); };
  for (const m of STT_MODELS[provider] ?? []) add(m.id, 'stt');
  for (const m of POLISH_MODELS[provider] ?? []) add(m.id, 'polish');
  if (DEFAULT_MODEL[provider]) add(DEFAULT_MODEL[provider], 'default-stt');
  if (DEFAULT_POLISH_MODEL[provider]) add(DEFAULT_POLISH_MODEL[provider], 'default-polish');
  return rows;
}
// RETIRED_MODEL_REPLACEMENTS has no provider field; infer it from which list
// the replacement id lives in, then from the id's naming family.
function providerOfReplacement(id) {
  for (const p of PROVIDERS) if (collectIds(p).has(id)) return p;
  if (/^gemini/i.test(id)) return 'gemini';
  if (/^claude/i.test(id)) return 'claude';
  if (/^gpt-|^o\d/i.test(id)) return 'openai';
  return 'groq';
}

// ---- live comparison (optional, key from env only) --------------------------
async function liveIds(provider) {
  const key = process.env[SOURCES[provider].envKey];
  if (!key) return null;
  try {
    const listed = await listModels(provider, { apiKey: key }, { fetch });
    return { ok: true, ids: new Set([...listed.stt, ...listed.polish, ...listed.other].map((m) => m.id)) };
  } catch (e) {
    // Error text may echo request details; keep it short and never the key.
    return { ok: false, reason: String(e.message || e).split(key).join('***').slice(0, 200) };
  }
}

// ---- main -----------------------------------------------------------------
const SEV = { severe: '🔴 severe', warn: '🟡 warning', ok: '🟢 ok', na: '⚪ unverifiable' };
const findings = []; // { provider, id, roles, level }
const sections = [];
let anySevere = false;

for (const provider of PROVIDERS) {
  const src = SOURCES[provider];
  const ids = collectIds(provider);
  for (const [retired, replacement] of Object.entries(RETIRED_MODEL_REPLACEMENTS)) {
    if (providerOfReplacement(replacement) !== provider) continue;
    if (!ids.has(replacement)) ids.set(replacement, new Set());
    ids.get(replacement).add(`replacement for ${retired}`);
  }

  const [modelsRes, deprRes, live, ...extra] = await Promise.all([
    fetchFirstOk(src.models), fetchFirstOk(src.deprecations), liveIds(provider),
    ...src.extraModels.map((u) => fetchPage(u)),
  ]);
  for (const p of extra) if (!p.ok) modelsRes.failures.push(`${p.url}: ${p.reason}`);
  const modelPages = [modelsRes.page, ...extra.filter((p) => p.ok)].filter(Boolean);
  const deprPage = deprRes.page;
  const pageLink = (p) => `[${new URL(p.url).host}${new URL(p.url).pathname}](${p.url}) (HTTP ${p.status})`;

  const lines = [`## ${provider}`, ''];
  lines.push(`- Static list verified at: \`${MODEL_LIST_VERIFIED_AT[provider] ?? 'n/a'}\``);
  lines.push(`- Models page(s): ${modelPages.length ? modelPages.map(pageLink).join(', ') : '**unreachable**'}`);
  lines.push(`- Deprecations page: ${deprPage ? pageLink(deprPage) : '**unreachable**'}`);
  for (const f of [...modelsRes.failures, ...deprRes.failures]) lines.push(`  - could not fetch ${f}`);
  const liveNote = live === null ? 'skipped (no key in env)' : live.ok ? `${live.ids.size} ids returned` : `failed: ${live.reason}`;
  lines.push(`- Live /models (env \`${src.envKey}\`): ${liveNote}`);
  const liveCol = live?.ok;
  lines.push('', `| id | used as | models page | deprecations page |${liveCol ? ' live /models |' : ''}`,
    `|---|---|---|---|${liveCol ? '---|' : ''}`);

  for (const [id, roles] of ids) {
    let level = 'ok';
    let modelsCell, deprCell, liveCell = '';
    let onModelsPage = null; // null = unverifiable
    if (modelPages.length) onModelsPage = modelPages.some((p) => containsId(p.full, id));

    // Deprecations: visible text only — embedded JSON on these pages carries
    // the whole site catalogue, not deprecation facts.
    let deprecated = null; // null = unverifiable, else { hit } or false
    if (deprPage) {
      const hits = deprecationHits(deprPage.visible, id);
      const real = hits.filter((h) => !h.benign);
      if (real.length) deprecated = real[0];
      else deprecated = false;
      if (real.length) deprCell = `${SEV.warn} deprecated: "${real[0].context}"`;
      else if (hits.length) deprCell = `${SEV.ok} mentioned as replacement/active: "${hits[0].context}"`;
      else deprCell = SEV.ok;
    } else deprCell = SEV.na;

    if (onModelsPage === null) { modelsCell = SEV.na; level = 'na'; }
    else if (onModelsPage) {
      const visible = modelPages.some((p) => containsId(p.visible, id));
      modelsCell = visible ? SEV.ok : `${SEV.ok} (embedded data only)`;
    } else {
      // Absent from the models page. Still a warning (not severe) while the
      // deprecations page gives a shutdown date in the future: the id works,
      // it just needs replacing before that date.
      const future = deprecated && deprecated.dates.some((d) => d.getTime() > Date.now());
      if (future) {
        const last = new Date(Math.max(...deprecated.dates.map((d) => d.getTime()))).toISOString().slice(0, 10);
        modelsCell = `${SEV.warn} not listed; shutdown ${last}`;
        level = 'warn';
      } else { modelsCell = `${SEV.severe} not found`; level = 'severe'; }
    }
    if (deprecated === null) { if (level === 'ok') level = 'na'; }
    else if (deprecated && level === 'ok') level = 'warn';

    if (liveCol) {
      if (live.ids.has(id)) liveCell = ` ${SEV.ok} |`;
      else { liveCell = ` ${SEV.severe} not returned |`; level = 'severe'; }
    }
    const roleText = [...roles].join(', ');
    lines.push(`| \`${id}\` | ${roleText} | ${modelsCell} | ${deprCell} |${liveCell}`);
    findings.push({ provider, id, roles: roleText, level });
    if (level === 'severe') anySevere = true;
  }
  sections.push(lines.join('\n'));
}

const counts = { severe: 0, warn: 0, na: 0, ok: 0 };
for (const f of findings) counts[f.level]++;
const now = new Date().toISOString().slice(0, 10);
const verdict = anySevere ? '🔴 drift detected'
  : counts.warn ? '🟡 warnings only'
  : counts.na ? '⚪ some rows unverifiable, no drift'
  : '🟢 all clear';
const report = [
  `# Model list drift check — ${now}`, '',
  'Source of truth: `packages/voice-core/src/stt/models.ts`. Public docs only; live `/models` is consulted only where a key was present in the environment.', '',
  `**Result:** ${verdict} — severe ${counts.severe}, warning ${counts.warn}, unverifiable ${counts.na}, ok ${counts.ok}.`, '',
  ...(counts.severe
    ? ['### Severe', ...findings.filter((f) => f.level === 'severe').map((f) => `- ${f.provider}: \`${f.id}\` (${f.roles})`), '']
    : []),
  ...sections, '',
  '_Legend: severe = id absent from the provider\'s models page with no future shutdown date (or absent from live /models); warning = id listed as deprecated, or absent from the models page but with a shutdown date still ahead; ok "mentioned as replacement/active" = the deprecations page names the id only as a replacement or an active model; unverifiable = page could not be fetched or is a JS shell._',
].join('\n');

process.stdout.write(report + '\n');
if (outPath) await writeFile(outPath, report + '\n', 'utf8');
process.exit(anySevere ? 1 : 0);
