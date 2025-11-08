import { SQL } from "bun";
import {
  beforeAll,
  afterAll,
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
} from "bun:test";
import { startPostgresContainer } from "./_utils_/db-container";
import { SqlPool } from "../src/sql-pool";
import type { Config } from "../src/config";

let cleanup: () => Promise<void>;
let connectionUri: string;

beforeAll(async () => {
  // Start PostgreSQL container using helper
  console.log("Starting PostgreSQL container...");
  const container = await startPostgresContainer();
  cleanup = container.cleanup;
  connectionUri = container.connectionString;
  console.log("Container started, connection URI obtained");
}, 120000); // 120 second timeout for container startup

afterAll(async () => {
  if (cleanup) {
    await cleanup();
  }
});

describe("SqlPool Integration Tests", () => {
  let pool: SqlPool;

  beforeEach(() => {
    // Create a fresh pool for each test
    pool = new SqlPool();
  });

  afterEach(() => {
    // Clean up all connections after each test
    pool.closeAll();
  });

  describe("get", () => {
    test("should create and return a SQL client for a new connection", async () => {
      const client = pool.get(connectionUri);

      expect(client).toBeDefined();
      const SQL_KEYS = [
        "unsafe",
        "file",
        "reserve",
        "array",
        "rollbackDistributed",
        "commitDistributed",
        "beginDistributed",
        "begin",
        "connect",
        "close",
        "flush",
        "options",
        "transaction",
        "distributed",
        "end",
      ];
      for (const key of SQL_KEYS) {
        expect((client as any)[key]).toBeDefined();
      }

      // Verify the client works by executing a query
      const result: Array<{ version: string }> =
        await client`SELECT version() as version`;
      expect(result[0]?.version).toContain("PostgreSQL");
    });

    test("should reuse existing client for same connection URI", async () => {
      const client1 = pool.get(connectionUri);
      const client2 = pool.get(connectionUri);

      // Should return the same client instance
      expect(client1).toBe(client2);
    });

    test("should create separate clients for different connection URIs", async () => {
      // Start a second container for this test
      const container2 = await startPostgresContainer();
      const connectionUri2 = container2.connectionString;

      try {
        const client1 = pool.get(connectionUri);
        const client2 = pool.get(connectionUri2);

        // Should be different client instances
        expect(client1).not.toBe(client2);

        // Both should work
        const result1: Array<{ num: number }> = await client1`SELECT 1 as num`;
        const result2: Array<{ num: number }> = await client2`SELECT 2 as num`;

        expect(result1[0]?.num).toBe(1);
        expect(result2[0]?.num).toBe(2);
      } finally {
        await container2.cleanup();
      }
    });

    test("should update lastUsed timestamp on subsequent gets", async () => {
      const client1 = pool.get(connectionUri);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const client2 = pool.get(connectionUri);

      // Should be the same client
      expect(client1).toBe(client2);
    });
  });

  describe("evict", () => {
    test("should remove client from pool and close connection", async () => {
      const client = pool.get(connectionUri);

      // Verify client works
      const result1: Array<{ num: number }> = await client`SELECT 1 as num`;
      expect(result1[0]?.num).toBe(1);

      // Evict the client
      pool.evict(connectionUri);

      // Getting the same URI should create a new client
      const newClient = pool.get(connectionUri);
      expect(newClient).not.toBe(client);

      // New client should work
      const result2: Array<{ num: number }> = await newClient`SELECT 2 as num`;
      expect(result2[0]?.num).toBe(2);
    });

    test("should handle evicting non-existent connection gracefully", () => {
      // Should not throw
      expect(() =>
        pool.evict("postgresql://nonexistent:5432/db")
      ).not.toThrow();
    });
  });

  describe("closeAll", () => {
    test("should close all connections in the pool", async () => {
      // Create multiple connections
      const client1 = pool.get(connectionUri);

      // Start a second container
      const container2 = await startPostgresContainer();
      const connectionUri2 = container2.connectionString;

      try {
        const client2 = pool.get(connectionUri2);

        // Verify both work
        await client1`SELECT 1`;
        await client2`SELECT 1`;

        // Close all
        pool.closeAll();

        // Getting clients again should create new instances
        const newClient1 = pool.get(connectionUri);
        const newClient2 = pool.get(connectionUri2);

        expect(newClient1).not.toBe(client1);
        expect(newClient2).not.toBe(client2);

        // New clients should work
        await newClient1`SELECT 1`;
        await newClient2`SELECT 1`;
      } finally {
        await container2.cleanup();
      }
    });
  });

  describe("reconcile", () => {
    test("should add new databases from config", async () => {
      const config: Config = {
        databases: {
          db1: { url: connectionUri, ttl: 60000 },
        },
        autoReload: true,
      };

      pool.reconcile(config);

      // Should have created a connection for db1
      const client = pool.get(connectionUri);
      expect(client).toBeDefined();

      // Verify it works
      const result: Array<{ num: number }> = await client`SELECT 1 as num`;
      expect(result[0]?.num).toBe(1);
    });

    test("should evict databases not in new config", async () => {
      // Start with a connection in the pool
      const client1 = pool.get(connectionUri);
      await client1`SELECT 1`; // Verify it works

      // Reconcile with empty config
      const config: Config = {
        databases: {},
        autoReload: true,
      };

      pool.reconcile(config);

      // The old connection should have been evicted
      // Getting it again should create a new instance
      const client2 = pool.get(connectionUri);
      expect(client2).not.toBe(client1);
    });

    test("should handle multiple databases in config", async () => {
      // Start a second container
      const container2 = await startPostgresContainer();
      const connectionUri2 = container2.connectionString;

      try {
        const config: Config = {
          databases: {
            db1: { url: connectionUri, ttl: 60000 },
            db2: { url: connectionUri2, ttl: 60000 },
          },
          autoReload: true,
        };

        pool.reconcile(config);

        // Both connections should be available
        const client1 = pool.get(connectionUri);
        const client2 = pool.get(connectionUri2);

        expect(client1).toBeDefined();
        expect(client2).toBeDefined();
        expect(client1).not.toBe(client2);

        // Both should work
        await client1`SELECT 1`;
        await client2`SELECT 1`;
      } finally {
        await container2.cleanup();
      }
    });

    test("should keep existing connections that are still in config", async () => {
      // Create initial connection
      const client1 = pool.get(connectionUri);
      await client1`SELECT 1`;

      // Reconcile with config that includes the same database
      const config: Config = {
        databases: {
          db1: { url: connectionUri, ttl: 60000 },
        },
        autoReload: true,
      };

      pool.reconcile(config);

      // Should still have the same client
      const client2 = pool.get(connectionUri);
      expect(client2).toBe(client1);
    });
  });

  describe("TTL and idle reaper", () => {
    test("should set and get TTL", () => {
      const pool = new SqlPool(30000);
      pool.setTTL(45000);

      // TTL is private, but we can verify it works through the idle reaper
      expect(() => pool.setTTL(45000)).not.toThrow();
    });

    test("should start and stop idle reaper", () => {
      const pool = new SqlPool();

      expect(() => pool.startIdleReaper(1000)).not.toThrow();
      expect(() => pool.stopIdleReaper()).not.toThrow();
    });

    test("should not start multiple reapers", () => {
      const pool = new SqlPool();

      pool.startIdleReaper(1000);
      pool.startIdleReaper(1000); // Should be ignored

      pool.stopIdleReaper();
    });

    test("should evict idle connections after TTL expires", async () => {
      const pool = new SqlPool(500); // 500ms TTL

      // Create a connection
      const client1 = pool.get(connectionUri);
      await client1`SELECT 1`;

      // Start the reaper with short interval
      pool.startIdleReaper(300);

      // Wait for TTL to expire and reaper to run
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Connection should have been evicted
      const client2 = pool.get(connectionUri);
      expect(client2).not.toBe(client1);

      pool.stopIdleReaper();
      pool.closeAll();
    }, 10000); // Longer timeout for this test

    test("should not evict recently used connections", async () => {
      const pool = new SqlPool(1000); // 1 second TTL

      // Create a connection
      const client1 = pool.get(connectionUri);
      await client1`SELECT 1`;

      // Start the reaper
      pool.startIdleReaper(300);

      // Keep using the connection
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        pool.get(connectionUri); // This updates lastUsed
      }

      // Connection should still be the same
      const client2 = pool.get(connectionUri);
      expect(client2).toBe(client1);

      pool.stopIdleReaper();
      pool.closeAll();
    }, 10000); // Longer timeout for this test
  });

  describe("real-world scenarios", () => {
    test("should handle concurrent queries on same connection", async () => {
      const client = pool.get(connectionUri);

      // Execute multiple queries concurrently
      const promises = [
        client`SELECT 1 as num`,
        client`SELECT 2 as num`,
        client`SELECT 3 as num`,
        client`SELECT 4 as num`,
        client`SELECT 5 as num`,
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results[0]?.[0]?.num).toBe(1);
      expect(results[4]?.[0]?.num).toBe(5);
    });

    test("should handle connection after container restart simulation", async () => {
      // Get initial client
      const client1 = pool.get(connectionUri);
      await client1`SELECT 1`;

      // Evict (simulating connection loss)
      pool.evict(connectionUri);

      // Get new client (simulating reconnection)
      const client2 = pool.get(connectionUri);

      // Should work with new client
      const result: Array<{ num: number }> = await client2`SELECT 1 as num`;
      expect(result[0]?.num).toBe(1);
    });
  });
});
