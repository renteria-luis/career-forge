# Career Forge

Structured resume data compiled into typeset PDFs.

You fill in forms. The app compiles your data through a Typst template into a
PDF that both humans and applicant tracking systems can read. Your data is the
source of truth — the PDF is a build artifact, never the thing you edit.

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

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Development server                    |
| `pnpm build`     | Production build                      |
| `pnpm start`     | Serve the production build            |
| `pnpm typecheck` | Generate route types, then type-check |
| `pnpm lint`      | Lint                                  |
| `pnpm format`    | Format with Prettier                  |

## Container

```bash
docker build -t career-forge .
docker run -p 3000:3000 career-forge
```

The image's health check asks `/api/preview` for a PDF, so a healthy container
means the compiler and fonts genuinely work.

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
