# railway-projects

Single-file HTML pages, each served at its own link by one Railway service.

**Adding a file to `pages/` is the whole deploy step.** No config, no dashboard.

```
pages/pricing.html   ->   https://<domain>/pricing
```

**Live:** _not deployed yet_ — add the domain here once generated.

## Pages

| Page                                          | URL               | What it is                                     |
| --------------------------------------------- | ----------------- | ---------------------------------------------- |
| [`hello-world.html`](pages/hello-world.html)   | `/hello-world`    | Deploy smoke test — shows host and healthcheck |
| [`unit-converter.html`](pages/unit-converter.html) | `/unit-converter` | Length, mass, and temperature converter    |

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

## Deploy

One service, connected to `main`, **no Root Directory set**. The manifest is at
the repo root, so there is nothing to configure — generate a domain and every
push ships every page.

Full details, including why this is one service rather than one per page:
**[AGENTS.md](AGENTS.md)**.
