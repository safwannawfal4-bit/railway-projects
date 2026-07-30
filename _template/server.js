'use strict';

// Zero-dependency static server for a single-page service.
// Serves any real file in this directory; unmatched paths fall back to
// index.html. See AGENTS.md — this file is duplicated per service on purpose,
// because Railway builds each service from its own root directory.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');

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
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Map a request path to a file inside ROOT, or null if it escapes ROOT.
function resolveInRoot(url) {
  let decoded;
  try {
    decoded = decodeURIComponent(url.split('?')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  const candidate = path.join(ROOT, path.normalize(decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  return candidate;
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
    return;
  }

  const requested = resolveInRoot(req.url);
  const target = requested && isFile(requested) ? requested : INDEX;

  fs.readFile(target, (err, body) => {
    if (err) {
      console.error(`failed to read ${target}: ${err.message}`);
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('internal error');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      // The page itself must not be cached, or a redeploy serves stale HTML.
      'cache-control': target === INDEX ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
});

if (!isFile(INDEX)) {
  console.error(`fatal: no index.html next to server.js (looked in ${ROOT})`);
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`listening on 0.0.0.0:${PORT}`);
});
