import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { SettingsDTO } from "../dto/SettingsDTO";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

/**
 * SettingsDTOMapper Projection Mapper (Phase C5 Constitutional Compliance)
 * 
 * SOLE CONSTITUTIONAL PROJECTION LAYER for Settings DTOs.
 * Implements IKernelProjectionMapper<SettingsDTO> for pure, read-only transformations.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY from KernelSnapshot metadata & configuration sources.
 * - NEVER fabricates default preference values (returns empty preferences object if unobserved).
 * - NEVER executes engines or computes business logic.
 * - Deeply freezes returned DTO object.
 */
export class SettingsDTOMapper implements IKernelProjectionMapper<SettingsDTO> {
  private static instance: SettingsDTOMapper;

  static getInstance(): SettingsDTOMapper {
    if (!SettingsDTOMapper.instance) {
      SettingsDTOMapper.instance = new SettingsDTOMapper();
    }
    return SettingsDTOMapper.instance;
  }

  /**
   * Canonical Implementation of IKernelProjectionMapper
   */
  project(snapshot: KernelSnapshot): Readonly<SettingsDTO> {
    return SettingsDTOMapper.fromKernelSnapshot(snapshot);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ SettingsDTO
   */
  static fromKernelSnapshot(snapshot: KernelSnapshot): Readonly<SettingsDTO> {
    const metadata = snapshot.metadata;

    return Object.freeze({
      schemaVersion: 1,
      userId: snapshot.userId,
      kernelVersion: metadata.kernelVersion,
      telemetryVersion: metadata.telemetryVersion,
      calibrationPackageId: metadata.calibration.weightPackageId,
      featureFlags: Object.freeze({ ...metadata.calibration.featureFlags }),
      preferences: Object.freeze({}),
      diagnosticsEnabled: snapshot.diagnostics.isSealed,
      timestamp: metadata.generationTimestamp,
    });
  }
}
