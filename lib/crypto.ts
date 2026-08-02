// =============================================================================
// Symmetric encryption for secrets stored at rest (LLM API keys).
//
// Keys are encrypted with AES-256-GCM using a key derived from AUTH_SECRET
// (already required, persisted in Docker at data/.auth_secret). The plaintext
// key is NEVER stored and NEVER returned to the browser — only the ciphertext
// lives in the DB, and it is decrypted server-side only when a request is made.
//
// If AUTH_SECRET changes, previously stored ciphertext can no longer be
// decrypted: safeDecrypt() returns "" and the caller treats the key as unset
// (the admin just re-enters it on the settings page).
// =============================================================================
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";

function derdKey(): Buffer {
  const secret = process.env.AUTH_SECRET || "";
  // sha256(secret) -> 32-byte key. AUTH_SECRET is high-entropy already.
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a UTF-8 string to a compact base64 blob (iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, derdKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a blob produced by encryptSecret. Throws on tamper/wrong key. */
export function decryptSecret(enc: string): string {
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, derdKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Decrypt but never throw — returns "" when the blob can't be read. */
export function safeDecrypt(enc: string | null | undefined): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    return "";
  }
}
