# pg-mcp

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Available Tools

The MCP server exposes several tools. A new addition is:

- `pg_execute_query` — execute a SQL query inside a read‑only transaction and
  return the resulting rows as JSON.


This project was created using `bun init` in bun v1.2.15. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
