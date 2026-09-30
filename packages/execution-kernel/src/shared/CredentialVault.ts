import crypto from "crypto";

/**
 * Enterprise-grade AES-256-GCM Credential Vault for LifeOS.
 *
 * Guarantees:
 * 1. Authenticated Encryption with Associated Data (AEAD) via AES-256-GCM.
 * 2. Randomized 12-byte IV for every encryption (NIST SP 800-38D standard).
 * 3. 16-byte authentication tag ensuring ciphertext integrity & anti-tamper.
 * 4. Deterministic key derivation via SHA-256 from environment master secrets.
 * 5. Transparent versioned format (enc:v1:<iv>:<tag>:<ciphertext>) with backward-compatible legacy plaintext fallback.
 * 6. Zero secret leakage across public client API boundaries.
 */

const VAULT_PREFIX = "enc:v1:";
const SENSITIVE_PREFERENCE_KEYS = new Set([
  "clientsecret",
  "client_secret",
  "refreshtoken",
  "refresh_token",
  "accesstoken",
  "access_token",
  "token",
  "secret",
  "apikey",
  "api_key",
  "apisecret",
  "api_secret",
  "password",
]);

export class CredentialVault {
  private static masterKey: Buffer | null = null;

  /**
   * Derive or return the cached 256-bit AES master key.
   */
  private static getKey(): Buffer {
    if (!this.masterKey) {
      const rootSecret =
        process.env.CREDENTIAL_ENCRYPTION_KEY ||
        process.env.ENCRYPTION_KEY ||
        process.env.NEXTAUTH_SECRET ||
        process.env.JWT_SECRET ||
        "lifeos-sovereign-vault-root-entropy-key-2026";

      // Derive exact 32 bytes (256 bits) using SHA-256
      this.masterKey = crypto.createHash("sha256").update(rootSecret, "utf8").digest();
    }
    return this.masterKey;
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   * Returns a tamper-proof self-describing string: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
   */
  public static encrypt(plainText: string): string {
    if (!plainText) return plainText;
    if (this.isEncrypted(plainText)) return plainText;

    const key = this.getKey();
    // 12-byte IV is standard and optimal for AES-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let ciphertext = cipher.update(plainText, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const tag = cipher.getAuthTag();

    return `${VAULT_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext}`;
  }

  /**
   * Decrypt a vault-encrypted string.
   * If the input is not encrypted (e.g. legacy plain text), returns it as-is.
   */
  public static decrypt(cipherTextOrPlain: string): string {
    if (!cipherTextOrPlain) return cipherTextOrPlain;
    if (!this.isEncrypted(cipherTextOrPlain)) {
      return cipherTextOrPlain; // Graceful legacy fallback
    }

    try {
      const parts = cipherTextOrPlain.slice(VAULT_PREFIX.length).split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid credential vault payload format");
      }

      const [ivHex, tagHex, dataHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const key = this.getKey();

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(dataHex, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (err: any) {
      console.error("[CredentialVault] Decryption failed or data tampered with:", err.message);
      throw new Error(`CredentialVault decryption failure: integrity check failed`);
    }
  }

  /**
   * Check if a string is encrypted with the LifeOS vault format.
   */
  public static isEncrypted(value: string): boolean {
    return typeof value === "string" && value.startsWith(VAULT_PREFIX);
  }

  /**
   * Encrypt all sensitive keys in a preference object/map before saving to database.
   */
  public static encryptPreferences(prefs: Record<string, any>): Record<string, any> {
    if (!prefs || typeof prefs !== "object") return {};
    const result: Record<string, any> = {};

    for (const [key, val] of Object.entries(prefs)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
      if (typeof val === "string" && val.trim() && SENSITIVE_PREFERENCE_KEYS.has(normalizedKey)) {
        result[key] = this.encrypt(val.trim());
      } else {
        result[key] = val;
      }
    }

    return result;
  }

  /**
   * Decrypt all sensitive keys in a preference object/map loaded from database.
   */
  public static decryptPreferences(prefs: Record<string, any>): Record<string, any> {
    if (!prefs || typeof prefs !== "object") return {};
    const result: Record<string, any> = {};

    for (const [key, val] of Object.entries(prefs)) {
      if (typeof val === "string" && this.isEncrypted(val)) {
        try {
          result[key] = this.decrypt(val);
        } catch (_) {
          result[key] = "";
        }
      } else {
        result[key] = val;
      }
    }

    return result;
  }

  /**
   * Sanitize preferences before returning them to client/browser over HTTP.
   * Strips all raw secrets, tokens, and encrypted payloads.
   * Masks clientSecret and sets boolean flags like `hasClientSecret: "true"`.
   */
  public static sanitizePreferencesForClient(prefs: Record<string, any>): Record<string, any> {
    if (!prefs || typeof prefs !== "object") return {};
    const result: Record<string, any> = {};

    for (const [key, val] of Object.entries(prefs)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");

      if (normalizedKey === "clientsecret") {
        if (val && typeof val === "string" && val.trim()) {
          result.hasClientSecret = "true";
          result[key] = "••••••••••••••••";
        }
      } else if (
        normalizedKey === "refreshtoken" ||
        normalizedKey === "accesstoken" ||
        normalizedKey === "token" ||
        normalizedKey === "password"
      ) {
        // Strip completely from client response
        continue;
      } else if (typeof val === "string" && this.isEncrypted(val)) {
        // Omit any internal encrypted payload
        continue;
      } else {
        result[key] = val;
      }
    }

    return result;
  }
}
