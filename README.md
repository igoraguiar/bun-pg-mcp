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

pg-mcp provides comprehensive tools for database management and interaction, organized into three categories: configuration management, database querying, and utility functions.

### Database Configuration Management Tools

Tools for managing database configurations and connection pooling.

#### `pg_db_list`

**Description:** List all configured databases with their connection details and TTL settings.

**Parameters:** None

**Returns:** Array of database configurations with redacted credentials

**Example:**

```json
{
  "name": "pg_db_list"
}
```

**Response Example:**

```json
{
  "result": [
    {
      "name": "default",
      "url": "postgresql://user:***@localhost:5432/myapp",
      "ttl": 60000
    },
    {
      "name": "analytics",
      "url": "postgresql://user:***@analytics-host:5432/analytics",
      "ttl": 120000
    }
  ]
}
```

#### `pg_db_add`

**Description:** Add a new database configuration to the connection pool.

**Parameters:**

- `name` (string, required): Unique identifier for the database
- `url` (string, required): PostgreSQL connection URL (must be valid URL format)
- `ttl` (number, optional): Time-to-live for connections in milliseconds (default: 60000)

**Returns:** Confirmation with the added database configuration (credentials redacted)

**Example:**

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

#### `pg_db_update`

**Description:** Update an existing database configuration. You can update the URL, TTL, or both.

**Parameters:**

- `name` (string, required): Identifier of the database to update
- `url` (string, optional): New PostgreSQL connection URL
- `ttl` (number, optional): New TTL value in milliseconds

**Returns:** Confirmation with updated configuration

**Example:**

```json
{
  "name": "pg_db_update",
  "arguments": {
    "name": "production",
    "ttl": 45000
  }
}
```

#### `pg_db_remove`

**Description:** Remove a database configuration and close its connection pool.

**Parameters:**

- `name` (string, required): Identifier of the database to remove

**Returns:** Confirmation of removal

**Example:**

```json
{
  "name": "pg_db_remove",
  "arguments": {
    "name": "staging"
  }
}
```

#### `pg_db_reload`

**Description:** Reload the database configuration from disk and reconcile the connection pool. Useful after manual configuration file changes or to refresh stale configurations.

**Parameters:** None

**Returns:** List of all configured database names after reload

**Example:**

```json
{
  "name": "pg_db_reload"
}
```

---

### Database Query Tools

Tools for querying and inspecting PostgreSQL databases. All tools support an optional `database` parameter to select which database to query.

> **Note on Database Selection:**
>
> - When only **one database is configured**, the `database` parameter is optional and automatically uses that database
> - When **multiple databases are configured**, you **must** specify the `database` parameter
> - If neither condition is met, an error will indicate which databases are available

#### `pg_get_server_version`

**Description:** Retrieve the PostgreSQL server version and detailed version information.

**Parameters:**

- `database` (string, optional): Name of the database to connect to

**Returns:** PostgreSQL version information

**Example:**

```json
{
  "name": "pg_get_server_version",
  "arguments": {
    "database": "production"
  }
}
```

#### `get_url`

**Description:** Retrieve the connection URL for a specific database (with credentials redacted for security).

**Parameters:**

- `database` (string, optional): Name of the database

**Returns:** Redacted PostgreSQL connection URL

**Example:**

```json
{
  "name": "get_url",
  "arguments": {
    "database": "default"
  }
}
```

#### `pg_list_schemas`

**Description:** List all schemas available in the selected database.

**Parameters:**

- `database` (string, optional): Name of the database to query

**Returns:** Array of schema names

**Example:**

```json
{
  "name": "pg_list_schemas",
  "arguments": {
    "database": "production"
  }
}
```

**Response Example:**

```json
{
  "result": ["public", "auth", "api", "analytics"]
}
```

#### `pg_list_tables`

**Description:** List all tables in a specific schema of the selected database.

**Parameters:**

- `schema` (string, required): Name of the schema to query
- `database` (string, optional): Name of the database to query

**Returns:** Array of table names in the specified schema

**Example:**

```json
{
  "name": "pg_list_tables",
  "arguments": {
    "schema": "public",
    "database": "production"
  }
}
```

**Response Example:**

```json
{
  "result": ["users", "posts", "comments", "categories"]
}
```

#### `pg_describe_table`

**Description:** Get detailed information about a specific table, including columns, data types, nullability, defaults, and foreign key constraints.

**Parameters:**

- `schema` (string, required): Name of the schema containing the table
- `table` (string, required): Name of the table to describe
- `database` (string, optional): Name of the database to query

**Returns:** Comprehensive table structure with columns and foreign key relationships

**Example:**

```json
{
  "name": "pg_describe_table",
  "arguments": {
    "schema": "public",
    "table": "users",
    "database": "production"
  }
}
```

**Response Example:**

```json
{
  "result": {
    "schema_name": "public",
    "table_name": "users",
    "columns": [
      {
        "column_name": "id",
        "data_type": "integer",
        "is_nullable": false,
        "column_default": "nextval('users_id_seq'::regclass)"
      },
      {
        "column_name": "email",
        "data_type": "character varying",
        "is_nullable": false,
        "column_default": null
      }
    ],
    "foreign_keys": [
      {
        "constraint_name": "posts_user_id_fk",
        "column_name": "id",
        "referenced_table_schema": "public",
        "referenced_table_name": "posts",
        "referenced_column_name": "user_id"
      }
    ]
  }
}
```

#### `pg_execute_query`

**Description:** Execute a read-only SQL query against the selected database. Queries are restricted to SELECT operations for security.

**Parameters:**

- `query` (string, required): SQL SELECT query to execute
- `database` (string, optional): Name of the database to query against

**Returns:** Query results as JSON array

**Example:**

```json
{
  "name": "pg_execute_query",
  "arguments": {
    "query": "SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days' LIMIT 10",
    "database": "production"
  }
}
```

**Response Example:**

```json
{
  "result": [
    {
      "id": 1,
      "email": "user@example.com",
      "created_at": "2024-10-22T10:30:00Z"
    },
    {
      "id": 2,
      "email": "another@example.com",
      "created_at": "2024-10-23T15:45:00Z"
    }
  ]
}
```

---

### Utility Functions

#### `gen_types` (Prompt)

**Description:** Generate TypeScript type definitions for specified tables. This is an interactive prompt that uses other tools to gather table information.

**Parameters:**

- `schema` (string, optional): Schema name containing the tables
- `tables` (string, optional): Comma-separated list of table names

**Returns:** TypeScript type definitions based on table structures

**Example Usage:**
To generate TypeScript types for the `users` and `posts` tables in the `public` schema, use:

```
schema: public
tables: users, posts
```

---

## Complete Workflow Examples

### Example 1: Explore a Single Database

When you have only one database configured, you can omit the `database` parameter:

```json
[
  { "name": "pg_list_schemas" },
  { "name": "pg_list_tables", "arguments": { "schema": "public" } },
  {
    "name": "pg_describe_table",
    "arguments": { "schema": "public", "table": "users" }
  }
]
```

### Example 2: Work with Multiple Databases

When multiple databases are configured, always specify which one to use:

```json
[
  { "name": "pg_db_list" },
  {
    "name": "pg_get_server_version",
    "arguments": { "database": "production" }
  },
  { "name": "pg_list_schemas", "arguments": { "database": "production" } },
  {
    "name": "pg_execute_query",
    "arguments": {
      "database": "analytics",
      "query": "SELECT COUNT(*) FROM events"
    }
  }
]
```

### Example 3: Add and Configure a New Database

```json
[
  {
    "name": "pg_db_add",
    "arguments": {
      "name": "staging",
      "url": "postgresql://user:password@staging-host:5432/app",
      "ttl": 45000
    }
  },
  { "name": "pg_db_list" },
  { "name": "pg_get_server_version", "arguments": { "database": "staging" } }
]
```

### Example 4: Query Multiple Databases

```json
[
  {
    "name": "pg_execute_query",
    "arguments": {
      "database": "production",
      "query": "SELECT COUNT(*) as user_count FROM users"
    }
  },
  {
    "name": "pg_execute_query",
    "arguments": {
      "database": "analytics",
      "query": "SELECT COUNT(*) as event_count FROM events"
    }
  }
]
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
