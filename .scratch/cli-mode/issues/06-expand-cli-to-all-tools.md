# 06 — Expand CLI to remaining tools

**What to build:** Ensure all config management tools `pg_db_list/add/update/remove/reload` and query tools `pg_get_server_version/get_url/pg_list_schemas/pg_describe_table/pg_execute_query` work via CLI with the same JSON output contract, validation and database resolution.

**Blocked by:** 05 — Global --database flag and smart coercion

**Status:** ready-for-agent

- [ ] All tools from the handler registry are invocable via CLI
- [ ] Config management tools correctly reconcile SqlPool after changes
- [ ] Query tools enforce read-only constraints and redact credentials
- [ ] Help output lists all tools with correct schemas
