# OpenChamber (mobile-first fork)

> Soft fork of [OpenChamber](https://github.com/btriapitsyn/openchamber) focused on mobile-first PWA UX and store architecture. Pulls upstream SDK/server fixes; diverges on UI and stores.

### A rich interface for [OpenCode](https://opencode.ai). Review diffs, manage agents, run dev servers, and keep the big picture while your AI codes.

![OpenChamber Chat](docs/references/chat_example.png)

<details>
<summary>More screenshots</summary>

![Tool Output](docs/references/tool_output_example.png)
![Settings](docs/references/settings_example.png)
![Web Version](docs/references/web_version_example.png)
![Diff View](docs/references/diff_example.png)

<p>
<img src="docs/references/pwa_chat_example.png" width="45%" alt="PWA Chat">
<img src="docs/references/pwa_diff_example.png" width="45%" alt="PWA Diff">
</p>

</details>

## Why use OpenChamber?

- **Cross-device continuity**: Start in TUI, continue on tablet/phone, return to terminal - same session
- **Remote access**: Use OpenCode from anywhere via browser
- **Familiarity**: A visual alternative for developers who prefer GUI workflows

## Features

### Core (all app versions)

- Branchable chat timeline with `/undo`, `/redo`, and one-click forks from earlier turns
- Smart tool UIs for diffs, file operations, permissions, and long-running task progress
- Voice mode with speech input and read-aloud responses for hands-free workflows
- Multi-agent runs from one prompt with isolated worktrees for safe side-by-side comparisons
- Git workflows in-app: identities, commits, PR creation, checks, and merge actions
- GitHub-native workflows: start sessions from issues and pull requests with context already attached
- Plan/Build mode with a dedicated plan view for drafting and iterating implementation steps
- Inline comment drafts on diffs, files, and plans that can be sent back to the agent
- Context visibility tools (token/cost breakdowns, raw message inspection, and activity summaries)
- Integrated terminal with per-directory sessions and stable performance on heavy output
- Built-in skills catalog and local skill management for reusable automation workflows

### Web / PWA

- Provider-aware tunnel access model with Cloudflare `quick`, `managed-remote`, and `managed-local` modes
- One-scan onboarding with tunnel QR + password URL helpers
- Mobile-first experience: optimized chat controls, keyboard-safe layouts, and attachment-friendly UI
- Background notifications plus reliable cross-tab session activity tracking
- Built-in self-update + restart flow that keeps your server settings intact

### Desktop (macOS)

- Native macOS menu integration with polished app actions and deep-link handling
- Multi-window support for parallel project/session workflows
- "Open In" shortcuts for Finder, Terminal, and your preferred editor
- Fast switching between local and remote instances
- Workspace-first startup flow with directory picker and steadier window restore behavior

### Custom Themes

- **Use it from anywhere** - Cloudflare tunnel with QR code onboarding. Scan, connect, code from your couch.
- **Branchable chat timeline** - Undo, redo, fork from any turn. Explore different approaches without losing your place.
- **GitHub-native workflows** - Start sessions from issues and PRs with context already attached. Review checks, merge - all in-app.
- **Project Actions** - Run dev servers, configure SSH port forwarding, open remote URLs locally. Your project commands, one click away.
- **Connect to remote machines** - Desktop app connects to remote OpenChamber instances over SSH, with dedicated lifecycle and UX flows.

## Quick Start

> **Prerequisite:** [OpenCode CLI](https://opencode.ai) installed.

### **Desktop (macOS)**
Download from [Releases](https://github.com/btriapitsyn/openchamber/releases).

### **CLI (Web + PWA)**
_requires Node.js 20+_

```bash
curl -fsSL https://raw.githubusercontent.com/btriapitsyn/openchamber/main/scripts/install.sh | bash
openchamber --ui-password be-creative-here
```

<details>
<summary>Advanced CLI options</summary>

```bash
openchamber --port 8080              # Custom port
openchamber --ui-password secret     # Password-protect UI
openchamber tunnel help              # Tunnel lifecycle commands
openchamber tunnel providers         # Show provider capabilities
openchamber tunnel profile add --provider cloudflare --mode managed-remote --name prod-main --hostname app.example.com --token <token>
openchamber tunnel start --profile prod-main
openchamber tunnel start --provider cloudflare --mode quick --qr
openchamber tunnel start --provider cloudflare --mode managed-local --config ~/.cloudflared/config.yml
openchamber tunnel status --all      # Show tunnel state across instances
openchamber tunnel stop --port 3000  # Stop tunnel only (server stays running)
openchamber logs                     # Follow latest instance logs
OPENCODE_PORT=4096 OPENCODE_SKIP_START=true openchamber                    # Connect to external OpenCode server
OPENCODE_HOST=https://myhost:4096 OPENCODE_SKIP_START=true openchamber  # Connect via custom host/HTTPS
openchamber stop                     # Stop server
openchamber update                   # Update to latest
```

Connect to an existing OpenCode server:
```bash
OPENCODE_PORT=4096 OPENCODE_SKIP_START=true openchamber
OPENCODE_HOST=https://myhost:4096 OPENCODE_SKIP_START=true openchamber
```

Bind managed OpenCode server to all interfaces (use only on trusted networks):
```bash
OPENCHAMBER_OPENCODE_HOSTNAME=0.0.0.0 openchamber --port 3000
```

</details>

<details>
<summary>systemd service (VPN / LAN access)</summary>

Run OpenChamber and OpenCode as separate persistent services — useful when you want to access your
dev machine over a VPN (e.g. Tailscale) or LAN without a Cloudflare tunnel.

**How it works:**
- OpenCode runs as its own service, binding only to `localhost`.
- OpenChamber connects to it via `OPENCODE_HOST` and `--host 0.0.0.0` makes it reachable on your VPN IP.
- `--foreground` keeps the CLI process alive so systemd can track and restart it.

**`~/.config/systemd/user/opencode.service`**
```ini
[Unit]
Description=OpenCode Server

[Service]
Type=simple
ExecStart=opencode serve --port 4095
Environment="PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/home/YOU/.local/bin:/home/YOU/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
Environment=SSH_AUTH_SOCK=%t/ssh-agent.socket
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

> **Why set `PATH` and `SSH_AUTH_SOCK`?**
> systemd user services start with a minimal environment — no shell profile is sourced.
> Without an explicit `PATH`, OpenCode won't find tools installed via Homebrew, npm, or `~/.local/bin`.
> Without `SSH_AUTH_SOCK`, git operations over SSH (push, pull, clone) will fail because the agent socket isn't inherited.
> Adjust the `PATH` to match your own tool installation paths.
> `%t` expands to `$XDG_RUNTIME_DIR` (e.g. `/run/user/1000`), where most SSH agents write their socket.

**`~/.config/systemd/user/openchamber.service`**
```ini
[Unit]
Description=OpenChamber Web Server
After=opencode.service

[Service]
Type=simple
ExecStart=openchamber serve --port 3000 --host 0.0.0.0 --ui-password your-password --foreground
Environment="OPENCODE_HOST=http://localhost:4095"
Environment="OPENCODE_SKIP_START=true"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now opencode openchamber
```

OpenChamber will be reachable at `http://<your-vpn-hostname>:3000` from any device on your VPN.

> **Note:** `--host 0.0.0.0` is required to listen on all interfaces. The default
> bind address is `127.0.0.1` (localhost only). Use `--host <ip>` or
> `OPENCHAMBER_HOST=<ip>` to bind to a specific interface instead.

</details>

<details>
<summary>Docker</summary>

```bash
docker compose up -d
```

Available at `http://localhost:3000`.

**UI Password:**
```yaml
environment:
  UI_PASSWORD: your_secure_password
```

**Cloudflare Tunnel (optional):**
```yaml
environment:
  OPENCHAMBER_TUNNEL_MODE: quick # quick | managed-remote | managed-local
  OPENCHAMBER_TUNNEL_PROVIDER: cloudflare
```

For `managed-remote` mode, provide:

```yaml
environment:
  OPENCHAMBER_TUNNEL_MODE: managed-remote
  OPENCHAMBER_TUNNEL_HOSTNAME: app.example.com
  OPENCHAMBER_TUNNEL_TOKEN: <token>
```

For `managed-local` mode, optionally provide:

```yaml
environment:
  OPENCHAMBER_TUNNEL_MODE: managed-local
  OPENCHAMBER_TUNNEL_CONFIG: /home/openchamber/.cloudflared/config.yml
```

Managed-local path note: `OPENCHAMBER_TUNNEL_CONFIG` must point to a path inside the container user home (`/home/openchamber/...`). If your Cloudflare config references a credentials JSON file, that file path must also be accessible inside the container (mount with `volumes`).

### Reverse proxy notes

- For a complete reverse proxy setup guide, see [`docs/REVERSE_PROXY.md`](./docs/REVERSE_PROXY.md).
- Website docs source lives at `packages/docs/content/docs/reverse-proxy.mdx`.

### Tunnel behavior notes

- OpenChamber supports one active tunnel per running instance (port).
- Starting a tunnel with a different mode/provider on the same instance replaces the current tunnel.
- Replacing or stopping a tunnel revokes existing connect links and invalidates remote tunnel sessions for that instance.
- Connect links are one-time tokens; generating a new link revokes the previous unused link.

**Data Directory Permission Note:** The `data/` directory is mounted into the container for persistent storage (config, sessions, SSH keys, workspaces). Before running, ensure the directory exists and has proper permissions:

```bash
mkdir -p data/openchamber data/opencode/share data/opencode/config data/ssh
chown -R 1000:1000 data/
```

**SSH/Git:** If git push/pull fails, run `ssh -T git@github.com` in terminal.

</details>


## Features

<details>
<summary><strong>Chat & Interaction</strong></summary>

- Branchable chat timeline with `/undo`, `/redo`, and one-click forks from any turn
- Multi-agent runs from one prompt with isolated worktrees for safe side-by-side comparisons
- Voice mode with speech input and read-aloud responses for hands-free workflows
- Plan/Build mode with a dedicated plan view for drafting and iterating steps
- Inline comment drafts on diffs, files, and plans - send feedback back to the agent
- Shell mode via leading `!` with inline output
- Share messages as images
- Mermaid diagrams render inline with copy/download actions
- Smart tool UIs for diffs, file operations, permissions, and task progress

</details>

<details>
<summary><strong>Git & GitHub</strong></summary>

- Full Git sidebar with staging, commits, push/pull, branch management, and rebase/merge flows
- PR creation with AI-generated descriptions, status checks, and merge actions
- Start sessions from GitHub issues and pull requests with context baked in
- Multi-remote push and fork-aware PR creation
- Worktree integration: isolated sessions per branch, merge back with conflict handling
- Git identities, gitmoji support, and multi-account GitHub auth

</details>

<details>
<summary><strong>Files, Diff & Terminal</strong></summary>

- Workspace file browser with inline editing, syntax highlighting, and markdown preview
- Beautiful diff viewer with stacked/inline modes, lazy loading for large changesets
- Integrated terminal with per-directory sessions, tabbed interface, and stable heavy-output performance
- Clickable file paths in messages - jump to exact line locations
- File-type icons across all views for faster visual scanning

</details>

<details>
<summary><strong>Web / PWA</strong></summary>

- Cloudflare tunnel with quick, managed-remote, and managed-local modes, secure one-time connect links, and QR onboarding
- Mobile-first: optimized chat controls, keyboard-safe layouts, drag-to-reorder projects
- Background notifications and cross-tab session tracking
- Self-update + restart flow that keeps your server settings intact
- Installable as PWA with project-aware naming

</details>

<details>
<summary><strong>Desktop (macOS)</strong></summary>

- Connect to remote OpenChamber instances over SSH with dedicated lifecycle flows
- Project Actions: run dev servers, SSH port forwarding, open remote URLs locally
- Multi-window support for parallel project workflows
- "Open In" shortcuts for Finder, Terminal, and your preferred editor
- Fast switching between local and remote instances
- Native macOS menu, deep-link handling, and polished startup

</details>

<details>
<summary><strong>Customization</strong></summary>

- 18+ built-in themes with light/dark variants
- Custom themes via JSON files in `~/.config/openchamber/themes/` - hot reload, no restart
- Configurable keyboard shortcuts for chat, panels, and services
- Font size, spacing, corner radius, and layout controls
- Customizable project icons with upload and automatic favicon discovery
- Skills catalog and local skill management for reusable automation

[Read the Guide: Custom Themes](docs/CUSTOM_THEMES.md)

</details>

<details>
<summary><strong>Context & Productivity</strong></summary>

- Token usage, cost breakdowns, and raw message inspection panel
- Usage quota tracking across multiple providers with pace/prediction indicators
- Favorite model cycling via keyboard shortcuts
- Session folders and subfolders with drag-to-reorder
- Persistent project notes and todos per project
- Draft persistence per session with expanded focus mode for longer prompts

</details>

## Fork Focus

This soft fork diverges from upstream on:

- **Mobile-first PWA**: Offline-capable service worker, bottom tab navigation, touch-optimized layouts, drawer-based panels
- **Store refactoring**: Split mega-stores by concern. Break circular dependencies. No DOM side-effects in Zustand.
- **SDK type centralization**: Single re-export point for all SDK types

Upstream SDK/server/runtime fixes flow in continuously. Full spec: `.superpawers/specs/2026-04-27-soft-fork-mobile-first.md`

## Acknowledgments

Independent project, not affiliated with the OpenCode team.

**Special thanks to:**

- [OpenCode](https://opencode.ai) - For the excellent API and extensible architecture.
- [Flexoki](https://github.com/kepano/flexoki) - Beautiful color scheme by [Steph Ango](https://stephango.com/flexoki).
- [Pierre](https://pierrejs-docs.vercel.app/) - Fast, beautiful diff viewer with syntax highlighting.
- [Tauri](https://github.com/tauri-apps/tauri) - Desktop application framework.
- [Ghostty-web](https://github.com/coder/ghostty-web) - Great implementation of a Ghostty web renderer.
- [David Hill](https://x.com/iamdavidhill) - Who inspired me to release this without [overthinking](https://x.com/iamdavidhill/status/1993648326450020746).
- [My wife](https://github.com/yulia-ivashko), who - with zero AI background - sat down with the app for the first time and built the firework celebration that plays on every successful push.
- Every contributor who shaped this project with their PRs, ideas, and attention to detail.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

Docs source lives in [`packages/docs`](packages/docs/README.md).

## License

MIT
