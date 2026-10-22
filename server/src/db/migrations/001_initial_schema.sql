-- TrustLink Database Schema - Migration 001
-- Portable SQLite Schema (with Strict Foreign Key enforcement)

PRAGMA foreign_keys = ON;

-- 1. Universities
CREATE TABLE IF NOT EXISTS universities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  registrar_email TEXT NOT NULL,
  logo_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_universities_domain ON universities(domain);
CREATE INDEX IF NOT EXISTS idx_universities_status ON universities(status);

-- 2. Users (Authentication & Roles)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'university', 'student', 'employer')),
  university_id INTEGER REFERENCES universities(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  totp_secret TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 3. University Cryptographic Keys (Versioned & Encrypted at Rest)
CREATE TABLE IF NOT EXISTS university_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  kid TEXT NOT NULL UNIQUE,
  public_key_pem TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  private_key_enc TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'retired', 'revoked')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  retired_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_university_keys_kid ON university_keys(kid);
CREATE INDEX IF NOT EXISTS idx_university_keys_uni ON university_keys(university_id);

-- 4. Students
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  student_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(university_id, student_number)
);
CREATE INDEX IF NOT EXISTS idx_students_uni_number ON students(university_id, student_number);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);

-- 5. Student Account Claim Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  claimed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token_hash);

-- 6. Credential Templates
CREATE TABLE IF NOT EXISTS credential_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('degree', 'transcript', 'certificate', 'course', 'skill', 'certification', 'internship', 'achievement', 'project', 'micro-credential')),
  claim_schema_json TEXT NOT NULL,
  employer_visible_claims_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_uni ON credential_templates(university_id);

-- 7. Credentials (Signed Academic Records)
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id TEXT NOT NULL UNIQUE,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES credential_templates(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  kid TEXT NOT NULL REFERENCES university_keys(kid),
  claims_json TEXT NOT NULL,
  salts_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'valid', 'suspended', 'revoked', 'expired')) DEFAULT 'active',
  revoked_reason TEXT,
  revoked_at TEXT,
  suspended_reason TEXT,
  suspended_at TEXT,
  issued_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_credentials_id ON credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_credentials_student ON credentials(student_id);
CREATE INDEX IF NOT EXISTS idx_credentials_university ON credentials(university_id);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);

-- 8. Selective Disclosure Shares
CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_token TEXT NOT NULL UNIQUE,
  credential_id INTEGER NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  disclosed_claims_json TEXT NOT NULL,
  reveals_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  passcode_hash TEXT,
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(share_token);
CREATE INDEX IF NOT EXISTS idx_shares_credential ON shares(credential_id);

-- 9. Employers
CREATE TABLE IF NOT EXISTS employers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  email_domain TEXT NOT NULL,
  official_email TEXT NOT NULL,
  email_verified_at TEXT,
  website TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'under_review', 'verified', 'rejected', 'suspended')) DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_employers_status ON employers(status);
CREATE INDEX IF NOT EXISTS idx_employers_domain ON employers(email_domain);

-- 10. Employer Documents
CREATE TABLE IF NOT EXISTS employer_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_employer_documents_emp ON employer_documents(employer_id);

-- 11. API Keys (Machine API for Verified Employers)
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- 12. Verification Logs (Append-Only Hash-Chained)
CREATE TABLE IF NOT EXISTS verification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seq INTEGER NOT NULL UNIQUE,
  verifier_type TEXT NOT NULL CHECK(verifier_type IN ('public', 'employer', 'api')),
  employer_id INTEGER REFERENCES employers(id) ON DELETE SET NULL,
  credential_id TEXT,
  share_id INTEGER REFERENCES shares(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK(method IN ('id', 'qr', 'share', 'bulk', 'api')),
  outcome TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_logs_seq ON verification_logs(seq);
CREATE INDEX IF NOT EXISTS idx_verification_logs_cred ON verification_logs(credential_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_emp ON verification_logs(employer_id);

-- 13. Audit Log (Append-Only Hash-Chained for Administrative Actions)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seq INTEGER NOT NULL UNIQUE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_seq ON audit_log(seq);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);

-- 14. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- 15. Dev Outbox Emails (Captured In-App Mailbox for Development)
CREATE TABLE IF NOT EXISTS outbox_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_emails_to ON outbox_emails(to_email);
