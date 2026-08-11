# 02 — Scaffold CLI module with mode wiring and arg parsing

**What to build:** Add `--mode cli` handling in `src/index.ts` and create `src/cli.ts`. The CLI parses `--tool <name>` and dynamic `--key value` flags into an args object with smart coercion. `--help` lists available tools and `--help <tool>` shows schema. No execution yet.

**Blocked by:** 01 — Extract pure handlers and handler registry

**Status:** ready-for-agent

- [ ] `--mode cli` is recognized and routes to CLI module
- [ ] Arg parser builds args object from dynamic flags with smart coercion for numbers, booleans and repeated flags
- [ ] `--help` prints tool list from registry
- [ ] `--help <tool>` prints argument schema for that tool
