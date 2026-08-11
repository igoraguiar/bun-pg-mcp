import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ConfigManager } from "./config";
import { SqlPool } from "./sql-pool";
import { handlers } from "./handlers";
import { pgListTables } from "./db/helpers";

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

async function getDatabasesInfo(configManager: ConfigManager) {
  const config = await configManager.loadConfig();
  if (!config) {
    throw new Error("Failed to load config");
  }
  const dbList = config.databases;
  const dbNames = Object.keys(dbList);
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
  const { dbNames, defaultDbName, singleDb } = await getDatabasesInfo(
    configManager
  );
  const name =
    database?.trim() ||
    defaultDbName?.trim() ||
    (singleDb ? dbNames[0] : undefined);
  if (!name) {
    if (dbNames.length === 0) {
      throw new Error(
        "No databases are configured. Please add a database configuration first."
      );
    } else {
      throw new Error(
        `Multiple databases are configured (${dbNames.length}): ${dbNames.join(
          ", "
        )}. Please specify the database using the \`database\` parameter.`
      );
    }
  }
  return name;
}

export function createMcpServer({
  pool = new SqlPool(),
  configManager = new ConfigManager(),
  version = "unknown",
} = {}) {
  configManager.startWatching((newConfig) => {
    try {
      pool.reconcile(newConfig);
    } catch (error) {
      console.error("Auto-reload error: Failed to reconcile SqlPool", error);
    }
  });

  const server = new McpServer({
    name: "PG MCP Server",
    version,
  });

  for (const h of handlers) {
    server.tool(
      h.name,
      h.description,
      h.schema,
      async (args) => {
        try {
          const result = await h.handler(configManager, pool, args);
          return textResult(result);
        } catch (error) {
          return textResult({
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );
  }

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

  return server;
}
