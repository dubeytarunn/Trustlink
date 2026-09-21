import type Database from 'better-sqlite3';
import { computeEntryHash, GENESIS_PREV_HASH, hashIpAddress, LogChainEntry, verifyLogChain } from '../../crypto/hash-chain';

export interface AppendVerificationLogParams {
  verifier_type: 'public' | 'employer' | 'api';
  employer_id?: number | null;
  credential_id?: string | null;
  share_id?: number | null;
  method: 'id' | 'qr' | 'share' | 'bulk' | 'api';
  outcome: string;
  ip: string;
  user_agent?: string | null;
}

export interface AppendAuditLogParams {
  actor_user_id?: number | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
}

export class LogRepository {
  constructor(private db: Database.Database) {}

  /**
   * Appends an entry to the append-only, hash-chained verification_logs table.
   */
  appendVerificationLog(params: AppendVerificationLogParams): LogChainEntry {
    const insertTx = this.db.transaction(() => {
      // Get highest seq and entry_hash
      const lastRow = this.db
        .prepare('SELECT seq, entry_hash FROM verification_logs ORDER BY seq DESC LIMIT 1')
        .get() as { seq: number; entry_hash: string } | undefined;

      const nextSeq = (lastRow?.seq ?? 0) + 1;
      const prevHash = lastRow?.entry_hash ?? GENESIS_PREV_HASH;
      const createdAt = new Date().toISOString();
      const ipHash = hashIpAddress(params.ip);

      const entryPayload = {
        seq: nextSeq,
        verifier_type: params.verifier_type,
        employer_id: params.employer_id ?? null,
        credential_id: params.credential_id ?? null,
        share_id: params.share_id ?? null,
        method: params.method,
        outcome: params.outcome,
        ip_hash: ipHash,
        user_agent: params.user_agent ?? null,
        created_at: createdAt,
      };

      const entryHash = computeEntryHash(prevHash, entryPayload);

      const stmt = this.db.prepare(`
        INSERT INTO verification_logs (
          seq, verifier_type, employer_id, credential_id, share_id,
          method, outcome, ip_hash, user_agent, created_at, prev_hash, entry_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const info = stmt.run(
        nextSeq,
        params.verifier_type,
        params.employer_id ?? null,
        params.credential_id ?? null,
        params.share_id ?? null,
        params.method,
        params.outcome,
        ipHash,
        params.user_agent ?? null,
        createdAt,
        prevHash,
        entryHash
      );

      return {
        id: Number(info.lastInsertRowid),
        ...entryPayload,
        prev_hash: prevHash,
        entry_hash: entryHash,
      };
    });

    return insertTx();
  }

  /**
   * Appends an entry to the append-only, hash-chained audit_log table.
   */
  appendAuditLog(params: AppendAuditLogParams): LogChainEntry {
    const insertTx = this.db.transaction(() => {
      const lastRow = this.db
        .prepare('SELECT seq, entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1')
        .get() as { seq: number; entry_hash: string } | undefined;

      const nextSeq = (lastRow?.seq ?? 0) + 1;
      const prevHash = lastRow?.entry_hash ?? GENESIS_PREV_HASH;
      const createdAt = new Date().toISOString();
      const detailsJson = JSON.stringify(params.details);

      const entryPayload = {
        seq: nextSeq,
        actor_user_id: params.actor_user_id ?? null,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        details_json: detailsJson,
        created_at: createdAt,
      };

      const entryHash = computeEntryHash(prevHash, entryPayload);

      const stmt = this.db.prepare(`
        INSERT INTO audit_log (
          seq, actor_user_id, action, entity_type, entity_id,
          details_json, created_at, prev_hash, entry_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const info = stmt.run(
        nextSeq,
        params.actor_user_id ?? null,
        params.action,
        params.entity_type,
        params.entity_id,
        detailsJson,
        createdAt,
        prevHash,
        entryHash
      );

      return {
        id: Number(info.lastInsertRowid),
        ...entryPayload,
        prev_hash: prevHash,
        entry_hash: entryHash,
      };
    });

    return insertTx();
  }

  /**
   * Verifies the cryptographic chain integrity of all verification logs.
   */
  verifyVerificationLogChain() {
    const rows = this.db.prepare('SELECT * FROM verification_logs ORDER BY seq ASC').all() as LogChainEntry[];
    return verifyLogChain(rows);
  }

  /**
   * Verifies the cryptographic chain integrity of all audit logs.
   */
  verifyAuditLogChain() {
    const rows = this.db.prepare('SELECT * FROM audit_log ORDER BY seq ASC').all() as LogChainEntry[];
    return verifyLogChain(rows);
  }
}
