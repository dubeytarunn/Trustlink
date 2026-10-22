import { getDatabase } from './connection';
import { hashPassword } from '../crypto/password';
import { generateUniversityKeyPair } from '../crypto/keys';
import { env } from '../config/env';
import { LogRepository } from './repositories/log-repository';

export async function seedDatabase() {
  console.log('🌱 Starting TrustLink database seed...');
  const db = getDatabase();
  const logRepo = new LogRepository(db);

  // 1. Create Admin User
  const adminEmail = 'admin@trustlink.demo';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail) as { id: number } | undefined;
  let adminUserId = existingAdmin?.id;

  if (!adminUserId) {
    const adminPassHash = await hashPassword('DemoAdmin123!');
    const info = db
      .prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'admin', 'active')")
      .run(adminEmail, adminPassHash);
    adminUserId = Number(info.lastInsertRowid);
    console.log(`  ✓ Created Admin: ${adminEmail} (DemoAdmin123!)`);

    logRepo.appendAuditLog({
      actor_user_id: adminUserId,
      action: 'ADMIN_SEEDED',
      entity_type: 'user',
      entity_id: String(adminUserId),
      details: { email: adminEmail },
    });
  }

  // 2. Fictional Universities
  const universitiesData = [
    {
      name: 'Northbridge Institute of Technology',
      domain: 'northbridge.edu',
      country: 'United States',
      registrarEmail: 'registrar@northbridge.edu',
      logoUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=128&auto=format&fit=crop&q=60',
      adminEmail: 'uni@northbridge.demo',
    },
    {
      name: 'Lakeshore University',
      domain: 'lakeshore.edu',
      country: 'Canada',
      registrarEmail: 'registrar@lakeshore.edu',
      logoUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=128&auto=format&fit=crop&q=60',
      adminEmail: 'uni@lakeshore.demo',
    },
    {
      name: 'Aurora School of Design',
      domain: 'aurora.edu',
      country: 'United Kingdom',
      registrarEmail: 'registrar@aurora.edu',
      logoUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?w=128&auto=format&fit=crop&q=60',
      adminEmail: 'uni@aurora.demo',
    },
  ];

  for (const u of universitiesData) {
    let uni = db.prepare('SELECT id FROM universities WHERE domain = ?').get(u.domain) as { id: number } | undefined;
    if (!uni) {
      const uniInfo = db
        .prepare('INSERT INTO universities (name, domain, country, registrar_email, logo_url, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(u.name, u.domain, u.country, u.registrarEmail, u.logoUrl, 'active');
      const uniId = Number(uniInfo.lastInsertRowid);

      // Generate keypair
      const key = generateUniversityKeyPair(uniId, 1, env.KEY_ENCRYPTION_SECRET);
      db.prepare(`
        INSERT INTO university_keys (university_id, kid, public_key_pem, public_jwk, private_key_enc, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(uniId, key.kid, key.publicKeyPem, JSON.stringify(key.publicJwk), key.privateKeyEnc);

      // Create uni admin user
      const uniPassHash = await hashPassword('DemoUni123!');
      db.prepare("INSERT INTO users (email, password_hash, role, university_id, status) VALUES (?, ?, 'university', ?, 'active')")
        .run(u.adminEmail, uniPassHash, uniId);

      console.log(`  ✓ Onboarded University: ${u.name} (Key: ${key.kid}, Login: ${u.adminEmail})`);

      logRepo.appendAuditLog({
        actor_user_id: adminUserId,
        action: 'UNIVERSITY_ONBOARDED',
        entity_type: 'university',
        entity_id: String(uniId),
        details: { name: u.name, domain: u.domain, kid: key.kid },
      });
    }
  }

  // 3. Demo Student User
  const studentEmail = 'student@northbridge.demo';
  const existingStudent = db.prepare('SELECT id FROM users WHERE email = ?').get(studentEmail);
  if (!existingStudent) {
    const studentPass = await hashPassword('DemoStudent123!');
    const sInfo = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'student', 'active')").run(studentEmail, studentPass);
    const sUserId = Number(sInfo.lastInsertRowid);
    db.prepare("INSERT INTO students (user_id, university_id, student_number, full_name, email) VALUES (?, 1, '24BAI1523', 'Tarun Dubey', ?)").run(sUserId, studentEmail);
    console.log(`  ✓ Created Demo Student: ${studentEmail} (DemoStudent123!)`);
  }

  // 4. Demo Employer User
  const employerEmail = 'hr@acme-corp.demo';
  const existingEmployer = db.prepare('SELECT id FROM users WHERE email = ?').get(employerEmail);
  if (!existingEmployer) {
    const empPass = await hashPassword('DemoEmployer123!');
    const eInfo = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'employer', 'active')").run(employerEmail, empPass);
    const eUserId = Number(eInfo.lastInsertRowid);
    db.prepare(`
      INSERT INTO employers (user_id, company_name, email_domain, official_email, website, status)
      VALUES (?, 'Acme Global Corporation', 'acme-corp.demo', ?, 'https://acme-corp.demo', 'verified')
    `).run(eUserId, employerEmail);
    console.log(`  ✓ Created Demo Employer: ${employerEmail} (DemoEmployer123!)`);
  }

  // 5. Demo Template & Signed Credential (for Northbridge / Tarun Dubey)
  const studentRow = db.prepare("SELECT * FROM students WHERE email = 'student@northbridge.demo'").get() as any;
  const uniKey = db.prepare("SELECT * FROM university_keys WHERE university_id = 1 AND status = 'active'").get() as any;
  const uniRow = db.prepare("SELECT * FROM universities WHERE id = 1").get() as any;

  if (studentRow && uniKey && uniRow) {
    let template = db.prepare("SELECT * FROM credential_templates WHERE university_id = 1 AND name = ?").get('Bachelor of Science in Computer Science') as any;
    if (!template) {
      const claimSchema = [
        { name: 'studentName', type: 'string', required: true },
        { name: 'studentNumber', type: 'string', required: true },
        { name: 'degree', type: 'string', required: true },
        { name: 'major', type: 'string', required: true },
        { name: 'graduationYear', type: 'number', required: true },
        { name: 'gpa', type: 'string', required: false },
        { name: 'honors', type: 'string', required: false },
      ];
      const employerVisible = ['studentName', 'degree', 'major', 'graduationYear', 'honors'];
      const tInfo = db.prepare(`
        INSERT INTO credential_templates (university_id, name, type, claim_schema_json, employer_visible_claims_json)
        VALUES (1, 'Bachelor of Science in Computer Science', 'degree', ?, ?)
      `).run(JSON.stringify(claimSchema), JSON.stringify(employerVisible));
      template = { id: Number(tInfo.lastInsertRowid) };
      console.log(`  ✓ Created Demo Template: Bachelor of Science in Computer Science`);
    }

    // 5. Demo Credentials for Tarun Dubey
    const { buildSignedPayload } = await import('../crypto/commitments');
    const { signPayload } = await import('../crypto/sign-verify');
    const { decryptPrivateKey } = await import('../crypto/keys');
    const privateKeyPem = decryptPrivateKey(uniKey.private_key_enc, env.KEY_ENCRYPTION_SECRET);

    // 5a. Primary Valid Demo Credential: TL-G807-HDAB-BZ7R-8
    let primaryCred = db.prepare("SELECT * FROM credentials WHERE credential_id = ?").get('TL-G807-HDAB-BZ7R-8') as any;
    if (!primaryCred) {
      const credentialId = 'TL-G807-HDAB-BZ7R-8';
      const claimsMap = {
        studentName: 'Tarun Dubey',
        studentNumber: '24BAI1523',
        degree: 'Bachelor of Science',
        major: 'Computer Science & AI',
        graduationYear: 2026,
        gpa: '3.92 / 4.00',
        honors: 'Summa Cum Laude',
      };

      const issuedAt = new Date().toISOString();
      const { payload, salts } = buildSignedPayload({
        credentialId,
        issuer: { id: 1, name: uniRow.name, kid: uniKey.kid },
        credentialType: 'degree',
        issuedAt,
        claimsMap,
      });

      const signature = signPayload(payload, privateKeyPem);
      const payloadHash = (await import('crypto')).default.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      const cInfo = db.prepare(`
        INSERT INTO credentials (credential_id, university_id, student_id, template_id, payload_json, signature, kid, claims_json, salts_json, payload_hash, status, issued_at)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        credentialId,
        studentRow.id,
        template.id,
        JSON.stringify(payload),
        signature,
        uniKey.kid,
        JSON.stringify(claimsMap),
        JSON.stringify(salts),
        payloadHash,
        issuedAt
      );

      primaryCred = { id: Number(cInfo.lastInsertRowid), credential_id: credentialId, claims_json: JSON.stringify(claimsMap), salts_json: JSON.stringify(salts) };
      console.log(`  ✓ Issued Demo Signed Credential: ${credentialId} for ${studentRow.full_name}`);

      try {
        db.prepare(`
          INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
          VALUES (?, NULL, 'active', 'Initial credential issuance', 1)
        `).run(credentialId);
      } catch {}
    }

    // 5b. Demo Share Links for TL-G807-HDAB-BZ7R-8
    const primaryClaimsMap = JSON.parse(primaryCred.claims_json || '{}');
    const primarySaltsMap = JSON.parse(primaryCred.salts_json || '{}');
    const disclosedClaims = ['studentName', 'degree', 'major', 'graduationYear', 'honors'];
    const reveals = disclosedClaims.map((claimName) => ({
      name: claimName,
      value: primaryClaimsMap[claimName],
      salt: primarySaltsMap[claimName],
    }));

    // Preserved demo share token (never expiring)
    const shareToken = 'demo-share-verified-token';
    const farFutureExpiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO shares (share_token, credential_id, disclosed_claims_json, reveals_json, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      shareToken,
      primaryCred.id,
      JSON.stringify(disclosedClaims),
      JSON.stringify(reveals),
      farFutureExpiresAt
    );
    console.log(`  ✓ Verified Demo Share Link: /verify/share/${shareToken}`);

    // Preserved expired share token (Feature 8 demo)
    const expiredShareToken = 'demo-share-expired-token';
    const pastExpiresAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO shares (share_token, credential_id, disclosed_claims_json, reveals_json, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      expiredShareToken,
      primaryCred.id,
      JSON.stringify(disclosedClaims),
      JSON.stringify(reveals),
      pastExpiresAt
    );
    console.log(`  ✓ Verified Expired Share Link: /verify/share/${expiredShareToken}`);

    // 5c. Micro-Credential / Skill: TL-SKILL-8080-ZK7R-9 (Feature 9 demo)
    const existingSkill = db.prepare("SELECT id FROM credentials WHERE credential_id = 'TL-SKILL-8080-ZK7R-9'").get();
    if (!existingSkill) {
      let skillTemplate = db.prepare("SELECT id FROM credential_templates WHERE name = 'Advanced Cryptography & Zero-Knowledge Proofs'").get() as any;
      if (!skillTemplate) {
        const sInfo = db.prepare(`
          INSERT INTO credential_templates (university_id, name, type, claim_schema_json, employer_visible_claims_json)
          VALUES (1, 'Advanced Cryptography & Zero-Knowledge Proofs', 'skill', '{"studentName":"string","skill":"string","proficiency":"string","issuedAt":"string"}', '["studentName","skill","proficiency","issuedAt"]')
        `).run();
        skillTemplate = { id: Number(sInfo.lastInsertRowid) };
      }

      const skillClaims = {
        studentName: 'Tarun Dubey',
        skill: 'Zero-Knowledge Proofs & ECDSA P-256',
        proficiency: 'Advanced / Production Ready',
        grade: 'Distinction',
      };
      const skillCredId = 'TL-SKILL-8080-ZK7R-9';
      const skillPayloadData = buildSignedPayload({
        credentialId: skillCredId,
        issuer: { id: 1, name: uniRow.name, kid: uniKey.kid },
        credentialType: 'skill',
        issuedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        claimsMap: skillClaims,
      });
      const skillSig = signPayload(skillPayloadData.payload, privateKeyPem);
      const skillHash = (await import('crypto')).default.createHash('sha256').update(JSON.stringify(skillPayloadData.payload)).digest('hex');

      db.prepare(`
        INSERT INTO credentials (credential_id, university_id, student_id, template_id, payload_json, signature, kid, claims_json, salts_json, payload_hash, status, issued_at)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        skillCredId,
        studentRow.id,
        skillTemplate.id,
        JSON.stringify(skillPayloadData.payload),
        skillSig,
        uniKey.kid,
        JSON.stringify(skillClaims),
        JSON.stringify(skillPayloadData.salts),
        skillHash,
        new Date().toISOString()
      );
      console.log(`  ✓ Seeded Micro-Credential: ${skillCredId}`);
    }

    // 5d. Revoked Credential: TL-REVOKED-DEMO-0001-A (Feature 2 demo)
    const existingRevoked = db.prepare("SELECT id FROM credentials WHERE credential_id = 'TL-REVOKED-DEMO-0001-A'").get();
    if (!existingRevoked) {
      const revokedCredId = 'TL-REVOKED-DEMO-0001-A';
      const revokedClaims = {
        studentName: 'Tarun Dubey',
        degree: 'Associate Diploma in Computer Systems',
        completionYear: 2024,
      };
      const revPayloadData = buildSignedPayload({
        credentialId: revokedCredId,
        issuer: { id: 1, name: uniRow.name, kid: uniKey.kid },
        credentialType: 'certificate',
        issuedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
        claimsMap: revokedClaims,
      });
      const revSig = signPayload(revPayloadData.payload, privateKeyPem);
      const revHash = (await import('crypto')).default.createHash('sha256').update(JSON.stringify(revPayloadData.payload)).digest('hex');

      db.prepare(`
        INSERT INTO credentials (credential_id, university_id, student_id, template_id, payload_json, signature, kid, claims_json, salts_json, payload_hash, status, revoked_reason, revoked_at, issued_at)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'revoked', 'Replaced by B.S. Full Degree', datetime('now', '-30 days'), ?)
      `).run(
        revokedCredId,
        studentRow.id,
        template.id,
        JSON.stringify(revPayloadData.payload),
        revSig,
        uniKey.kid,
        JSON.stringify(revokedClaims),
        JSON.stringify(revPayloadData.salts),
        revHash,
        new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
      );
      try {
        db.prepare(`
          INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
          VALUES (?, 'active', 'revoked', 'Replaced by B.S. Full Degree', 1)
        `).run(revokedCredId);
      } catch {}
      console.log(`  ✓ Seeded Revoked Credential: ${revokedCredId}`);
    }

    // 5e. Suspended Credential: TL-SUSPEND-DEMO-0002-B (Feature 2 demo)
    const existingSusp = db.prepare("SELECT id FROM credentials WHERE credential_id = 'TL-SUSPEND-DEMO-0002-B'").get();
    if (!existingSusp) {
      const suspendedCredId = 'TL-SUSPEND-DEMO-0002-B';
      const suspClaims = {
        studentName: 'Tarun Dubey',
        degree: 'Minor in Quantitative Finance',
        gpa: '3.80 / 4.00',
      };
      const suspPayloadData = buildSignedPayload({
        credentialId: suspendedCredId,
        issuer: { id: 1, name: uniRow.name, kid: uniKey.kid },
        credentialType: 'certificate',
        issuedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        claimsMap: suspClaims,
      });
      const suspSig = signPayload(suspPayloadData.payload, privateKeyPem);
      const suspHash = (await import('crypto')).default.createHash('sha256').update(JSON.stringify(suspPayloadData.payload)).digest('hex');

      db.prepare(`
        INSERT INTO credentials (credential_id, university_id, student_id, template_id, payload_json, signature, kid, claims_json, salts_json, payload_hash, status, suspended_reason, suspended_at, issued_at)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'suspended', 'Pending semester library clearance verification', datetime('now', '-2 days'), ?)
      `).run(
        suspendedCredId,
        studentRow.id,
        template.id,
        JSON.stringify(suspPayloadData.payload),
        suspSig,
        uniKey.kid,
        JSON.stringify(suspClaims),
        JSON.stringify(suspPayloadData.salts),
        suspHash,
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      );
      try {
        db.prepare(`
          INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
          VALUES (?, 'active', 'suspended', 'Pending semester library clearance verification', 1)
        `).run(suspendedCredId);
      } catch {}
      console.log(`  ✓ Seeded Suspended Credential: ${suspendedCredId}`);
    }

    // 5f. Employer Credential Request (Feature 7 demo)
    const empRow = db.prepare("SELECT id FROM employers WHERE official_email = 'hr@acme-corp.demo'").get() as any;
    if (empRow) {
      db.prepare(`
        INSERT OR IGNORE INTO credential_requests (request_id, employer_id, student_email, credential_id, requested_claims_json, purpose, status)
        VALUES ('REQ-7842-DEMO-01', ?, 'student@northbridge.demo', 'TL-G807-HDAB-BZ7R-8', ?, 'Senior Software Engineer Background Check', 'PENDING')
      `).run(
        empRow.id,
        JSON.stringify(['degree', 'major', 'graduationYear'])
      );
      console.log(`  ✓ Seeded Employer Credential Request: REQ-7842-DEMO-01`);
    }
  }

  // 6. Seed Aadhaar National ID Registry
  const demoAadhaars = [
    {
      aadhaar_number: '234567890123',
      masked_aadhaar: 'XXXX-XXXX-0123',
      full_name: 'Arjun Sharma',
      dob: '2001-08-14',
      gender: 'MALE',
      address: 'B-402, Green Glen Heights, Bellandur, Bengaluru, Karnataka - 560103',
      phone_last4: '9842',
      photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80',
    },
    {
      aadhaar_number: '567890123456',
      masked_aadhaar: 'XXXX-XXXX-3456',
      full_name: 'Priya Patel',
      dob: '2002-04-22',
      gender: 'FEMALE',
      address: '12/A, Navrangpura, Ahmedabad, Gujarat - 380009',
      phone_last4: '7120',
      photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256&auto=format&fit=crop&q=80',
    },
    {
      aadhaar_number: '891012345678',
      masked_aadhaar: 'XXXX-XXXX-5678',
      full_name: 'Rohan Iyer',
      dob: '1999-11-03',
      gender: 'MALE',
      address: 'Flat 501, Powai Lake View, Mumbai, Maharashtra - 400076',
      phone_last4: '4491',
      photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&auto=format&fit=crop&q=80',
    },
    {
      aadhaar_number: '901234567890',
      masked_aadhaar: 'XXXX-XXXX-7890',
      full_name: 'Ananya Sen',
      dob: '2000-01-19',
      gender: 'FEMALE',
      address: '78 Salt Lake Sector V, Kolkata, West Bengal - 700091',
      phone_last4: '3312',
      photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&auto=format&fit=crop&q=80',
    },
  ];

  for (const a of demoAadhaars) {
    const existing = db.prepare('SELECT id FROM aadhaar_registry WHERE aadhaar_number = ?').get(a.aadhaar_number);
    if (!existing) {
      db.prepare(`
        INSERT INTO aadhaar_registry (aadhaar_number, masked_aadhaar, full_name, dob, gender, address, phone_last4, photo_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(a.aadhaar_number, a.masked_aadhaar, a.full_name, a.dob, a.gender, a.address, a.phone_last4, a.photo_url);
      console.log(`  ✓ Seeded Aadhaar Identity: ${a.full_name} (${a.masked_aadhaar})`);
    }
  }

  console.log('✅ Seed completed successfully.\n');
}

// Run directly if script invoked
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
