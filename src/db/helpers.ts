import type { SQL } from "bun";
import type {
  PgSchemaItem,
  PgColumnItem,
  PgTableItem,
  PgForeignKeyItem,
  PgReferencedByItem,
  PgForeignKeyItemEnhanced,
  PgTriggerItem,
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
        kcu.column_name,
        kcu2.table_schema as referenced_table_schema,
        kcu2.table_name as referenced_table_name,
        kcu2.column_name as referenced_column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        join information_schema.referential_constraints rc
          on tc.constraint_name = rc.constraint_name
          and tc.table_schema = rc.constraint_schema
        join information_schema.key_column_usage kcu2
          on rc.unique_constraint_name = kcu2.constraint_name
          and rc.unique_constraint_schema = kcu2.table_schema
          and kcu.ordinal_position = kcu2.ordinal_position
        where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_name = ${tableName}
        and tc.table_schema = ${schemaName}
        order by kcu.ordinal_position;
    `;
  return result;
}

export async function pgListTableReferencedBy(
  pg: SQL,
  tableName: string,
  schemaName: string = "public"
): Promise<Array<PgReferencedByItem>> {
  const result: Array<PgReferencedByItem> = await pg`
        select
        tc.constraint_name,
        tc.table_schema as referencing_table_schema,
        tc.table_name as referencing_table_name,
        kcu.column_name as referencing_column_name,
        kcu2.column_name as referenced_column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        join information_schema.referential_constraints rc
          on tc.constraint_name = rc.constraint_name
          and tc.table_schema = rc.constraint_schema
        join information_schema.key_column_usage kcu2
          on rc.unique_constraint_name = kcu2.constraint_name
          and rc.unique_constraint_schema = kcu2.table_schema
          and kcu.ordinal_position = kcu2.ordinal_position
        where tc.constraint_type = 'FOREIGN KEY'
        and kcu2.table_name = ${tableName}
        and kcu2.table_schema = ${schemaName}
        order by tc.table_name, kcu.ordinal_position;
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

export async function pgGetTableOwner(pg: SQL, tableName: string, schemaName: string = "public"): Promise<string> {
  const result: Array<{ owner: string }> = await pg`
    SELECT pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ${tableName} AND n.nspname = ${schemaName}
  `;
  return result[0]?.owner ?? "";
}

export async function pgGetTableConstraints(pg: SQL, tableName: string, schemaName: string = "public", constraintType: string): Promise<Array<{ constraint_name: string; column_name: string; ordinal_position: number }>> {
  const result = await pg`
    SELECT tc.constraint_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = ${constraintType}
      AND tc.table_name = ${tableName}
      AND tc.table_schema = ${schemaName}
    ORDER BY kcu.ordinal_position
  `;
  return result;
}

export async function pgGetPrimaryKey(pg: SQL, tableName: string, schemaName: string = "public"): Promise<{ constraint_name: string; columns: string[] } | null> {
  const rows = await pgGetTableConstraints(pg, tableName, schemaName, 'PRIMARY KEY');
  if (rows.length === 0) return null;
  const constraint_name = rows[0]!.constraint_name;
  const columns = rows.map(r => r.column_name);
  return { constraint_name, columns };
}

export async function pgGetUniqueConstraints(pg: SQL, tableName: string, schemaName: string = "public"): Promise<Array<{ constraint_name: string; columns: string[] }>> {
  const rows = await pgGetTableConstraints(pg, tableName, schemaName, 'UNIQUE');
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!map.has(r.constraint_name)) map.set(r.constraint_name, []);
    map.get(r.constraint_name)!.push(r.column_name);
  }
  return Array.from(map.entries()).map(([constraint_name, columns]) => ({ constraint_name, columns }));
}

export async function pgGetCheckConstraints(pg: SQL, tableName: string, schemaName: string = "public"): Promise<Array<{ constraint_name: string; check_clause: string }>> {
  const result: Array<{ constraint_name: string; check_clause: string }> = await pg`
    SELECT conname AS constraint_name, pg_get_constraintdef(pg_constraint.oid) AS check_clause
    FROM pg_constraint
    JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_constraint.contype = 'c'
      AND pg_class.relname = ${tableName}
      AND pg_namespace.nspname = ${schemaName}
  `;
  return result;
}

export async function pgGetExcludeConstraints(pg: SQL, tableName: string, schemaName: string = "public"): Promise<Array<{ constraint_name: string; definition: string }>> {
  const result: Array<{ constraint_name: string; definition: string }> = await pg`
    SELECT conname AS constraint_name, pg_get_constraintdef(pg_constraint.oid) AS definition
    FROM pg_constraint
    JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_constraint.contype = 'x'
      AND pg_class.relname = ${tableName}
      AND pg_namespace.nspname = ${schemaName}
  `;
  return result;
}

export async function pgGetTriggers(pg: SQL, tableName: string, schemaName: string = "public"): Promise<Array<PgTriggerItem>> {
  const result: Array<PgTriggerItem> = await pg`
    SELECT trigger_name, action_timing, event_manipulation, action_statement, action_orientation
    FROM information_schema.triggers
    WHERE trigger_schema = ${schemaName} AND event_object_table = ${tableName}
    ORDER BY trigger_name
  `;
  return result;
}

export async function pgListTableForeignKeysEnhanced(pg: SQL, tableName: string, schemaName: string = "public"): Promise<Array<PgForeignKeyItemEnhanced>> {
  const result: Array<PgForeignKeyItemEnhanced> = await pg`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      kcu2.table_schema AS referenced_table_schema,
      kcu2.table_name AS referenced_table_name,
      kcu2.column_name AS referenced_column_name,
      rc.match_option,
      rc.update_rule,
      rc.delete_rule,
      tc.is_deferrable
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage kcu2
      ON rc.unique_constraint_name = kcu2.constraint_name
      AND rc.unique_constraint_schema = kcu2.table_schema
      AND kcu.ordinal_position = kcu2.ordinal_position
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = ${tableName}
      AND tc.table_schema = ${schemaName}
    ORDER BY kcu.ordinal_position
  `;
  return result;
}
