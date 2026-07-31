# railway-projects

Single-file HTML pages, each served at its own link by one Railway service.

**Adding a file to `pages/` is the whole deploy step.** No config, no dashboard.

```
pages/pricing.html   ->   https://<domain>/pricing
```

**Live:** <https://railway-projects-production-0ea1.up.railway.app>

## Pages

| Page                                                                             | Link                                                                                                                   | What it is                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`select-property-daily-numbers.html`](pages/select-property-daily-numbers.html) | [/select-property-daily-numbers](https://railway-projects-production-0ea1.up.railway.app/select-property-daily-numbers) | ITP Live daily performance sheet for Select Property |
| [`vivo-influencer-report.html`](pages/vivo-influencer-report.html)               | [/vivo-influencer-report](https://railway-projects-production-0ea1.up.railway.app/vivo-influencer-report)               | ITP Live influencer campaign report for vivo (V series) |
| [`vivo-paid-amplification-report.html`](pages/vivo-paid-amplification-report.html) | [/vivo-paid-amplification-report](https://railway-projects-production-0ea1.up.railway.app/vivo-paid-amplification-report) | ITP Live paid amplification report for vivo (V series) |

`/` lists them all automatically — the table above is just for browsing on
GitHub.

## Add a page

```sh
cp pages/_template.html pages/my-page.html
npm start                    # http://localhost:3000/my-page
```

Write the page, commit, push. Live at `/my-page`.

The file name is the URL. Names are lowercase letters, digits, and dashes.
Anything starting with `_` is **not** published — `pages/_wip.html` stays
private, which is how `_template.html` avoids being served.

## Run locally

```sh
npm start                    # http://localhost:3000
PORT=4000 npm start          # or pick a port
```

No dependencies to install — the router is Node stdlib only. New files are
picked up without a restart.

## Give each page its own subdomain

Paths work out of the box. To give every page its own hostname as well —
`pricing.pages.example.com` — set this up once and it covers all future pages:

1. **DNS**: wildcard `CNAME` `*.pages` → the target Railway shows for a custom
   domain.
2. **Railway** → Settings → Networking → Custom Domain → `*.pages.example.com`.
3. **Railway** → Variables → `PAGE_DOMAIN=pages.example.com`.

After that, adding `pages/pricing.html` gives you
`https://pricing.pages.example.com` with no further setup. Path URLs keep
working, and the index switches to linking subdomains.

## Deploy

One service, connected to `main`, **no Root Directory set**. The manifest is at
the repo root, so there is nothing to configure — every push ships every page.

Full details, including why this is one service rather than one per page:
**[AGENTS.md](AGENTS.md)**.
