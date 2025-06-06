export type PgSchemaItem = {
  schema_name: string;
};

export type PgTableItem = {
  schema_name: string;
  table_name: string;
};

export type GetServerVersionResult = {
  version: string;
};

export type PgColumnItem = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

export type PgForeignKeyItem = {
  constraint_name: string;
  referenced_table_schema: string;
  referenced_table_name: string;
  referenced_column_name: string;
  column_name: string;
};

export type PgTableDetails = PgTableItem & {
  columns: PgColumnItem[];
  foreign_keys: PgForeignKeyItem[];
};
