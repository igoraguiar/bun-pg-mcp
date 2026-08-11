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

export type PgForeignKeyItemEnhanced = PgForeignKeyItem & {
  match_option: string | null;
  update_rule: string | null;
  delete_rule: string | null;
  deferrable: string | null;
};

export type PgReferencedByItem = {
  constraint_name: string;
  referencing_table_schema: string;
  referencing_table_name: string;
  referencing_column_name: string;
  referenced_column_name: string;
};

export type PgTableDetails = PgTableItem & {
  columns: PgColumnItem[];
  foreign_keys: PgForeignKeyItem[];
  referenced_by: PgReferencedByItem[];
};

export type PgTriggerItem = {
  trigger_name: string;
  action_timing: string;
  event_manipulation: string;
  action_statement: string;
  action_orientation: string | null;
};

export type PgConstraintColumns = {
  constraint_name: string;
  columns: string[];
};

export type PgCheckConstraint = {
  constraint_name: string;
  check_clause: string;
};

export type PgExcludeConstraint = {
  constraint_name: string;
  definition: string;
};

export type PgTableFullDetails = PgTableItem & {
  owner: string;
  columns: PgColumnItem[];
  primary_key: PgConstraintColumns | null;
  unique_constraints: PgConstraintColumns[];
  check_constraints: PgCheckConstraint[];
  exclude_constraints: PgExcludeConstraint[];
  foreign_keys: PgForeignKeyItemEnhanced[];
  referenced_by: PgReferencedByItem[];
  triggers: PgTriggerItem[];
};
