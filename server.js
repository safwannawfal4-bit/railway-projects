'use strict';

// Serves every page in pages/ at its own link. Adding a file to pages/ is the
// entire deploy step — there is no registry to update and nothing to configure
// in Railway. See AGENTS.md.
//
// Two routing modes run at once, so a page is reachable both ways:
//
//   subdomain   pricing.pages.example.com/   -> pages/pricing.html
//   path        example.com/pricing          -> pages/pricing.html
//
// Subdomain routing needs a wildcard domain pointed at this service. Set
// PAGE_DOMAIN to the wildcard base (e.g. "pages.example.com", comma-separated
// for several) to scope it to that zone and to make the index link to
// subdomains. Left unset, any host whose first label matches a page name is
// served as that page, which is enough to work without configuration.
//
// Names must match SLUG_RE, so anything starting with "_" or "." is ignored —
// use that for drafts and templates you do not want published.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const PAGES = path.join(__dirname, 'pages');
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const PAGE_DOMAINS = (process.env.PAGE_DOMAIN || '')
  .split(',')
  .map((d) => d.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
  .filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
};

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Read pages/ fresh on each use, so a new file is live without a restart.
function listPages() {
  let entries;
  try {
    entries = fs.readdirSync(PAGES, { withFileTypes: true });
  } catch {
    return new Map();
  }

  const pages = new Map();

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.html')) continue;
    const slug = e.name.slice(0, -'.html'.length);
    if (SLUG_RE.test(slug)) pages.set(slug, { slug, file: path.join(PAGES, e.name), dir: null });
  }

  // A directory with an index.html can carry sibling assets, so it wins over a
  // flat file of the same name.
  for (const e of entries) {
    if (!e.isDirectory() || !SLUG_RE.test(e.name)) continue;
    const dir = path.join(PAGES, e.name);
    const index = path.join(dir, 'index.html');
    if (!isFile(index)) continue;
    if (pages.has(e.name)) {
      console.warn(
        `warning: pages/${e.name}.html and pages/${e.name}/index.html both exist; serving the directory`,
      );
    }
    pages.set(e.name, { slug: e.name, file: index, dir });
  }

  return new Map([...pages].sort(([a], [b]) => a.localeCompare(b)));
}

// What this Host header pins the request to:
//   { page }      serve that page at "/"
//   { missing }   a subdomain inside the configured zone with no such page
//   null          not subdomain-routed; fall through to path routing
function resolveHost(hostHeader, pages) {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0].toLowerCase();
  const labels = host.split('.');
  if (labels.length < 2) return null; // localhost

  // On Railway's own domain the first label is the service name, not a page.
  if (host.endsWith('.up.railway.app')) return null;

  if (PAGE_DOMAINS.length) {
    const base = PAGE_DOMAINS.find((d) => host.endsWith('.' + d));
    if (!base) return null;
    const sub = host.slice(0, -(base.length + 1));
    if (!SLUG_RE.test(sub)) return null; // multi-level or invalid
    const page = pages.get(sub);
    // Inside the zone the subdomain is a promise of a page, so a typo should
    // say so rather than quietly serving the index.
    return page ? { page } : { missing: `${sub}.${base}` };
  }

  const page = pages.get(labels[0]);
  return page ? { page } : null;
}

const linkFor = (slug) => (PAGE_DOMAINS.length ? `https://${slug}.${PAGE_DOMAINS[0]}` : `/${slug}`);

function titleOf(file, fallback) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 4096);
    const m = head.match(/<title>([^<]*)<\/title>/i);
    const t = m && m[1].trim();
    return t ? t : fallback;
  } catch {
    return fallback;
  }
}

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const SHELL = (title, body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(title)}</title>
    <style>
      :root { --bg:#faf9f7; --fg:#17161a; --muted:#6b6870; --line:#e3e0da; --card:#fff; --accent:#b8452f; }
      @media (prefers-color-scheme: dark) {
        :root { --bg:#131215; --fg:#f2f0ee; --muted:#9a969f; --line:#2c2a30; --card:#1b1a1f; --accent:#ff8a6b; }
      }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100vh; display:grid; place-items:start center;
        padding:3rem 1.5rem; background:var(--bg); color:var(--fg);
        font:16px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; }
      main { width:100%; max-width:34rem; }
      h1 { margin:0 0 .25rem; font-size:clamp(1.75rem,6vw,2.25rem); letter-spacing:-.02em; }
      p.lede { margin:0 0 2rem; color:var(--muted); }
      ul { list-style:none; margin:0; padding:0; border:1px solid var(--line);
        border-radius:.75rem; background:var(--card); overflow:hidden; }
      li { border-top:1px solid var(--line); }
      li:first-child { border-top:0; }
      a.page { display:flex; flex-wrap:wrap; gap:.15rem 1rem; justify-content:space-between;
        align-items:baseline; padding:.85rem 1rem; text-decoration:none; color:inherit; }
      a.page:hover { background:color-mix(in srgb, var(--accent) 8%, transparent); }
      a.page:hover .slug { color:var(--accent); }
      .title { font-weight:500; }
      .slug { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:.8125rem;
        color:var(--muted); word-break:break-all; }
      .empty { padding:1rem; color:var(--muted); }
      footer { margin-top:1.5rem; color:var(--muted); font-size:.8125rem; }
      footer a { color:var(--accent); }
      code { font-family:ui-monospace,"SF Mono",Menlo,monospace; background:var(--card);
        border:1px solid var(--line); border-radius:.25rem; padding:.1em .35em; }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>
`;

function indexPage() {
  const pages = listPages();
  const items = [...pages.values()]
    .map((p) => {
      const href = linkFor(p.slug);
      const label = PAGE_DOMAINS.length ? `${p.slug}.${PAGE_DOMAINS[0]}` : `/${p.slug}`;
      return `<li><a class="page" href="${escape(href)}"><span class="title">${escape(
        titleOf(p.file, p.slug),
      )}</span><span class="slug">${escape(label)}</span></a></li>`;
    })
    .join('\n        ');

  return SHELL(
    'railway-projects',
    `
      <h1>railway-projects</h1>
      <p class="lede">${pages.size} page${pages.size === 1 ? '' : 's'}, each at its own link.</p>
      ${items ? `<ul>\n        ${items}\n      </ul>` : '<ul><li class="empty">No pages yet.</li></ul>'}
      <footer>Add <code>pages/name.html</code> and push — it goes live at
      <code>${escape(PAGE_DOMAINS.length ? `name.${PAGE_DOMAINS[0]}` : '/name')}</code>.</footer>`,
  );
}

function notFoundPage(what) {
  const items = [...listPages().values()]
    .map(
      (p) =>
        `<li><a class="page" href="${escape(linkFor(p.slug))}"><span class="slug">${escape(
          PAGE_DOMAINS.length ? `${p.slug}.${PAGE_DOMAINS[0]}` : `/${p.slug}`,
        )}</span></a></li>`,
    )
    .join('\n        ');

  return SHELL(
    'Not found',
    `
      <h1>404</h1>
      <p class="lede">No page at <code>${escape(what)}</code>.</p>
      ${items ? `<ul>\n        ${items}\n      </ul>` : ''}
      <footer><a href="/">All pages</a></footer>`,
  );
}

function send(req, res, status, type, body, cache) {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const notFound = (req, res, what) =>
  send(req, res, 404, 'text/html; charset=utf-8', notFoundPage(what), 'no-store');

function sendFile(req, res, file) {
  fs.readFile(file, (err, body) => {
    if (err) {
      console.error(`failed to read ${file}: ${err.message}`);
      send(req, res, 500, 'text/plain; charset=utf-8', 'internal error', 'no-store');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    send(
      req,
      res,
      200,
      MIME[ext] || 'application/octet-stream',
      body,
      // Never cache the HTML, or a deploy keeps serving the old page.
      ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    );
  });
}

// Serve an asset sitting beside a directory-style page.
function sendAsset(req, res, page, rest) {
  if (!page.dir) return notFound(req, res, '/' + rest.join('/'));
  const asset = path.join(page.dir, ...rest);
  if (!asset.startsWith(page.dir + path.sep) || !isFile(asset)) {
    return notFound(req, res, '/' + rest.join('/'));
  }
  sendFile(req, res, asset);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(req, res, 400, 'text/plain; charset=utf-8', 'bad request', 'no-store');
    return;
  }

  // Must answer on every host, before any page routing.
  if (pathname === '/healthz') {
    send(req, res, 200, 'text/plain; charset=utf-8', 'ok', 'no-store');
    return;
  }

  const segments = pathname.split('/').filter(Boolean);

  // Reject rather than silently normalise, so one resource has one URL.
  if (segments.some((s) => s === '.' || s === '..' || s.includes('\0'))) {
    notFound(req, res, pathname);
    return;
  }

  const pages = listPages();
  const host = resolveHost(req.headers.host, pages);

  if (host && host.missing) {
    notFound(req, res, host.missing);
    return;
  }

  // Subdomain mode: the host pins the page, so it lives at "/" and its assets
  // hang directly off the root.
  if (host) {
    if (segments.length === 0) sendFile(req, res, host.page.file);
    else sendAsset(req, res, host.page, segments);
    return;
  }

  // Path mode.
  if (segments.length === 0) {
    send(req, res, 200, 'text/html; charset=utf-8', indexPage(), 'no-cache');
    return;
  }

  const [slug, ...rest] = segments;
  const page = pages.get(slug);

  if (!page) {
    notFound(req, res, pathname);
    return;
  }

  if (rest.length > 0) {
    sendAsset(req, res, page, rest);
    return;
  }

  // Directory pages get a trailing slash so relative asset URLs resolve the
  // same way they do on a subdomain.
  if (page.dir && !pathname.endsWith('/')) {
    const body = `moved to /${slug}/`;
    res.writeHead(301, {
      location: `/${slug}/`,
      'content-type': 'text/plain; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  sendFile(req, res, page.file);
});

if (!fs.existsSync(PAGES)) {
  console.error(`fatal: no pages/ directory next to server.js (looked in ${__dirname})`);
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  const slugs = [...listPages().keys()];
  console.log(`listening on 0.0.0.0:${PORT}`);
  console.log(slugs.length ? `serving ${slugs.length} page(s): ${slugs.join(', ')}` : 'no pages yet');
  console.log(
    PAGE_DOMAINS.length
      ? `subdomain routing scoped to: ${PAGE_DOMAINS.map((d) => `*.${d}`).join(', ')}`
      : 'subdomain routing unscoped (set PAGE_DOMAIN to pin it to your wildcard zone)',
  );
});
