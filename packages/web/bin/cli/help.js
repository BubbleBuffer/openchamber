import { COMMAND_DESCRIPTIONS, COMMAND_NAMES, DEFAULT_PORT } from './arguments.js';

function renderHelp() {
  const commands = COMMAND_NAMES
    .map((name) => `  ${name.padEnd(15)}${COMMAND_DESCRIPTIONS[name]}`)
    .join('\n');

  return `
 OpenChamber - Web interface for the OpenCode AI coding agent

USAGE:
  openchamber [COMMAND] [OPTIONS]

COMMANDS:
${commands}

OPTIONS:
  -p, --port              Web server port (default: ${DEFAULT_PORT})
  --host                  Bind address (default: 127.0.0.1)
  --ui-password           Protect browser UI with single password
  --foreground            Run server in foreground (use with systemd/process managers)
  --no-daemon             Alias for --foreground
  -h, --help              Show help
  -v, --version           Show version

ENVIRONMENT:
  OPENCHAMBER_HOST             Bind address (e.g. 0.0.0.0 for all interfaces)
  OPENCHAMBER_UI_PASSWORD      Alternative to --ui-password flag
  OPENCHAMBER_DATA_DIR         Override OpenChamber data directory
  OPENCODE_HOST               External OpenCode server base URL, e.g. http://hostname:4096
  OPENCODE_PORT               Port of external OpenCode server to connect to
  OPENCODE_SKIP_START          Skip starting OpenCode, use external server
  OPENCHAMBER_OPENCODE_HOSTNAME  Bind hostname for managed OpenCode server (default: 127.0.0.1)

EXAMPLES:
  openchamber                    # Start in daemon mode on default port 3000 (or free port)
  openchamber --port 8080        # Start on port 8080 (daemon)
  openchamber serve --foreground # Start in foreground (for systemd Type=simple)
  openchamber logs               # Follow logs for latest running instance
`;
}

function showHelp({ stdout = process.stdout } = {}) {
  stdout.write(renderHelp());
}

function generateCompletionScript(shell) {
  const normalized = typeof shell === 'string' ? shell.trim().toLowerCase() : '';
  const commands = COMMAND_NAMES.join(' ');
  if (normalized === 'bash') {
    return `# Bash completion for openchamber
# Add to ~/.bashrc: eval "$(openchamber completion bash)"
_openchamber() {
  local cur commands common_flags
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"

  commands="${commands}"
  common_flags="--port --foreground --no-daemon --json --all --help --version --plain --quiet"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "\${common_flags}" -- "\${cur}") )
  return 0
}
complete -F _openchamber openchamber
`;
  }
  if (normalized === 'zsh') {
    return `#compdef openchamber
# Zsh completion for openchamber
# Add to ~/.zshrc: eval "$(openchamber completion zsh)"

_openchamber() {
  local -a commands

  commands=(
${COMMAND_NAMES.map((name) => `    '${name}:${COMMAND_DESCRIPTIONS[name]}'`).join('\n')}
  )

  _arguments -C \\
    '1:command:->command'

  case \$state in
    command)
      _describe 'command' commands
      ;;
  esac
}

compdef _openchamber openchamber
`;
  }
  if (normalized === 'fish') {
    const fishCommands = COMMAND_NAMES.map((name) => {
      const description = name === 'logs'
        ? 'Tail logs'
        : (name === 'update' ? 'Check for updates' : COMMAND_DESCRIPTIONS[name]);
      return `complete -c openchamber -n '__fish_use_subcommand' -a '${name}' -d '${description}'`;
    }).join('\n');
    return `# Fish completion for openchamber
# Save to ~/.config/fish/completions/openchamber.fish

${fishCommands}
complete -c openchamber -n '__fish_seen_subcommand_from serve' -l foreground -d 'Run in foreground (for systemd/process managers)'
complete -c openchamber -n '__fish_seen_subcommand_from serve' -l no-daemon -d 'Run in foreground (alias for --foreground)'
`;
  }
  return null;
}

export { generateCompletionScript, renderHelp, showHelp };
