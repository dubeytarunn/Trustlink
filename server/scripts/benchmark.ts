import qrcode from 'qrcode';
import { generateUniversityKeyPair, decryptPrivateKey } from '../src/crypto/keys';
import { buildSignedPayload, ClaimReveal } from '../src/crypto/commitments';
import { signPayload, verifyCredential } from '../src/crypto/sign-verify';
import { generateCredentialId } from '../src/crypto/credential-id';
import { performance } from 'perf_hooks';

const TEST_SECRET = 'e7b89f2d1a4c3e5b6a7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90';

async function runBenchmarks() {
  console.log('===============================================================');
  console.log('  TrustLink Cryptographic Performance Benchmark (NFR-01..03)   ');
  console.log('===============================================================\n');

  const keyPair = generateUniversityKeyPair(1, 1, TEST_SECRET);
  const privateKeyPem = decryptPrivateKey(keyPair.privateKeyEnc, TEST_SECRET);

  const claims = {
    fullName: 'Tarun Dubey',
    studentNumber: '24BAI1523',
    degree: 'Bachelor of Technology',
    program: 'Computer Science and Engineering',
    major: 'Artificial Intelligence & Machine Learning',
    grade: '9.42 CGPA',
    honors: 'First Class with Distinction',
    graduationDate: '2026-07-15',
  };

  const ITERATIONS = 100;
  console.log(`Running ${ITERATIONS} iterations per test case...\n`);

  // --- NFR-01: Credential Signing Benchmark ---
  const signTimes: number[] = [];
  let lastPayload: any;
  let lastSignature: string = '';
  let lastSalts: Record<string, string> = {};

  for (let i = 0; i < ITERATIONS; i++) {
    const credId = generateCredentialId();
    const t0 = performance.now();

    const { payload, salts } = buildSignedPayload({
      credentialId: credId,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: keyPair.kid },
      credentialType: 'degree',
      issuedAt: '2026-07-18T10:00:00.000Z',
      claimsMap: claims,
    });
    const sig = signPayload(payload, privateKeyPem);

    const t1 = performance.now();
    signTimes.push(t1 - t0);

    lastPayload = payload;
    lastSignature = sig;
    lastSalts = salts;
  }

  const avgSignTime = signTimes.reduce((a, b) => a + b, 0) / signTimes.length;
  const maxSignTime = Math.max(...signTimes);
  const minSignTime = Math.min(...signTimes);

  console.log('---------------------------------------------------------------');
  console.log('NFR-01: Credential Signing Performance');
  console.log(`  SRS Target:   < 1000.00 ms`);
  console.log(`  Average Time: ${avgSignTime.toFixed(3)} ms`);
  console.log(`  Min / Max:    ${minSignTime.toFixed(3)} ms / ${maxSignTime.toFixed(3)} ms`);
  console.log(`  Throughput:   ${(1000 / avgSignTime).toFixed(0)} ops/sec`);
  console.log(`  Status:       ${avgSignTime < 1000 ? '✅ PASS (WELL UNDER 1s)' : '❌ FAIL'}`);

  // --- NFR-02: Verification Benchmark ---
  const reveals: ClaimReveal[] = Object.entries(claims).map(([name, value]) => ({
    name,
    value,
    salt: lastSalts[name],
  }));

  const verifyTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();

    const result = verifyCredential({
      payload: lastPayload,
      signature: lastSignature,
      publicKeyPem: keyPair.publicKeyPem,
      reveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    const t1 = performance.now();
    if (!result.isValid) {
      throw new Error('Verification benchmark encountered invalid result');
    }
    verifyTimes.push(t1 - t0);
  }

  const avgVerifyTime = verifyTimes.reduce((a, b) => a + b, 0) / verifyTimes.length;
  const maxVerifyTime = Math.max(...verifyTimes);
  const minVerifyTime = Math.min(...verifyTimes);

  console.log('---------------------------------------------------------------');
  console.log('NFR-02: Credential Verification Performance');
  console.log(`  SRS Target:   < 1000.00 ms`);
  console.log(`  Average Time: ${avgVerifyTime.toFixed(3)} ms`);
  console.log(`  Min / Max:    ${minVerifyTime.toFixed(3)} ms / ${maxVerifyTime.toFixed(3)} ms`);
  console.log(`  Throughput:   ${(1000 / avgVerifyTime).toFixed(0)} ops/sec`);
  console.log(`  Status:       ${avgVerifyTime < 1000 ? '✅ PASS (WELL UNDER 1s)' : '❌ FAIL'}`);

  // --- NFR-03: QR Code Generation Benchmark ---
  const sampleVerifyUrl = `https://trustlink.org/verify/${lastPayload.credentialId}`;
  const qrTimes: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await qrcode.toDataURL(sampleVerifyUrl, { errorCorrectionLevel: 'M', width: 256 });
    const t1 = performance.now();
    qrTimes.push(t1 - t0);
  }

  const avgQrTime = qrTimes.reduce((a, b) => a + b, 0) / qrTimes.length;
  const maxQrTime = Math.max(...qrTimes);
  const minQrTime = Math.min(...qrTimes);

  console.log('---------------------------------------------------------------');
  console.log('NFR-03: QR Code Generation Performance');
  console.log(`  SRS Target:   < 1000.00 ms`);
  console.log(`  Average Time: ${avgQrTime.toFixed(3)} ms`);
  console.log(`  Min / Max:    ${minQrTime.toFixed(3)} ms / ${maxQrTime.toFixed(3)} ms`);
  console.log(`  Throughput:   ${(1000 / avgQrTime).toFixed(0)} ops/sec`);
  console.log(`  Status:       ${avgQrTime < 1000 ? '✅ PASS (WELL UNDER 1s)' : '❌ FAIL'}`);
  console.log('===============================================================\n');
}

runBenchmarks().catch(console.error);
