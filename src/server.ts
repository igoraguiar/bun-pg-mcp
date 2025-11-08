import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ConfigManager } from "./config";
import {
  pgGetServerVersion,
  pgListSchemas,
  pgListTables,
  pgListTableColumns,
  pgListTableForeignKeys,
  pgListTableReferencedBy,
  executeReadOnlyQuery,
} from "./db/helpers";
import type { PgTableDetails } from "./db/types";
import { SqlPool } from "./sql-pool";

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
export function createMcpServer({
  pool = new SqlPool(),
  configManager = new ConfigManager(),
  version = "unknown",
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
    version,
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
        const referencedBy = await pgListTableReferencedBy(
          client,
          table,
          schema
        );
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
          referenced_by: referencedBy.map((rb) => ({
            constraint_name: rb.constraint_name,
            referencing_table_schema: rb.referencing_table_schema,
            referencing_table_name: rb.referencing_table_name,
            referencing_column_name: rb.referencing_column_name,
            referenced_column_name: rb.referenced_column_name,
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
