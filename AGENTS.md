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
└── pages/
    ├── _template.html   # starter. Not published (see below).
    ├── hello-world.html         ->  /hello-world
    ├── unit-converter.html      ->  /unit-converter
    └── report/                  ->  /report
        ├── index.html
        └── chart.png            ->  /report/chart.png
```

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
- returns a 404 listing the available pages for an unknown path or subdomain,
- serves HTML as `no-cache` so a deploy never serves a stale page, and assets
  with a one-hour cache.

Only files inside `pages/` are reachable. Repo files — `server.js`,
`package.json`, `AGENTS.md` — are not served.

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
- Check that no secret or `.env` file is staged.
