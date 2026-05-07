import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TOKEN_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64).toString("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = Buffer.from(derived, "hex");

  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, derivedBuffer);
}

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
