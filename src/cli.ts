import { handlers } from "./handlers";

function coerceValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

export function parseCliArgs(argv: string[]) {
  const args: Record<string, any> = {};
  let tool: string | null = null;
  let help = false;
  let helpTool: string | undefined;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === "--mode" || token === "-m") {
      i++;
      continue;
    }
    if (token === "--tool" || token === "-t") {
      tool = argv[i + 1] ?? null;
      i++;
      continue;
    }
    if (token === "--help" || token === "-h") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        helpTool = next;
        i++;
      } else {
        help = true;
      }
      continue;
    }
    if (token === "--verbose" || token === "-v") {
      verbose = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = coerceValue(next);
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  return { tool, args, help, helpTool, verbose };
}

export function listTools() {
  return handlers.map(h => ({ name: h.name, description: h.description }));
}

export function getToolSchema(toolName: string) {
  const h = handlers.find(h => h.name === toolName);
  return h?.schema ?? null;
}

export function printHelp() {
  console.log("Usage: pg-mcp --mode cli --tool <name> [--key value...]");
  console.log("\nAvailable tools:");
  for (const h of handlers) {
    console.log(`  ${h.name} - ${h.description}`);
  }
}

export function printToolHelp(toolName: string) {
  const h = handlers.find(h => h.name === toolName);
  if (!h) {
    console.error(`Tool ${toolName} not found`);
    return;
  }
  console.log(`Tool: ${h.name}`);
  console.log(`Description: ${h.description}`);
  console.log("Schema:", JSON.stringify(h.schema, null, 2));
}
