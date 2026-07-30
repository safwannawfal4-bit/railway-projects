# railway-projects

Instructions for working in this repository.

## What this repo is

A home for projects deployed on [Railway](https://railway.com). Each project
lives in its own top-level directory and is deployable on its own.

## Layout

```
railway-projects/
├── CLAUDE.md          # these instructions
├── README.md          # human-facing overview
└── <project-name>/    # one directory per Railway service
    ├── railway.json   # Railway build/deploy config
    └── ...            # app source
```

## Conventions

- One directory per Railway service. Don't share source between services —
  duplicate or extract to a package instead.
- Every project directory has its own dependency manifest
  (`package.json`, `requirements.txt`, `go.mod`, …) and its own lockfile.
- Commit lockfiles. Railway builds from them.
- Name directories in `kebab-case`, matching the Railway service name.

## Configuration and secrets

- Never commit secrets. Set them as Railway service variables.
- Check in a `.env.example` per project listing every variable the app reads,
  with placeholder values and a one-line comment each.
- Read config from the environment at startup and fail fast with a clear
  message if a required variable is missing.
- Bind servers to `0.0.0.0` and the port in `$PORT` — Railway assigns it.

## Adding a new project

1. Create the directory and add the app source.
2. Add `.env.example` and a short `README.md` covering what it does and how to
   run it locally.
3. Add a `railway.json` with the build and start commands.
4. Verify it starts locally with the same command Railway will use.

## Branching

- `main` is the default branch and should always be deployable.
- Work on a branch, then open a pull request into `main`.
- Keep commits scoped to one project where possible; prefix the subject with
  the project directory, e.g. `api: add health check endpoint`.

## Before pushing

- Run the project's tests and linter if it has them.
- Confirm the start command in `railway.json` still works.
- Check that no secret or `.env` file is staged.
