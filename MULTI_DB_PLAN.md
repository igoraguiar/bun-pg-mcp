## Multi‑Database Support Plan for pg-mcp

This document outlines how to add multi‑database support using a JSON config file, introduce management tools for that config, implement a lazy SQL client pool, and update existing MCP tools to select a target database.

### Requirements checklist

- Config source moves from a single env var POSTGRES_URL to a config file path env var with default to `$HOME/.config/pg-mcp/config.json`. [Planned]
- Config JSON structure as specified, including `databases.{name}.uri`, `databases.{name}.ttl`, and `autoReload`. [Planned]
- New MCP tools: `pg_db_add`, `pg_db_remove`, `pg_db_list`, `pg_db_update`. [Planned]
- Add `pg_db_reload` tool to reload config and reconcile pool. [Planned]
- Implement a lazy pool of Bun SQL clients keyed by database name, reading config on demand and caching clients; evict/end on remove/update. [Planned]
- Update all existing tools to accept `database` and retrieve a client via the pool. [Planned]
- If `autoReload` is true, automatically reload on file modifications. [Planned]
- Backward-compat/migration: optionally bootstrap config from POSTGRES_URL if present and no config file exists. [Planned]

---

## Design overview

### 1) Configuration

- Env var name: `PG_MCP_CONFIG_PATH` (string). If unset, default to `$HOME/.config/pg-mcp/config.json`.
- JSON schema:
  ```json
  {
    "databases": {
      "database_name": {
        "uri": "postgresql://user:password@host:port/database",
        "ttl": 600
      }
    },
    "autoReload": true
  }
  ```
- Validation: use `zod` to validate structure on load and before save.
- File management:
  - Ensure directory exists (`$HOME/.config/pg-mcp/`).
  - If file missing and legacy `POSTGRES_URL` exists, create a config with a single `default` entry and `autoReload: true` (migration), then warn via logs.
  - If file missing and no `POSTGRES_URL`, create a minimal default config with empty `databases` and `autoReload: true`.
  - Support read/write with atomic writes (write to temp then rename) to avoid partial writes.

### 2) ConfigManager

- Purpose: centralize config loading, validation, saving, change detection, and optional file watching.
- API (TypeScript):
  - `load(): Promise<Config>` — read, validate, and return current config from disk; cache in memory.
  - `get(): Config` — return in-memory config.
  - `save(updater: (prev: Config) => Config | void | Promise<...>): Promise<Config>` — transactional update with validation and atomic write.
  - `list(): Record<string, DbEntry>` — convenience accessor for `databases`.
  - `add(name: string, entry: DbEntry): Promise<void>` — add, error if exists.
  - `update(name: string, partial: Partial<DbEntry>): Promise<void>` — merge update, error if missing.
  - `remove(name: string): Promise<void>` — delete, no-op if missing or error if you prefer strict.
  - `watch(onChange: (oldCfg: Config, newCfg: Config) => void): () => void` — start FS watch if `autoReload` is true; returns unwatch function; debounce events.
- Types:
  - `type DbEntry = { uri: string; ttl: number }`
  - `type Config = { databases: Record<string, DbEntry>; autoReload: boolean }`

### 3) Lazy SQL Pool

- Purpose: manage `bun.SQL` clients per database name, created on demand and cached with simple TTL semantics.
- Internals:
  - `Map<string, ClientRecord>` where `ClientRecord = { sql: SQL; lastUsed: number; ttl: number }`.
  - `get(name: string): Promise<SQL>` — looks up config; if not cached, create `new SQL(uri, {})`, prime with a ping (e.g., `select 1`) to fail fast, cache with `lastUsed=Date.now()` and `ttl` from config; return client.
  - `touch(name)` — update `lastUsed` when used.
  - `evict(name: string)` — call `end()`/`close()` on client and delete from map. Note: verify the exact close method on `bun.SQL` (expected: `sql.end()`); if API differs, adapt accordingly.
  - `reconcile(config: Config)` — compare previous and new sets of database entries:
    - Removed names: `evict(name)`.
    - Updated (URI/TTL changed): `evict(name)` so next `get` recreates with new config.
    - Added names: no action; created on demand.
  - Idle reaper: setInterval every `X` seconds (e.g., 30) to evict clients where `Date.now() - lastUsed > ttl*1000`.
  - `closeAll()` — evict all clients (for shutdown).
- Errors: if requested `name` is not in config, throw a user-facing error indicating known databases.

### 4) MCP tools

- New tools for config management (all return JSON via existing `textResult`):
  - `pg_db_list` — args: none; returns `{ databases: Record<string, DbEntry> }` (names and URIs/TTLs). Consider redacting passwords if you prefer; initial version returns URIs as-is.
  - `pg_db_add` — args: `{ name: string; uri: string; ttl?: number }`; default ttl if missing (e.g., 600). On success, if `autoReload` is true, call `pg_db_reload` internally or directly reconcile pool for just-added name (no-op needed per spec, but reloading keeps memory config in sync).
  - `pg_db_update` — args: `{ name: string; uri?: string; ttl?: number }`; after save, evict the client for `name` to ensure next use re-creates; then optionally reconcile.
  - `pg_db_remove` — args: `{ name: string }`; after save, evict client for `name`.
  - `pg_db_reload` — args: none; reload config from disk and call `pool.reconcile(newConfig)`.
- Update existing tools to accept `database: string` and obtain a client via `await pool.get(database)`.
  - Provide a compatibility path: if `database` is omitted and config has exactly one database, use it; otherwise error with guidance. (Optional but recommended.)

### 5) Auto‑reload behavior

- If `autoReload` is true, ConfigManager watches the config file. On change:
  - It reloads and validates the file.
  - Notifies the pool to `reconcile(newConfig)`.
  - Debounce rapid successive events to avoid thrashing.

### 6) Migration and defaults

- Startup behavior:
  1. Determine config path: `process.env.PG_MCP_CONFIG_PATH || "$HOME/.config/pg-mcp/config.json"` (resolve `$HOME` from `os.homedir()`).
  2. If config file is missing:
     - If `POSTGRES_URL` exists, create the config with `{ databases: { default: { uri: POSTGRES_URL, ttl: 600 } }, autoReload: true }` and log a deprecation note.
     - Else create an empty config with `autoReload: true`.
  3. Load config into memory; start watching if `autoReload`.

---

## Code changes by file

### New files

1. `src/config.ts`
   - `zod` schemas for `DbEntry` and `Config`.
   - `ConfigManager` implementation (load, save, add, update, remove, list, watch).
2. `src/sqlPool.ts`
   - `SqlPool` class implementing lazy client creation, `get`, `evict`, `reconcile`, `closeAll`, and idle reaper.

### Updated files

1. `src/index.ts`
   - Replace direct `POSTGRES_URL` usage with `ConfigManager` and `SqlPool` initialization.
   - Register new tools: `pg_db_add`, `pg_db_remove`, `pg_db_list`, `pg_db_update`, `pg_db_reload`.
   - Update existing tools to accept `database` and use `await sqlPool.get(database)`.
   - Optional: backward compatibility if exactly one DB exists and `database` is omitted.
2. `src/db/helpers.ts`
   - No changes needed; functions already accept `SQL`.
3. `README.md`
   - Document new env var `PG_MCP_CONFIG_PATH`, default path, JSON schema, and new tools.

---

## Detailed implementation steps

1. Add config types and manager

- Create `src/config.ts`:
  - Define `DbEntrySchema = z.object({ uri: z.string().url(), ttl: z.number().int().positive().default(600) })`.
  - Define `ConfigSchema = z.object({ databases: z.record(DbEntrySchema).default({}), autoReload: z.boolean().default(true) })`.
  - Implement filesystem helpers using `fs/promises` and `path`:
    - `ensureDir(path)`.
    - `atomicWrite(file, content)` writing to `file + ".tmp"` then `rename`.
  - Implement `ConfigManager` as described above.

2. Add lazy SQL pool

- Create `src/sqlPool.ts`:
  - Import `{ SQL }` from `bun`.
  - `class SqlPool` takes a `ConfigManager` in constructor; stores `currentConfig`.
  - `get(name)`:
    - Read from `currentConfig.databases[name]`; if missing, throw.
    - If cached, return; else create `new SQL(uri, {})`, await a sanity query `await client`select 1``or`await client`...); cache and return.
    - Update `lastUsed` on every access.
  - `evict(name)` closes and deletes record (verify `sql.end()` vs `sql.close()` in Bun SQL; adjust accordingly during implementation).
  - `reconcile(newConfig)` computes diff with previous config to evict removed/updated entries; then replace `currentConfig`.
  - Start a periodic idle reaper (`setInterval`) that evicts stale clients by TTL.

3. Wire up in `src/index.ts`

- Initialize `ConfigManager` with resolved config path (from `process.env.PG_MCP_CONFIG_PATH` or default). Load config, possibly creating and saving defaults.
- Initialize `SqlPool` with the loaded config.
- If `autoReload`, call `config.watch((old, next) => sqlPool.reconcile(next))` with a debounce.
- Register MCP tools:
  - `pg_db_list`: returns names and their configs.
  - `pg_db_add`: validates name not present, adds `{ uri, ttl: ttl ?? 600 }`, saves; then either call `pg_db_reload` or directly reconcile via `sqlPool.reconcile(configManager.get())` (no evict needed for additions).
  - `pg_db_update`: applies partial update; after save, `sqlPool.evict(name)`.
  - `pg_db_remove`: removes from config; after save, `sqlPool.evict(name)`.
  - `pg_db_reload`: calls `config.load()` and `sqlPool.reconcile(config)`.
- Update existing tools (`pg_get_server_version`, `pg_list_schemas`, `pg_list_tables`, `pg_describe_table`, `pg_execute_query`) to accept `database`:
  - Example:
    ```ts
    const schemaWithDb = { database: z.string(), schema: z.string() };
    server.tool(
      "pg_list_tables",
      "List PostgreSQL tables",
      schemaWithDb,
      async ({ database, schema }) => {
        if (!schema) throw new Error("Schema is required");
        const client = await sqlPool.get(database);
        return textResult(pgListTables(client, schema));
      }
    );
    ```
  - For tools with no schema/table args (e.g., `pg_list_schemas`), just require `{ database: z.string() }`.
- Optional compatibility: if `database` is missing and there's exactly one configured DB, use that; otherwise error.

4. Logging and errors

- Provide clear error messages when:
  - Config path is invalid or file cannot be parsed.
  - Requested database name is not found.
  - URI is invalid or TTL is non‑positive.
- Log when clients are created, evicted, or reaped (at debug level).

5. Security considerations

- URIs include credentials. For `pg_db_list`, consider an option to redact passwords in output. Initial version can return full URIs; add a follow‑up to support redaction.

6. Testing and quality gates

- Add minimal tests (if using Bun’s test runner) for:
  - ConfigManager load/save/add/update/remove and validation errors.
  - SqlPool get/evict/reconcile with mocked SQL (or a light integration test against a local PG URL if available).
- Manual smoke test:
  - Start server; `pg_db_add` a DB; call `pg_list_schemas` with that `database` name; update URI; ensure client is evicted and recreated; remove DB and ensure subsequent calls error.

7. Documentation

- Update `README.md`:
  - Describe `PG_MCP_CONFIG_PATH` and default path.
  - Provide sample config JSON.
  - Document new tools and updated tool signatures.
  - Note migration from `POSTGRES_URL`.

---

## Rollout plan

1. Implement `ConfigManager` and `SqlPool` with unit tests where feasible.
2. Migrate `src/index.ts` to use them; update tool schemas and behavior.
3. Add new tools for config management and reload.
4. Add optional auto‑reload using FS watch.
5. Update README and example usage.
6. Validate build and perform a local smoke test.

---

## Open questions / to verify during implementation

- Confirm the correct method to close a Bun `SQL` client (`end()` vs `close()`). Use whichever is provided by the `bun` SQL API; adjust `evict` and shutdown accordingly.
- Decide whether to redact credentials in `pg_db_list` output. If required, implement a redaction helper.
- Compatibility behavior when `database` is omitted: enforce requirement strictly or auto‑select if exactly one entry exists.
