/**
 * RealityTestHarness.ts
 * Real-system testing harness executing operations against real MongoDB.
 * Replaces mock-heavy false confidence with database state assertions.
 * Part of Phase 0 Reality Baseline.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

// Load root .env if not already loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });


export interface IRealityTestContext {
  userId: string;
  executionId: string;
}

export class RealityTestHarness {
  private isConnected: boolean = false;
  private defaultUri: string;

  constructor(customUri?: string) {
    this.defaultUri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/life-os-test';
  }

  public async connect(): Promise<void> {
    if (this.isConnected || mongoose.connection.readyState === 1) {
      this.isConnected = true;
      return;
    }

    try {
      await mongoose.connect(this.defaultUri, {
        serverSelectionTimeoutMS: 5000,
      });
      this.isConnected = true;
    } catch (err: any) {
      console.warn(`[RealityTestHarness] MongoDB connection warning: ${err.message}. Ensure MongoDB is accessible.`);
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
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
