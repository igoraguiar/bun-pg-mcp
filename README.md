# pg-mcp

PostgreSQL MCP (Model Context Protocol) server with multi-database support. This tool allows you to interact with PostgreSQL databases through MCP-compatible clients like Cursor, Claude, and other AI-powered development tools.

## Features

- Multi-database support with configuration management
- Connection pooling with automatic cleanup
- Auto-reload configuration on file changes
- Backward compatibility with single database setups
- Secure credential handling

## Installation

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```

## Configuration

### Configuration Path

The configuration file location is determined by the `PG_MCP_CONFIG_PATH` environment variable. If not set, it defaults to:

```
$HOME/.config/pg-mcp/config.json
```

You can set a custom configuration path:

```bash
export PG_MCP_CONFIG_PATH="/path/to/your/config.json"
```

### Configuration Schema

The configuration file follows this JSON schema:

```json
{
  "databases": {
    "database_name": {
      "url": "postgresql://user:password@host:port/database",
      "ttl": 60000
    }
  },
  "autoReload": true
}
```

**Fields:**

- `databases`: Object containing database configurations
  - `database_name`: Unique identifier for the database
    - `url`: PostgreSQL connection URL (required)
    - `ttl`: Time-to-live for connection pooling in milliseconds (default: 60000)
- `autoReload`: Enable automatic configuration reloading when the file changes (default: false)

### Configuration Example

```json
{
  "databases": {
    "default": {
      "url": "postgresql://user:password@localhost:5432/myapp",
      "ttl": 60000
    },
    "analytics": {
      "url": "postgresql://user:password@analytics-host:5432/analytics",
      "ttl": 120000
    }
  },
  "autoReload": true
}
```

### Migration from POSTGRES_URL

If no configuration file exists but the `POSTGRES_URL` environment variable is set, pg-mcp will automatically create a default configuration with a single database entry named "default".

## Available Tools

### Database Configuration Tools

- `pg_db_list` — List all configured databases
- `pg_db_add` — Add a new database configuration
- `pg_db_update` — Update an existing database configuration
- `pg_db_remove` — Remove a database configuration
- `pg_db_reload` — Reload database configuration from disk

### Database Interaction Tools

All existing PostgreSQL tools now accept an optional `database` parameter to specify which database to connect to:

- `pg_get_server_version` — Retrieves PostgreSQL version
- `pg_list_schemas` — List PostgreSQL schemas
- `pg_list_tables` — List PostgreSQL tables
- `pg_describe_table` — Get PostgreSQL table details
- `pg_execute_query` — Execute a read-only SQL query

When only one database is configured, the `database` parameter is optional and will default to the configured database. When multiple databases are configured, you must specify which database to use.

### Tool Usage Examples

List configured databases:

```json
{
  "name": "pg_db_list"
}
```

Add a new database:

```json
{
  "name": "pg_db_add",
  "arguments": {
    "name": "production",
    "url": "postgresql://user:password@prod-host:5432/myapp",
    "ttl": 30000
  }
}
```

Execute a query on a specific database:

```json
{
  "name": "pg_execute_query",
  "arguments": {
    "database": "production",
    "query": "SELECT * FROM users LIMIT 10"
  }
}
```

List schemas (with auto-selection when only one database is configured):

```json
{
  "name": "pg_list_schemas"
}
```

## Connection Pooling

pg-mcp uses a lazy connection pool to manage database connections efficiently:

- Connections are created on-demand when a tool is called
- Connections are tracked with last-used timestamps
- Idle connections are automatically closed based on their TTL
- An idle reaper runs periodically to clean up stale connections
- Pool is automatically reconciled when configuration changes

## Auto-Reload

When `autoReload` is set to `true` in the configuration, pg-mcp will automatically reload the configuration file when changes are detected. This allows you to add, remove, or modify database configurations without restarting the server.

## Building

To build the project for distribution:

```bash
bun run build
```

To compile a standalone executable:

```bash
bun run compile
```

This project was created using `bun init` in bun v1.2.15. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
