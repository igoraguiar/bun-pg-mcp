import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import * as fsSync from "fs";

export function resolveConfigPath(customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  const DEFAULT_CONFIG_PATH = path.join(
    process.env.HOME || "",
    ".config",
    "pg-mcp",
    "config.json"
  );

  const configPath = process.env.PG_MCP_CONFIG_PATH || DEFAULT_CONFIG_PATH;
  return configPath;
}

export const DbEntrySchema = z.object({
  url: z.string(),
  ttl: z.number().min(0).default(60000),
});

export type DbEntry = z.infer<typeof DbEntrySchema>;

export const ConfigSchema = z.object({
  databases: z.record(DbEntrySchema),
  autoReload: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private watcher: fsSync.FSWatcher | null = null;
  private reloadCallback: ((config: Config) => void) | null = null;
  private DEBOUNCE_MS = 100;
  private reloadTimer: NodeJS.Timeout | null = null;

  constructor(
    private configPath: string | (() => string) = resolveConfigPath
  ) {}

  /**
   * Returns the configuration file path
   */
  getConfigPath(): string {
    return typeof this.configPath === "string"
      ? this.configPath
      : this.configPath();
  }

  /**
   * Ensures the configuration folder exists
   */
  private async ensureConfigFolderExists(): Promise<void> {
    await fs.mkdir(path.dirname(this.getConfigPath()), { recursive: true });
  }

  /**
   * Loads the configuration from file
   */
  async loadConfig(): Promise<Config | null> {
    try {
      const data = await fs.readFile(this.getConfigPath(), "utf8");
      const parsed = JSON.parse(data);
      const result = ConfigSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(
          "Invalid config: " + JSON.stringify(result.error.issues)
        );
      }
      return result.data;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // File not found
        // Migration logic: check POSTGRES_URL
        const pgUrl = process.env.POSTGRES_URL;

        // Parse the URL
        try {
          const dbEntry = pgUrl
            ? {
                url: pgUrl,
                ttl: 60000,
              }
            : null;
          const config: Config = {
            databases: dbEntry ? { default: dbEntry } : {},
            autoReload: true,
          };
          await this.saveConfig(config);
          return config;
        } catch (parseErr) {
          throw new Error(`Failed to create default config: ${parseErr}`, {
            cause: parseErr,
          });
        }
      }
      throw new Error(`Failed to load config: ${err.message}`);
    }
  }

  /**
   * Saves the configuration to file
   */
  async saveConfig(config: Config): Promise<void> {
    // Validate before saving
    const result = ConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error("Invalid config: " + JSON.stringify(result.error.issues));
    }
    const tmpPath = this.getConfigPath() + ".tmp";
    try {
      await this.ensureConfigFolderExists();
      await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf8");
      await fs.rename(tmpPath, this.getConfigPath());
    } catch (err: any) {
      throw new Error(`Failed to save config: ${err.message}`);
    }
  }

  /**
   * Adds a new database to the configuration
   */
  async addDatabase(name: string, dbConfig: DbEntry): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error("Config file not found");
    }
    if (config.databases[name]) {
      throw new Error(`Database name '${name}' already exists`);
    }
    const result = DbEntrySchema.safeParse(dbConfig);
    if (!result.success) {
      throw new Error(
        "Invalid database config: " + JSON.stringify(result.error.issues)
      );
    }
    config.databases[name] = result.data;
    await this.saveConfig(config);
  }

  /**
   * Updates an existing database configuration
   */
  async updateDatabase(name: string, update: Partial<DbEntry>): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error("Config file not found");
    }
    if (!config.databases[name]) {
      throw new Error(`Database name '${name}' not found`);
    }
    const updated = { ...config.databases[name], ...update };
    const result = DbEntrySchema.safeParse(updated);
    if (!result.success) {
      throw new Error(
        "Invalid updated database config: " +
          JSON.stringify(result.error.issues)
      );
    }
    config.databases[name] = result.data;
    await this.saveConfig(config);
  }

  /**
   * Removes a database from the configuration
   */
  async removeDatabase(name: string): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error("Config file not found");
    }
    if (!config.databases[name]) {
      throw new Error(`Database name '${name}' not found`);
    }
    delete config.databases[name];
    await this.saveConfig(config);
  }

  /**
   * Gets a specific database configuration
   */
  async getConfig(name: string): Promise<DbEntry> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error("Config file not found");
    }
    const db = config.databases[name];
    if (!db) {
      const knownDatabases = Object.keys(config.databases);
      if (knownDatabases.length === 0) {
        throw new Error(
          "No databases are configured. Please add a database configuration first."
        );
      }
      throw new Error(
        `Database '${name}' not found. Available databases: ${knownDatabases.join(
          ", "
        )}`
      );
    }
    const result = DbEntrySchema.safeParse(db);
    if (!result.success) {
      throw new Error(
        "Invalid database config: " + JSON.stringify(result.error.issues)
      );
    }
    return result.data;
  }

  /**
   * Lists all database configurations
   */
  async listDatabases(): Promise<DbEntry[]> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error("Config file not found");
    }
    return Object.values(config.databases).map((db) => {
      const result = DbEntrySchema.safeParse(db);
      if (!result.success) {
        throw new Error(
          "Invalid database config: " + JSON.stringify(result.error.issues)
        );
      }
      return result.data;
    });
  }

  async getDatabase(name: string): Promise<DbEntry | null> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error("Config file not found");
    }
    const db = config.databases[name];
    if (!db) {
      return null;
    }
    const result = DbEntrySchema.safeParse(db);
    if (!result.success) {
      throw new Error(
        "Invalid database config: " + JSON.stringify(result.error.issues)
      );
    }
    return result.data;
  }

  /**
   * Starts watching the configuration file for changes
   * @param callback Function to call when config changes and autoReload is enabled
   */
  startWatching(callback: (config: Config) => void): void {
    // Stop any existing watcher
    this.stopWatching();

    // Set the callback
    this.reloadCallback = callback;

    // Create new watcher
    this.watcher = fsSync.watch(
      this.getConfigPath(),
      (_eventType, _filename) => {
        // Debounce and handle change events
        if (this.reloadTimer) {
          clearTimeout(this.reloadTimer);
        }

        this.reloadTimer = setTimeout(async () => {
          try {
            const newConfig = await this.loadConfig();
            // Only call callback when autoReload flag is true
            if (newConfig?.autoReload && this.reloadCallback) {
              this.reloadCallback(newConfig);
            }
          } catch {
            console.error(
              "Auto-reload error: Configuration file could not be reloaded"
            );
          }
        }, this.DEBOUNCE_MS);
      }
    );
  }

  /**
   * Stops watching the configuration file
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    this.reloadCallback = null;
  }
}

// Export the class as well for new usage
// (ConfigManager is already exported above)
