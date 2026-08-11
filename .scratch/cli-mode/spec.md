## Problem Statement

Status: ready-for-agent

The user wants to invoke pg-mcp tools from a command line without starting an MCP server. Current modes are `stdio` and `http` only, which require an MCP client. The user needs a one-shot CLI that accepts process arguments, selects a tool, passes arguments, and prints a JSON response for scripting and automation.

## Solution

Add a new `--mode cli` execution path. The CLI parses process arguments, loads configuration via ConfigManager, creates a fresh SqlPool, resolves the target database, validates arguments against the existing Zod schemas, executes the pure tool handler, and prints a pretty JSON envelope with tool name, duration, timestamp, and result or error. The implementation reuses existing ConfigManager, SqlPool, and db helpers, and extracts tool logic into pure handlers shared with the MCP server.

## User Stories

1. As a developer, I want to run `pg_list_tables` from the shell, so that I can script database introspection without an MCP client.
2. As a developer, I want to pass tool arguments as `--key value` flags, so that I can invoke tools without crafting JSON manually.
3. As a developer, I want the CLI to accept a global `--database` flag, so that I can default the database for a command.
4. As a developer, I want the CLI to validate arguments against Zod schemas before execution, so that I get clear errors early.
5. As a developer, I want the CLI to output JSON to stdout, so that I can pipe results to jq or other tools.
6. As a developer, I want the output to include tool name, durationMs and timestamp, so that I can audit runs.
7. As a developer, I want errors to be returned as JSON with a consistent shape, so that scripts can handle failures uniformly.
8. As a developer, I want `--format json` to be reserved for future formats, so that the CLI can be extended later.
9. As a developer, I want `--help` to list available tools, so that I can discover the CLI surface.
10. As a developer, I want `--help <tool>` to show the argument schema for a tool, so that I know how to call it.
11. As a developer, I want the CLI to load `.env` from cwd like the server does, so that configuration is consistent.
12. As a developer, I want the CLI to respect `PG_MCP_CONFIG_PATH`, so that I can use the same config as the server.
13. As a developer, I want the CLI to use smart coercion for numbers, booleans and repeated flags for arrays, so that CLI flags map to Zod types.
14. As a developer, I want the CLI to redact credentials in `get_url` output, so that secrets are not leaked in logs.
15. As a developer, I want the CLI to create a fresh SqlPool per invocation, so that resources are cleaned up after run.
16. As a developer, I want the CLI to skip ConfigManager file watching, so that one-shot execution stays fast.
17. As a developer, I want `--verbose` to emit debug logs to stderr, so that I can troubleshoot without polluting JSON output.
18. As a developer, I want early validation of tool name, so that unknown tools fail fast with a helpful message.
19. As a developer, I want the CLI to support all config management tools, so that I can add/remove/reload databases from shell.
20. As a developer, I want the CLI to support query tools with read-only enforcement, so that accidental writes are prevented.
21. As a developer, I want the CLI to resolve database name using the same single-db vs multi-db rules as the server, so that behaviour is consistent.
22. As a developer, I want the CLI to be testable via unit tests for parser and handlers, so that changes are safe.
23. As a developer, I want the CLI to be documented alongside existing modes, so that onboarding is straightforward.

## Implementation Decisions

- Add `--mode cli` handling in `src/index.ts` alongside `stdio` and `http`. The CLI entry point lives in a new `src/cli.ts` module to keep separation of concerns.
- Extract pure tool handlers into a shared module `src/handlers.ts`. Handlers accept `ConfigManager`, `SqlPool` and raw args, return result data. `createMcpServer` will delegate to these handlers to avoid duplication.
- CLI argument parsing: use `parseArgs` from util for mode flags, then collect remaining flags as dynamic key/value pairs. Build an args object for the selected tool, apply smart coercion for numbers, booleans, null and repeated flags for arrays.
- Global flags: `--database` overrides per-tool database arg, `--format` is parsed and validated, `--verbose` toggles debug logging, `--config-path` is not added in v1; config path is resolved via `PG_MCP_CONFIG_PATH` and default.
- Validation: pre-validate tool name against the handler registry and pre-validate args with the existing Zod schemas used by MCP tools. Errors are captured and returned in JSON.
- Execution flow: load `.env`, instantiate ConfigManager, load config, instantiate fresh SqlPool, resolve database name via existing `resolveDatabaseName` logic, run handler, measure duration, wrap output.
- Output contract: JSON object with `tool`, `durationMs`, `timestamp`, and either `result` or `error`. All output goes to stdout. Exit code is zero for both success and error per user choice; error is encoded in JSON.
- No ConfigManager watcher is started for CLI mode. Pool is created per invocation and disposed after execution.
- Help generation derives from handler registry metadata: tool name, description and Zod schema keys.
- Existing modules modified: `src/index.ts`, `src/server.ts`. New modules: `src/cli.ts`, `src/handlers.ts`. No schema changes to config.

## Testing Decisions

- Test external behavior only, not implementation details.
- Unit tests for `parseCliArgs` covering dynamic flag building, smart coercion, repeated flags, and global `--database` override. Prior art: `config.test.ts` for argument parsing patterns.
- Unit tests for handler functions in isolation with mocked ConfigManager and SqlPool. Prior art: `db-helpers.test.ts` for pure DB helper testing.
- Integration test for CLI runner: given parsed args, runner returns correct JSON envelope with duration and result. Prior art: `sql-pool.integration.test.ts` for integration seam usage.
- End-to-end process test: spawn CLI with a known tool and assert JSON shape. Existing seams for SqlPool and ConfigManager are reused; no new seams beyond handler registry and CLI parser.
- Highest test seam is `runTool(toolName, args, configManager, pool) -> {tool,durationMs,timestamp,result|error}`. This keeps tests focused on observable output.

## Out of Scope

- Prompts such as `gen_types` are not supported in v1; only tools.
- Multiple tool calls per invocation, JSON file input, or batch mode.
- Output formats beyond JSON; `--format` is reserved but only `json` is accepted.
- Interactive mode, streaming, or long-running CLI daemon.
- Config file mutation via CLI flags; config management tools remain the way to mutate config.
- HTTP mode or stdio MCP server changes.

## Further Notes

- The CLI should remain consistent with existing database resolution rules: when a single database is configured the `database` arg is optional, when multiple are configured it is required.
- Credential redaction for `get_url` and `pg_db_list` must be preserved.
- Future extension points: add `--format yaml` or table, add config-path override flag, and add prompt support.
- Spec published to local markdown issue tracker under `.scratch/cli-mode/spec.md` with triage label `ready-for-agent`.
