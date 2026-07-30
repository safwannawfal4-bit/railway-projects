# railway-projects

Single-page HTML apps. Each page is self-contained and deployed as its **own
Railway service** inside one Railway project, so each has its own URL and its
own deploy lifecycle.

One directory = one HTML file = one Railway service = one URL.

## Pages

| Page                                 | What it is                                     | Live URL           |
| ------------------------------------ | ---------------------------------------------- | ------------------ |
| [`hello-world`](hello-world/)         | Deploy smoke test — shows host and healthcheck | _not deployed yet_ |
| [`unit-converter`](unit-converter/)   | Length, mass, and temperature converter        | _not deployed yet_ |

## Add a page

```sh
./new-page.sh my-page          # scaffolds my-page/ from _template/
cd my-page && npm start        # http://localhost:3000
```

Write the page into `my-page/index.html`, push, then add the Railway service
with **Root Directory** `/my-page` and generate a domain.

Full instructions: **[AGENTS.md](AGENTS.md)**.

## Run any page locally

```sh
cd <page-name>
npm start                      # http://localhost:3000
PORT=4000 npm start            # or pick a port
```

No dependencies to install — the server is Node stdlib only.
