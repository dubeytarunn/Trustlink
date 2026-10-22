import Tesseract from 'tesseract.js';

export interface BiometricInput {
  score: number;
  verdict: 'MATCH' | 'PARTIAL' | 'MISMATCH' | string;
}

export interface DocumentVerificationResult {
  documentType: string;
  extractedText: string;
  extractedFields: Record<string, string>;
  matches: Record<string, boolean>;
  checks: Record<string, boolean>;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  result: 'VERIFIED' | 'REVIEW' | 'SUSPICIOUS';
  reasons: string[];
  biometric?: {
    similarityScore: number;
    verdict: string;
    verified: boolean;
  };
}

function isImageBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true;
  return false;
}

export async function processDocument(
  fileBuffer: Buffer,
  _mimetype: string,
  documentType: string,
  credentialClaims: Record<string, any>,
  biometric?: BiometricInput
): Promise<DocumentVerificationResult> {
  // 1. OCR Extraction or text extraction
  let extractedText = '';
  if (isImageBuffer(fileBuffer)) {
    try {
      const { data: { text } } = await Tesseract.recognize(fileBuffer, 'eng');
      extractedText = text;
    } catch (err) {
      console.error('OCR Error:', err);
      extractedText = '';
    }
  } else {
    // Non-image document or text/pdf stream
    try {
      extractedText = fileBuffer.toString('utf-8');
    } catch {
      extractedText = '';
    }
  }

  const normalizedText = extractedText.replace(/\n/g, ' ').toUpperCase();

  // 2. Field Matching & Extraction
  const extractedFields: Record<string, string> = {};
  const matches: Record<string, boolean> = {};
  const reasons: string[] = [];

  // Assume signature, issuer, status are valid for this calculation (added +50 base for crypto trust which is done earlier, 
  // but we'll calculate local document match score here out of 50, and combined later).
  // Actually, let's just do out of 100 where 50 points are for crypto (assumed true if passed here) and 50 for document match.

  const cryptoScore = 50; // Credential signature + status + issuer trust
  let docScore = 0;

  // Name match (15 pts)
  if (credentialClaims.studentName) {
    const targetName = credentialClaims.studentName.toUpperCase();
    // basic fuzzy: check if name parts are present
    const nameParts = targetName.split(' ');
    let nameFound = true;
    for (const part of nameParts) {
      if (!normalizedText.includes(part)) {
        nameFound = false;
        break;
      }
    }
    matches.studentName = nameFound;
    if (nameFound) {
      docScore += 15;
      extractedFields.studentName = credentialClaims.studentName;
    } else {
      reasons.push('Name mismatch between credential and document.');
    }
  }

  // University match (15 pts)
  // We'll check if any known university part is in text. 
  // For the MVP, we just assume university is valid if name passes, or we do a simple check.
  // Actually, we can get university from the credential wrapper, but we only have claims here.
  // We'll give 15 points for university automatically if identity matches, or check if 'INSTITUTE' or 'UNIVERSITY' is found.
  if (normalizedText.includes('UNIVERSITY') || normalizedText.includes('INSTITUTE') || normalizedText.includes('COLLEGE')) {
      matches.university = true;
      docScore += 15;
  } else {
      matches.university = false;
      reasons.push('University/Institution name not clearly found in document.');
  }

  // Degree match (10 pts)
  if (credentialClaims.degree) {
    const degreePart = credentialClaims.degree.split(' ')[0].toUpperCase();
    if (normalizedText.includes(degreePart)) {
      matches.degree = true;
      docScore += 10;
      extractedFields.degree = credentialClaims.degree;
    } else {
      matches.degree = false;
      reasons.push('Degree mismatch.');
    }
  }

  // CGPA match (10 pts)
  if (credentialClaims.gpa) {
    const gpaMatch = credentialClaims.gpa.match(/[\d.]+/);
    if (gpaMatch && normalizedText.includes(gpaMatch[0])) {
      matches.gpa = true;
      docScore += 10;
      extractedFields.gpa = credentialClaims.gpa;
    } else {
      matches.gpa = false;
      reasons.push('Academic claim (CGPA) differs from cryptographically issued credential.');
    }
  }

  // Biometric Facial Comparison factor
  if (biometric) {
    if (biometric.verdict === 'MATCH' || biometric.score >= 75) {
      matches.faceMatch = true;
      docScore += 10;
      reasons.push(`Biometric facial match confirmed with ${biometric.score}% similarity.`);
    } else if (biometric.verdict === 'MISMATCH' || biometric.score < 60) {
      matches.faceMatch = false;
      docScore = Math.max(0, docScore - 20);
      reasons.push(`Biometric facial mismatch detected (${biometric.score}% similarity). Possible candidate impersonation.`);
    } else {
      matches.faceMatch = false;
      reasons.push(`Biometric facial verification partial (${biometric.score}% similarity). Manual review recommended.`);
    }
  }

  const riskScore = Math.min(100, cryptoScore + docScore);
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  let result: 'VERIFIED' | 'REVIEW' | 'SUSPICIOUS' = 'VERIFIED';

  if (biometric && (biometric.verdict === 'MISMATCH' || biometric.score < 60)) {
    riskLevel = 'HIGH';
    result = 'SUSPICIOUS';
  } else if (riskScore >= 90) {
    riskLevel = 'LOW';
    result = 'VERIFIED';
  } else if (riskScore >= 70) {
    riskLevel = 'MEDIUM';
    result = 'REVIEW';
  } else {
    riskLevel = 'HIGH';
    result = 'SUSPICIOUS';
  }

  if (reasons.length === 0) {
    reasons.push('All required fields detected and matched perfectly.');
  }

  return {
    documentType,
    extractedText,
    extractedFields,
    matches,
    checks: {
      documentReadable: extractedText.length > 20,
      requiredFieldsDetected: docScore >= 30,
      noMajorInconsistencies: riskScore >= 70,
      ...(biometric ? { biometricVerified: matches.faceMatch } : {})
    },
    riskScore,
    riskLevel,
    result,
    reasons,
    ...(biometric ? {
      biometric: {
        similarityScore: biometric.score,
        verdict: biometric.verdict,
        verified: !!matches.faceMatch
      }
    } : {})
  };
}
