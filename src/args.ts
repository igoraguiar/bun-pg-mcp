import { parseArgs } from "util";

export type Mode = "stdio" | "cli" | "http";

export type MainArgs = {
  mode: Mode;
  httpHost: string;
  httpPort: string;
  version: boolean;
};

/**
 * Parse top-level CLI arguments for pg-mcp.
 * Only mode, http-host, http-port and version are parsed here.
 * All other flags are left for the CLI-specific parser.
 */
export function parseMainArgs(argv: string[]): MainArgs {
  const knownFlags = new Set(['--mode', '--http-host', '--http-port', '--version']);
  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && knownFlags.has(arg)) {
      filtered.push(arg);
      if (arg !== '--version' && i + 1 < argv.length) {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          filtered.push(next);
          i++;
        }
      }
    }
  }
  const { values } = parseArgs({
    args: filtered,
    options: {
      mode: {
        type: "string",
        default: "stdio",
      },
      "http-host": {
        type: "string",
        default: "0.0.0.0",
      },
      "http-port": {
        type: "string",
        default: "3838",
      },
      version: {
        type: "boolean",
        default: false,
      },
    },
    strict: false,
    allowPositionals: false,
  });

  const mode = (values.mode as string) as Mode;
  return {
    mode,
    httpHost: String(values["http-host"] ?? "0.0.0.0"),
    httpPort: String(values["http-port"] ?? "3838"),
    version: Boolean(values.version),
  };
}
