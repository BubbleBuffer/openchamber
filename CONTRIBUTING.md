# Contributing to OpenChamber

## Getting Started

```bash
git clone https://github.com/btriapitsyn/openchamber.git
cd openchamber
bun install
```

## Dev Scripts

### Web product

| Command | Description |
|---------|-------------|
| `bun run dev` | Start the web development watchers. |
| `bun run build` | Build session state, the web bundle, and the web server. |
| `bun run start:web` | Build and start the web product. |
| `bun run pack:session-state` | Create the session-state package tarball. |
| `bun run pack:web` | Create the web package tarball. |

The browser presentation and state live in `packages/web/src/ui`; the Express server and CLI live alongside them in `packages/web`.

## Before Submitting

```bash
bun run type-check   # Must pass
bun run lint         # Must pass
bun run build        # Must succeed
```

## Code Style

- Functional React components only
- TypeScript strict mode — no `any` without justification
- Use existing theme colors/typography from `packages/web/src/ui/lib/theme/` — don't add new ones
- Components must support light and dark themes
- Prefer early returns and `if/else`/`switch` over nested ternaries
- Tailwind v4 for styling; typography via `packages/web/src/ui/lib/typography.ts`

## Pull Requests

1. Fork and create a branch
2. Make changes
3. Run the validation commands above
4. Submit PR with clear description of what and why

## Project Structure

```
packages/
  web/       Web server (Express), frontend (Vite), CLI, and browser UI/state (`src/ui/`)
```

See [AGENTS.md](./AGENTS.md) for detailed architecture reference.

## Not a developer?

You can still help:

- Report bugs or UX issues — even "this felt confusing" is valuable feedback
- Test on different devices, browsers, or OS versions
- Suggest features or improvements via issues
- Help others in Discord

## Questions?

Open an [issue](https://github.com/btriapitsyn/openchamber/issues) or ask in [Discord](https://discord.gg/ZYRSdnwwKA).
