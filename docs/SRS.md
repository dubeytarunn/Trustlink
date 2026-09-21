# Software Requirements Specification (SRS)
## For TrustLink: University & Employer Verification Platform
**Version 1.0 approved**  
**Prepared by Tarun Dubey (24BAI1523)**  
**Date: 18/07/2026**

*(Transcribed directly from the approved SRS document in the project repository)*

### Executive Summary
TrustLink is a web-based platform that combines academic issuance and corporate verification into an integrated trust ecosystem without blockchain overhead. Universities issue digitally signed academic credentials using ECDSA (P-256) cryptographic signatures. Employers must be vetted and verified by an administrator before they are permitted to verify student credentials. Students maintain ownership of their records and can selectively disclose specific claims (e.g. degree only, concealing grades) while maintaining verifiable cryptographic integrity against the original institutional signature.

### Functional Requirements (FR)
- **FR-01**: The system shall generate an ECDSA public/private key pair when a new university is onboarded.
- **FR-02**: The system shall allow a university to submit student credential data (name, degree, grade) for issuance.
- **FR-03**: The system shall construct a JSON representation of the credential and compute its cryptographic hash.
- **FR-04**: The system shall sign the credential hash using the issuing university's private key.
- **FR-05**: The system shall store the signed credential and generate a QR code encoding its verification URL.
- **FR-06**: The system shall, upon verification request, re-compute the credential's hash and verify it against the stored signature using the university's public key.
- **FR-07**: The system shall display a clear "Verified" or "Invalid" result, including credential details when valid.
- **FR-08**: The system shall reject verification of any credential whose signature does not match its current content.
- **FR-09**: The system shall allow an organization to register as an employer, submitting company name, official email domain, and a verification document.
- **FR-10**: The system shall store new employer registrations with a "Pending" status by default.
- **FR-11**: The system shall provide an administrator interface to review, approve, or reject pending employer registrations.
- **FR-12**: The system shall restrict access to the credential verification interface to employers with "Verified" status.
- **FR-13**: The system shall maintain a history of verification attempts performed by each verified employer.
- **FR-14**: The system shall allow an authenticated student to view a list of all credentials issued to them.
- **FR-15**: The system shall allow a student to select a subset of fields from a credential for disclosure.
- **FR-16**: The system shall generate a distinct shareable record (and QR code) reflecting only the selected fields.
- **FR-17**: The system shall ensure that a filtered disclosure remains independently verifiable against the original credential's signature.
- **FR-18**: The system shall not permit modification of field values during the selective-sharing process — only inclusion or exclusion of fields.
- **FR-19**: The system shall display aggregate counts of issued credentials, registered universities, and verified employers.
- **FR-20**: The system shall maintain a chronological, queryable log of all verification attempts, including outcome and timestamp.

### Non-Functional Requirements (NFR)
- **NFR-01**: Credential signing shall complete within 1 second of form submission under normal load.
- **NFR-02**: Signature verification shall return a result within 1 second of a verification request.
- **NFR-03**: QR code generation shall complete within 1 second of credential issuance.
- **NFR-04**: University private keys shall never be transmitted to or exposed on the client side; all signing operations shall occur server-side.
- **NFR-05**: The system shall use JWT-based authentication to distinguish Admin, University, Student, and Employer sessions.
- **NFR-06**: A credential's signature shall be invalidated by any modification to its content, ensuring tamper-evidence.
- **NFR-07**: Access to the credential verification interface shall be restricted to employers with "Verified" status.
- **NFR-08**: Passwords, where used, shall be stored using secure hashing, not plaintext.
