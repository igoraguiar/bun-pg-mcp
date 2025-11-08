// SqlPool class for managing Bun SQL clients
import { SQL } from "bun";
import type { Config } from "./config";

interface PoolEntry {
  client: SQL;
  lastUsed: number;
}

export class SqlPool {
  private reaperInterval: NodeJS.Timeout | null = null;
  private ttl: number;

  /**
   * @param ttlMs Time To Live for idle connections in milliseconds (default: 60000)
   */
  constructor(ttlMs: number = 60000) {
    this.ttl = ttlMs;
  }

  setTTL(ttlMs: number): void {
    this.ttl = ttlMs;
  }

  startIdleReaper(intervalMs: number = 30000): void {
    if (this.reaperInterval) return;
    this.reaperInterval = setInterval(() => {
      const now = Date.now();
      for (const db in this.pool) {
        const entry = this.pool[db];
        if (entry && now - entry.lastUsed > this.ttl) {
          this.evict(db);
        }
      }
    }, intervalMs);
  }

  stopIdleReaper(): void {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
  }
  private pool: Record<string, PoolEntry> = {};

  get(database: string): SQL {
    const now = Date.now();
    if (this.pool[database]) {
      this.pool[database].lastUsed = now;
      return this.pool[database].client;
    }
    // Replace with actual Bun SQL client creation logic
    const client = new SQL(database);
    this.pool[database] = { client, lastUsed: now };
    return client;
  }

  evict(database: string): void {
    const entry = this.pool[database];
    if (entry) {
      entry.client.end();
      delete this.pool[database];
    }
  }
  reconcile(newConfig: Config): void {
    const newDatabases = Object.values(newConfig.databases || {}).map(
      (db) => db.url
    );
    const currentDatabases = Object.keys(this.pool);
    // Evict databases not in newConfig
    for (const db of currentDatabases) {
      if (!newDatabases.includes(db)) {
        this.evict(db);
      }
    }
    // Add new databases
    for (const url of newDatabases) {
      if (!this.pool[url]) {
        this.get(url);
      }
    }
    // Optionally update connections if config changed (not implemented here)
  }

  closeAll(): void {
    for (const db in this.pool) {
      this.evict(db);
    }
    this.pool = {};
  }
}
