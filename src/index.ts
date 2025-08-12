import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { argv } from "bun";
import { z } from "zod";
import { resolve } from "path";
// Removed unused import of SQL; using SqlPool instead
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SqlPool } from "./sqlPool";
import { loadConfig, getConfig } from "./config";
import {
  pgGetServerVersion,
  pgListSchemas,
  pgListTableColumns,
  pgListTableForeignKeys,
  pgListTables,
  executeReadOnlyQuery,
} from "./db/helpers";
import type { PgTableDetails } from "./db/types";

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

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error(
    `POSTGRES_URL environment variable is not set: cwd=${cwd}, envFile=${envFile}, envFileExists=${envFileExists}`
  );
}
// Initialize connection pool using configured databases
const pool = new SqlPool();
const config = await loadConfig();
if (!config) throw new Error("Config file not found");
const dbNames = Object.keys(config.databases);
if (dbNames.length === 0) throw new Error("No databases configured");
// Default to the first configured database
const defaultDbName = dbNames[0]!;
const singleDb = dbNames.length === 1;
// Test default connection if only one database configured
if (singleDb) {
  const { url } = config.databases[defaultDbName]!;
  const client = pool.get(url);
  await client`select 1`;
}

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
    // Determine database name
    const name = database ?? (singleDb ? defaultDbName : undefined);
    if (!name)
      throw new Error(
        `Multiple databases are configured: ${dbNames.join(
          ", "
        )}. Please specify the database using the ` +
          "`database`" +
          ` parameter.`
      );
    const { url } = await getConfig(name);
    const client = pool.get(url);
    return textResult(pgGetServerVersion(client));
  }
);

server.tool("get_url", "Retrieves PostgreSQL connection URL", {}, async () => {
  return textResult(postgresUrl);
});

server.tool(
  "pg_list_schemas",
  "List PostgreSQL schemas",
  { database: z.string().optional() },
  async ({ database }) => {
    const name = database ?? (singleDb ? defaultDbName : undefined);
    if (!name)
      throw new Error(
        `Multiple databases are configured: ${dbNames.join(
          ", "
        )}. Please specify the database using the ` +
          "`database`" +
          ` parameter.`
      );
    const { url } = await getConfig(name);
    const client = pool.get(url);
    return textResult(pgListSchemas(client));
  }
);

const pgTablesArgsSchema = {
  schema: z.string(),
  database: z.string().optional(),
};
server.tool(
  "pg_list_tables",
  "List PostgreSQL tables",
  pgTablesArgsSchema,
  async ({ schema, database }) => {
    if (!schema) throw new Error("Schema is required");
    const name = database ?? (singleDb ? defaultDbName : undefined);
    if (!name)
      throw new Error(
        `Multiple databases are configured: ${dbNames.join(
          ", "
        )}. Please specify the database using the ` +
          "`database`" +
          ` parameter.`
      );
    const { url } = await getConfig(name);
    const client = pool.get(url);
    return textResult(pgListTables(client, schema));
  }
);

server.tool(
  "pg_describe_table",
  "Get PostgreSQL table details",
  { schema: z.string(), table: z.string(), database: z.string().optional() },
  async ({ schema, table, database }) => {
    if (!schema || !table) throw new Error("Schema and table are required");
    const name = database ?? (singleDb ? defaultDbName : undefined);
    if (!name)
      throw new Error(
        `Multiple databases are configured: ${dbNames.join(
          ", "
        )}. Please specify the database using the ` +
          "`database`" +
          ` parameter.`
      );
    const { url } = await getConfig(name);
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
  }
);

server.tool(
  "pg_execute_query",
  "Execute a read-only SQL query",
  { query: z.string(), database: z.string().optional() },
  async ({ query, database }) => {
    if (!query) throw new Error("Query is required");
    const name = database ?? (singleDb ? defaultDbName : undefined);
    if (!name)
      throw new Error(
        `Multiple databases are configured: ${dbNames.join(
          ", "
        )}. Please specify the database using the ` +
          "`database`" +
          ` parameter.`
      );
    const { url } = await getConfig(name);
    const client = pool.get(url);
    const result = await executeReadOnlyQuery(client, query);
    return textResult(result);
  }
);

server.prompt(
  "gen_types",
  "Generate TypeScript types for the comma separated tables",
  {
    schema: z.string().optional(),
    tables: z.string().optional(),
  },
  async (args) => {
    const { schema, tables } = args;
    if (!schema || !tables) {
      throw new Error("Schema and tables are required for type generation");
    }
    const tableList = tables.split(",").map((table) => table.trim());
    return {
      description: `Generate TypeScript types for tables: ${tableList.join(
        ", "
      )}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use pg_describe_table tool to generate TypeScript types for the following tables in schema "${schema}": ${tableList.join(
              ", "
            )}. Include all columns and their types.`,
          },
        },
      ],
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
