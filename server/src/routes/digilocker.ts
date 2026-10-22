import { Router, Request, Response, NextFunction } from 'express';
import { getDigiLockerIssuers, pullAndVerifyFromDigiLocker } from '../services/digilocker-service';
import { getDatabase } from '../db/connection';

export const digilockerRouter = Router();

// Adapter Status (Feature: Explicit Integration State)
digilockerRouter.get('/status', (_req: Request, res: Response) => {
  const hasCredentials = !!(process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_CLIENT_SECRET);
  res.json({
    success: true,
    adapterState: hasCredentials ? 'CONNECTED' : 'DEMO_MODE',
    isProductionAuthorized: hasCredentials,
    environment: hasCredentials ? 'PRODUCTION_NAD' : 'SYNTHETIC_SANDBOX',
    source: 'National Academic Depository (NAD) / DigiLocker Adapter',
    message: hasCredentials
      ? 'Official DigiLocker production credentials configured.'
      : 'Running in simulated sandbox demo mode. All returned documents are synthetic educational records for workflow evaluation.',
    allowedStates: ['NOT_CONNECTED', 'DEMO_MODE', 'AUTHORIZATION_REQUIRED', 'CONNECTED', 'RETRIEVAL_FAILED', 'DOCUMENT_UNAVAILABLE', 'SUCCESSFULLY_RETRIEVED'],
  });
});

// 1. List accredited Indian universities and examination boards on DigiLocker / NAD
digilockerRouter.get('/issuers', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const issuers = getDigiLockerIssuers();
    res.json({
      success: true,
      count: issuers.length,
      issuers,
    });
  } catch (err) {
    next(err);
  }
});

// 2. Pull official verified academic credential from National Academic Depository (NAD)
digilockerRouter.post('/pull-doc', (req: Request, res: Response) => {
  try {
    const { orgId, docType, rollNumber, passingYear, candidateName, credentialId } = req.body;

    if (!orgId || !docType || !rollNumber || !passingYear) {
      res.status(400).json({
        error: { message: 'orgId, docType, rollNumber, and passingYear are required to query DigiLocker / NAD' },
      });
      return;
    }

    const result = pullAndVerifyFromDigiLocker({
      orgId,
      docType,
      rollNumber: String(rollNumber).trim(),
      passingYear: Number(passingYear),
      candidateName,
      credentialId,
    });

    res.json({
      success: true,
      message: 'Academic record pulled and cryptographically verified from DigiLocker / NAD repository',
      document: result,
    });
  } catch (err: any) {
    res.status(400).json({
      error: { message: err.message || 'Failed to pull document from DigiLocker' },
    });
  }
});

// 3. Inspect pulled DigiLocker document by URI
digilockerRouter.get('/doc/:uri', (req: Request, res: Response, next: NextFunction) => {
  try {
    const uri = decodeURIComponent(req.params.uri);
    const db = getDatabase();
    const doc = db.prepare('SELECT * FROM digilocker_pulled_docs WHERE uri = ?').get(uri) as any;

    if (!doc) {
      res.status(404).json({ error: { message: 'DigiLocker document record not found' } });
      return;
    }

    res.json({
      success: true,
      document: {
        uri: doc.uri,
        orgId: doc.org_id,
        docType: doc.doc_type,
        rollNumber: doc.roll_number,
        candidateName: doc.candidate_name,
        passingYear: doc.passing_year,
        credentialId: doc.credential_id,
        metadata: JSON.parse(doc.raw_metadata_json),
        signatureHex: doc.digilocker_signature_hex,
        verificationStatus: doc.verification_status,
        pulledAt: doc.pulled_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
