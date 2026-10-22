-- TrustLink Schema Migration 005
-- DigiLocker & National Academic Depository (NAD) Gateway Schema

CREATE TABLE IF NOT EXISTS digilocker_issuers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('UNIVERSITY', 'BOARD', 'INSTITUTE', 'AUTONOMOUS')),
  doc_types_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_digilocker_org ON digilocker_issuers(org_id);

CREATE TABLE IF NOT EXISTS digilocker_pulled_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uri TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  passing_year INTEGER NOT NULL,
  credential_id TEXT REFERENCES credentials(credential_id) ON DELETE SET NULL,
  raw_metadata_json TEXT NOT NULL,
  digilocker_signature_hex TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK(verification_status IN ('VERIFIED_NAD', 'TAMPERED', 'MISMATCH')),
  pulled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (org_id) REFERENCES digilocker_issuers(org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_digilocker_uri ON digilocker_pulled_docs(uri);
CREATE INDEX IF NOT EXISTS idx_digilocker_roll ON digilocker_pulled_docs(roll_number);
