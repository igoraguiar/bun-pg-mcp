import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  loadConfig,
  saveConfig,
  addDatabase,
  updateDatabase,
  removeDatabase,
  getConfig,
  listDatabases,
} from "../src/config";
import type { Config, DbEntry } from "../src/config";
import { promises as fs } from "fs";
import { join } from "path";

// Store original CONFIG_PATH and process.env
const ORIGINAL_CONFIG_PATH = process.env.PG_MCP_CONFIG_PATH;
const ORIGINAL_POSTGRES_URL = process.env.POSTGRES_URL;

// Test config path
let TEST_CONFIG_PATH: string;

describe("config.ts", () => {
  beforeEach(async () => {
    // Create a temporary directory for test config files
    const tempDir = await fs.mkdtemp("/tmp/pg-mcp-test-");
    TEST_CONFIG_PATH = join(tempDir, "config.json");

    // Set the test config path
    process.env.PG_MCP_CONFIG_PATH = TEST_CONFIG_PATH;
  });

  afterEach(async () => {
    // Restore original CONFIG_PATH
    if (ORIGINAL_CONFIG_PATH !== undefined) {
      process.env.PG_MCP_CONFIG_PATH = ORIGINAL_CONFIG_PATH;
    } else {
      delete process.env.PG_MCP_CONFIG_PATH;
    }

    // Restore original POSTGRES_URL
    if (ORIGINAL_POSTGRES_URL !== undefined) {
      process.env.POSTGRES_URL = ORIGINAL_POSTGRES_URL;
    } else {
      delete process.env.POSTGRES_URL;
    }

    // Clean up test config file
    try {
      await fs.unlink(TEST_CONFIG_PATH);
      await fs.rmdir(TEST_CONFIG_PATH.split("/").slice(0, -1).join("/"));
    } catch (err) {
      // Ignore errors if file doesn't exist
    }
  });

  describe("loadConfig", () => {
    it("should create default config when file doesn't exist and POSTGRES_URL is set", async () => {
      process.env.POSTGRES_URL = "postgresql://user:pass@localhost:5432/testdb";

      const config = await loadConfig();

      expect(config).not.toBeNull();
      expect(config!.databases).toHaveProperty("default");
      expect(config!.databases.default!.url).toBe(
        "postgresql://user:pass@localhost:5432/testdb"
      );
      expect(config!.databases.default!.ttl).toBe(60000);
      expect(config!.autoReload).toBe(true);
    });

    it("should return config with empty databases when file doesn't exist and POSTGRES_URL is not set", async () => {
      delete process.env.POSTGRES_URL;

      const config = await loadConfig();

      expect(config).not.toBeNull();
      expect(config!.databases).toEqual({});
      expect(config!.autoReload).toBe(true);
    });

    it("should load existing valid config", async () => {
      const testConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: false,
      };

      await saveConfig(testConfig);

      const loadedConfig = await loadConfig();

      expect(loadedConfig).toEqual(testConfig);
    });

    it("should throw error for invalid config format", async () => {
      // Create an invalid config file
      await fs.writeFile(TEST_CONFIG_PATH, '{"invalid": "json"', "utf8");

      await expect(loadConfig()).rejects.toThrow("Failed to load config");
    });
  });

  describe("saveConfig", () => {
    it("should save valid config to file", async () => {
      const config: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };

      await saveConfig(config);

      const savedData = await fs.readFile(TEST_CONFIG_PATH, "utf8");
      const savedConfig = JSON.parse(savedData);

      expect(savedConfig).toEqual(config);
    });

    it("should throw error for invalid config", async () => {
      const invalidConfig = {
        databases: {
          testdb: {
            url: "not-a-valid-url",
            ttl: -1, // Invalid: negative TTL
          },
        },
        autoReload: true,
      };

      // @ts-ignore - intentionally passing invalid config
      await expect(saveConfig(invalidConfig)).rejects.toThrow("Invalid config");
    });

    it("should create directory structure if it doesn't exist", async () => {
      // Set a nested path that doesn't exist
      const nestedPath = TEST_CONFIG_PATH.replace(
        "config.json",
        "nested/deep/config.json"
      );
      process.env.PG_MCP_CONFIG_PATH = nestedPath;

      const config: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };

      await saveConfig(config);

      const savedData = await fs.readFile(nestedPath, "utf8");
      const savedConfig = JSON.parse(savedData);

      expect(savedConfig).toEqual(config);
    });
  });

  describe("addDatabase", () => {
    it("should add new database to config", async () => {
      // Start with empty config
      const initialConfig: Config = {
        databases: {},
        autoReload: true,
      };
      await saveConfig(initialConfig);

      const dbConfig: DbEntry = {
        url: "postgresql://user:pass@localhost:5432/testdb",
        ttl: 30000,
      };

      await addDatabase("testdb", dbConfig);

      const config = await loadConfig();
      expect(config!.databases).toHaveProperty("testdb");
      expect(config!.databases.testdb).toEqual(dbConfig);
    });

    it("should throw error if database name already exists", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      const dbConfig: DbEntry = {
        url: "postgresql://user:pass@localhost:5432/anotherdb",
        ttl: 40000,
      };

      await expect(addDatabase("testdb", dbConfig)).rejects.toThrow(
        "Database name 'testdb' already exists"
      );
    });

    it("should throw error for invalid database config", async () => {
      const initialConfig: Config = {
        databases: {},
        autoReload: true,
      };
      await saveConfig(initialConfig);

      const invalidDbConfig = {
        url: "not-a-valid-url",
        ttl: -1, // Invalid: negative TTL
      };

      // @ts-ignore - intentionally passing invalid config
      await expect(addDatabase("testdb", invalidDbConfig)).rejects.toThrow(
        "Invalid database config"
      );
    });

    it("should throw error if config file not found", async () => {
      // Delete config file
      try {
        await fs.unlink(TEST_CONFIG_PATH);
      } catch (err) {
        // Ignore if file doesn't exist
      }

      const dbConfig: DbEntry = {
        url: "postgresql://user:pass@localhost:5432/testdb",
        ttl: 30000,
      };

      await expect(addDatabase("testdb", dbConfig)).rejects.toThrow(
        "Config file not found"
      );
    });
  });

  describe("updateDatabase", () => {
    it("should update existing database config", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await updateDatabase("testdb", { ttl: 45000 });

      const config = await loadConfig();
      expect(config!.databases.testdb!.ttl).toBe(45000);
      expect(config!.databases.testdb!.url).toBe(
        "postgresql://user:pass@localhost:5432/testdb"
      );
    });

    it("should throw error if database name not found", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await expect(
        updateDatabase("nonexistent", { ttl: 45000 })
      ).rejects.toThrow("Database name 'nonexistent' not found");
    });

    it("should throw error for invalid updated config", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await expect(updateDatabase("testdb", { ttl: -1 })).rejects.toThrow(
        "Invalid updated database config"
      );
    });

    it("should throw error if config file not found", async () => {
      // Delete config file
      try {
        await fs.unlink(TEST_CONFIG_PATH);
      } catch (err) {
        // Ignore if file doesn't exist
      }

      await expect(updateDatabase("testdb", { ttl: 45000 })).rejects.toThrow(
        "Config file not found"
      );
    });
  });

  describe("removeDatabase", () => {
    it("should remove existing database from config", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
          anotherdb: {
            url: "postgresql://user:pass@localhost:5432/anotherdb",
            ttl: 40000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await removeDatabase("testdb");

      const config = await loadConfig();
      expect(config!.databases).not.toHaveProperty("testdb");
      expect(config!.databases).toHaveProperty("anotherdb");
    });

    it("should throw error if database name not found", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await expect(removeDatabase("nonexistent")).rejects.toThrow(
        "Database name 'nonexistent' not found"
      );
    });

    it("should throw error if config file not found", async () => {
      // Delete config file
      try {
        await fs.unlink(TEST_CONFIG_PATH);
      } catch (err) {
        // Ignore if file doesn't exist
      }

      await expect(removeDatabase("testdb")).rejects.toThrow(
        "Config file not found"
      );
    });
  });

  describe("getConfig", () => {
    it("should return specific database config", async () => {
      const dbConfig: DbEntry = {
        url: "postgresql://user:pass@localhost:5432/testdb",
        ttl: 30000,
      };
      const initialConfig: Config = {
        databases: {
          testdb: dbConfig,
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      const result = await getConfig("testdb");

      expect(result).toEqual(dbConfig);
    });

    it("should throw error if database name not found", async () => {
      const initialConfig: Config = {
        databases: {
          testdb: {
            url: "postgresql://user:pass@localhost:5432/testdb",
            ttl: 30000,
          },
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await expect(getConfig("nonexistent")).rejects.toThrow(
        "Database 'nonexistent' not found"
      );
    });

    it("should throw error if config file not found", async () => {
      // Delete config file
      try {
        await fs.unlink(TEST_CONFIG_PATH);
      } catch (err) {
        // Ignore if file doesn't exist
      }

      await expect(getConfig("testdb")).rejects.toThrow(
        "Config file not found"
      );
    });

    it("should handle case when no databases are configured", async () => {
      const initialConfig: Config = {
        databases: {},
        autoReload: true,
      };
      await saveConfig(initialConfig);

      await expect(getConfig("testdb")).rejects.toThrow(
        "No databases are configured"
      );
    });
  });

  describe("listDatabases", () => {
    it("should return array of all database configs", async () => {
      const dbConfigs: DbEntry[] = [
        {
          url: "postgresql://user:pass@localhost:5432/testdb1",
          ttl: 30000,
        },
        {
          url: "postgresql://user:pass@localhost:5432/testdb2",
          ttl: 40000,
        },
      ];
      const initialConfig: Config = {
        databases: {
          testdb1: dbConfigs[0]!,
          testdb2: dbConfigs[1]!,
        },
        autoReload: true,
      };
      await saveConfig(initialConfig);

      const result = await listDatabases();

      expect(result).toEqual(dbConfigs);
    });

    it("should return empty array when no databases configured", async () => {
      const initialConfig: Config = {
        databases: {},
        autoReload: true,
      };
      await saveConfig(initialConfig);

      const result = await listDatabases();

      expect(result).toEqual([]);
    });

    it("should throw error if config file not found", async () => {
      // Delete config file
      try {
        await fs.unlink(TEST_CONFIG_PATH);
      } catch (err) {
        // Ignore if file doesn't exist
      }

      await expect(listDatabases()).rejects.toThrow("Config file not found");
    });

    it("should validate each database config", async () => {
      // Create a config file with invalid database entry
      const invalidConfig = {
        databases: {
          testdb: {
            url: "not-a-valid-url",
            ttl: -1, // Invalid: negative TTL
          },
        },
        autoReload: true,
      };

      await fs.writeFile(
        TEST_CONFIG_PATH,
        JSON.stringify(invalidConfig, null, 2),
        "utf8"
      );

      await expect(listDatabases()).rejects.toThrow("Invalid database config");
    });
  });
});
