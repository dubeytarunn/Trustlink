# TrustLink — Academic Credential Verification Platform

> A production-grade, cryptographically verifiable academic credential verification platform connecting **Universities (Issuers)**, **Students (Holders)**, and **Employers (Verifiers)** with selective disclosure, W3C Verifiable Credential standard compliance, and an immutable append-only audit ledger.

---

## 📋 Table of Contents
- [Executive Summary & Problem Statement](#-executive-summary--problem-statement)
- [System Objectives](#-system-objectives)
- [Implemented Core Features](#-implemented-core-features)
- [System Architecture & Cryptographic Data Flow](#-system-architecture--cryptographic-data-flow)
- [Technology Stack](#-technology-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites & Getting Started](#-prerequisites--getting-started)
- [Environment Configuration](#-environment-configuration)
- [Database Migrations & Seed Data](#-database-migrations--seed-data)
- [Running the Platform](#-running-the-platform)
- [Demo Credentials & Test Accounts](#-demo-credentials--test-accounts)
- [REST API Reference](#-rest-api-reference)
- [Performance Benchmarks & Load Testing](#-performance-benchmarks--load-testing)
- [Automated Testing](#-automated-testing)
- [Known Limitations & Future Roadmap](#-known-limitations--future-roadmap)
- [License](#-license)

---

## 🎯 Executive Summary & Problem Statement

### The Problem
Traditional educational credential verification relies on manual registrar requests, postal transcripts, unauthenticated PDF printouts, or costly third-party background verification agencies. These approaches present critical vulnerabilities:
1. **Rampant Diploma Fraud:** High-resolution digital tampering makes fraudulent degrees virtually indistinguishable from genuine documents.
2. **Slow Verification Times:** Employers spend days or weeks awaiting manual institutional registrar confirmation.
3. **Loss of Student Privacy:** Students are forced to disclose entire academic histories (such as all course grades or personal registration numbers) when an employer only needs to verify degree conferral and graduation year.
4. **Blockchain Overhead:** Many decentralized solutions mandate cryptocurrency tokens, high gas fees, slow transaction finality, and irreversible public ledger exposure of student identities.

### The Solution: TrustLink
TrustLink delivers institutional-grade cryptographic trust **without blockchain overhead**. Universities sign credentials off-chain using standardized **ECDSA (NIST P-256)** digital signatures. Students maintain custody in a **self-sovereign digital wallet** and use **Pedersen commitment–based selective disclosure** to share strictly necessary claims. Employers and verifiers validate credentials in milliseconds via a 7-point cryptographic audit engine and tamper-evident SHA-256 hash chains.

---

## 🎯 System Objectives

Derived from the approved Software Requirements Specification (SRS):
- **Cryptographic Non-Repudiation (FR-01..04):** Institutional keypairs (ECDSA P-256) sign canonical JSON credential hashes. Private keys are encrypted at rest using AES-256-GCM and never exposed to the client.
- **Privacy-Preserving Selective Disclosure (FR-15..18):** Students can generate verifiable presentations containing a subset of claims. Undisclosed fields remain cryptographically blinded via Pedersen commitments.
- **Instant Multi-Channel Verification (FR-05..08):** Real-time verification via direct ID lookup, shareable tokens, and dynamic QR codes scanned via smartphone cameras.
- **Lifecycle & Revocation Control (FR-19..20):** Universities can dynamically suspend, restore, or revoke credentials with tamper-proof lifecycle audit trails.
- **Enterprise Verification Workflow (FR-09..13):** Verified employer onboarding, candidate claim request center, and batch applicant verification with risk scoring.

---

## 🌟 Implemented Core Features

### 1. Student Digital Wallet (`/student`)
- Self-sovereign wallet presenting all issued credentials (Degrees, Transcripts, Certifications, Skills, Micro-Credentials).
- Real-time category filtering and claim inspection.
- W3C Verifiable Credential (JSON-LD) inspector modal.
- Active share link manager with view tracking, customizable expiration (24h, 7d, 30d, Never), and instant one-click link revocation.
- Employer credential request center allowing students to review requested claims, approve with selective disclosure, or decline.

### 2. University Issuance & Lifecycle Management (`/university`)
- Multi-credential issuance engine supporting 9 distinct credential types.
- Cryptographic signing pipeline (ECDSA P-256, IEEE-P1363).
- Complete lifecycle management: `VALID`, `SUSPENDED`, `REVOKED`, and `EXPIRED`.
- Key rotation dashboard with historical key status and fingerprint tracking.

### 3. Employer Verification Portal (`/employer`)
- Real-time 7-Point Cryptographic Verification Audit.
- Targeted Claim Request tool allowing recruiters to request specific verified attributes from candidates.
- Batch Verification engine evaluating multiple candidate credentials with heuristic risk analysis (`LOW`, `MEDIUM`, `HIGH`).
- OCR Document & Biometric verification engine utilizing Tesseract.js.

### 4. 7-Point Cryptographic Verification Engine
Every verification request runs seven independent checks:
1. **Credential Integrity:** Canonical payload matches commitments and hashes.
2. **University Signature:** ECDSA P-256 digital signature verifies against the university's public key.
3. **Issuer Authorization:** University is registered and active in the accredited Trust Registry.
4. **Credential Status:** Credential is not suspended, revoked, or expired.
5. **Expiration Validity:** Credential validity date is current.
6. **Selective Disclosure:** Disclosed field blenders accurately open Pedersen commitments.
7. **Presentation Validity:** Share token is active, unrevoked, and within its expiry window.

### 5. Standards Compliance: W3C Verifiable Credentials
- Implements W3C VC 1.1 / 2.0 specifications alongside native TrustLink envelopes.
- Fully formatted `@context`, `type`, `issuer`, `credentialSubject`, `issuanceDate`, `credentialStatus`, and `proof` objects.

### 6. Tamper Simulation Lab (`/admin/tamper`)
- Interactive security demonstration portal enabling administrators to intentionally alter student names, GPA, or graduation dates in database records.
- Visually proves that any bit flip immediately breaks the cryptographic signature and fails the verification pipeline.

### 7. National Depository & KYC Integration (Simulation)
- **DigiLocker / NAD Integration:** Pull official academic documents via candidate roll number and passing year.
- **Aadhaar KYC Simulation:** Simulated OTP generation and biometric facial similarity verification.

---

## 🏗 System Architecture & Cryptographic Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor University as University Registrar (Issuer)
    actor Student as Student (Holder)
    actor Employer as Employer / Verifier
    participant Server as TrustLink Backend API
    participant Crypto as Crypto Engine (ECDSA P-256)
    participant DB as SQLite & Hash-Chain Audit Log

    Note over University,DB: 1. Credential Issuance
    University->>Server: Submit Credential Claims (Name, Degree, GPA, Year)
    Server->>Crypto: Compute Pedersen Commitments for claims
    Server->>Crypto: Construct Canonical JSON & ECDSA P-256 Sign
    Crypto-->>Server: Digital Signature & Formatted Credential ID
    Server->>DB: Store Credential & Log to Append-Only Hash Chain
    Server-->>University: Credential Issued & QR Code Generated

    Note over Student,Server: 2. Selective Disclosure Share
    Student->>Server: Select Disclosed Claims (e.g. Degree only; hide GPA)
    Server->>Crypto: Generate Blinding Factors & Presentation Envelope
    Server->>DB: Store Share Token & Expiry
    Server-->>Student: Shareable URL & Presentation QR Code

    Note over Employer,DB: 3. Verification Audit
    Employer->>Server: Request Verification (ID or Share Token)
    Server->>DB: Fetch Public Key, Status & Commitments
    Server->>Crypto: Execute 7-Point Verification Audit
    Server->>DB: Append Verification Attempt to SHA-256 Audit Log
    Server-->>Employer: Audit Result (Valid / Compromised / Expired)
```

---

## 💻 Technology Stack

### Backend
- **Runtime:** Node.js (v18.x to v22.x)
- **Framework:** Express 4 (CommonJS module target, TypeScript source via `tsx`)
- **Database:** SQLite 3 via `better-sqlite3` (with WAL mode and foreign key constraints)
- **Cryptography:** Node.js native `crypto` module (ECDSA NIST P-256, AES-256-GCM, SHA-256)
- **Authentication:** JWT (HttpOnly cookies), TOTP 2FA (`otplib`), PBKDF2/scrypt password hashing
- **Security:** Helmet, CORS, Cookie-Parser, Zod validation
- **Document Processing:** Tesseract.js (OCR), PDFKit, QRCode

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler:** Vite 6
- **Styling:** Tailwind CSS 3, PostCSS, Autoprefixer
- **Icons:** Lucide React
- **Routing:** React Router DOM 6

### Testing & Quality
- **Test Runner:** Vitest 3
- **HTTP Assertions:** Supertest 7
- **Performance:** Native microbenchmark scripts & Apache JMeter 5.6.3

---

## 📁 Project Directory Structure

```text
trustlink_swe/
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git exclusion rules (secrets, caches, DBs)
├── package.json                  # Root npm workspaces configuration
├── package-lock.json
├── README.md                     # Project documentation
├── client/                       # Frontend application (React + Vite)
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx               # Client routes and navigation
│       ├── main.tsx
│       ├── index.css
│       ├── components/           # UI components, modals, QR viewers
│       ├── context/              # Authentication & state context
│       ├── lib/                  # API client and formatting utilities
│       └── pages/                # Role dashboards and verification portals
│           ├── Landing.tsx
│           ├── Login.tsx
│           ├── StudentDashboard.tsx
│           ├── VerifyCredential.tsx
│           ├── VerifyShare.tsx
│           ├── AadhaarKYC.tsx
│           ├── admin/            # Admin universities, audit log, tamper lab
│           ├── employer/         # Employer dashboard, batch verify, document OCR
│           └── university/       # Issuance and lifecycle management
├── server/                       # Backend API & Crypto Engine (Express)
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/
│   │   └── benchmark.ts          # NFR-01..03 Cryptographic benchmarks
│   ├── src/
│   │   ├── app.ts                # Express application setup & middleware
│   │   ├── server.ts             # Server entrypoint and graceful shutdown
│   │   ├── config/
│   │   │   └── env.ts            # Zod environment schema validation
│   │   ├── crypto/               # Cryptographic primitives & engines
│   │   │   ├── canonical.ts      # Deterministic JSON canonicalization
│   │   │   ├── commitments.ts    # Pedersen commitments & blinding
│   │   │   ├── credential-id.ts  # Structured TL-XXXX-XXXX-XXXX-X IDs
│   │   │   ├── hash-chain.ts     # Immutable SHA-256 audit ledger
│   │   │   ├── keys.ts           # ECDSA P-256 keypair generation & AES storage
│   │   │   ├── password.ts       # Secure password hashing
│   │   │   ├── sign-verify.ts    # 7-point verification & signature validation
│   │   │   └── w3c.ts            # W3C Verifiable Credential 1.1/2.0 transformation
│   │   ├── db/
│   │   │   ├── connection.ts     # SQLite connection & WAL mode
│   │   │   ├── migrations.ts     # Incremental migration runner
│   │   │   ├── seed.ts           # Seed demo accounts and credentials
│   │   │   ├── migrations/       # SQL schema migrations (001 to 005)
│   │   │   └── repositories/     # Data access layer
│   │   ├── middleware/           # Auth, RBAC, and error handlers
│   │   ├── routes/               # Express REST route handlers
│   │   └── utils/                # Logger and formatting helpers
│   └── tests/                    # 15 automated Vitest test suites (71 tests)
└── docs/
    └── SRS.md                    # Approved Software Requirements Specification
```

---

## ⚡ Prerequisites & Getting Started

### Prerequisites
- **Node.js:** v18.0.0 or higher (Tested on Node.js v22)
- **npm:** v9.0.0 or higher
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/trustlink.git
cd trustlink
```

### 2. Install Dependencies
Install dependencies across all npm workspaces (root, server, client):
```bash
npm install
```

---

## ⚙ Environment Configuration

Create a `.env` file in the root directory by copying the provided `.env.example`:

```bash
cp .env.example .env
```

### Required Configuration Keys

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Backend server port | `4000` |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |
| `DEMO_MODE` | Enables pre-seeded demo accounts and bypasses | `true` |
| `DATABASE_PATH` | Path to SQLite database file | `./data/trustlink.db` |
| `KEY_ENCRYPTION_SECRET` | 32-byte (64 hex character) secret for AES-256-GCM encryption | *(Generate using command below)* |
| `JWT_ACCESS_SECRET` | Secret key for signing short-lived access tokens | *(Random secure string)* |
| `JWT_REFRESH_SECRET` | Secret key for signing long-lived refresh tokens | *(Random secure string)* |
| `CORS_ORIGIN` | Allowed client origin for CORS | `http://localhost:5173` |
| `CLIENT_URL` | Public frontend client URL | `http://localhost:5173` |

To generate a secure 64-character hex key for `KEY_ENCRYPTION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 💾 Database Migrations & Seed Data

The project uses SQLite with automatic SQL migration execution on startup. To seed the database with demo accounts, accredited universities, and sample credentials:

```bash
npm --workspace=server run seed
```

This populates:
- **Accredited Universities:** VIT Chennai, Anna University, IIT Madras.
- **Active Credentials:** Valid degrees, transcripts, certifications, and skills.
- **Selective Disclosure Shares:** Pre-configured active and expired share links.
- **Credential Requests:** Sample employer claim verification requests.

---

## 🚀 Running the Platform

You can start the frontend and backend servers together or in separate terminal sessions:

### Option A: Run Separately (Recommended for Development)

**Terminal 1 — Backend API (Port 4000):**
```bash
npm run dev:server
```

**Terminal 2 — Frontend Application (Port 5173):**
```bash
npm run dev:client
```

### Option B: Build for Production
```bash
npm run build
npm start
```

Visit **`http://localhost:5173`** in your browser.

---

## 👥 Demo Credentials & Test Accounts

| Role | Email | Password | Access Portal |
| :--- | :--- | :--- | :--- |
| **Student (Holder)** | `student@university.edu` | `Password123!` | `/student` (Digital Wallet, Presentations) |
| **University (Issuer)** | `admin@vit.edu` | `Password123!` | `/university` (Issuance, Key Rotation, Lifecycle) |
| **Employer (Verifier)** | `recruiter@acme.com` | `Password123!` | `/employer` (7-Point Audit, Batch Verification) |
| **System Admin** | `admin@trustlink.demo` | `DemoAdmin123!` | `/admin/universities`, `/admin/audit`, `/admin/tamper` |

### Sample Credentials for Instant Testing
- **Valid Credential ID:** `TL-G807-HDAB-BZ7R-8`  
  Verify at: `http://localhost:5173/verify/credential/TL-G807-HDAB-BZ7R-8`
- **Active Selective Disclosure Share:** `demo-share-verified-token`  
  Verify at: `http://localhost:5173/verify/share/demo-share-verified-token`
- **Expired Share Token:** `demo-share-expired-token`  
  Verify at: `http://localhost:5173/verify/share/demo-share-expired-token`
- **Suspended Credential:** `TL-SUSPEND-DEMO-0002-B`  
  Verify at: `http://localhost:5173/verify/credential/TL-SUSPEND-DEMO-0002-B`
- **Revoked Credential:** `TL-REVOKED-DEMO-0001-A`  
  Verify at: `http://localhost:5173/verify/credential/TL-REVOKED-DEMO-0001-A`

---

## 📡 REST API Reference

All backend endpoints are prefixed with `/api`.

### System & Health
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | No | System health check and database connectivity probe. |

### Authentication (`/api/auth`)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | No | Authenticate user; returns JWT and sets HttpOnly cookies. |
| `POST` | `/api/auth/logout` | No | Clear authentication cookies. |
| `POST` | `/api/auth/refresh` | No | Refresh expired access tokens using refresh token. |
| `GET` | `/api/auth/me` | Yes (Bearer/Cookie) | Get current authenticated user profile. |
| `POST` | `/api/auth/change-password` | Yes | Change user password. |
| `POST` | `/api/auth/2fa/setup` | Yes | Generate TOTP secret and QR code for two-factor auth. |
| `POST` | `/api/auth/2fa/verify` | Yes | Verify TOTP token and enable 2FA on account. |

### Verification & Trust Registry (`/api/verify`)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/verify/public-keys` | No | Public JWKS discovery endpoint for university public keys. |
| `GET` | `/api/verify/trust-registry` | No | List accredited universities and public key fingerprints. |
| `GET` | `/api/verify/qr?text=...` | No | Generate QR code (data URL or PNG buffer). |
| `GET` | `/api/verify/credential/:credentialId` | No | Perform 7-point cryptographic audit on a credential ID. |
| `POST` | `/api/verify/share/:shareToken` | No | Verify a selective disclosure presentation token. |
| `POST` | `/api/verify/` | No | Unified verification endpoint for credentials and shares. |

### University Operations (`/api/university`)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/university/credentials/issue` | Yes (University) | Issue a new cryptographically signed credential. |
| `GET` | `/api/university/credentials` | Yes (University) | List all credentials issued by the authenticated institution. |
| `PATCH` | `/api/university/credentials/:id/lifecycle` | Yes (University) | Suspend, restore, or revoke a credential. |
| `GET` | `/api/university/keys` | Yes (University) | View active and historical ECDSA key pairs. |
| `POST` | `/api/university/keys/rotate` | Yes (University) | Rotate the university's active signing key. |

### Student Digital Wallet (`/api/student`)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/student/credentials` | Yes (Student) | Retrieve all credentials issued to the authenticated student. |
| `POST` | `/api/student/share` | Yes (Student) | Create a selective disclosure presentation share token. |
| `GET` | `/api/student/shares` | Yes (Student) | List active share links and access metrics. |
| `DELETE` | `/api/student/shares/:id` | Yes (Student) | Revoke a shareable presentation link immediately. |
| `GET` | `/api/student/requests` | Yes (Student) | View incoming claim verification requests from employers. |
| `POST` | `/api/student/requests/:id/respond` | Yes (Student) | Approve (with selective disclosure) or reject requests. |

### Employer Operations (`/api/employer`)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/employer/requests` | Yes (Employer) | Submit a verified claim request to a student. |
| `GET` | `/api/employer/requests` | Yes (Employer) | List sent verification requests and their statuses. |
| `POST` | `/api/employer/batch-verify` | Yes (Employer) | Batch verify multiple credentials with risk scoring. |
| `GET` | `/api/employer/history` | Yes (Employer) | View past verification audits conducted by the employer. |

### Government & Document Verification
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/kyc/aadhaar/generate-otp` | No | Simulate Aadhaar OTP delivery. |
| `POST` | `/api/kyc/aadhaar/verify-otp` | No | Verify Aadhaar OTP against simulated national registry. |
| `POST` | `/api/documents/verify` | Yes | OCR document text extraction and biometric match analysis. |
| `GET` | `/api/digilocker/issuers` | No | List registered National Academic Depository issuers. |
| `POST` | `/api/digilocker/pull-credential`| No | Pull verified academic records from DigiLocker/NAD. |

---

## 📊 Performance Benchmarks & Load Testing

### 1. Cryptographic Microbenchmarks (NFR-01 to NFR-03)
The cryptographic engine was benchmarked on ECDSA P-256 operations using `server/scripts/benchmark.ts`:

```text
===============================================================
  TrustLink Cryptographic Performance Benchmark
===============================================================
NFR-01: Credential Signing Performance
  Average Time: 0.439 ms (2,280 ops/sec)  --> ✅ PASS (Target: < 1000 ms)
---------------------------------------------------------------
NFR-02: Credential Verification Performance
  Average Time: 0.303 ms (3,301 ops/sec)  --> ✅ PASS (Target: < 1000 ms)
---------------------------------------------------------------
NFR-03: QR Code Generation Performance
  Average Time: 9.550 ms (105 ops/sec)    --> ✅ PASS (Target: < 1000 ms)
===============================================================
```

### 2. Apache JMeter Load Testing
Performance testing of the server infrastructure was evaluated using **Apache JMeter 5.6.3** targeting the safe, read-only endpoint:
```text
GET http://localhost:4000/api/health
```

**Observed Test Profile & Results:**
- **Virtual Users (Threads):** 100 concurrent threads
- **Ramp-Up Period:** 100 seconds
- **Loop Count:** 2 loops per thread
- **Total Samples:** 200 requests
- **Average Response Time:** ~3 ms
- **Maximum Response Time:** 46 ms
- **Error Rate:** 0.00% (200 / 200 HTTP 200 OK responses)

> **Scope Note:** This benchmark evaluated local HTTP connection concurrency and SQLite health-check throughput on `GET /api/health`. It demonstrates server responsiveness under concurrent load, but does not represent the end-to-end performance of resource-intensive operations such as multi-page OCR document processing.

---

## 🧪 Automated Testing

TrustLink includes a comprehensive suite of **15 test suites** and **71 automated unit/integration tests** implemented in Vitest:

```bash
npm test
```

### Test Suite Coverage
- `tests/ten-features.test.ts`: Verifies all 10 core platform features, including W3C compliance, selective disclosure, and lifecycle revocations.
- `tests/crypto-sign-verify.test.ts`: Verifies ECDSA P-256 keypair generation, canonical JSON hashing, and signature validation.
- `tests/selective-disclosure.test.ts`: Verifies Pedersen commitments and disclosure blinding factors.
- `tests/tamper.test.ts`: Asserts that any unauthorized data alteration fails signature verification.
- `tests/hash-chain.test.ts`: Tests sequential SHA-256 hash chaining in the append-only audit ledger.
- `tests/batch-verification.test.ts`: Tests employer batch applicant verification and risk scoring algorithms.
- `tests/auth.test.ts`: Tests JWT generation, HttpOnly cookie handling, and 2FA TOTP authentication.
- `tests/admin-universities.test.ts`: Tests institutional onboarding and trust registry authorization.
- `tests/digilocker-nad.test.ts`: Validates DigiLocker document pulling and simulated NAD verifications.
- `tests/document-verification.test.ts`: Tests document OCR extraction and biometric similarity heuristics.
- `tests/credential-id.test.ts`: Validates formatted Luhn-checked Credential IDs.
- `tests/canonical.test.ts`: Ensures deterministic JSON property ordering before cryptographic hashing.
- `tests/health.test.ts`: Asserts system health probe functionality.

---

## 🔮 Known Limitations & Future Roadmap

While TrustLink provides a robust, self-contained implementation for university and enterprise evaluation, the following enhancements are planned for future production deployments:

1. **Hardware Security Modules (HSM):** Integrate cloud KMS (e.g., AWS KMS, Google Cloud KMS, or HashiCorp Vault) to protect university private signing keys in hardware rather than encrypted database storage.
2. **Decentralized Identifiers (DIDs):** Support official DID methods (such as `did:web` and `did:ion`) for institutional identifier resolution alongside the centralized trust registry.
3. **Zero-Knowledge Proofs (ZKP):** Upgrade Pedersen commitments to zk-SNARKs/BBS+ signatures to enable zero-knowledge range proofs (e.g., proving `GPA > 3.5` without revealing the exact GPA).
4. **Production DigiLocker Gateway:** Replace simulated NAD pulling with production API gateway credentials through India's National Academic Depository.
5. **Distributed Ledger Anchoring:** Periodically anchor the SHA-256 hash-chain root state to a public timestamping service or distributed ledger for external immutability guarantees.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](file:///c:/Users/dubey/OneDrive/ドキュメント/Desktop/trustlink_swe/LICENSE) file for complete details.

Copyright (c) 2026 Tarun Dubey (24BAI1523).
