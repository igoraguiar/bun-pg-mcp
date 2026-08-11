#!/usr/bin/env bun

import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { createMcpServer } from "./server";
import { version } from "../package.json";
import { resolve } from "path";
import { parseMainArgs } from "./args";
import { parseCliArgs, printHelp, printToolHelp, runTool } from "./cli";

function printSkill() {
  const bunPgMcpFile =
    import.meta.file === "index.ts"
      ? `bun run ${import.meta.path}`
      : import.meta.file;
  console.log(`---
name: pg-mcp-cli
description: Use bun-pg-mcp CLI mode to query and manage PostgreSQL databases via command line with JSON output.
---

# pg-mcp CLI Usage

## Purpose
This skill teaches an agent how to use bun-pg-mcp in \`--mode cli\` to execute PostgreSQL tools via command line and receive JSON results.

## Configuration
The server reads configuration from \`PG_MCP_CONFIG_PATH\` environment variable. Default: \`$HOME/.config/pg-mcp/config.json\`.

Config schema:
{
  "databases": {
    "name": {
      "url": "postgresql://user:password@host:port/db",
      "ttl": 60000
    }
  },
  "autoReload": true
}

If no config exists but \`POSTGRES_URL\` is set, a default database named \`default\` is created.

## CLI Invocation
Generic form:
${bunPgMcpFile} --mode cli --tool <tool_name> [--database <name>] [--key value...]

With bun wrapper:
bun run src/index.ts --mode cli --tool <tool_name> ...

Flags:
--tool, -t <name>   Required tool name
--database, -d <name>   Target database, required when multiple databases configured
--help, -h          Print help for all tools
--help <tool_name>  Print help for a specific tool
--format, -f        Output format, only json supported
--verbose, -v       Print debug info to stderr
--skill             Print this skill documentation to stdout

## Help
${bunPgMcpFile} --mode cli --help
${bunPgMcpFile} --mode cli --help pg_list_tables

## Execution Examples
List configured databases:
${bunPgMcpFile} --mode cli --tool pg_db_list

List schemas:
${bunPgMcpFile} --mode cli --tool pg_list_schemas --database production

List tables:
${bunPgMcpFile} --mode cli --tool pg_list_tables --schema public --database default

Describe table:
${bunPgMcpFile} --mode cli --tool pg_describe_table --schema public --table users --database default

Read-only query:
${bunPgMcpFile} --mode cli --tool pg_execute_query --query "SELECT id FROM users LIMIT 10" --database default

## Output
Output is JSON envelope:
{
  "tool": "<name>",
  "durationMs": 0,
  "timestamp": "ISO",
  "result": ...,
  "error": "..."
}
Credentials are redacted in URLs.
`);
}

async function loadEnvFile(filePath: string) {
  try {
    const env = await Bun.file(filePath).text();
    env.split("\n").forEach((line) => {
      const [key, value] = line.split("=");
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    });
  } catch (error) {
    console.error(`Failed to load environment file at ${filePath}:`, error);
  }
}
const cwd = process.cwd();
const envFile = resolve(cwd, ".env");
const envFileExists = await Bun.file(envFile).exists();
if (envFileExists) {
  await loadEnvFile(envFile);
}

if (Bun.main === import.meta.path) {
  const args = parseMainArgs(Bun.argv.slice(2));

  if (args.version) {
    console.log(version);
    process.exit(0);
  }
  if (args.mode === "stdio") {
    const server = createMcpServer({ version });
    await server.connect(new StdioServerTransport());
  } else if (args.mode === "cli") {
    const parsed = parseCliArgs(Bun.argv.slice(2));
    if (parsed.args?.skill) {
      printSkill();
      process.exit(0);
    }
    if (parsed.help) {
      printHelp();
      process.exit(0);
    }
    if (parsed.helpTool) {
      printToolHelp(parsed.helpTool);
      process.exit(0);
    }
    if (!parsed.tool) {
      console.error("Error: --tool is required for CLI mode");
      printHelp();
      process.exit(1);
    }
    if (parsed.format !== "json") {
      const err = {
        tool: parsed.tool,
        durationMs: 0,
        timestamp: new Date().toISOString(),
        error: `Unsupported format '${parsed.format}'. Only 'json' is supported.`,
      };
      console.log(JSON.stringify(err, null, 2));
      process.exit(0);
    }
    if (parsed.verbose) {
      console.error(
        `CLI: running tool ${parsed.tool} with args ${JSON.stringify(parsed.args)}`,
      );
    }
    const result = await runTool(parsed.tool, parsed.args, parsed.verbose);
    console.log(JSON.stringify(result, null, 2));
  } else if (args.mode === "http") {
    const host = String(args.httpHost || "0.0.0.0");
    const port = String(args.httpPort || "3838");
    const app = express();
    app.use(express.json());

    // Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } =
      {};

    // Handle POST requests for client-to-server communication
    app.post("/mcp", async (req, res) => {
      // Check for existing session ID
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
          },
          // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
          // locally, make sure to set:
          // enableDnsRebindingProtection: true,
          // allowedHosts: ['127.0.0.1'],
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        const server = createMcpServer();

        // ... set up server resources, tools, and prompts ...

        // Connect to the MCP server
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (
      req: express.Request,
      res: express.Response,
    ) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications via SSE
    app.get("/mcp", handleSessionRequest);

    // Handle DELETE requests for session termination
    app.delete("/mcp", handleSessionRequest);

    app.listen(Number(port), host, () => {
      console.log(`MCP server listening at http://${host}:${port}/mcp`);
    });
  }
}
