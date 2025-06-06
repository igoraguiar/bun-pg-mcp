import type { SQL } from "bun";
import type {
  PgSchemaItem,
  PgColumnItem,
  PgTableItem,
  PgForeignKeyItem,
} from "./types";

export async function pgListSchemas(pg: SQL): Promise<Array<PgSchemaItem>> {
  const result: Array<PgSchemaItem> = await pg`
        select schema_name
        from information_schema.schemata
        where schema_name not in ('information_schema', 'pg_catalog')
        order by schema_name;
    `;
  return result;
}

export async function pgListTables(
  pg: SQL,
  schemaName: string = "public"
): Promise<Array<PgTableItem>> {
  const result: Array<PgTableItem> = await pg`
        select table_name, table_schema as schema_name
        from information_schema.tables
        where table_schema = ${schemaName}
        and table_type = 'BASE TABLE'
        order by table_name;
    `;
  return result;
}

export async function pgListTableColumns(
  pg: SQL,
  tableName: string,
  schemaName: string = "public"
): Promise<Array<PgColumnItem>> {
  const result: Array<PgColumnItem> = await pg`
        select
        column_name,
        data_type,
        is_nullable,
        column_default
        from information_schema.columns
        where table_name = ${tableName}
        and table_schema = ${schemaName}
        order by ordinal_position;
    `;
  return result;
}

export async function pgListTableForeignKeys(
  pg: SQL,
  tableName: string,
  schemaName: string = "public"
): Promise<Array<PgForeignKeyItem>> {
  const result: Array<PgForeignKeyItem> = await pg`
        select
        tc.constraint_name,
        kcu.table_schema as referenced_table_schema,
        kcu.table_name as referenced_table_name,
        kcu.column_name as referenced_column_name,
        kcu2.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        join information_schema.key_column_usage kcu2
          on tc.constraint_name = kcu2.constraint_name
          and tc.table_schema = kcu2.table_schema
          and kcu.ordinal_position = kcu2.ordinal_position
        where tc.constraint_type = 'FOREIGN KEY'
        and kcu.table_name = ${tableName}
        and kcu.table_schema = ${schemaName};
    `;
  return result;
}

export async function pgGetServerVersion(pg: SQL): Promise<string> {
  const result: Array<{ version: string }> = await pg`
        select version() as version;
    `;
  const version = result[0]?.version;
  if (!version) {
    throw new Error("Failed to retrieve PostgreSQL server version");
  }
  return version;
}

export async function executeReadOnlyQuery(pg: SQL, sql: string) {
  return pg.begin("READ ONLY", (tx) => {
    return tx.unsafe(sql);
  });
}
