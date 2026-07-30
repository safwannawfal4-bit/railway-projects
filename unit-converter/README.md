# unit-converter

Converts length, mass, and temperature as you type, in either direction.
Temperature uses per-scale offset functions rather than a single ratio, so
°C/°F/K convert correctly.

**Live:** _not deployed yet_

## Run locally

```sh
npm start              # http://localhost:3000
PORT=4000 npm start    # or pick a port
```

No dependencies to install.

## Deploy

See [Deploying a page as its own service](../AGENTS.md#deploying-a-page-as-its-own-service).
Root Directory must be set to `/unit-converter`.
