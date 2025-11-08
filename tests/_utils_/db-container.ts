import { $ } from "bun";

interface ContainerOptions {
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  port?: number;
  containerName?: string;
}

interface ContainerInstance {
  connectionString: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  cleanup: () => Promise<void>;
}

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  try {
    const result = await $`lsof -nP -iTCP:${port} -sTCP:LISTEN`.quiet();
    // If command succeeds and has output, port is in use
    return result.stdout.toString().trim().length > 0;
  } catch {
    // If lsof fails or returns nothing, port is available
    return false;
  }
}

/**
 * Find an available port starting from a given port
 */
async function findAvailablePort(startPort: number = 5433): Promise<number> {
  let port = startPort;
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (!(await isPortInUse(port))) {
      return port;
    }
    port++;
    attempts++;
  }

  throw new Error(
    `Could not find available port after ${maxAttempts} attempts`
  );
}

/**
 * Start a PostgreSQL container for testing
 * Returns connection details and cleanup function
 */
export async function startPostgresContainer(
  options: ContainerOptions = {}
): Promise<ContainerInstance> {
  const {
    image = "postgres:16-alpine",
    database = "test_db",
    username = "test_user",
    password = "test_pass",
    containerName = `bun-test-postgres-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`,
  } = options;

  // Find available port if not specified
  // Use a random starting port to reduce collision probability
  const startPort = options.port ?? 5433 + Math.floor(Math.random() * 1000);
  const port = options.port ?? (await findAvailablePort(startPort));

  console.log(`Starting PostgreSQL container on port ${port}...`);

  // Stop any existing container with same name
  await $`docker rm -f ${containerName}`.quiet().nothrow();

  // Start container
  await $`docker run -d \
    --name ${containerName} \
    -e POSTGRES_DB=${database} \
    -e POSTGRES_USER=${username} \
    -e POSTGRES_PASSWORD=${password} \
    -p ${port}:5432 \
    --tmpfs /var/lib/postgresql/data \
    ${image}`;

  // Wait for PostgreSQL to be ready
  console.log("Waiting for PostgreSQL to be ready...");
  let ready = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!ready && attempts < maxAttempts) {
    try {
      await $`docker exec ${containerName} pg_isready -U ${username}`.quiet();
      ready = true;
    } catch {
      await Bun.sleep(500);
      attempts++;
    }
  }

  if (!ready) {
    await $`docker rm -f ${containerName}`.nothrow();
    throw new Error("PostgreSQL failed to become ready in time");
  }

  console.log(`PostgreSQL ready on port ${port}`);

  const cleanup = async () => {
    console.log(`Stopping container ${containerName}...`);
    await $`docker rm -f ${containerName}`.quiet().nothrow();
  };

  // Register cleanup on process exit
  const exitHandler = async () => {
    await cleanup();
    process.exit();
  };

  process.on("SIGINT", exitHandler);
  process.on("SIGTERM", exitHandler);
  process.on("exit", () => {
    // Synchronous cleanup on normal exit
    Bun.spawn(["docker", "rm", "-f", containerName]);
  });

  const connectionString = `postgres://${username}:${password}@localhost:${port}/${database}`;

  return {
    connectionString,
    host: "localhost",
    port,
    database,
    username,
    password,
    cleanup,
  };
}
