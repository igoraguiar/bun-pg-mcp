# 01 — Extract pure handlers and handler registry

**What to build:** Move tool logic out of `createMcpServer` into reusable pure handlers. Create a handler registry that maps tool names to handler functions and their Zod schemas. The MCP server continues to work by delegating to the registry, so behavior is unchanged.

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] Handlers for all existing tools are pure functions accepting ConfigManager, SqlPool and args, returning result data
- [ ] Registry exposes tool name, description and Zod schema for each tool
- [ ] `createMcpServer` delegates to registry without duplicating logic
- [ ] Existing tests for config, db-helpers and sql-pool still pass
