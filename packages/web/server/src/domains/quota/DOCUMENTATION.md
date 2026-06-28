# Quota Module Documentation

## Purpose
This module fetches quota and usage signals for supported providers in the web server runtime.

## Entrypoints and structure
- `packages/web/server/src/domains/quota/index.ts`: public entrypoint imported by the server composition root.
- `packages/web/server/src/domains/quota/routes.ts`: Express route registration for quota endpoints.
- `packages/web/server/src/domains/quota/providers/index.ts`: provider registry, configured-provider list, and provider dispatcher.
- `packages/web/server/src/domains/quota/types.ts`: provider/result contracts used by provider implementations.
- `packages/web/server/src/domains/quota/providers/google/`: Google-specific auth, API, and transform modules.
- `packages/web/server/src/domains/quota/auth-utils.ts`, `formatters.ts`, and `transformers.ts`: shared auth, formatting, and transformation helpers.

## Supported provider IDs (dispatcher)

These provider IDs are currently dispatchable via `fetchQuotaForProvider(providerId)` in `packages/web/server/src/domains/quota/providers/index.ts`.

| Provider ID | Display name | Module | Auth aliases/keys |
| --- | --- | --- | --- |
| `claude` | Claude | `providers/claude.ts` | `anthropic`, `claude` |
| `codex` | Codex | `providers/codex.ts` | `openai`, `codex`, `chatgpt` |
| `google` | Google | `providers/google/index.ts` | `google`, `google.oauth`, Antigravity accounts file |
| `github-copilot` | GitHub Copilot | `providers/copilot.ts` | `github-copilot`, `copilot` |
| `github-copilot-addon` | GitHub Copilot Add-on | `providers/copilot.ts` | `github-copilot`, `copilot` |
| `kimi-for-coding` | Kimi for Coding | `providers/kimi.ts` | `kimi-for-coding`, `kimi` |
| `nano-gpt` | NanoGPT | `providers/nanogpt.ts` | `nano-gpt`, `nanogpt`, `nano_gpt` |
| `openrouter` | OpenRouter | `providers/openrouter.ts` | `openrouter` |
| `zai-coding-plan` | z.ai | `providers/zai.ts` | `zai-coding-plan`, `zai`, `z.ai` |
| `zhipuai-coding-plan` | Zhipu AI Coding Plan | `providers/zhipuai-coding-plan.ts` | `zhipuai-coding-plan` |
| `minimax-coding-plan` | MiniMax Coding Plan (minimax.io) | `providers/minimax-coding-plan.ts` | `minimax-coding-plan` |
| `minimax-cn-coding-plan` | MiniMax Coding Plan (minimaxi.com) | `providers/minimax-cn-coding-plan.ts` | `minimax-cn-coding-plan` |
| `ollama-cloud` | Ollama Cloud | `providers/ollama-cloud.ts` | Cookie file at `~/.config/ollama-quota/cookie` (raw session cookie string) |
| `zhipuai-coding-plan` | ZhipuAI | `providers/zhipuai.ts` | `zhipuai-coding-plan`, `zhipuai`, `zhipu` |

## Internal-only provider module
- `providers/openai.ts` exists for logic parity/reuse but is intentionally not registered for dispatcher ID routing.

## Response contract
All providers should return results via shared helpers to preserve API shape:
- Required fields: `providerId`, `providerName`, `ok`, `configured`, `usage`, `fetchedAt`
- Optional field: `error`
- Unsupported provider requests should return `ok: false`, `configured: false`, `error: Unsupported provider`

## Add a new provider (quick steps)
1. Choose module shape based on complexity:
   - Simple providers: create `packages/web/server/src/domains/quota/providers/<provider>.ts`.
   - Complex providers (multi-source auth, multiple API calls, non-trivial transforms): create `packages/web/server/src/domains/quota/providers/<provider>/` with split modules like Google (`index.ts`, `auth.ts`, `api.ts`, `transforms.ts`).
2. Export `providerId`, `providerName`, `aliases`, `isConfigured`, and `fetchQuota`.
3. Use shared helpers in `packages/web/server/src/domains/quota/` (`buildResult`, `toUsageWindow`, auth/conversion helpers) to keep payload shape consistent.
4. Register the provider in `packages/web/server/src/domains/quota/providers/index.ts`.
5. If needed for direct use, export a named fetcher from `packages/web/server/src/domains/quota/providers/index.ts` and `packages/web/server/src/domains/quota/index.ts`.
6. Update this file with the new provider ID, module path, and alias/auth details.
7. Validate with `bun run type-check`, `bun run lint`, and `bun run build`.

## Notes for contributors
- Keep provider IDs stable; clients use them directly.
- Avoid adding alias-based dispatch in `fetchQuotaForProvider`; dispatch currently expects exact provider IDs.
- Keep Google behavior changes isolated and review `providers/google/*` together.
