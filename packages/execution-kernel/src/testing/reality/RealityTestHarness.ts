/**
 * RealityTestHarness.ts
 * Real-system testing harness executing operations against real MongoDB.
 * Replaces mock-heavy false confidence with database state assertions.
 * Part of Phase 0 Reality Baseline.
 */

import mongoose from 'mongoose';
import {
  assertSafeTestDatabase,
  connectIsolatedTestDB,
  disconnectIsolatedTestDB,
} from '../helpers/testDbIsolation';

export interface IRealityTestContext {
  userId: string;
  executionId: string;
}

export class RealityTestHarness {
  private isConnected: boolean = false;
  private customUri?: string;

  constructor(customUri?: string) {
    this.customUri = customUri;
  }

  public async connect(): Promise<void> {
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return;
    }

    if (this.customUri) {
      const dbName = assertSafeTestDatabase(this.customUri);
      await mongoose.connect(this.customUri, {
        dbName,
        bufferCommands: false,
        serverSelectionTimeoutMS: 5000,
      });
      this.isConnected = true;
      return;
    }

    await connectIsolatedTestDB({ serverSelectionTimeoutMS: 5000 });
    this.isConnected = true;
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected || mongoose.connection.readyState !== 0) {
      await disconnectIsolatedTestDB({ dropDatabase: false });
      this.isConnected = false;
    }
  }

  public async cleanUserData(userId: string): Promise<void> {
    if (!this.isConnected) await this.connect();
    const db = mongoose.connection.db;
    if (!db) return;

    const collections = await db.listCollections().toArray();
    for (const collInfo of collections) {
      const coll = db.collection(collInfo.name);
      try {
        await coll.deleteMany({ userId: { $in: [userId, new RegExp(`^${userId}`)] } });
      } catch {
        // Continue if collection does not support or index differs
      }
    }
  }

  public async assertDatabaseMutation(
    collectionName: string,
    filter: Record<string, unknown>,
    expectedFieldValues: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.isConnected) await this.connect();
    const db = mongoose.connection.db;
    if (!db) throw new Error('[RealityTestHarness] Database connection not initialized');

    const doc = await db.collection(collectionName).findOne(filter);
    if (!doc) {
      throw new Error(`[RealityTestHarness] Document not found in ${collectionName} for filter: ${JSON.stringify(filter)}`);
    }

    for (const [key, expectedVal] of Object.entries(expectedFieldValues)) {
      const actualVal = (doc as any)[key];
      if (actualVal !== expectedVal) {
        throw new Error(
          `[RealityTestHarness] State mismatch in ${collectionName}.${key}: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`
        );
      }
    }

    return true;
  }

  public getDb(): mongoose.mongo.Db {
    const db = mongoose.connection.db;
    if (!db) throw new Error('[RealityTestHarness] Database connection not initialized');
    return db;
  }
}
