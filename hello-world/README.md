# hello-world

Smoke test for the one-page-per-service pattern. Renders the service name, the
host it was served from, the load time, and the live result of fetching
`/healthz` — so a green page means the build, the start command, and the
healthcheck are all working.

**Live:** _not deployed yet_

## Run locally

```sh
npm start              # http://localhost:3000
PORT=4000 npm start    # or pick a port
```

No dependencies to install.

## Deploy

See [Deploying a page as its own service](../AGENTS.md#deploying-a-page-as-its-own-service).
Root Directory must be set to `/hello-world`.
