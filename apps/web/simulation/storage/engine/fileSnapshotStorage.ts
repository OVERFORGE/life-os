/**
 * FileSnapshotStorage — Deterministic Disk Persistence Implementation
 *
 * Implements ISnapshotStorage. Persists pre-serialized snapshot string bytes cleanly
 * into structured filesystem directories (<baseDir>/<runUid>/Day<N>/<snapshotId>.json).
 * Storage provider NEVER owns or invokes serialization logic.
 */

import * as fs from "fs";
import * as path from "path";
import { ISnapshotStorage } from "../contracts/ISnapshotStorage";
import { SimulationSnapshot } from "../contracts/snapshotStorageContracts";

export class FileSnapshotStorage implements ISnapshotStorage {
  private baseDir: string;

  constructor(baseDir: string = path.join(process.cwd(), "simulation_snapshots")) {
    this.baseDir = baseDir;
  }

  public save(snapshot: SimulationSnapshot, serializedContent: string): void {
    const dayFolder = path.join(this.baseDir, snapshot.runUid, `Day${snapshot.virtualDay}`);

    if (!fs.existsSync(dayFolder)) {
      fs.mkdirSync(dayFolder, { recursive: true });
    }

    const filePath = path.join(dayFolder, `${snapshot.snapshotId}.json`);
    fs.writeFileSync(filePath, serializedContent, "utf8");
  }
}
