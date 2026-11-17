import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "crypto";
import { promisify } from "util";

/**
 * Password hashing with Node's built-in scrypt (no external dependency).
 * Stored format: scrypt$N$r$p$saltHex$hashHex
 */

const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hashHex] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * A throwaway hash used when the email is unknown, so the response time does
 * not reveal whether an account exists.
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-real-password");
  return dummyHash;
}
