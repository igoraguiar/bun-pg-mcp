import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { argv } from "bun";
import { z } from "zod";
import { resolve } from "path";
import { SQL } from "bun";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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
const pg = new SQL(postgresUrl, {});

await pg`select 1`;

// Create an MCP server
const server = new McpServer({
  name: "PG MCP Server",
  version: "1.0.0",
});

// Add an addition tool
server.tool(
  "pg_get_server_version",
  "Retrieves PostgreSQL version",
  {},
  async () => {
    return textResult(pgGetServerVersion(pg));
  }
);

server.tool("get_url", "Retrieves PostgreSQL connection URL", {}, async () => {
  return textResult(postgresUrl);
});

server.tool("pg_list_schemas", "List PostgreSQL schemas", {}, async () => {
  return textResult(pgListSchemas(pg));
});

const pgTablesArgsSchema = {
  schema: z.string(),
};
server.tool(
  "pg_list_tables",
  "List PostgreSQL tables",
  pgTablesArgsSchema,
  async ({ schema }) => {
    if (!schema) {
      throw new Error("Schema is required");
    }
    return textResult(pgListTables(pg, schema));
  }
);

server.tool(
  "pg_describe_table",
  "Get PostgreSQL table details",
  {
    schema: z.string(),
    table: z.string(),
  },
  async ({ schema, table }) => {
    if (!schema || !table) {
      throw new Error("Schema and table are required");
    }
    const columns = await pgListTableColumns(pg, table, schema);
    const foreignKeys = await pgListTableForeignKeys(pg, table, schema);
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
  {
    query: z.string(),
  },
  async ({ query }) => {
    if (!query) {
      throw new Error("Query is required");
    }
    const result = await executeReadOnlyQuery(pg, query);
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
  async (args, extra) => {
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
