# pg-mcp - PostgreSQL MCP Server with Multi-Database Support

## Project Overview

This project, `pg-mcp`, is a PostgreSQL Model Context Protocol (MCP) server designed to enable interaction with multiple PostgreSQL databases through MCP-compatible clients like Cursor, Claude, and other AI-powered development tools. It extends the original single-database functionality to support a configuration-driven multi-database setup, complete with connection pooling and auto-reload capabilities.

### Key Features

- **Multi-Database Support:** Configure and manage multiple PostgreSQL databases via a JSON configuration file.
- **Connection Pooling:** Implements a lazy connection pool with automatic cleanup based on Time-To-Live (TTL) settings.
- **Auto-Reload:** Automatically reloads the configuration file when changes are detected (if enabled).
- **Backward Compatibility:** Maintains compatibility with single-database setups using the `POSTGRES_URL` environment variable.
- **Secure Credential Handling:** Redacts credentials in tool outputs where applicable.

### Core Technologies

- **Runtime:** [Bun](https://bun.sh) - A fast all-in-one JavaScript runtime.
- **Language:** TypeScript.
- **MCP SDK:** `@modelcontextprotocol/sdk` for implementing the server.
- **Validation:** `zod` for schema validation.
- **Database:** PostgreSQL, using Bun's built-in SQL client (`bun:sql`).

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

The configuration file (`config.json`) follows this JSON schema:

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

### Migration from POSTGRES_URL

If no configuration file exists but the `POSTGRES_URL` environment variable is set, `pg-mcp` will automatically create a default configuration with a single database entry named "default".

## Building and Running

### Prerequisites

- [Bun](https://bun.sh) installed.

### Installation

To install dependencies:

```bash
bun install
```

### Running the Server

To run the server directly:

```bash
bun run src/index.ts
```

### Building for Distribution

To build the project (outputs to `dist`):

```bash
bun run build
```

### Compiling a Standalone Executable

To compile a standalone executable (output to `out/bun-pg-mcp`):

```bash
bun run compile
```

## Available MCP Tools

### Database Configuration Tools

These tools manage the database configurations:

- `pg_db_list` — List all configured databases.
- `pg_db_add` — Add a new database configuration.
- `pg_db_update` — Update an existing database configuration.
- `pg_db_remove` — Remove a database configuration.
- `pg_db_reload` — Reload database configuration from disk.

### Database Interaction Tools

These tools interact with the PostgreSQL databases. They now accept an optional `database` parameter to specify which database to connect to:

- `pg_get_server_version` — Retrieves PostgreSQL version.
- `pg_list_schemas` — List PostgreSQL schemas.
- `pg_list_tables` — List PostgreSQL tables.
- `pg_describe_table` — Get PostgreSQL table details.
- `pg_execute_query` — Execute a read-only SQL query.

When only one database is configured, the `database` parameter is optional and will default to the configured database. When multiple databases are configured, you must specify which database to use.

## Development Conventions

### Code Structure

- `src/index.ts`: Main entry point, initializes the MCP server, config manager, SQL pool, and registers tools.
- `src/config.ts`: Contains `ConfigManager` for loading, validating (using Zod), saving, and managing database configurations. Handles migration from `POSTGRES_URL`.
- `src/sqlPool.ts`: Implements `SqlPool` for lazy creation and management of Bun SQL clients, including TTL-based eviction and reconciliation with the configuration.
- `src/db/`: Contains database helper functions that operate on Bun SQL clients.
- `tests/`: Contains test files (e.g., planned tests for `config.ts`).

### Key Classes

- `ConfigManager` (`src/config.ts`):
  - Manages loading, saving, and CRUD operations for the JSON config file.
  - Uses Zod for validation.
  - Handles migration from `POSTGRES_URL`.
  - Ensures atomic writes.
- `SqlPool` (`src/sqlPool.ts`):
  - Manages a pool of Bun SQL clients keyed by database name/URL.
  - Creates clients on demand.
  - Tracks last used time and implements TTL-based eviction.
  - Includes an idle reaper to clean up stale connections.
  - Provides `reconcile` method to sync with config changes (add/remove/evict).

### Testing

Testing plans are outlined in `TESTING_PLAN.md`, focusing initially on the `ConfigManager` in `src/config.ts`. The project uses Bun's built-in test runner.

### Task Management (Task Master AI)

This project uses Task Master AI for task management. Key files and commands are documented in `GEMINI.md`.
