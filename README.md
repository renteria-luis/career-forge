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
