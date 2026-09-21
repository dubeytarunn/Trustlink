import { describe, it, expect } from 'vitest';
import { generateCredentialId, validateCredentialId, computeCheckSymbol } from '../src/crypto/credential-id';

describe('Typo-Resistant Credential ID with Crockford Check Symbol', () => {
  it('should generate valid Credential IDs matching format TL-XXXX-XXXX-XXXX-C', () => {
    for (let i = 0; i < 25; i++) {
      const id = generateCredentialId();
      expect(id).toMatch(/^TL-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z*~$=U]$/);

      const res = validateCredentialId(id);
      expect(res.valid).toBe(true);
      expect(res.normalizedId).toBe(id);
    }
  });

  it('should detect single-character typo mutations', () => {
    const validId = generateCredentialId();
    const parts = validId.split('-'); // ['TL', 'XXXX', 'XXXX', 'XXXX', 'C']

    // Mutate one character in the first block
    const originalChar = parts[1][0];
    const mutatedChar = originalChar === 'A' ? 'B' : 'A';
    const mutatedFirstBlock = mutatedChar + parts[1].slice(1);
    const mutatedId = `TL-${mutatedFirstBlock}-${parts[2]}-${parts[3]}-${parts[4]}`;

    const res = validateCredentialId(mutatedId);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Checksum mismatch');
  });

  it('should detect adjacent character transpositions', () => {
    // Generate an ID where the first two characters are distinct
    let validId = generateCredentialId();
    let parts = validId.split('-');
    while (parts[1][0] === parts[1][1]) {
      validId = generateCredentialId();
      parts = validId.split('-');
    }

    // Swap adjacent characters
    const transposedBlock = parts[1][1] + parts[1][0] + parts[1].slice(2);
    const transposedId = `TL-${transposedBlock}-${parts[2]}-${parts[3]}-${parts[4]}`;

    const res = validateCredentialId(transposedId);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Checksum mismatch');
  });

  it('should reject malformed or illegal characters (like I, L, O, U in payload)', () => {
    expect(validateCredentialId('INVALID-ID').valid).toBe(false);
    expect(validateCredentialId('TL-1234-5678-90AB').valid).toBe(false); // missing check char
    expect(validateCredentialId('TL-123O-5678-90AB-0').valid).toBe(false); // 'O' is invalid in Crockford payload
  });
});
