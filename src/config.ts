export async function removeDatabase(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("Config file not found");
  }
  const idx = config.databases.findIndex((db) => db.name === name);
  if (idx === -1) {
    throw new Error(`Database name '${name}' not found`);
  }
  config.databases.splice(idx, 1);
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
  const idx = config.databases.findIndex((db) => db.name === name);
  if (idx === -1) {
    throw new Error(`Database name '${name}' not found`);
  }
  const updated = { ...config.databases[idx], ...update, name };
  const result = DbEntrySchema.safeParse(updated);
  if (!result.success) {
    throw new Error(
      "Invalid updated database config: " + JSON.stringify(result.error.issues)
    );
  }
  config.databases[idx] = result.data;
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
  if (config.databases.some((db) => db.name === name)) {
    throw new Error(`Database name '${name}' already exists`);
  }
  const result = DbEntrySchema.safeParse(dbConfig);
  if (!result.success) {
    throw new Error(
      "Invalid database config: " + JSON.stringify(result.error.issues)
    );
  }
  config.databases.push({ ...result.data, name });
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
const CONFIG_PATH = process.env.PG_MCP_CONFIG_PATH || DEFAULT_CONFIG_PATH;

// DbEntry type and schema
export type DbEntry = {
  name: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean;
  url?: string;
};

export const DbEntrySchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number().int().min(1),
  user: z.string(),
  password: z.string().optional(),
  database: z.string(),
  ssl: z.boolean().optional(),
  url: z.string().url().optional(),
});

// Config type and schema
export type Config = {
  databases: DbEntry[];
};

export const ConfigSchema = z.object({
  databases: z.array(DbEntrySchema),
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
          const parsedUrl = new URL(pgUrl);
          const user = parsedUrl.username;
          const password = parsedUrl.password;
          const dbEntry: DbEntry = {
            name: "default",
            host: parsedUrl.hostname,
            port: Number(parsedUrl.port) || 5432,
            user: user,
            password: password || undefined,
            database: parsedUrl.pathname.replace(/^\//, ""),
            ssl: parsedUrl.searchParams.get("ssl") === "true",
            url: pgUrl,
          };
          const config: Config = { databases: [dbEntry] };
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
  const db = config.databases.find((d) => d.name === name);
  if (!db) {
    throw new Error(`Database config '${name}' not found`);
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
  return config.databases.map((db) => {
    const result = DbEntrySchema.safeParse(db);
    if (!result.success) {
      throw new Error(
        "Invalid database config: " + JSON.stringify(result.error.issues)
      );
    }
    return result.data;
  });
}
