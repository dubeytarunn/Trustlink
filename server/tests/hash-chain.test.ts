import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryDatabase } from '../src/db/connection';
import { LogRepository } from '../src/db/repositories/log-repository';
import { hashIpAddress } from '../src/crypto/hash-chain';

describe('Append-Only Hash-Chained Logs & Integrity Verification', () => {
  let db: ReturnType<typeof createInMemoryDatabase>;
  let logRepo: LogRepository;

  beforeEach(() => {
    db = createInMemoryDatabase();
    logRepo = new LogRepository(db);
  });

  it('should create hash-chained verification logs and pass integrity check', () => {
    // Append 5 verification entries
    for (let i = 1; i <= 5; i++) {
      logRepo.appendVerificationLog({
        verifier_type: 'public',
        credential_id: `TL-1234-5678-90AB-C`,
        method: 'qr',
        outcome: i % 2 === 0 ? 'valid' : 'invalid',
        ip: `192.168.1.${i}`,
        user_agent: 'Mozilla/5.0 Test',
      });
    }

    const checkResult = logRepo.verifyVerificationLogChain();
    expect(checkResult.isValid).toBe(true);
    expect(checkResult.totalVerified).toBe(5);
  });

  it('should detect tampering if an existing log record is modified in the database', () => {
    for (let i = 1; i <= 4; i++) {
      logRepo.appendVerificationLog({
        verifier_type: 'public',
        credential_id: `TL-1234-5678-90AB-C`,
        method: 'id',
        outcome: 'valid',
        ip: '10.0.0.1',
      });
    }

    // Tamper with record sequence 2 by changing outcome from valid to invalid
    db.prepare("UPDATE verification_logs SET outcome = 'invalid' WHERE seq = 2").run();

    const checkResult = logRepo.verifyVerificationLogChain();
    expect(checkResult.isValid).toBe(false);
    expect(checkResult.brokenAtSeq).toBe(2);
    expect(checkResult.reason).toContain('Hash mismatch');
  });

  it('should detect tampering if an audit log record is modified', () => {
    // Insert a valid user for foreign key satisfaction
    db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('admin@trustlink.org', 'scrypt_hash', 'admin')").run();

    for (let i = 1; i <= 3; i++) {
      logRepo.appendAuditLog({
        actor_user_id: 1,
        action: `ACTION_${i}`,
        entity_type: 'university',
        entity_id: '1',
        details: { step: i },
      });
    }

    expect(logRepo.verifyAuditLogChain().isValid).toBe(true);

    // Tamper with sequence 3
    db.prepare("UPDATE audit_log SET action = 'MALICIOUS_ACTION' WHERE seq = 3").run();

    const checkResult = logRepo.verifyAuditLogChain();
    expect(checkResult.isValid).toBe(false);
    expect(checkResult.brokenAtSeq).toBe(3);
  });

  it('should salt and truncate IP addresses to 16 hex characters for privacy', () => {
    const ip = '198.51.100.42';
    const hashed = hashIpAddress(ip);

    expect(hashed).toHaveLength(16);
    expect(hashed).not.toContain(ip);
  });
});
