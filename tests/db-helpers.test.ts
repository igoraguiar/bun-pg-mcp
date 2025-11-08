import { SQL } from "bun";
import { beforeAll, afterAll, test, expect, describe } from "bun:test";
import { startPostgresContainer } from "./_utils_/db-container";
import {
  pgGetServerVersion,
  pgListSchemas,
  pgListTables,
  pgListTableColumns,
  pgListTableForeignKeys,
  pgListTableReferencedBy,
  executeReadOnlyQuery,
} from "../src/db/helpers";

let cleanup: () => Promise<void>;
let pg: SQL;

beforeAll(async () => {
  try {
    // Start PostgreSQL container using helper
    console.log("Starting PostgreSQL container...");
    const container = await startPostgresContainer();
    cleanup = container.cleanup;
    console.log("Container started successfully");

    // Connect using Bun's native SQL client
    console.log("Connecting to database...");
    pg = new SQL(container.connectionString);

    // Test connection
    await pg`SELECT 1`;
    console.log("Database connection established");

    // Setup test schema and tables
    await pg`CREATE SCHEMA IF NOT EXISTS test_schema`;

    // Create users table
    await pg`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create posts table with foreign key to users
    await pg`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT,
        published BOOLEAN DEFAULT false,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    // Create comments table with foreign key to posts
    await pg`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        author_name VARCHAR(100) NOT NULL,
        comment_text TEXT NOT NULL,
        CONSTRAINT fk_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `;

    // Create a table in test_schema
    await pg`
      CREATE TABLE IF NOT EXISTS test_schema.test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100)
      )
    `;

    // Insert some test data
    await pg`INSERT INTO users (username, email) VALUES ('testuser', 'test@example.com')`;
    await pg`INSERT INTO posts (user_id, title, content, published) VALUES (1, 'Test Post', 'Test content', true)`;
    await pg`INSERT INTO comments (post_id, author_name, comment_text) VALUES (1, 'Commenter', 'Great post!')`;

    console.log("Test data setup complete");
  } catch (error) {
    console.error("Error in beforeAll:", error);
    throw error;
  }
}, 120000); // 120 second timeout for container startup

afterAll(async () => {
  if (pg) {
    await pg.end(); // Must close connection before stopping container
  }
  if (cleanup) {
    await cleanup();
  }
});

describe("Database Helpers Integration Tests", () => {
  describe("pgGetServerVersion", () => {
    test("should return PostgreSQL server version", async () => {
      const version = await pgGetServerVersion(pg);

      expect(version).toBeDefined();
      expect(typeof version).toBe("string");
      expect(version).toContain("PostgreSQL");
      expect(version).toContain("16"); // postgres:16-alpine
    });
  });

  describe("pgListSchemas", () => {
    test("should list all user-created schemas", async () => {
      const schemas = await pgListSchemas(pg);

      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);

      // Should include public and test_schema
      const schemaNames = schemas.map((s) => s.schema_name);
      expect(schemaNames).toContain("public");
      expect(schemaNames).toContain("test_schema");

      // Should NOT include system schemas
      expect(schemaNames).not.toContain("information_schema");
      expect(schemaNames).not.toContain("pg_catalog");
    });
  });

  describe("pgListTables", () => {
    test("should list all tables in public schema", async () => {
      const tables = await pgListTables(pg, "public");

      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBe(3); // users, posts, comments

      const tableNames = tables.map((t) => t.table_name);
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("posts");
      expect(tableNames).toContain("comments");

      // All tables should have schema_name set to 'public'
      tables.forEach((table) => {
        expect(table.schema_name).toBe("public");
      });
    });

    test("should list tables in test_schema", async () => {
      const tables = await pgListTables(pg, "test_schema");

      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBe(1);
      expect(tables[0]?.table_name).toBe("test_table");
      expect(tables[0]?.schema_name).toBe("test_schema");
    });

    test("should return empty array for schema with no tables", async () => {
      await pg`CREATE SCHEMA IF NOT EXISTS empty_schema`;
      const tables = await pgListTables(pg, "empty_schema");

      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBe(0);
    });
  });

  describe("pgListTableColumns", () => {
    test("should list all columns for users table", async () => {
      const columns = await pgListTableColumns(pg, "users", "public");

      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBe(4); // id, username, email, created_at

      const columnNames = columns.map((c) => c.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("username");
      expect(columnNames).toContain("email");
      expect(columnNames).toContain("created_at");
    });

    test("should include correct column metadata", async () => {
      const columns = await pgListTableColumns(pg, "users", "public");

      const idColumn = columns.find((c) => c.column_name === "id");
      expect(idColumn).toBeDefined();
      expect(idColumn?.data_type).toBe("integer");
      expect(idColumn?.is_nullable).toBe("NO");
      expect(idColumn?.column_default).toContain("nextval");

      const usernameColumn = columns.find((c) => c.column_name === "username");
      expect(usernameColumn).toBeDefined();
      expect(usernameColumn?.data_type).toBe("character varying");
      expect(usernameColumn?.is_nullable).toBe("NO");

      const emailColumn = columns.find((c) => c.column_name === "email");
      expect(emailColumn).toBeDefined();
      expect(emailColumn?.is_nullable).toBe("NO");
    });

    test("should handle table with nullable columns", async () => {
      const columns = await pgListTableColumns(pg, "posts", "public");

      const contentColumn = columns.find((c) => c.column_name === "content");
      expect(contentColumn).toBeDefined();
      expect(contentColumn?.is_nullable).toBe("YES");
    });
  });

  describe("pgListTableForeignKeys", () => {
    test("should list foreign keys for posts table", async () => {
      const foreignKeys = await pgListTableForeignKeys(pg, "posts", "public");

      expect(Array.isArray(foreignKeys)).toBe(true);
      expect(foreignKeys.length).toBe(1);

      const fk = foreignKeys[0];
      expect(fk?.constraint_name).toBe("fk_user");
      expect(fk?.column_name).toBe("user_id");
      expect(fk?.referenced_table_name).toBe("users");
      expect(fk?.referenced_column_name).toBe("id");
      expect(fk?.referenced_table_schema).toBe("public");
    });

    test("should list foreign keys for comments table", async () => {
      const foreignKeys = await pgListTableForeignKeys(
        pg,
        "comments",
        "public"
      );

      expect(Array.isArray(foreignKeys)).toBe(true);
      expect(foreignKeys.length).toBe(1);

      const fk = foreignKeys[0];
      expect(fk?.constraint_name).toBe("fk_post");
      expect(fk?.column_name).toBe("post_id");
      expect(fk?.referenced_table_name).toBe("posts");
    });

    test("should return empty array for table with no foreign keys", async () => {
      const foreignKeys = await pgListTableForeignKeys(pg, "users", "public");

      expect(Array.isArray(foreignKeys)).toBe(true);
      expect(foreignKeys.length).toBe(0);
    });
  });

  describe("pgListTableReferencedBy", () => {
    test("should list tables that reference users table", async () => {
      const referencedBy = await pgListTableReferencedBy(pg, "users", "public");

      expect(Array.isArray(referencedBy)).toBe(true);
      expect(referencedBy.length).toBe(1);

      const ref = referencedBy[0];
      expect(ref?.referencing_table_name).toBe("posts");
      expect(ref?.referencing_column_name).toBe("user_id");
      expect(ref?.referenced_column_name).toBe("id");
      expect(ref?.constraint_name).toBe("fk_user");
    });

    test("should list tables that reference posts table", async () => {
      const referencedBy = await pgListTableReferencedBy(pg, "posts", "public");

      expect(Array.isArray(referencedBy)).toBe(true);
      expect(referencedBy.length).toBe(1);

      const ref = referencedBy[0];
      expect(ref?.referencing_table_name).toBe("comments");
      expect(ref?.referencing_column_name).toBe("post_id");
      expect(ref?.referenced_column_name).toBe("id");
    });

    test("should return empty array for table not referenced by others", async () => {
      const referencedBy = await pgListTableReferencedBy(
        pg,
        "comments",
        "public"
      );

      expect(Array.isArray(referencedBy)).toBe(true);
      expect(referencedBy.length).toBe(0);
    });
  });

  describe("executeReadOnlyQuery", () => {
    test("should execute SELECT query successfully", async () => {
      const result = await executeReadOnlyQuery(pg, "SELECT * FROM users");

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty("username", "testuser");
      expect(result[0]).toHaveProperty("email", "test@example.com");
    });

    test("should execute query with WHERE clause", async () => {
      const result = await executeReadOnlyQuery(
        pg,
        "SELECT title, published FROM posts WHERE published = true"
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty("title", "Test Post");
      expect(result[0]).toHaveProperty("published", true);
    });

    test("should execute JOIN query", async () => {
      const result = await executeReadOnlyQuery(
        pg,
        `SELECT u.username, p.title 
         FROM users u 
         JOIN posts p ON u.id = p.user_id`
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty("username", "testuser");
      expect(result[0]).toHaveProperty("title", "Test Post");
    });

    test("should prevent INSERT operations", async () => {
      await expect(
        executeReadOnlyQuery(
          pg,
          "INSERT INTO users (username, email) VALUES ('hacker', 'hack@example.com')"
        )
      ).rejects.toThrow();
    });

    test("should prevent UPDATE operations", async () => {
      await expect(
        executeReadOnlyQuery(
          pg,
          "UPDATE users SET email = 'newemail@example.com' WHERE username = 'testuser'"
        )
      ).rejects.toThrow();
    });

    test("should prevent DELETE operations", async () => {
      await expect(
        executeReadOnlyQuery(
          pg,
          "DELETE FROM users WHERE username = 'testuser'"
        )
      ).rejects.toThrow();
    });
  });
});
