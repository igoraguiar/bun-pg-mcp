# 04 — Output contract, error handling and UX flags

**What to build:** Implement consistent JSON output contract for CLI. Output includes tool, durationMs, timestamp and either result or error. Reserve `--format` flag, accept only json for now. Add `--verbose` logging to stderr. Errors are JSON-encoded and exit code stays zero.

**Blocked by:** 03 — CLI tracer for pg_list_tables end-to-end

**Status:** resolved

- [ ] Success output shape is { tool, durationMs, timestamp, result }
- [ ] Error output shape is { tool, durationMs, timestamp, error }
- [ ] `--format json` is accepted, other formats error with JSON message
- [ ] `--verbose` emits debug logs to stderr without polluting stdout JSON
