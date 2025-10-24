import express from "express";
import { parseArgs } from "util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { resolve } from "path";
import {
  isInitializeRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { SqlPool } from "./sqlPool";
import { ConfigManager } from "./config";
import {
  pgGetServerVersion,
  pgListSchemas,
  pgListTableColumns,
  pgListTableForeignKeys,
  pgListTables,
  executeReadOnlyQuery,
} from "./db/helpers";
import type { PgTableDetails } from "./db/types";
import { randomUUID } from "crypto";

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

async function textResult(data: any): Promise<CallToolResult> {
  data = await Promise.resolve(data);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ result: data }, null, 2),
      },
    ],
  };
}

const cwd = process.cwd();
const envFile = resolve(cwd, ".env");
const envFileExists = await Bun.file(envFile).exists();
if (envFileExists) {
  await loadEnvFile(envFile);
}

async function getDatabasesInfo(configManager: ConfigManager) {
  const config = await configManager.loadConfig();
  if (!config) {
    throw new Error("Failed to load config");
  }
  const dbList = config.databases;
  const dbNames = Object.keys(dbList);
  // Allow empty database configuration
  const defaultDbName =
    dbNames.find((name) => name === config.defaultDatabase) || dbNames.at(0);
  const singleDb = dbNames.length === 1;
  return {
    dbList,
    dbNames,
    defaultDbName,
    singleDb,
  };
}

async function resolveDatabaseName(
  configManager: ConfigManager,
  database: string | undefined
) {
  const { dbList, dbNames, defaultDbName, singleDb } = await getDatabasesInfo(
    configManager
  );
  // Determine database name
  const name = database ?? defaultDbName;
  if (!name) {
    if (dbNames.length === 0) {
      throw new Error(
        "No databases are configured. Please add a database configuration first."
      );
    } else {
      throw new Error(
        `Multiple databases are configured: ${dbNames.join(
          ", "
        )}. Please specify the database using the ` +
          "`database`" +
          ` parameter.`
      );
    }
  }
  return name;
}

function createMcpServer({
  pool = new SqlPool(),
  configManager = new ConfigManager(),
} = {}) {
  // Initialize ConfigManager and start watching for config changes
  configManager.startWatching((newConfig) => {
    try {
      // Reconcile pool when config changes and autoReload is enabled
      pool.reconcile(newConfig);
    } catch (error) {
      console.error("Auto-reload error: Failed to reconcile SqlPool", error);
    }
  });

  // Create an MCP server
  const server = new McpServer({
    name: "PG MCP Server",
    version: "1.0.0",
  });

  // Add an addition tool
  server.tool(
    "pg_get_server_version",
    "Retrieves PostgreSQL version",
    { database: z.string().optional() },
    async ({ database }) => {
      try {
        const name = await resolveDatabaseName(configManager, database);
        const { url } = await configManager.getConfig(name);
        const client = pool.get(url);
        return textResult(pgGetServerVersion(client));
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.tool(
    "get_url",
    "Retrieves PostgreSQL connection URL",
    { database: z.string().optional() },
    async ({ database }) => {
      try {
        const name = await resolveDatabaseName(configManager, database);
        const { url } = await configManager.getConfig(name);
        return textResult(redactCredentials(url));
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.tool(
    "pg_list_schemas",
    "List PostgreSQL schemas",
    { database: z.string().optional() },
    async ({ database }) => {
      try {
        const name = await resolveDatabaseName(configManager, database);
        const { url } = await configManager.getConfig(name);
        const client = pool.get(url);
        return textResult(pgListSchemas(client));
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  const pgTablesArgsSchema = {
    schema: z.string().default("public"),
    database: z.string().optional(),
  };
  server.tool(
    "pg_list_tables",
    "List PostgreSQL tables",
    pgTablesArgsSchema,
    async ({ schema, database }) => {
      try {
        if (!schema) throw new Error("Schema is required");
        const name = await resolveDatabaseName(configManager, database);
        const { url } = await configManager.getConfig(name);
        const client = pool.get(url);
        return textResult(pgListTables(client, schema));
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.tool(
    "pg_describe_table",
    "Get PostgreSQL table details",
    {
      schema: z.string().default("public"),
      table: z.string(),
      database: z.string().optional(),
    },
    async ({ schema, table, database }) => {
      try {
        if (!schema || !table) throw new Error("Schema and table are required");
        const name = await resolveDatabaseName(configManager, database);
        const { url } = await configManager.getConfig(name);
        const client = pool.get(url);
        const columns = await pgListTableColumns(client, table, schema);
        const foreignKeys = await pgListTableForeignKeys(client, table, schema);
        const result: PgTableDetails = {
          schema_name: schema,
          table_name: table,
          columns: columns.map((col) => ({
            column_name: col.column_name,
            data_type: col.data_type,
            is_nullable: col.is_nullable,
            column_default: col.column_default,
          })),
          foreign_keys: foreignKeys.map((fk) => ({
            constraint_name: fk.constraint_name,
            referenced_table_schema: fk.referenced_table_schema,
            referenced_table_name: fk.referenced_table_name,
            referenced_column_name: fk.referenced_column_name,
            column_name: fk.column_name,
          })),
        };
        return textResult(result);
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.tool(
    "pg_execute_query",
    "Execute a read-only SQL query",
    { query: z.string(), database: z.string().optional() },
    async ({ query, database }) => {
      try {
        if (!query) throw new Error("Query is required");
        const name = await resolveDatabaseName(configManager, database);
        const { url } = await configManager.getConfig(name);
        const client = pool.get(url);
        const result = await executeReadOnlyQuery(client, query);
        return textResult(result);
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.prompt(
    "gen_types",
    "Generate TypeScript types for the comma separated tables",
    {
      database: z.string().optional(),
      schema: z.string().optional(),
      tables: z.string().optional(),
    },
    async (args) => {
      try {
        let { schema, tables, database } = args;
        schema = schema?.trim() || "public";
        tables = tables?.trim() || undefined;
        database = database?.trim() || undefined;
        const name = await resolveDatabaseName(configManager, database);
        const tableList =
          tables?.split(",").map((table) => table.trim()) ??
          (
            await pgListTables(
              pool.get((await configManager.getConfig(name)).url),
              schema
            )
          ).map((table) => table.table_name);
        return {
          description: `Generate TypeScript types for tables: ${tableList.join(
            ", "
          )}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Use pg_describe_table tool to get table details and generate TypeScript types for each table using the following parameters:
- schema "${schema}"
- tables ${tableList.join(", ")}
- database "${name}"
                
Include all columns and their types.`,
              },
            },
          ],
        };
      } catch (error) {
        return {
          description: "Error generating types",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Error: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            },
          ],
        };
      }
    }
  );

  // Add new MCP tool: list configured databases
  server.tool("pg_db_list", "List configured databases", {}, async () => {
    const config = await configManager.loadConfig();
    if (!config) throw new Error("Config file not found");
    const databases = Object.entries(config.databases).map(([name, db]) => ({
      name,
      url: redactCredentials(db.url),
      ttl: db.ttl,
    }));
    return textResult(databases);
  });

  // Helper function to redact credentials from URLs
  function redactCredentials(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = "***";
        return urlObj.toString();
      }
      return url;
    } catch {
      // If URL parsing fails, return the original URL
      return url;
    }
  }

  server.tool(
    "pg_db_add",
    "Add a new database configuration",
    {
      name: z.string(),
      url: z.string().url(),
      ttl: z.number({ coerce: true }).optional(),
    },
    async ({ name, url, ttl = 60000 }) => {
      try {
        await configManager.addDatabase(name, { url, ttl });
        // Reconcile pool after addition
        const newConfig = await configManager.loadConfig();
        if (!newConfig) throw new Error("Config file not found");
        pool.reconcile(newConfig);
        return textResult({ name, url: redactCredentials(url), ttl });
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.tool(
    "pg_db_update",
    "Update an existing database configuration",
    {
      name: z.string(),
      url: z.string().url().optional(),
      ttl: z.number().optional(),
    },
    async ({ name, url, ttl }) => {
      try {
        const update: Partial<{ url: string; ttl: number }> = {};
        if (url !== undefined) update.url = url;
        if (ttl !== undefined) update.ttl = ttl;
        await configManager.updateDatabase(name, update);
        // Evict and reconcile pool after update
        pool.evict(name);
        const updatedConfig = await configManager.loadConfig();
        if (!updatedConfig) throw new Error("Config file not found");
        pool.reconcile(updatedConfig);
        return textResult({
          name,
          ...(url && { url: redactCredentials(url) }),
          ...(ttl !== undefined && { ttl }),
        });
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  server.tool(
    "pg_db_remove",
    "Remove a database configuration",
    { name: z.string() },
    async ({ name }) => {
      try {
        await configManager.removeDatabase(name);
        // Evict and reconcile pool after removal
        pool.evict(name);
        const remConfig = await configManager.loadConfig();
        if (!remConfig) throw new Error("Config file not found");
        pool.reconcile(remConfig);
        return textResult({ name });
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Add new MCP tool: reload configuration and reconcile pool
  server.tool(
    "pg_db_reload",
    "Reload database configuration and reconcile SqlPool",
    {},
    async () => {
      try {
        const config = await configManager.loadConfig();
        if (!config) throw new Error("Config file not found");
        pool.reconcile(config);
        return textResult(Object.keys(config.databases));
      } catch (error) {
        return textResult({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  return server;
}

if (Bun.main === import.meta.path) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
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
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.mode === "stdio") {
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
  } else if (values.mode === "http") {
    const host = values["http-host"] || "0.0.0.0";
    const port = values["http-port"] || "3838";
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
      res: express.Response
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
