import crypto from 'node:crypto';

/**
 * Password hashing with scrypt (built into Node, no dependency).
 * Stored format: scrypt$<N>$<saltHex>$<hashHex>
 */
const KEYLEN = 64;
const COST = 16384; // scrypt N

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: COST });
  return `scrypt$${COST}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, costStr, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt') return false;

  const N = parseInt(costStr, 10);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  let actual;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N });
  } catch {
    return false;
  }
  // Constant-time comparison to avoid leaking timing information.
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
