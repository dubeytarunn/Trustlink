-- TrustLink Database Schema - Migration 002
-- Aadhaar National ID Registry, e-KYC Verification, and Biometric Audits

CREATE TABLE IF NOT EXISTS aadhaar_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aadhaar_number TEXT NOT NULL UNIQUE,
  masked_aadhaar TEXT NOT NULL,
  full_name TEXT NOT NULL,
  dob TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('MALE', 'FEMALE', 'OTHER')),
  address TEXT NOT NULL,
  phone_last4 TEXT NOT NULL,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_aadhaar_number ON aadhaar_registry(aadhaar_number);

CREATE TABLE IF NOT EXISTS aadhaar_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aadhaar_number TEXT NOT NULL,
  verifier_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  credential_id TEXT REFERENCES credentials(credential_id) ON DELETE SET NULL,
  otp TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING_OTP', 'VERIFIED', 'FAILED')) DEFAULT 'PENDING_OTP',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_aadhaar_verif_num ON aadhaar_verifications(aadhaar_number);
CREATE INDEX IF NOT EXISTS idx_aadhaar_verif_cred ON aadhaar_verifications(credential_id);

CREATE TABLE IF NOT EXISTS biometric_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id TEXT REFERENCES credentials(credential_id) ON DELETE SET NULL,
  verifier_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  similarity_score REAL NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('MATCH', 'PARTIAL', 'MISMATCH')),
  reference_photo_hash TEXT NOT NULL,
  candidate_photo_hash TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_biometric_cred ON biometric_verifications(credential_id);
