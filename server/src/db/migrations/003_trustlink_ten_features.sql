-- TrustLink Database Schema - Migration 003
-- Credential Lifecycle (Revocation, Suspension), Status History, Extended Credential Types, and Employer Credential Requests

PRAGMA foreign_keys = OFF;

-- 1. Recreate credentials table with expanded status values and suspension metadata
CREATE TABLE IF NOT EXISTS credentials_new (
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

INSERT INTO credentials_new (
  id, credential_id, university_id, student_id, template_id,
  payload_json, signature, kid, claims_json, salts_json,
  payload_hash, status, revoked_reason, revoked_at,
  suspended_reason, suspended_at, issued_at, expires_at
)
SELECT 
  id, credential_id, university_id, student_id, template_id,
  payload_json, signature, kid, claims_json, salts_json,
  payload_hash, status, revoked_reason, revoked_at,
  NULL, NULL, issued_at, expires_at
FROM credentials;

DROP TABLE credentials;
ALTER TABLE credentials_new RENAME TO credentials;

CREATE INDEX IF NOT EXISTS idx_credentials_id ON credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_credentials_student ON credentials(student_id);
CREATE INDEX IF NOT EXISTS idx_credentials_university ON credentials(university_id);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);

-- 2. Credential Status Audit History
CREATE TABLE IF NOT EXISTS credential_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_status_hist_cred ON credential_status_history(credential_id);

-- 3. Extend credential_templates to support Transcripts, Skills, Micro-Credentials, Internships, Projects, Certifications
CREATE TABLE IF NOT EXISTS credential_templates_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('degree', 'transcript', 'certificate', 'course', 'skill', 'certification', 'internship', 'achievement', 'project', 'micro-credential')),
  claim_schema_json TEXT NOT NULL,
  employer_visible_claims_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO credential_templates_new SELECT * FROM credential_templates;
DROP TABLE credential_templates;
ALTER TABLE credential_templates_new RENAME TO credential_templates;
CREATE INDEX IF NOT EXISTS idx_templates_uni ON credential_templates(university_id);

-- 4. Employer Credential Requests Workflow
CREATE TABLE IF NOT EXISTS credential_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  employer_id INTEGER NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  credential_id TEXT,
  requested_claims_json TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')) DEFAULT 'PENDING',
  share_token TEXT REFERENCES shares(share_token) ON DELETE SET NULL,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_cred_req_emp ON credential_requests(employer_id);
CREATE INDEX IF NOT EXISTS idx_cred_req_student ON credential_requests(student_email);
CREATE INDEX IF NOT EXISTS idx_cred_req_status ON credential_requests(status);

PRAGMA foreign_keys = ON;
