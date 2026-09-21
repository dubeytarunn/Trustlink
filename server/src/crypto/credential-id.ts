import crypto from 'crypto';

/**
 * Crockford Base32 Alphabet (32 characters, excluding I, L, O, U to avoid confusion)
 */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Check symbol mapping for Modulo 37 (Douglas Crockford Check Symbol spec)
 */
const CHECK_SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U';

const CROCKFORD_MAP: Record<string, number> = {};
for (let i = 0; i < CROCKFORD_ALPHABET.length; i++) {
  CROCKFORD_MAP[CROCKFORD_ALPHABET[i]] = i;
}
// Normalize lookalikes per Crockford spec:
// O/o -> 0, I/i/L/l -> 1
CROCKFORD_MAP['O'] = 0;
CROCKFORD_MAP['I'] = 1;
CROCKFORD_MAP['L'] = 1;

/**
 * Computes the Crockford checksum symbol for a string of Crockford Base32 characters.
 * Uses a weighted sum algorithm to detect both single-character substitutions and adjacent transpositions.
 */
export function computeCheckSymbol(payloadChars: string): string {
  const normalized = payloadChars.toUpperCase().replace(/[^0-9A-Z]/g, '');
  let sum = 0;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const val = CROCKFORD_MAP[ch];
    if (val === undefined) {
      throw new Error(`Invalid Crockford character: ${ch}`);
    }
    // Weight (i + 1) detects adjacent transpositions
    sum = (sum + val * (i + 1)) % 37;
  }
  return CHECK_SYMBOLS[sum];
}

/**
 * Generates a typo-resistant Credential ID in the format:
 * TL-XXXX-XXXX-XXXX-C
 * 12 random Crockford Base32 characters + 1 check character.
 */
export function generateCredentialId(): string {
  const bytes = crypto.randomBytes(12);
  let rawChars = '';
  for (let i = 0; i < 12; i++) {
    rawChars += CROCKFORD_ALPHABET[bytes[i] % 32];
  }

  const check = computeCheckSymbol(rawChars);
  const part1 = rawChars.slice(0, 4);
  const part2 = rawChars.slice(4, 8);
  const part3 = rawChars.slice(8, 12);

  return `TL-${part1}-${part2}-${part3}-${check}`;
}

/**
 * Validates a Credential ID against the format and checksum.
 * Returns { valid: true, normalizedId } or { valid: false, reason }
 */
export function validateCredentialId(id: string): { valid: boolean; normalizedId?: string; reason?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, reason: 'Credential ID must be a non-empty string' };
  }

  const clean = id.trim().toUpperCase();
  const match = clean.match(/^TL-([0-9A-HJKMNP-Z]{4})-([0-9A-HJKMNP-Z]{4})-([0-9A-HJKMNP-Z]{4})-([0-9A-HJKMNP-Z*~$=U])$/);

  if (!match) {
    return { valid: false, reason: 'Invalid Credential ID format. Expected TL-XXXX-XXXX-XXXX-C' };
  }

  const rawChars = `${match[1]}${match[2]}${match[3]}`;
  const checkChar = match[4];

  try {
    const expectedCheck = computeCheckSymbol(rawChars);
    if (checkChar !== expectedCheck) {
      return { valid: false, reason: `Checksum mismatch (expected ${expectedCheck}, got ${checkChar})` };
    }
    return { valid: true, normalizedId: `TL-${match[1]}-${match[2]}-${match[3]}-${checkChar}` };
  } catch (err: unknown) {
    return { valid: false, reason: err instanceof Error ? err.message : 'Checksum validation failed' };
  }
}
