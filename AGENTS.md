# railway-projects

Instructions for working in this repository. This file is the canonical set of
conventions; `CLAUDE.md` points here.

## What this repo is

A collection of **single-file HTML pages**, each served at its own link by one
Railway service. The repo is the entire configuration: **adding a file to
`pages/` is the whole deploy step.** There is no registry to update, no
per-page config, and nothing to click in the Railway dashboard.

Every page is reachable two ways at once:

```
pages/pricing.html   ->  https://pricing.pages.example.com   (own subdomain)
                     ->  https://<railway-domain>/pricing    (path)
```

Subdomain routing needs a wildcard domain pointed at the service — see
[Own subdomain per page](#own-subdomain-per-page). Path routing always works.

### Why one service and not one per page

Railway does not discover directories and turn them into services. Every
service has to be created explicitly and given a Root Directory, and
`railway.json` configures exactly one service — it cannot declare several. So
"drop in a file, get a new service" is not achievable natively.

One service plus a wildcard domain gets the intended outcome — a new file gets
its own link, with no manual step — because the wildcard is registered once and
covers every future page. The tradeoff is that all pages redeploy together.

Don't "fix" this by splitting the repo back into a service per directory. That
reintroduces a dashboard visit per page, which is the thing this layout exists
to avoid.

## Layout

```
railway-projects/
├── AGENTS.md            # these instructions
├── CLAUDE.md            # pointer to AGENTS.md
├── README.md            # human-facing overview
├── server.js            # router; zero dependencies
├── package.json         # start script + engines. No dependencies.
├── railway.json         # build/deploy config for the single service
├── feeds/               # optional daily data feed per page (see below)
│   └── philips-tiktok-dashboard.js  ->  /philips-tiktok-dashboard/data.json
└── pages/
    ├── _template.html   # starter. Not published (see below).
    ├── hello-world.html         ->  /hello-world
    ├── unit-converter.html      ->  /unit-converter
    └── report/                  ->  /report
        ├── index.html
        └── chart.png            ->  /report/chart.png
```

## The standard request: "deploy this file"

The owner's normal workflow is to open a fresh chat, hand over an HTML file
(attached, pasted, or described), and expect back a working link. When that
happens, do exactly this — no questions unless the request is genuinely
ambiguous:

1. **Pick the slug.** Use the supplied file name if it fits the naming rules
   below; otherwise derive a short kebab-case slug from the page's `<title>` or
   content (`Spartan Gym Offer.html` → `spartan-gym-offer`). If a page with
   that slug already exists, treat the new file as its replacement only when it
   is clearly the same page; otherwise pick a fresh slug.
2. **Save it** as `pages/<slug>.html`, keeping the content as delivered. Fix
   nothing silently. If the file violates a hard rule in
   [Writing the HTML](#writing-the-html) — external CDN requests, a missing
   `<title>` — fix it minimally, say so, and list what changed.
3. **Verify locally**: `npm start`, then confirm `/<slug>` returns 200, the
   page renders, and it appears on the index at `/`.
4. **Commit and push to `main`** (the only branch — see
   [Branching](#branching)). The push is the deploy.
5. **Reply with the link**:
   `https://railway-projects-production-0ea1.up.railway.app/<slug>` — the
   current live domain, also recorded in `README.md`. Say the deploy takes
   about a minute after the push. If Railway egress is blocked in the session
   (it usually is), say the link is constructed, not confirmed — never claim
   you watched the deploy succeed.
6. **Add the page to the table in `README.md`** in the same commit.

If a wildcard domain has been attached and `PAGE_DOMAIN` is set (see
[Own subdomain per page](#own-subdomain-per-page)), give the subdomain link
`https://<slug>.<zone>` as the primary link, with the path URL as fallback.

## Adding a page

```sh
cp pages/_template.html pages/my-page.html   # then write the page
npm start                                    # http://localhost:3000/my-page
```

Commit, push. It is live at `/my-page`. That's it.

- The **file name is the URL**. `pages/my-page.html` → `/my-page`.
- Names must be lowercase letters, digits, and dashes, starting with a letter
  or digit. Anything else is ignored by the router.
- **Anything starting with `_` or `.` is not published.** Use that for drafts
  and templates: `pages/_wip.html` stays private even once pushed.
- The index at `/` lists every page automatically, using each page's `<title>`.
  Never hand-maintain a list of links.
- New pages appear without a restart — `pages/` is read per request.

### Pages that need assets

Most pages should be a single self-contained file. If a page genuinely needs a
binary asset too large to inline, use the directory form: `pages/report/` with
an `index.html` inside. Files beside it are served alongside the page. A
directory takes precedence over a same-named flat file.

**Reference those assets relatively** — `src="chart.png"`, never
`src="/report/chart.png"`. The same page is served at `/report/` on the path
URL and at `/` on its subdomain, so only a relative URL resolves in both. The
router redirects `/report` → `/report/` to keep relative paths working.

## Writing the HTML

- **One file.** All markup, CSS, and JS inline. No build step, no bundler, no
  framework install.
- **No external requests.** No CDN scripts, stylesheets, fonts, or remote
  images — inline everything and embed assets as `data:` URIs. A page that
  depends on a CDN breaks when the CDN does, and leaks visitors to a third
  party.
- Set a `<title>`. It is the browser tab, the link preview, **and** the label
  on the index — a missing title falls back to the bare slug.
- Make it responsive: relative units, flexbox/grid, `max-width: 100%` on
  images. Wide content (tables, code) scrolls inside its own container; the
  page body must never scroll horizontally.
- Support light and dark via `prefers-color-scheme` unless the page
  deliberately commits to one look.
- Link back to the index with `<a href="/">All pages</a>`.

## The server

`server.js` is Node stdlib only — no dependencies, so no lockfile and a
near-instant build. It:

- binds `0.0.0.0` on `$PORT` (Railway assigns the port — never hardcode it),
- reads `pages/` per request, so new files are live without a restart,
- routes by `Host` first (subdomain mode), then by path,
- generates the index at `/` from the pages it finds, linking to subdomains when
  `PAGE_DOMAIN` is set and to paths otherwise,
- serves assets beside directory-style pages, under `/<slug>/…` on the path URL
  and off the root on a subdomain,
- answers `/healthz` with `200 ok` on **every** host, for Railway's healthcheck,
- serves `/robots.txt` as `Disallow: /` on **every** host, and sets
  `X-Robots-Tag: noindex, nofollow` on every response — see
  [Keeping pages out of search](#keeping-pages-out-of-search),
- returns a 404 listing the available pages for an unknown path or subdomain,
- serves HTML as `no-cache` so a deploy never serves a stale page, and assets
  with a one-hour cache,
- compresses text responses with brotli or gzip, whichever the client accepts,
- gives every response an `ETag`, so `no-cache` revalidates into an empty 304
  instead of refetching the page,
- rebuilds `<slug>/data.json` once a day for any page that has a module in
  `feeds/` — see [Live data feeds](#live-data-feeds).

### Compression and validators

Text goes out brotli-compressed (quality 5) or gzipped, negotiated from
`Accept-Encoding` with q-values honoured. Already-compressed types — images,
fonts, PDFs — are sent as-is, and so is anything under 1 KB. These pages are
mostly inline JSON and markup, so the saving is large: the Philips dashboard is
1058 KB raw and 381 KB over the wire, and all ten pages together drop from
4867 KB to 1985 KB.

Compressed output is cached in memory, keyed on the file's size and mtime, so a
page is compressed once per deploy rather than once per request — about 50ms on
the first hit, then 2–5ms. A changed file gets a new key, so a deploy can never
serve a stale body.

The `ETag` is built from size and mtime too, with the encoding appended, since a
gzip body and a brotli body are different representations and must not share a
validator. `sendFile` compares it before reading the file, so a client that is
already current costs a `stat` rather than a megabyte of disk and bandwidth.

None of this changes what a page author does. Write one self-contained file, as
before.

### Keeping pages out of search

Everything served here is client work that happens to be reachable by link, and
the index at `/` lists every page by title — so a crawler finding the root would
enumerate every engagement. The server therefore sends
`X-Robots-Tag: noindex, nofollow` on every response and serves a blanket
`Disallow: /` at `/robots.txt`, on every host, before any page routing.

This is deliberately server-wide rather than a `<meta name="robots">` in each
page: a per-page tag is one more thing to remember for every new file, and the
generated index and 404 pages could not carry one at all.

**None of it is access control.** It asks well-behaved crawlers not to index;
it stops nobody from opening a link. If a page needs to be genuinely private,
it needs real auth, not this.

If a page ever *should* be indexed, that is a deliberate exception — drop the
header for that slug rather than removing it globally.

### Live data feeds

Most pages are a snapshot: the data is embedded and changes when someone
commits a new file. A page whose numbers live in a spreadsheet that keeps
moving can have a **feed** instead — `feeds/<slug>.js`, named after the page.
The server fetches the feed's source at boot and then once a day, runs the
module's `build` over it, and serves the result at `/<slug>/data.json` (or
`/data.json` on the page's subdomain). Nothing is committed and nothing
redeploys; the refreshed data is held in memory.

A feed module exports three things:

```js
module.exports = {
  url: 'https://docs.google.com/spreadsheets/d/<id>/export?format=csv',
  at: { hour: 13, minute: 0, timeZone: 'Asia/Beirut' }, // daily, in that zone
  build(text, now) { /* return the object to serve; throw if unusable */ },
};
```

Rules that keep this safe:

- **The page must still work alone.** It embeds a full copy of the data and
  fetches `data.json` on top: `location.pathname.replace(/\/+$/, '') +
  '/data.json'`, which resolves on both the path URL and the subdomain. Any
  failure — 503 before the first fetch lands, a timeout, the file opened from
  disk — falls back to the embedded copy. Same-origin only, so the
  [no external requests](#writing-the-html) rule still holds: the visitor's
  browser never talks to Google.
- **A failed refresh keeps the last good data** and retries every 10 minutes.
  `build` should throw on a source it does not recognise (missing column, no
  rows) rather than return something half-right, so a broken sheet shows
  yesterday's numbers, not wrong ones.
- **The schedule is wall-clock time in the feed's zone**, checked against
  `Intl` every 30 seconds rather than computed as one long timeout, so it stays
  at 13:00 across DST changes. A restart refetches immediately.
- **The source must be readable without a login.** For a Google Sheet that
  means *Share → Anyone with the link → Viewer*. A restricted sheet answers
  401 and the feed logs `source answered 401`. If a source ever needs a
  credential, it goes in a Railway variable per
  [Configuration and secrets](#configuration-and-secrets), never in the feed.
- Feeds are Node stdlib only, like the server. `feeds/` is not served.
- When you change `build`, refresh the page's embedded copy from the same
  function so the fallback and the live shape cannot drift apart.

The one feed today is `philips-tiktok-dashboard`: a raw TikTok Ads Manager
export (day × ad × age × gender) in a Google Sheet, refreshed at 13:00
Asia/Beirut. Its `build` sums rows that share a key (one ad name runs in
several ad groups), drops ads with no impressions and no spend, and derives
flights from paid-delivery days more than 21 days apart.

Only files inside `pages/` are reachable, plus each feed's `data.json`. Repo
files — `server.js`, `package.json`, `AGENTS.md`, `feeds/` — are not served.

### Own subdomain per page

Set up once, then every new page automatically gets its own hostname.

1. **DNS**: add a wildcard `CNAME` for the zone you want to use — e.g.
   `*.pages` → the target Railway shows for a custom domain. One record covers
   every page, now and later.
2. **Railway** → service → **Settings** → **Networking** → **Custom Domain** →
   add `*.pages.example.com`. Railway issues the wildcard certificate.
3. **Railway** → **Variables** → set `PAGE_DOMAIN=pages.example.com`.

`PAGE_DOMAIN` is optional but recommended. With it set, only that zone maps
subdomains to pages, a subdomain with no matching page returns a 404 naming it
instead of quietly serving the index, and the index links to subdomains.
Unset, any host whose first label matches a page name is served as that page —
enough to work with no configuration, but it would let a page name capture a
subdomain you meant for something else. Several zones can be comma-separated;
the first is the one used for generated links.

Railway's own `*.up.railway.app` domain is deliberately exempt: its first label
is the service name, not a page, so that URL always uses path routing.

## Deploying

One Railway service, connected to this repo's default branch. Because
`package.json` and `railway.json` sit at the repo root, the service needs **no
Root Directory** and no dashboard configuration. Build and start commands come
from `railway.json`.

Setting it up once:

1. **New** → **GitHub Repo** → this repo. Leave Root Directory empty.
2. **Settings** → **Networking** → **Generate Domain**.
3. Record the domain in `README.md`.

After that, every push redeploys, and every page in `pages/` is live.

### Agents: you cannot deploy without credentials

Creating the service and reading back its domain needs Railway API access. If
there is no `RAILWAY_TOKEN` in the environment and no Railway CLI or connector
available, **say so plainly** and give the user the dashboard steps instead of
implying a deploy happened. Never invent or guess a `*.up.railway.app` URL — a
fabricated link is worse than no link. Only report a URL that came back from
Railway or that the user supplied.

## Troubleshooting a failed deploy

**"Nixpacks was unable to generate a build plan" / no start command found.**
The service has a **Root Directory** set to a subdirectory. It must be empty —
the manifest is at the repo root.

**A page 404s after deploying.** Check the file name against the rules above:
uppercase, spaces, underscores, and a leading `_` all make a file unpublished.
`GET /` lists exactly what the router found.

**A subdomain 404s but the path works.** The page exists, so routing is fine and
the wildcard is the problem: check the DNS record covers that label, that
`*.zone` is registered on the service in Railway, and that `PAGE_DOMAIN` matches
the zone exactly (no leading `*.`, no trailing dot).

**A subdomain page loads but its images are missing.** The page references
assets absolutely (`/report/chart.png`). Make them relative (`chart.png`).

**Healthcheck fails but the build succeeded.** The start command must serve on
`$PORT` and bind `0.0.0.0`, and `/healthz` must return 200. Reproduce with
`PORT=3000 npm start` and `curl localhost:3000/healthz`.

## Configuration and secrets

- Never commit secrets. Set them as Railway service variables.
- The server reads two variables, neither secret: `PORT` (set by Railway) and
  `PAGE_DOMAIN` (optional, above). If a page ever needs more, add a
  `.env.example` listing every variable with a placeholder and a one-line
  comment, and fail fast at startup with a clear message when one is missing.
- Everything in `pages/` is public. Never put an API key in a page.

## Branching

**Use `main`. Only `main`.** Commit and push straight to it — no feature
branches, no pull requests, no `claude/*` working branches. This is the
repository owner's standing instruction; don't create a branch "to be safe."

- `main` is the default branch and must always be deployable — every push to it
  redeploys the service and ships every page.
- Because there is no review step, verify before pushing: run the checks in
  [Before pushing](#before-pushing) rather than relying on a PR to catch things.
- Prefix commit subjects with the page where it applies, e.g.
  `unit-converter: fix mobile layout`.

## Before pushing

- Run `npm start` and load every page you changed, plus `/`.
- Confirm `/healthz` returns `ok`.
- Confirm a new page appears on the index at `/` under the URL you expect.
- If you touched routing, check both modes:
  `curl -H 'Host: my-page.pages.example.com' localhost:3000/` and
  `curl localhost:3000/my-page`.
- If you touched a feed or the page it serves: the startup log should show
  `feed <slug>: refreshed (boot)`, `curl localhost:3000/<slug>/data.json`
  should return the JSON, and the page should render both with the feed up and
  with it failing (it falls back to the embedded copy).
- Check that no secret or `.env` file is staged.
