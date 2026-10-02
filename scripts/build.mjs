// Lee los repositorios públicos de GitHub, guarda data/github.json y genera dist/
// en español (/) e inglés (/en/).
//
//   GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs
//   node scripts/build.mjs --offline      reutiliza data/github.json sin llamar a la API

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => join(ROOT, ...p);
const site = JSON.parse(await readFile(at('content/site.json'), 'utf8'));
const OFFLINE = process.argv.includes('--offline');
const LANGS = ['es', 'en'];

// ---------------------------------------------------------------- datos

async function gh(path) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': `${site.github}-portfolio`,
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 409) return []; // repositorio sin commits
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} en ${path}: ${await res.text()}`);
  return res.json();
}

async function all(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

const authorNames = new Set(site.authorNames.map((n) => n.toLowerCase()));
const isMine = (c) =>
  c.author?.login === site.github || authorNames.has((c.commit.author.name || '').toLowerCase());

const localClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: site.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const hourOfDay = (iso) => {
  const [h, m] = localClock.format(new Date(iso)).split(':').map(Number);
  return h + m / 60;
};

// Solo se vuelven a leer los commits de los repos cuyo último push ha cambiado,
// así la comprobación periódica cuesta una llamada a la API cuando no hay novedades.
async function fetchData(previous) {
  const siteRepo = `${site.github}.github.io`;
  const cached = new Map((previous?.repos || []).map((r) => [r.name, r]));
  const repos = (await all(`/users/${site.github}/repos?type=owner&sort=pushed`))
    .filter((r) => !r.private && !r.fork);

  const hours = Array(24).fill(0);
  const buckets = Array(72).fill(0); // franjas de 20 minutos
  const list = [];
  let latest = null;

  for (const r of repos) {
    // El repo del portfolio recibe un commit del bot en cada actualización: se relee
    // siempre y no guarda su push, o cada publicación provocaría la siguiente.
    const pushed = r.name === siteRepo ? null : r.pushed_at;
    const old = cached.get(r.name);
    const dates = pushed && old?.dates && old.pushed === pushed
      ? old.dates
      : (await all(`/repos/${site.github}/${r.name}/commits`))
        .filter(isMine)
        .map((c) => c.commit.author.date)
        .sort();
    for (const d of dates) {
      const t = hourOfDay(d);
      hours[Math.floor(t)]++;
      buckets[Math.floor(t * 3)]++;
    }
    if (dates.length && (!latest || dates.at(-1) > latest.date)) latest = { repo: r.name, date: dates.at(-1) };
    list.push({
      name: r.name,
      description: r.description || '',
      language: r.language || '',
      topics: r.topics || [],
      homepage: r.homepage || '',
      url: r.html_url,
      created: r.created_at,
      pushed,
      commits: dates.length,
      first: dates[0] || null,
      latest: dates.at(-1) || pushed,
      dates,
    });
  }

  list.sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
  const languages = new Set(list.map((r) => r.language).filter(Boolean));

  return {
    user: site.github,
    totals: { commits: hours.reduce((a, b) => a + b, 0), repos: list.length, languages: languages.size },
    hours,
    buckets,
    latest,
    repos: list,
  };
}

async function loadData() {
  const file = at('data/github.json');
  const previous = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
  if (OFFLINE) {
    if (!previous) throw new Error('No hay data/github.json; ejecuta sin --offline.');
    return previous;
  }
  const fresh = await fetchData(previous);
  // La fecha solo cambia cuando cambian los datos, para no generar commits vacíos.
  const { generatedAt, ...prevBody } = previous || {};
  fresh.generatedAt = previous && JSON.stringify(prevBody) === JSON.stringify(fresh)
    ? generatedAt
    : new Date().toISOString();
  await mkdir(at('data'), { recursive: true });
  await writeFile(file, JSON.stringify(fresh, null, 2) + '\n');
  return fresh;
}

// ---------------------------------------------------------------- utilidades

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const year = (iso) => (iso ? new Date(iso).getUTCFullYear() : null);
const span = (a, b) => (!a ? '' : !b || a === b ? String(a) : `${a}–${b}`);
const ext = (href, text) => `<a href="${esc(href)}" rel="noopener">${esc(text)}</a>`;

// ---------------------------------------------------------------- reloj

// Escala de 270°, de las 06:00 a las 06:00 del día siguiente. La franja de
// 00:00 a 06:00 cae al final del arco, donde un cuentarrevoluciones tiene la zona roja.
const C = 200;
const A0 = -135;
const SWEEP = 270;
const angleAt = (v) => A0 + (v / 24) * SWEEP; // v: horas desde las 06:00
const fromClock = (t) => (((t - 6) % 24) + 24) % 24;
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};
const n2 = (x) => x.toFixed(2);
const tick = (deg, r1, r2, cls) => {
  const [x1, y1] = polar(deg, r1);
  const [x2, y2] = polar(deg, r2);
  return `<line class="${cls}" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}"/>`;
};
const arc = (r, d1, d2, cls) => {
  const [x1, y1] = polar(d1, r);
  const [x2, y2] = polar(d2, r);
  return `<path class="${cls}" d="M${n2(x1)} ${n2(y1)}A${r} ${r} 0 ${d2 - d1 > 180 ? 1 : 0} 1 ${n2(x2)} ${n2(y2)}"/>`;
};

function dial(data, t) {
  const parts = [];

  for (let i = 0; i <= 96; i++) {
    const v = i / 4;
    const deg = angleAt(v);
    if (i % 4 === 0) parts.push(tick(deg, 158, 175, 'd-major'));
    else parts.push(tick(deg, 167, 174, v > 18 ? 'd-red' : 'd-minor'));
  }
  parts.push(arc(180, angleAt(18), angleAt(24), 'd-redline'));

  for (let v = 0; v <= 24; v += 3) {
    const [x, y] = polar(angleAt(v), 140);
    const label = String((v + 6) % 24).padStart(2, '0');
    parts.push(`<text class="d-num" x="${n2(x)}" y="${n2(y)}" text-anchor="middle" dominant-baseline="central">${label}</text>`);
  }

  const max = Math.max(...data.buckets, 1);
  data.buckets.forEach((count, b) => {
    const deg = angleAt(fromClock(b / 3 + 1 / 6));
    if (!count) parts.push(tick(deg, 122, 119, 'd-empty'));
    else parts.push(tick(deg, 122, 122 - 56 * Math.sqrt(count / max), 'd-bar'));
  });

  const peak = data.hours.indexOf(Math.max(...data.hours));
  const desc = fill(t.dialDesc, { from: String(peak).padStart(2, '0'), to: String((peak + 1) % 24).padStart(2, '0') });

  return `<svg viewBox="0 0 400 400" role="img" aria-labelledby="dial-title dial-desc">
<title id="dial-title">${esc(t.dialLabel)}</title>
<desc id="dial-desc">${esc(desc)}</desc>
<defs>
<radialGradient id="face" cx="50%" cy="46%" r="54%"><stop offset="0" stop-color="#16161a"/><stop offset=".7" stop-color="#0d0d10"/><stop offset="1" stop-color="#09090b"/></radialGradient>
<linearGradient id="bezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dadd"/><stop offset=".28" stop-color="#55575b"/><stop offset=".55" stop-color="#a9abaf"/><stop offset=".8" stop-color="#303134"/><stop offset="1" stop-color="#8d8f93"/></linearGradient>
<filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="400"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<circle class="d-face" cx="${C}" cy="${C}" r="193"/>
<circle class="d-ring" cx="${C}" cy="${C}" r="186"/>
${parts.join('\n')}
<text class="d-unit" x="${C}" y="${C - 42}" text-anchor="middle">COMMITS / H</text>
<text class="d-time" id="readout" x="${C}" y="${C + 120}" text-anchor="middle">--:--</text>
<text class="d-place" x="${C}" y="${C + 140}" text-anchor="middle">${esc(t.now.toUpperCase())}</text>
<g id="needle" transform="rotate(${A0} ${C} ${C})">
<line class="d-needle" x1="${C}" y1="${C + 24}" x2="${C}" y2="${C - 170}"/>
</g>
<circle class="d-hub" cx="${C}" cy="${C}" r="9"/>
<circle class="d-pin" cx="${C}" cy="${C}" r="2.4"/>
</svg>`;
}

// ---------------------------------------------------------------- página

function featuredList(data) {
  const byName = new Map(data.repos.map((r) => [r.name, r]));
  const curated = site.featured.map((f) => {
    const repos = f.repos.map((n) => byName.get(n)).filter(Boolean);
    const firsts = repos.map((r) => year(r.first || r.created)).filter(Boolean);
    const lasts = repos.map((r) => year(r.latest)).filter(Boolean);
    return {
      ...f,
      years: f.year ? String(f.year) : span(Math.min(...firsts), Math.max(...lasts)),
    };
  });
  const taken = new Set(site.featured.flatMap((f) => f.repos));
  const promoted = data.repos
    .filter((r) => r.topics.includes(site.promoteTopic) && !taken.has(r.name) && !site.hidden.includes(r.name))
    .map((r) => {
      const copy = { summary: r.description };
      return {
        id: r.name,
        name: r.name,
        repos: [r.name],
        stack: r.language ? [r.language] : [],
        links: [
          ...(r.homepage ? [{ href: r.homepage, label: { es: new URL(r.homepage).host, en: new URL(r.homepage).host } }] : []),
          { href: r.url, label: { es: 'Código', en: 'Code' } },
        ],
        es: copy,
        en: copy,
        years: span(year(r.first || r.created), year(r.latest)),
      };
    });
  return [...curated, ...promoted];
}

function projectHtml(p, lang, t) {
  const copy = p[lang];
  const rows = [];
  if (p.stack?.length) rows.push([t.specStack, esc(p.stack.join(' · '))]);
  for (const x of p.extra || []) rows.push([x.label[lang], esc(x.value[lang])]);
  if (copy.status) rows.push([t.specStatus, esc(copy.status)]);
  if (p.repos.length > 1) {
    rows.push([t.specParts, p.repos.map((n) => ext(`https://github.com/${site.github}/${n}`, n)).join('<span class="sep"> · </span>')]);
  }
  if (p.links?.length) rows.push([t.specLinks, p.links.map((l) => ext(l.href, l.label[lang])).join('<span class="sep"> · </span>')]);

  return `<article class="project" id="${esc(p.id)}">
<header class="project-head">
<h3 class="project-name">${esc(p.name)}</h3>
<p class="data project-year">${p.commission ? `<span class="label">${esc(t.commission)}</span>` : ''}${esc(p.years)}</p>
</header>
<p class="summary">${esc(copy.summary)}</p>
${copy.detail ? `<p class="detail">${esc(copy.detail)}</p>` : ''}
<dl class="spec">
${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('\n')}
</dl>
</article>`;
}

function archiveRows(repos) {
  return `<ul class="rows">
${repos
  .map(
    (r) => `<li><a class="row" href="${esc(r.url)}" rel="noopener">
<span class="data row-year">${year(r.first || r.created)}</span>
<span class="row-name">${esc(r.name)}</span>
<span class="row-desc">${esc(r.description)}</span>
<span class="data row-lang">${esc(r.language)}</span>
</a></li>`,
  )
  .join('\n')}
</ul>`;
}

function page(lang, data) {
  const t = site.i18n[lang];
  const base = lang === 'es' ? '' : '../';
  const urls = { es: site.siteUrl, en: `${site.siteUrl}en/` };
  const hrefs = lang === 'es' ? { es: './', en: 'en/' } : { es: '../', en: './' };

  const projects = featuredList(data);
  const shown = new Set([...projects.flatMap((p) => p.repos), ...site.hidden]);
  const rest = data.repos.filter((r) => !shown.has(r.name));
  const isUni = (r) => r.topics.includes('university') || site.university.includes(r.name);
  const own = rest.filter((r) => !isUni(r));
  const uni = rest.filter(isUni);

  const dateFmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: site.timeZone });
  // El último commit que se enseña es el de un repo visible, no el del propio portfolio.
  const latest = data.repos
    .filter((r) => r.commits && !site.hidden.includes(r.name))
    .map((r) => ({ repo: r.name, date: r.latest }))
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<link rel="canonical" href="${urls[lang]}">
<link rel="alternate" hreflang="es" href="${urls.es}">
<link rel="alternate" hreflang="en" href="${urls.en}">
<link rel="alternate" hreflang="x-default" href="${urls.es}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${urls[lang]}">
<meta property="og:locale" content="${lang === 'es' ? 'es_ES' : 'en_US'}">
<meta name="theme-color" content="#08080a">
<meta name="color-scheme" content="dark">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${base}assets/fonts/castoro-titling-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}assets/fonts/castoro-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}assets/site.css">
<script src="${base}assets/site.js" defer></script>
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
<header class="wrap top">
<a class="mark" href="${hrefs[lang]}">${esc(site.name)}</a>
<nav class="langs" aria-label="Idioma / Language">
${LANGS.map((l) => `<a href="${hrefs[l]}" lang="${l}" hreflang="${l}" title="${esc(site.i18n[l].langName)}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`).join('\n')}
</nav>
</header>

<main id="main">
<section class="wrap hero">
<div class="hero-text">
<p class="label">${esc(t.eyebrow)}</p>
<h1>${t.headline.split(/(?<=\.)\s+/).map((s) => `<span>${esc(s)}</span>`).join(' ')}</h1>
<p class="lede">${esc(t.lede)}</p>
</div>
<figure class="dial">
${dial(data, t)}
<figcaption>
<p class="dial-caption">${esc(t.dialCaption)}</p>
<p class="data">${esc(fill(t.dialStats, { commits: data.totals.commits, repos: data.totals.repos }))}</p>
${latest ? `<p class="data">${esc(fill(t.lastCommit, { repo: latest.repo }))}, <time datetime="${latest.date}" data-ago>${esc(dateFmt.format(new Date(latest.date)))}</time></p>` : ''}
</figcaption>
</figure>
</section>

<section class="wrap section" aria-labelledby="h-projects">
<h2 class="label section-label" id="h-projects">${esc(t.projects)}</h2>
<div class="projects">
${projects.map((p) => projectHtml(p, lang, t)).join('\n')}
</div>
</section>

<section class="wrap section" aria-labelledby="h-approach">
<h2 class="label section-label" id="h-approach">${esc(t.approach)}</h2>
<div class="prose">
${t.approachText.map((p) => `<p>${esc(p)}</p>`).join('\n')}
</div>
</section>

<section class="wrap section" aria-labelledby="h-archive">
<h2 class="label section-label" id="h-archive">${esc(t.archive)}</h2>
<div class="archive">
<p class="archive-intro">${esc(t.archiveIntro)}</p>
${own.length ? `<h3 class="label group">${esc(t.groupOwn)}</h3>\n${archiveRows(own)}` : ''}
${uni.length ? `<h3 class="label group">${esc(t.groupUni)}</h3>\n${archiveRows(uni)}` : ''}
</div>
</section>
</main>

<footer class="wrap section foot" aria-labelledby="h-contact">
<h2 class="label section-label" id="h-contact">${esc(t.contact)}</h2>
<div>
<p class="contact-text">${esc(t.contactText)}</p>
<p class="contact-links">${[
    site.email ? `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>` : '',
    ext(`https://github.com/${site.github}`, `github.com/${site.github}`),
  ].filter(Boolean).join('\n')}</p>
<p class="data updated">${esc(fill(t.updated, { date: dateFmt.format(new Date(data.generatedAt)) }))}</p>
</div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- salida

const data = await loadData();
await rm(at('dist'), { recursive: true, force: true });
await mkdir(at('dist/en'), { recursive: true });
await cp(at('src/fonts'), at('dist/assets/fonts'), { recursive: true });
await cp(at('src/favicon.svg'), at('dist/assets/favicon.svg'));
await cp(at('src/site.js'), at('dist/assets/site.js'));
await writeFile(
  at('dist/assets/site.css'),
  (await readFile(at('src/fonts.css'), 'utf8')) + '\n' + (await readFile(at('src/site.css'), 'utf8')),
);
await writeFile(at('dist/index.html'), page('es', data));
await writeFile(at('dist/en/index.html'), page('en', data));
await writeFile(at('dist/.nojekyll'), '');

console.log(`${data.totals.repos} repositorios, ${data.totals.commits} commits. Sitio en dist/`);
