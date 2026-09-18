import assert from "node:assert/strict";

/**
 * LifeOS Test Harness & Diagnostic Assertion Utilities
 */
export class TestHarness {
  /**
   * Asserts that a promise rejects with an error matching expected message or pattern.
   */
  static async assertRejects(fn: () => Promise<any>, expectedErrorPattern?: RegExp | string): Promise<void> {
    let threw = false;
    try {
      await fn();
    } catch (err: any) {
      threw = true;
      if (expectedErrorPattern) {
        const msg = err?.message || String(err);
        if (typeof expectedErrorPattern === "string") {
          assert.ok(
            msg.includes(expectedErrorPattern),
            `Expected error to contain "${expectedErrorPattern}", got "${msg}"`
          );
        } else {
          assert.match(msg, expectedErrorPattern);
        }
      }
    }
    assert.ok(threw, "Expected function to throw an error, but it succeeded.");
  }

  /**
   * Simulates an unexpected process crash or memory leak boundary.
   */
  static simulateCrash(message: string = "Simulated Process Crash"): never {
    throw new Error(`[CRASH_SIMULATION]: ${message}`);
  }

  /**
   * Deep object freeze helper for verifying immutability.
   */
  static deepFreeze<T>(obj: T): Readonly<T> {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const val = (obj as any)[prop];
      if (val !== null && (typeof val === "object" || typeof val === "function") && !Object.isFrozen(val)) {
        TestHarness.deepFreeze(val);
      }
    });
    return obj;
  }
}
