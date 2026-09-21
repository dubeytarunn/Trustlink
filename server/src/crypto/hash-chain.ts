import crypto from 'crypto';
import { canonicalBuffer } from './canonical';

export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Computes an entry hash in the tamper-evident hash chain:
 * entry_hash = SHA-256(prev_hash || canonical(entry))
 * Automatically omits database primary key 'id', 'prev_hash', and 'entry_hash' so the hash is deterministic.
 */
export function computeEntryHash(prevHash: string, entry: Record<string, unknown>): string {
  const { id: _id, prev_hash: _prev, entry_hash: _entry, ...cleanEntry } = entry;
  const canonicalBytes = canonicalBuffer(cleanEntry);
  const combined = Buffer.concat([Buffer.from(prevHash, 'utf8'), canonicalBytes]);
  return crypto.createHash('sha256').update(combined).digest('hex');
}

export interface LogChainEntry {
  id?: number | string;
  seq: number;
  prev_hash: string;
  entry_hash: string;
  [key: string]: unknown;
}

export interface ChainVerificationResult {
  isValid: boolean;
  totalVerified: number;
  brokenAtSeq?: number;
  reason?: string;
}

/**
 * Validates the cryptographic integrity of an append-only hash chain.
 * Checks:
 * 1. Monotonic sequence order
 * 2. Correct prev_hash pointer link
 * 3. Exact matching SHA-256 hash calculation for every entry
 */
export function verifyLogChain(entries: LogChainEntry[]): ChainVerificationResult {
  if (entries.length === 0) {
    return { isValid: true, totalVerified: 0 };
  }

  // Sort by sequence to ensure chronological verification
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];

    // Check sequence continuity
    if (i === 0) {
      if (entry.prev_hash !== GENESIS_PREV_HASH && entry.seq === 1) {
        return {
          isValid: false,
          totalVerified: 0,
          brokenAtSeq: entry.seq,
          reason: `Genesis block prev_hash must be ${GENESIS_PREV_HASH}, found ${entry.prev_hash}`,
        };
      }
    } else {
      const prevEntry = sorted[i - 1];
      if (entry.prev_hash !== prevEntry.entry_hash) {
        return {
          isValid: false,
          totalVerified: i,
          brokenAtSeq: entry.seq,
          reason: `Chain broken at sequence ${entry.seq}: prev_hash does not match previous entry_hash`,
        };
      }
    }

    // Recompute entry hash
    const expectedHash = computeEntryHash(entry.prev_hash, entry);
    if (entry.entry_hash !== expectedHash) {
      return {
        isValid: false,
        totalVerified: i,
        brokenAtSeq: entry.seq,
        reason: `Hash mismatch at sequence ${entry.seq}: stored entry_hash was modified or tampered with`,
      };
    }
  }

  return {
    isValid: true,
    totalVerified: sorted.length,
  };
}

/**
 * Hashes an IP address with a salt and truncates to 16 hex characters for privacy.
 */
export function hashIpAddress(ip: string, salt: string = 'trustlink_ip_salt_2026'): string {
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 16);
}
