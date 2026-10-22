import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../db/connection';

export const aadhaarRouter = Router();

interface AadhaarRow {
  id: number;
  aadhaar_number: string;
  masked_aadhaar: string;
  full_name: string;
  dob: string;
  gender: string;
  address: string;
  phone_last4: string;
  photo_url: string | null;
}

// Adapter Status (Feature: Explicit Integration State)
aadhaarRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    adapterState: 'DEMO_MODE',
    isProductionAuthorized: false,
    environment: 'SYNTHETIC_SANDBOX',
    source: 'TrustLink Synthetic Identity Registry (Simulated UIDAI e-KYC)',
    message: 'UIDAI e-KYC integration running in synthetic sandbox demo mode. No live government APIs are called.',
    allowedStates: ['NOT_CONNECTED', 'DEMO_MODE', 'AUTHORIZATION_REQUIRED', 'CONNECTED', 'RETRIEVAL_FAILED', 'SUCCESSFULLY_RETRIEVED'],
  });
});

// 1. Get demo identities for instant testing in UI
aadhaarRouter.get('/demos', (_req: Request, res: Response) => {
  const db = getDatabase();
  const rows = db.prepare('SELECT aadhaar_number, masked_aadhaar, full_name, dob, gender, phone_last4, photo_url FROM aadhaar_registry WHERE status = ? LIMIT 10').all('active') as AadhaarRow[];
  res.json({
    success: true,
    demos: rows.map(r => ({
      aadhaarNumber: r.aadhaar_number,
      maskedAadhaar: r.masked_aadhaar,
      fullName: r.full_name,
      dob: r.dob,
      gender: r.gender,
      phoneLast4: r.phone_last4,
      photoUrl: r.photo_url,
    })),
  });
});

// 2. Request OTP for Aadhaar e-KYC
aadhaarRouter.post('/send-otp', (req: Request, res: Response) => {
  const { aadhaarNumber } = req.body;
  const cleanNumber = String(aadhaarNumber || '').replace(/\D/g, '');

  if (cleanNumber.length !== 12) {
    return res.status(400).json({ error: { message: 'Aadhaar number must be exactly 12 digits' } });
  }

  const db = getDatabase();
  const identity = db.prepare('SELECT * FROM aadhaar_registry WHERE aadhaar_number = ? AND status = ?').get(cleanNumber, 'active') as AadhaarRow | undefined;

  if (!identity) {
    return res.status(404).json({
      error: { message: 'Aadhaar number not found in National Identity Registry. Try one of the demo numbers.' },
    });
  }

  // Generate deterministic/standard OTP for demo: fixed demo code 482910
  const otp = '482910';

  // Save verification request
  db.prepare(`
    INSERT INTO aadhaar_verifications (aadhaar_number, otp, status)
    VALUES (?, ?, 'PENDING_OTP')
  `).run(cleanNumber, otp);

  return res.json({
    success: true,
    message: `OTP sent to mobile linked with ${identity.masked_aadhaar} (ending in ******${identity.phone_last4})`,
    maskedAadhaar: identity.masked_aadhaar,
    phoneLast4: identity.phone_last4,
    demoOtp: otp, // Returned for effortless demo testing in the UI
  });
});

// 3. Verify OTP and return signed e-KYC Demographic Card
aadhaarRouter.post('/verify-otp', (req: Request, res: Response) => {
  const { aadhaarNumber, otp, credentialId } = req.body;
  const cleanNumber = String(aadhaarNumber || '').replace(/\D/g, '');
  const cleanOtp = String(otp || '').trim();

  const db = getDatabase();
  const identity = db.prepare('SELECT * FROM aadhaar_registry WHERE aadhaar_number = ? AND status = ?').get(cleanNumber, 'active') as AadhaarRow | undefined;

  if (!identity) {
    return res.status(404).json({ error: { message: 'Aadhaar record not found' } });
  }

  // Check OTP (accept either demo OTP '482910' or stored pending OTP)
  const pending = db.prepare(`
    SELECT * FROM aadhaar_verifications
    WHERE aadhaar_number = ? AND status = 'PENDING_OTP'
    ORDER BY id DESC LIMIT 1
  `).get(cleanNumber) as { id: number; otp: string } | undefined;

  const validOtp = cleanOtp === '482910' || (pending && pending.otp === cleanOtp);
  if (!validOtp) {
    return res.status(400).json({ error: { message: 'Invalid OTP code. Please enter the 6-digit code shown.' } });
  }

  const verifiedAt = new Date().toISOString();

  // Mark as verified
  if (pending) {
    db.prepare(`
      UPDATE aadhaar_verifications
      SET status = 'VERIFIED', verified_at = ?, credential_id = COALESCE(?, credential_id)
      WHERE id = ?
    `).run(verifiedAt, credentialId || null, pending.id);
  }

  // Generate cryptographic e-KYC verification token with transparent sandbox simulation labeling
  const ekycPayload = {
    iss: 'TRUSTLINK-SIMULATED-EKYC-GATEWAY',
    adapter_mode: 'DEMO_SANDBOX',
    is_simulated: true,
    aadhaar_masked: identity.masked_aadhaar,
    full_name: identity.full_name,
    dob: identity.dob,
    gender: identity.gender,
    address: identity.address,
    verified_at: verifiedAt,
  };
  const proofHash = crypto.createHash('sha256').update(JSON.stringify(ekycPayload)).digest('hex');

  return res.json({
    success: true,
    message: 'Aadhaar e-KYC Authentication Successful (Simulated Sandbox Demo)',
    isSimulated: true,
    adapterMode: 'DEMO_SANDBOX',
    disclaimer: 'This verification was performed using synthetic test data in the TrustLink Sandbox. It is not an official UIDAI government query.',
    ekyc: {
      aadhaarNumber: identity.masked_aadhaar,
      fullName: identity.full_name,
      dob: identity.dob,
      gender: identity.gender,
      address: identity.address,
      phoneLast4: identity.phone_last4,
      photoUrl: identity.photo_url,
      verifiedAt,
      proofHash,
      status: 'VERIFIED_UIDAI',
      isSimulated: true,
    },
  });
});

// 4. Record Biometric Facial Comparison audit log
aadhaarRouter.post('/biometric-audit', (req: Request, res: Response) => {
  const { credentialId, similarityScore, verdict, referencePhotoHash, candidatePhotoHash, notes } = req.body;

  if (typeof similarityScore !== 'number' || !verdict) {
    return res.status(400).json({ error: { message: 'similarityScore and verdict are required' } });
  }

  const db = getDatabase();
  const refHash = referencePhotoHash || crypto.createHash('sha256').update('ref-photo').digest('hex');
  const candHash = candidatePhotoHash || crypto.createHash('sha256').update('candidate-photo').digest('hex');

  const info = db.prepare(`
    INSERT INTO biometric_verifications (credential_id, similarity_score, verdict, reference_photo_hash, candidate_photo_hash, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(credentialId || null, similarityScore, verdict, refHash, candHash, notes || null);

  return res.json({
    success: true,
    auditId: Number(info.lastInsertRowid),
    message: 'Biometric verification audit recorded successfully',
  });
});
