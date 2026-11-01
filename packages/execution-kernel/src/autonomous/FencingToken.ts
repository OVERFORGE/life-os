/**
 * FencingToken.ts
 * 
 * Milestone B — Phase B4: Work Package 2 / Loop 3
 * Distributed Monotonic Fencing Token Specification & Verification
 */

export interface FencingToken {
  epoch: number;
  workerId: string;
  token: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export function formatFencingTokenString(epoch: number, workerId: string): string {
  return `epoch:${epoch}:worker:${workerId}`;
}

export function parseFencingTokenString(raw: string): { epoch: number; workerId: string } | null {
  if (!raw) return null;
  const match = raw.match(/^epoch:(\d+):worker:(.+)$/);
  if (!match) return null;
  return {
    epoch: parseInt(match[1], 10),
    workerId: match[2],
  };
}

export function createFencingToken(
  epoch: number,
  workerId: string,
  acquiredAt: Date | string,
  expiresAt: Date | string
): FencingToken {
  return {
    epoch,
    workerId,
    token: formatFencingTokenString(epoch, workerId),
    acquiredAt: acquiredAt instanceof Date ? acquiredAt : new Date(acquiredAt),
    expiresAt: expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
  };
}

export function isFencingTokenActive(token: FencingToken, now: Date = new Date()): boolean {
  const expiresMs = token.expiresAt instanceof Date ? token.expiresAt.getTime() : new Date(token.expiresAt).getTime();
  return now.getTime() < expiresMs;
}

/**
 * Validate fencing against aggregate mutationEpoch and active lease epoch.
 * Invariant: token.epoch must be strictly >= aggregate.mutationEpoch.
 */
export function validateFencingEpoch(
  token: FencingToken,
  aggregateEpoch: number
): { valid: boolean; reason?: string } {
  if (token.epoch < aggregateEpoch) {
    return {
      valid: false,
      reason: `Stale fencing token epoch ${token.epoch} is superseded by aggregate epoch ${aggregateEpoch}`,
    };
  }
  return { valid: true };
}
