import { z, type ZodRawShape } from "zod";
import type { ConfigManager } from "./config";
import type { SqlPool } from "./sql-pool";
import {
  pgGetServerVersion,
  pgListSchemas,
  pgListTables,
  pgListTableColumns,
  pgListTableForeignKeys,
  pgListTableReferencedBy,
  executeReadOnlyQuery,
  pgGetTableOwner,
  pgGetPrimaryKey,
  pgGetUniqueConstraints,
  pgGetCheckConstraints,
  pgGetExcludeConstraints,
  pgGetTriggers,
  pgListTableForeignKeysEnhanced,
  pgListTriggerFunctions,
  pgDescribeTriggerFunction,
} from "./db/helpers";
import type { PgTableDetails, PgTableFullDetails } from "./db/types";

function redactCredentials(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.password) {
      urlObj.password = "***";
      return urlObj.toString();
    }
    return url;
  } catch {
    return url;
  }
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
  return { dbList, dbNames, defaultDbName, singleDb };
}

async function resolveDatabaseName(
  configManager: ConfigManager,
  database: string | undefined
) {
  const { dbNames, defaultDbName, singleDb } = await getDatabasesInfo(configManager);
  const name = database?.trim() || defaultDbName?.trim() || (singleDb ? dbNames[0] : undefined);
  if (!name) {
    if (dbNames.length === 0) {
      throw new Error("No databases are configured. Please add a database configuration first.");
    } else {
      throw new Error(
        `Multiple databases are configured (${dbNames.length}): ${dbNames.join(", ")}. Please specify the database using the \`database\` parameter.`
      );
    }
  }
  return name;
}

type HandlerFn = (configManager: ConfigManager, pool: SqlPool, args: any) => Promise<any>;

export type ToolHandler = {
  name: string;
  description: string;
  schema: ZodRawShape;
  handler: HandlerFn;
};

export const handlers: ToolHandler[] = [];

handlers.push({
  name: "pg_get_server_version",
  description: "Retrieves PostgreSQL version",
  schema: { database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    return pgGetServerVersion(client);
  },
});

handlers.push({
  name: "get_url",
  description: "Retrieves PostgreSQL connection URL",
  schema: { database: z.string().optional() },
  handler: async (configManager, _pool, args) => {
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    return redactCredentials(url);
  },
});

handlers.push({
  name: "pg_list_schemas",
  description: "List PostgreSQL schemas",
  schema: { database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    return pgListSchemas(client);
  },
});

handlers.push({
  name: "pg_list_tables",
  description: "List PostgreSQL tables",
  schema: { schema: z.string().default("public"), database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const schema = args.schema ?? "public";
    if (!schema) throw new Error("Schema is required");
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    return pgListTables(client, schema);
  },
});

handlers.push({
  name: "pg_describe_table",
  description: "Get PostgreSQL table details",
  schema: { schema: z.string().default("public"), table: z.string(), database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const schema = args.schema ?? "public";
    const table = args.table;
    if (!schema || !table) throw new Error("Schema and table are required");
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    const columns = await pgListTableColumns(client, table, schema);
    const foreignKeys = await pgListTableForeignKeys(client, table, schema);
    const referencedBy = await pgListTableReferencedBy(client, table, schema);
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
    return result;
  },
});

handlers.push({
  name: "pg_describe_table_full",
  description: "Get comprehensive PostgreSQL table details including constraints, owner, triggers and enhanced FK attributes",
  schema: { schema: z.string().default("public"), table: z.string(), database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const schema = args.schema ?? "public";
    const table = args.table;
    if (!schema || !table) throw new Error("Schema and table are required");
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);

    const [columns, foreignKeysEnhanced, referencedBy, owner, primaryKey, uniqueConstraints, checkConstraints, excludeConstraints, triggers] = await Promise.all([
      pgListTableColumns(client, table, schema),
      pgListTableForeignKeysEnhanced(client, table, schema),
      pgListTableReferencedBy(client, table, schema),
      pgGetTableOwner(client, table, schema),
      pgGetPrimaryKey(client, table, schema),
      pgGetUniqueConstraints(client, table, schema),
      pgGetCheckConstraints(client, table, schema),
      pgGetExcludeConstraints(client, table, schema),
      pgGetTriggers(client, table, schema),
    ]);

    const result: PgTableFullDetails = {
      schema_name: schema,
      table_name: table,
      owner,
      columns: columns.map(col => ({
        column_name: col.column_name,
        data_type: col.data_type,
        is_nullable: col.is_nullable,
        column_default: col.column_default,
      })),
      primary_key: primaryKey,
      unique_constraints: uniqueConstraints,
      check_constraints: checkConstraints,
      exclude_constraints: excludeConstraints,
      foreign_keys: foreignKeysEnhanced.map(fk => ({
        constraint_name: fk.constraint_name,
        column_name: fk.column_name,
        referenced_table_schema: fk.referenced_table_schema,
        referenced_table_name: fk.referenced_table_name,
        referenced_column_name: fk.referenced_column_name,
        match_option: fk.match_option,
        update_rule: fk.update_rule,
        delete_rule: fk.delete_rule,
        deferrable: fk.deferrable,
      })),
      referenced_by: referencedBy.map(rb => ({
        constraint_name: rb.constraint_name,
        referencing_table_schema: rb.referencing_table_schema,
        referencing_table_name: rb.referencing_table_name,
        referencing_column_name: rb.referencing_column_name,
        referenced_column_name: rb.referenced_column_name,
      })),
      triggers: triggers.map(t => ({
        trigger_name: t.trigger_name,
        action_timing: t.action_timing,
        event_manipulation: t.event_manipulation,
        action_statement: t.action_statement,
        action_orientation: t.action_orientation,
      })),
    };
    return result;
  },
});

handlers.push({
  name: "pg_list_trigger_functions",
  description: "List trigger functions in a schema",
  schema: { schema: z.string().optional(), database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const schema = args.schema ?? undefined;
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    return pgListTriggerFunctions(client, schema);
  },
});

handlers.push({
  name: "pg_describe_trigger_function",
  description: "Get details and definition of a trigger function",
  schema: { schema: z.string().default("public"), function: z.string(), database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    const schema = args.schema ?? "public";
    const func = args.function;
    if (!func) throw new Error("Function name is required");
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    return pgDescribeTriggerFunction(client, func, schema);
  },
});

handlers.push({
  name: "pg_execute_query",
  description: "Execute a read-only SQL query",
  schema: { query: z.string(), database: z.string().optional() },
  handler: async (configManager, pool, args) => {
    if (!args.query) throw new Error("Query is required");
    const name = await resolveDatabaseName(configManager, args.database);
    const { url } = await configManager.getConfig(name);
    const client = pool.get(url);
    return executeReadOnlyQuery(client, args.query);
  },
});

handlers.push({
  name: "pg_db_list",
  description: "List configured databases",
  schema: {},
  handler: async (configManager) => {
    const config = await configManager.loadConfig();
    if (!config) throw new Error("Config file not found");
    return Object.entries(config.databases).map(([name, db]) => ({
      name,
      url: redactCredentials(db.url),
      ttl: db.ttl,
    }));
  },
});

handlers.push({
  name: "pg_db_add",
  description: "Add a new database configuration",
  schema: { name: z.string(), url: z.string().url(), ttl: z.number({ coerce: true }).optional() },
  handler: async (configManager, pool, args) => {
    const ttl = args.ttl ?? 60000;
    await configManager.addDatabase(args.name, { url: args.url, ttl });
    const newConfig = await configManager.loadConfig();
    if (!newConfig) throw new Error("Config file not found");
    pool.reconcile(newConfig);
    return { name: args.name, url: redactCredentials(args.url), ttl };
  },
});

handlers.push({
  name: "pg_db_update",
  description: "Update an existing database configuration",
  schema: { name: z.string(), url: z.string().url().optional(), ttl: z.number().optional() },
  handler: async (configManager, pool, args) => {
    const update: Partial<{ url: string; ttl: number }> = {};
    if (args.url !== undefined) update.url = args.url;
    if (args.ttl !== undefined) update.ttl = args.ttl;
    await configManager.updateDatabase(args.name, update);
    pool.evict(args.name);
    const updatedConfig = await configManager.loadConfig();
    if (!updatedConfig) throw new Error("Config file not found");
    pool.reconcile(updatedConfig);
    return {
      name: args.name,
      ...(args.url && { url: redactCredentials(args.url) }),
      ...(args.ttl !== undefined && { ttl: args.ttl }),
    };
  },
});

handlers.push({
  name: "pg_db_remove",
  description: "Remove a database configuration",
  schema: { name: z.string() },
  handler: async (configManager, pool, args) => {
    await configManager.removeDatabase(args.name);
    pool.evict(args.name);
    const remConfig = await configManager.loadConfig();
    if (!remConfig) throw new Error("Config file not found");
    pool.reconcile(remConfig);
    return { name: args.name };
  },
});

handlers.push({
  name: "pg_db_reload",
  description: "Reload database configuration and reconcile SqlPool",
  schema: {},
  handler: async (configManager, pool) => {
    const config = await configManager.loadConfig();
    if (!config) throw new Error("Config file not found");
    pool.reconcile(config);
    return Object.keys(config.databases);
  },
});

export function getHandler(name: string): ToolHandler | undefined {
  return handlers.find((h) => h.name === name);
}
