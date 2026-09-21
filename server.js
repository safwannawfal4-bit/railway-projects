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
const zlib = require('node:zlib');
const crypto = require('node:crypto');

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
      <p class="lede">${
        pages.size === 1 ? '1 page, at its own link.' : `${pages.size} pages, each at its own link.`
      }</p>
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

// Every page here is client work reachable by link, so none of it belongs in a
// search index. Set on every response, including the index and 404s, because a
// per-page <meta> tag is one more thing to remember for each new page.
const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
};

// Text is most of what this serves and compresses hard; images, fonts and PDFs
// are already compressed, so running them through brotli only burns CPU.
const isCompressible = (type) => /^text\/|\+xml|\/(json|javascript)\b/.test(type);
const MIN_COMPRESS = 1024;

// q5 is the knee of the curve for these pages: 1.06 MB -> 382 KB in 39ms, where
// q11 spends 1.6s to reach 348 KB. Output is cached per file version, but the
// first visitor after a deploy pays this, so it has to stay quick.
const BR_QUALITY = 5;

// `${file}|${encoding}` -> { tag, body }. Bounded, roughly LRU. A tag that no
// longer matches the file on disk just means we compress it again.
const CACHE_MAX = 64;
const encoded = new Map();

function cached(key, tag) {
  const hit = encoded.get(key);
  if (!hit || hit.tag !== tag) return null;
  encoded.delete(key); // re-insert so the most recently used sorts last
  encoded.set(key, hit);
  return hit.body;
}

function cache(key, tag, body) {
  encoded.set(key, { tag, body });
  while (encoded.size > CACHE_MAX) encoded.delete(encoded.keys().next().value);
}

// Honour q-values: some clients send "gzip, br;q=0" to opt out of one of them.
function pickEncoding(req) {
  const header = req.headers['accept-encoding'];
  if (!header) return null;

  const weights = {};
  for (const part of String(header).split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const q = params.map((p) => /^\s*q=([\d.]+)\s*$/i.exec(p)).find(Boolean);
    weights[name.trim().toLowerCase()] = q ? parseFloat(q[1]) : 1;
  }

  const score = (n) => weights[n] ?? weights['*'] ?? 0;
  if (score('br') > 0 && score('br') >= score('gzip')) return 'br';
  return score('gzip') > 0 ? 'gzip' : null;
}

const negotiate = (req, type, size) =>
  isCompressible(type) && size >= MIN_COMPRESS ? pickEncoding(req) : null;

// Resolves to null if compression fails, and the caller falls back to identity.
function compress(enc, body) {
  return new Promise((resolve) => {
    const done = (err, out) => resolve(err ? null : out);
    if (enc === 'br') {
      const params = {
        [zlib.constants.BROTLI_PARAM_QUALITY]: BR_QUALITY,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
      };
      zlib.brotliCompress(body, { params }, done);
    } else {
      zlib.gzip(body, { level: 6 }, done);
    }
  });
}

// Size and mtime identify a build of a file well enough here, and cost a stat
// rather than a read of the whole thing.
const fileTag = (st) => `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`;
const bodyTag = (body) => crypto.createHash('sha1').update(body).digest('base64url').slice(0, 16);

// The encoding is part of what the tag identifies, so a gzip client and a
// brotli client must not share one.
const etagOf = (tag, enc) => `"${tag}-${enc || 'id'}"`;

function isFresh(req, etag) {
  const header = req.headers['if-none-match'];
  if (!header) return false;
  return String(header)
    .split(',')
    .some((t) => t.trim().replace(/^W\//, '') === etag);
}

function notModified(req, res, etag, cacheControl, type) {
  res.writeHead(304, {
    ...BASE_HEADERS,
    etag,
    'cache-control': cacheControl,
    ...(isCompressible(type) ? { vary: 'accept-encoding' } : {}),
  });
  res.end();
}

// `opts.tag` enables validators, `opts.key` caches the compressed result, and
// `opts.enc` lets a caller that already negotiated skip doing it twice.
async function send(req, res, status, type, body, cacheControl, opts = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const { tag = null, key = null } = opts;
  const enc = 'enc' in opts ? opts.enc : negotiate(req, type, buf.length);

  const headers = { ...BASE_HEADERS, 'content-type': type, 'cache-control': cacheControl };
  if (isCompressible(type)) headers.vary = 'accept-encoding';

  if (tag) {
    const etag = etagOf(tag, enc);
    headers.etag = etag;
    if (isFresh(req, etag)) {
      notModified(req, res, etag, cacheControl, type);
      return;
    }
  }

  let out = buf;
  if (enc) {
    const ck = key && `${key}|${enc}`;
    let hit = ck && tag ? cached(ck, tag) : null;
    if (!hit) {
      hit = await compress(enc, buf);
      if (hit && ck && tag) cache(ck, tag, hit);
    }
    if (hit) {
      headers['content-encoding'] = enc;
      out = hit;
    }
  }

  headers['content-length'] = out.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : out);
}

function notFound(req, res, what) {
  const body = Buffer.from(notFoundPage(what));
  send(req, res, 404, 'text/html; charset=utf-8', body, 'no-store', { tag: bodyTag(body) });
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      console.error(`failed to stat ${file}: ${err ? err.message : 'not a regular file'}`);
      send(req, res, 500, 'text/plain; charset=utf-8', 'internal error', 'no-store');
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // Never cache the HTML, or a deploy keeps serving the old page. "no-cache"
    // still revalidates rather than refetching, and the ETag turns that
    // revalidation into an empty 304.
    const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    const tag = fileTag(st);
    const enc = negotiate(req, type, st.size);

    // A client that already has this version needs none of the bytes, so answer
    // before reading a megabyte off disk.
    const etag = etagOf(tag, enc);
    if (isFresh(req, etag)) {
      notModified(req, res, etag, cacheControl, type);
      return;
    }

    fs.readFile(file, (readErr, body) => {
      if (readErr) {
        console.error(`failed to read ${file}: ${readErr.message}`);
        send(req, res, 500, 'text/plain; charset=utf-8', 'internal error', 'no-store');
        return;
      }
      send(req, res, 200, type, body, cacheControl, { tag, key: file, enc });
    });
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
    res.writeHead(405, { ...BASE_HEADERS, allow: 'GET, HEAD' }).end();
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

  // Likewise on every host: a crawler reaching a subdomain must not have to
  // find its way to the root to learn the whole service is off limits.
  if (pathname === '/robots.txt') {
    const body = 'User-agent: *\nDisallow: /\n';
    send(req, res, 200, 'text/plain; charset=utf-8', body, 'public, max-age=3600', {
      tag: bodyTag(body),
    });
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
    const body = Buffer.from(indexPage());
    send(req, res, 200, 'text/html; charset=utf-8', body, 'no-cache', { tag: bodyTag(body) });
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
      ...BASE_HEADERS,
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
