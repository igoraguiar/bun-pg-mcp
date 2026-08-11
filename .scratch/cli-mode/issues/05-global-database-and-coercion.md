# 05 — Global --database flag and smart coercion

**What to build:** Add global `--database` flag that overrides per-tool database arg. Implement smart coercion for numbers, booleans, null and repeated flags building arrays. Pre-validate args against Zod schemas before handler execution.

**Blocked by:** 04 — Output contract, error handling and UX flags

**Status:** resolved

- [ ] Global `--database` flag overrides tool arg when present
- [ ] Repeated flags build arrays for tools expecting arrays
- [ ] Numbers and booleans are coerced from string flags
- [ ] Zod pre-validation errors are returned as JSON error envelope
