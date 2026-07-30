# railway-projects

Instructions for working in this repository. This file is the canonical set of
conventions; `CLAUDE.md` points here.

## What this repo is

A collection of **single-page HTML apps**. Each page is self-contained and gets
deployed as its **own Railway service** inside one Railway project, so every
page has its own URL and its own deploy lifecycle.

One directory = one HTML file = one Railway service = one URL.

## Layout

```
railway-projects/
├── AGENTS.md           # these instructions
├── CLAUDE.md           # pointer to AGENTS.md
├── README.md           # human-facing overview + live URL table
├── new-page.sh         # scaffolds a new service from _template/
├── _template/          # copied by new-page.sh; never deployed itself
└── <page-name>/        # one directory per page == one Railway service
    ├── index.html      # the page. All markup, CSS, and JS inline.
    ├── server.js       # zero-dependency static server
    ├── package.json    # start script + engines. No dependencies.
    ├── railway.json    # build/deploy config, incl. watchPatterns
    └── README.md       # what the page is, plus its live URL
```

## Creating a new page

```sh
./new-page.sh <page-name>     # kebab-case, matches the Railway service name
```

That stamps out the directory from `_template/`. Then:

1. Write the page into `<page-name>/index.html`.
2. Set `build.watchPatterns` in `<page-name>/railway.json` to
   `["/<page-name>/**"]` — `new-page.sh` does this, but check it. Without it,
   **every** service in the project redeploys on **every** push.
3. Verify it locally: `cd <page-name> && PORT=3000 npm start`, then load
   `http://localhost:3000`.
4. Commit, push.
5. Deploy it (below) and paste the URL into `<page-name>/README.md` and the
   table in the root `README.md`.

## Writing the HTML

- **One file.** All markup, CSS, and JS inline in `index.html`. No build step,
  no bundler, no framework install.
- **No external requests.** No CDN scripts, stylesheets, fonts, or remote
  images — inline everything and embed assets as `data:` URIs. A page that
  depends on a CDN breaks when the CDN does, and leaks visitors to a third
  party.
- If a page genuinely needs a binary asset too large to inline, put it beside
  `index.html`; `server.js` serves any file in the directory.
- Set a `<title>` — it is what shows in the browser tab and in link previews.
- Make it responsive: relative units, flexbox/grid, `max-width: 100%` on
  images. Wide content (tables, code) scrolls inside its own container; the
  page body must never scroll horizontally.

## The server

Every page ships the same zero-dependency `server.js`. It:

- binds `0.0.0.0` on `$PORT` (Railway assigns the port — never hardcode it),
- serves any real file in the directory with a correct `Content-Type`,
- falls back to `index.html` for unmatched paths,
- answers `/healthz` with `200 ok` for Railway's healthcheck.

`server.js` is duplicated per service on purpose. Railway builds each service
from its own root directory, so a shared file at the repo root would not be
visible to the build. Don't try to factor it out. If you fix a bug in it, apply
the fix to `_template/server.js` and to every existing service.

## Deploying a page as its own service

Railway does not create services from the repo automatically — each one is
added once, by hand, then auto-deploys on every push after that.

In the Railway dashboard, inside the **same project**:

1. **New** → **GitHub Repo** → this repo.
2. Open the new service → **Settings**:
   - **Root Directory**: `/<page-name>` ← the step everything depends on.
     Without it Railway builds the repo root and the deploy fails.
   - **Service Name**: `<page-name>` (match the directory).
3. **Settings** → **Networking** → **Generate Domain**. That is the page's URL.
4. Paste the URL into `<page-name>/README.md` and the root `README.md` table.

Build and start commands come from `<page-name>/railway.json` — no need to set
them in the dashboard.

### Troubleshooting a failed deploy

**"Nixpacks was unable to generate a build plan" / no start command found.**
The service's **Root Directory** is unset, so Railway is building the repo
root. The root has no `package.json` on purpose — it is not deployable. Set
Root Directory to `/<page-name>`.

**Connecting the repo only created one service.** Expected: one repo connection
= one service. Railway does not discover directories. Add a service per page,
each with its own Root Directory. The repo can be connected many times over,
once per service.

**A push redeployed every service.** A `railway.json` is missing its
`build.watchPatterns`, or the pattern does not match its own directory.

**Healthcheck fails but the build succeeded.** The start command must serve on
`$PORT` and bind `0.0.0.0`, and `/healthz` must return 200. Reproduce locally
with `PORT=3000 npm start` and `curl localhost:3000/healthz`.

### Agents: you cannot deploy without credentials

Creating services and reading back live URLs needs Railway API access. If
there is no `RAILWAY_TOKEN` in the environment and no Railway CLI or connector
available, **say so plainly** and give the user the dashboard steps above
instead of implying a deploy happened. Never invent or guess a
`*.up.railway.app` URL — a fabricated link is worse than no link. Only report a
URL that came back from Railway or that the user supplied.

## Configuration and secrets

- Never commit secrets. Set them as Railway service variables.
- These pages are static and normally read no config beyond `$PORT`. If one
  does read more, add a `.env.example` in that directory listing every
  variable with a placeholder and a one-line comment, and fail fast at startup
  with a clear message if a required variable is missing.
- **Every file in a service directory is publicly served**, not just
  `index.html` — `server.js`, `package.json`, and anything else you drop in are
  fetchable over HTTP. Never put a private file in a service directory, and
  never put an API key in a page.

## Branching

- `main` is the default branch and should always be deployable — pushes to it
  redeploy the affected services.
- Work on a branch, then open a pull request into `main`.
- Scope commits to one page where possible and prefix the subject with the
  directory, e.g. `hello-world: fix mobile layout`.

## Before pushing

- Start each changed service the way Railway will: `cd <dir> && npm start`.
- Load it in a browser and confirm the page renders and `/healthz` returns
  `ok`.
- Confirm `watchPatterns` in each changed `railway.json` still matches its own
  directory.
- Check that no secret or `.env` file is staged.
