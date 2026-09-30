import test from "node:test";
import assert from "node:assert/strict";
import { CredentialVault } from "../shared/CredentialVault";

test("CredentialVault: Encrypts and decrypts with AES-256-GCM round-trip", () => {
  const secret = "44d9adb29db34bc581a1f24e8cbe974b_super_secret_spotify_key";
  const encrypted = CredentialVault.encrypt(secret);

  assert.ok(encrypted.startsWith("enc:v1:"), "Must use versioned vault prefix");
  assert.notEqual(encrypted, secret, "Ciphertext must not match plaintext");

  const decrypted = CredentialVault.decrypt(encrypted);
  assert.equal(decrypted, secret, "Decrypted text must match original secret exactly");
});

test("CredentialVault: Generates unique IVs and ciphertexts for identical inputs", () => {
  const secret = "identical_secret";
  const enc1 = CredentialVault.encrypt(secret);
  const enc2 = CredentialVault.encrypt(secret);

  assert.notEqual(enc1, enc2, "Each encryption must use a randomized initialization vector");
  assert.equal(CredentialVault.decrypt(enc1), secret);
  assert.equal(CredentialVault.decrypt(enc2), secret);
});

test("CredentialVault: Detects tampering and rejects modified ciphertext", () => {
  const secret = "tamper_test_secret";
  const encrypted = CredentialVault.encrypt(secret);

  // Tamper with the last character of ciphertext
  const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === "a" ? "b" : "a");

  assert.throws(
    () => CredentialVault.decrypt(tampered),
    /integrity check failed/,
    "Tampered ciphertext must fail GCM authentication tag verification"
  );
});

test("CredentialVault: Transparently handles unencrypted legacy text", () => {
  const legacy = "plain_legacy_token_12345";
  const result = CredentialVault.decrypt(legacy);
  assert.equal(result, legacy, "Legacy unencrypted tokens must pass through gracefully");
});

test("CredentialVault: Encrypts sensitive preference keys while preserving non-sensitive metadata", () => {
  const prefs = {
    clientId: "44d9adb29db34bc581a1f24e8cbe974b",
    clientSecret: "spotify_secret_99999",
    refreshToken: "spotify_refresh_token_88888",
    defaultPlaylist: "Ambient Focus",
  };

  const encryptedPrefs = CredentialVault.encryptPreferences(prefs);

  assert.equal(encryptedPrefs.clientId, prefs.clientId, "Client ID is non-sensitive and should not be encrypted");
  assert.equal(encryptedPrefs.defaultPlaylist, prefs.defaultPlaylist, "Default playlist should not be encrypted");
  assert.ok(encryptedPrefs.clientSecret.startsWith("enc:v1:"), "Client Secret must be encrypted");
  assert.ok(encryptedPrefs.refreshToken.startsWith("enc:v1:"), "Refresh Token must be encrypted");

  const decryptedPrefs = CredentialVault.decryptPreferences(encryptedPrefs);
  assert.equal(decryptedPrefs.clientSecret, prefs.clientSecret);
  assert.equal(decryptedPrefs.refreshToken, prefs.refreshToken);
});

test("CredentialVault: Sanitizes client response and prevents secret leakage", () => {
  const prefs = {
    clientId: "44d9adb29db34bc581a1f24e8cbe974b",
    clientSecret: CredentialVault.encrypt("spotify_secret_99999"),
    refreshToken: CredentialVault.encrypt("spotify_refresh_token_88888"),
    defaultPlaylist: "Ambient Focus",
  };

  const sanitized = CredentialVault.sanitizePreferencesForClient(prefs);

  assert.equal(sanitized.clientId, "44d9adb29db34bc581a1f24e8cbe974b");
  assert.equal(sanitized.hasClientSecret, "true");
  assert.equal(sanitized.clientSecret, "••••••••••••••••", "Secret must be masked");
  assert.equal(sanitized.refreshToken, undefined, "Refresh token must never be sent to browser");
  assert.equal(sanitized.defaultPlaylist, "Ambient Focus");
});
