export async function removeDatabase(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("Config file not found");
  }
  if (!config.databases[name]) {
    throw new Error(`Database name '${name}' not found`);
  }
  delete config.databases[name];
  await saveConfig(config);
}
export async function updateDatabase(
  name: string,
  update: Partial<DbEntry>
): Promise<void> {
  const config = await loadConfig();
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
      "Invalid updated database config: " + JSON.stringify(result.error.issues)
    );
  }
  config.databases[name] = result.data;
  await saveConfig(config);
}
export async function addDatabase(
  name: string,
  dbConfig: DbEntry
): Promise<void> {
  const config = await loadConfig();
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
  await saveConfig(config);
}
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

const DEFAULT_CONFIG_PATH = path.join(
  process.env.HOME || "",
  ".config",
  "pg-mcp",
  "config.json"
);
export const CONFIG_PATH =
  process.env.PG_MCP_CONFIG_PATH || DEFAULT_CONFIG_PATH;

export const DbEntrySchema = z.object({
  url: z.string().url(),
  ttl: z.number().min(0).default(60000),
});

export type DbEntry = z.infer<typeof DbEntrySchema>;

// Config type and schema
export type Config = {
  databases: Record<string, DbEntry>;
  /** Enable auto reload of config on file changes */
  autoReload?: boolean;
};

export const ConfigSchema = z.object({
  databases: z.record(DbEntrySchema),
  autoReload: z.boolean().default(false),
});

export async function saveConfig(config: Config): Promise<void> {
  // Validate before saving
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error("Invalid config: " + JSON.stringify(result.error.issues));
  }
  const tmpPath = CONFIG_PATH + ".tmp";
  try {
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf8");
    await fs.rename(tmpPath, CONFIG_PATH);
  } catch (err: any) {
    throw new Error(`Failed to save config: ${err.message}`);
  }
}

export async function loadConfig(): Promise<Config | null> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(data);
    const result = ConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("Invalid config: " + JSON.stringify(result.error.issues));
    }
    return result.data;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // File not found
      // Migration logic: check POSTGRES_URL
      const pgUrl = process.env.POSTGRES_URL;
      if (pgUrl) {
        // Parse the URL
        try {
          const dbEntry: DbEntry = {
            url: pgUrl,
            ttl: 60000,
          };
          const config: Config = { databases: { default: dbEntry } };
          await saveConfig(config);
          return config;
        } catch (parseErr) {
          throw new Error(`Failed to parse POSTGRES_URL: ${parseErr}`);
        }
      }
      return null;
    }
    throw new Error(`Failed to load config: ${err.message}`);
  }
}

export async function getConfig(name: string): Promise<DbEntry> {
  const config = await loadConfig();
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

export async function listDatabases(): Promise<DbEntry[]> {
  const config = await loadConfig();
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
