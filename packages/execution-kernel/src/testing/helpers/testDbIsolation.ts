import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export const FORBIDDEN_TEST_DB_NAMES: ReadonlySet<string> = new Set([
  "life-os",
  "life_os",
  "prod",
  "production",
  "admin",
  "local",
  "config",
]);

export const DEFAULT_ISOLATED_TEST_DB_NAME = "life-os-stage0-test";

let activeReplSet: MongoMemoryReplSet | null = null;
let activeIsMemoryServer = false;

export function extractDbNameFromUri(uri: string): string {
  if (!uri || typeof uri !== "string") return "";
  try {
    const sanitized = uri.trim().replace(/^mongodb(\+srv)?:\/\/[^@]+@/, "mongodb://");
    const parsed = new URL(sanitized);
    return (parsed.pathname || "/").replace(/^\//, "").trim();
  } catch {
    return "";
  }
}

export function sanitizeUriForLogs(uri: string): string {
  if (!uri) return "<unset>";
  return uri.replace(/\/\/([^:@]+):([^@]+)@/, "//<redacted>@");
}

export function assertSafeTestDatabase(uri: string, explicitDbName?: string): string {
  if (!uri || !uri.trim()) {
    throw new Error(
      "[UNSAFE_TEST_DATABASE_ERROR]: Test database URI is empty. Set TEST_MONGODB_URI or use isolated MongoMemoryReplSet."
    );
  }
  const dbName = (explicitDbName || extractDbNameFromUri(uri) || "").trim();
  if (!dbName) {
    throw new Error(
      `[UNSAFE_TEST_DATABASE_ERROR]: Could not determine database name from URI (${sanitizeUriForLogs(uri)}). Refusing to connect.`
    );
  }
  if (FORBIDDEN_TEST_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `[UNSAFE_TEST_DATABASE_ERROR]: Refusing to connect test suite to protected/production database "${dbName}".`
    );
  }
  return dbName;
}

export interface IsolatedDbConnectionResult {
  uri: string;
  dbName: string;
  isMemoryServer: boolean;
}

/**
 * Connects Mongoose to an isolated test database (never live `life-os`).
 * Uses TEST_MONGODB_URI when explicitly provided (validated against forbidden DB names),
 * otherwise boots an ephemeral local MongoMemoryReplSet supporting transactions & indexes.
 */
export async function connectIsolatedTestDB(options?: {
  dbName?: string;
  serverSelectionTimeoutMS?: number;
  useMemoryReplSet?: boolean;
}): Promise<IsolatedDbConnectionResult> {
  const requestedDbName = options?.dbName || DEFAULT_ISOLATED_TEST_DB_NAME;
  const envTestUri = (process.env.TEST_MONGODB_URI || "").trim();
  const forceMemory = options?.useMemoryReplSet ?? (!envTestUri || process.env.USE_MEMORY_REPLSET === "true");

  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    const currentDb = mongoose.connection.db.databaseName;
    if (FORBIDDEN_TEST_DB_NAMES.has(currentDb.toLowerCase())) {
      await mongoose.disconnect();
      throw new Error(
        `[UNSAFE_TEST_DATABASE_ERROR]: Active connection points to protected database "${currentDb}". Disconnected immediately.`
      );
    }
    return {
      uri: envTestUri || "mongodb-memory-server://active",
      dbName: currentDb,
      isMemoryServer: activeIsMemoryServer,
    };
  }

  let targetUri = envTestUri;
  let targetDbName = requestedDbName;

  if (forceMemory) {
    if (!activeReplSet) {
      activeReplSet = await MongoMemoryReplSet.create({
        replSet: {
          count: 1,
          dbName: requestedDbName,
        },
      });
    }
    targetUri = activeReplSet.getUri(requestedDbName);
    targetDbName = requestedDbName;
    activeIsMemoryServer = true;
  } else {
    targetDbName = assertSafeTestDatabase(targetUri, options?.dbName);
    activeIsMemoryServer = false;
  }

  assertSafeTestDatabase(targetUri, targetDbName);

  await mongoose.connect(targetUri, {
    dbName: targetDbName,
    bufferCommands: false,
    serverSelectionTimeoutMS: options?.serverSelectionTimeoutMS ?? 5000,
  });

  const actualDbName = mongoose.connection.db?.databaseName || "";
  if (FORBIDDEN_TEST_DB_NAMES.has(actualDbName.toLowerCase())) {
    await mongoose.disconnect();
    throw new Error(
      `[UNSAFE_TEST_DATABASE_ERROR]: Connected database "${actualDbName}" is forbidden for tests.`
    );
  }

  return {
    uri: sanitizeUriForLogs(targetUri),
    dbName: actualDbName,
    isMemoryServer: activeIsMemoryServer,
  };
}

export async function disconnectIsolatedTestDB(options?: { dropDatabase?: boolean }): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      const dbName = mongoose.connection.db?.databaseName || "";
      if (options?.dropDatabase && !FORBIDDEN_TEST_DB_NAMES.has(dbName.toLowerCase()) && dbName.includes("test")) {
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
    }
  } finally {
    if (activeReplSet) {
      await activeReplSet.stop();
      activeReplSet = null;
      activeIsMemoryServer = false;
    }
  }
}
