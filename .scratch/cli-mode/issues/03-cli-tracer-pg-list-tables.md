# 03 — CLI tracer for pg_list_tables end-to-end

**What to build:** Make the CLI runnable end-to-end for `pg_list_tables`. Load `.env`, instantiate ConfigManager and a fresh SqlPool, resolve database name, validate args with Zod, run the pure handler, and print a JSON envelope with tool, durationMs, timestamp and result.

**Blocked by:** 01 — Extract pure handlers and handler registry, 02 — Scaffold CLI module with mode wiring and arg parsing

**Status:** resolved

- [ ] `bun run src/index.ts --mode cli --tool pg_list_tables --schema public` returns valid JSON with result
- [ ] Database resolution follows single-db vs multi-db rules
- [ ] Duration and timestamp are present in output
- [ ] Invalid args produce JSON error envelope
