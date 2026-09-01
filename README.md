# Career Forge

Structured resume data compiled into typeset PDFs.

**[career-forge-1043463379985.us-central1.run.app](https://career-forge-1043463379985.us-central1.run.app)**

You fill in forms. The app compiles your data through a Typst template into a
PDF that both humans and applicant tracking systems can read. Your data is the
source of truth — the PDF is a build artifact, never the thing you edit.

Upload an existing resume and it is parsed back into fields, so you can see how
a machine reads it. That parse is deterministic — vocabulary and typography, no
model — because "what did this resume say" and "what would an ATS make of it"
have to be one answer.

## Requirements

- Node 24 (see `.nvmrc`)
- pnpm 11 (`corepack enable pnpm`)

## Getting started

```bash
nvm use          # picks up .nvmrc
pnpm install
pnpm dev         # http://localhost:3000
```

## Scripts

| Command          | What it does                           |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | Development server                     |
| `pnpm build`     | Production build                       |
| `pnpm start`     | Serve the production build             |
| `pnpm typecheck` | Generate route types, then type-check  |
| `pnpm lint`      | Lint                                   |
| `pnpm format`    | Format with Prettier                   |
| `pnpm test`      | Unit tests                             |
| `pnpm test:e2e`  | End-to-end tests on a production build |

## Container

```bash
docker build -t career-forge .
docker run -p 3000:3000 career-forge
```

The health check compiles a real resume rather than pinging a status page, so
a healthy container means the native compiler loaded and the fonts resolved.

## Deployment

Cloud Run, from this Dockerfile, rebuilt and redeployed on every push to `main`.
Sizing and cost limits are measured rather than guessed — see
[deployment](docs/deployment.md).

## Fonts

`assets/fonts` holds committed static instances. Rebuild them only when adding
or changing a font:

```bash
python3 -m pip install fonttools
python3 scripts/build-fonts.py
```

## Documentation

- [Engineering guidelines](docs/engineering-guidelines.md) — the rules this
  codebase is held to. Read before contributing.
- [Architecture](docs/architecture.md) — how data becomes a PDF.
- [Deployment](docs/deployment.md) — where it runs, measured sizing, cost limits.
- [Accounts and billing](docs/accounts-and-billing.md) — the staged plan to
  accounts, credits and payments.
