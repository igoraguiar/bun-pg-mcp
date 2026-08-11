# AGENTS.md

## Project Context

pg-mcp is a PostgreSQL Model Context Protocol server that enables AI coding assistants to query, inspect, and manage multiple PostgreSQL databases securely via stdio, HTTP, or CLI modes. It is built for developers using tools like Cursor and Claude who need programmatic database access with auto-reloading multi-database configuration.

## Tech Stack

- Runtime: Bun latest
- Language: TypeScript 5+ with strict mode (`tsconfig.json`)
- MCP SDK: `@modelcontextprotocol/sdk ^1.12.1`
- Web: Express ^5.1.0 for HTTP mode
- Validation: Zod ^3.25.76
- DB: Bun SQL client with connection pooling

## Directory Map

```
src/
  index.ts          # Entry point, mode routing stdio/http/cli
  server.ts         # MCP server factory, prompts & tools registration
  config.ts         # ConfigManager with auto-reload watcher
  sql-pool.ts       # Lazy connection pool with TTL reaper
  handlers.ts       # Tool handlers (pg_*, pg_db_*)
  cli.ts            # CLI argument parsing & execution
  db/
    types.ts        # PgTableDetails etc
    helpers.ts      # SQL helpers for schema/table introspection
tests/              # bun:test integration tests
docs/agents/        # Issue tracker, triage labels, domain docs
dist/ out/          # Build outputs
```

## Commands

```bash
bun install                 # Install dependencies
bun run src/index.ts        # Run dev server (stdio mode)
bun run build               # Build to dist/ with bun build
bun run compile             # Compile standalone binary to out/pg-mcp
bun test                    # Run tests (bun:test)
# Lint/Format: no formatter configured; rely on tsc strict checks
```

## Rules of Engagement

✅ Always:

- Use TypeScript strict mode, no `any` without justification
- Add JSDoc to exported functions/classes
- Validate all external input with Zod schemas
- Redact credentials in URLs before returning to clients
- Use async/await, never block the event loop
- Keep handlers pure; side effects via ConfigManager/SqlPool only

🚫 Never:

- Use `any` types or disable strict checks
- Commit `.env` files or log secrets
- Mutate config objects in place; load → modify → save
- Return raw SQL errors to clients; wrap with safe messages
- Add inline styles or UI code – this is a server only

## Code Style Reference

```ts
/**
 * List tables in a schema
 */
export async function pgListTables(client: SQL, schema: string) {
  const schemaSafe = schema.replace(/"/g, '""');
  const rows = await client.query<{table_name:string}>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
    [schemaSafe]
  );
  return rows.map(r => r.table_name);
}
```

## Agent Skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
