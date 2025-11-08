import { SQL } from "bun";
import { expect, test } from "bun:test";
import { startPostgresContainer } from "./_utils_/db-container";

test("simple testcontainers test", async () => {
  console.log("Starting container...");

  // Disable Ryuk if it's causing issues
  process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

  const { connectionString, cleanup } = await startPostgresContainer();

  console.log("Container started");
  console.log("Connection URI:", connectionString);

  const pg = new SQL(connectionString);

  console.log("Testing connection...");
  const result: Array<{ num: number }> = await pg`SELECT 1 as num`;

  expect(result[0]?.num).toBe(1);

  await pg.end();
  await cleanup();

  console.log("Test complete");
}, 180000);
