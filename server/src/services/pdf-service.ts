import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface CertificateData {
  credentialId: string;
  universityName: string;
  universityDomain?: string;
  studentName: string;
  studentNumber?: string;
  degreeTitle: string;
  major?: string;
  graduationDate?: string;
  issuedAt: string;
  payloadHash: string;
  kid: string;
  signature: string;
  status: string;
  verifyUrl: string;
}

/**
 * Generates an official, tamper-evident Academic Certificate in PDF format
 * using PDFKit and embeds a verification QR code.
 */
export async function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  // Generate QR Code buffer pointing to TrustLink verification page
  const qrBuffer = await QRCode.toBuffer(data.verifyUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 140,
    color: {
      dark: '#0B1B3A',
      light: '#FFFFFF',
    },
  });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 36, bottom: 36, left: 36, right: 36 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const width = doc.page.width;
      const height = doc.page.height;

      // 1. Certificate Background & Outer Border
      doc.rect(20, 20, width - 40, height - 40)
        .lineWidth(3)
        .strokeColor('#0B1B3A')
        .stroke();

      // Inner ornate gold border
      doc.rect(26, 26, width - 52, height - 52)
        .lineWidth(1)
        .strokeColor('#C5A059')
        .stroke();

      // Soft ambient watermark
      doc.save();
      doc.fillColor('#F1F5F9');
      doc.fontSize(72);
      doc.font('Helvetica-Bold');
      doc.opacity(0.12);
      doc.text('TRUSTLINK VERIFIED', 0, height / 2 - 40, {
        align: 'center',
        width: width,
      });
      doc.restore();

      // 2. University / Institution Header
      doc.y = 50;
      doc.fillColor('#0B1B3A')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text(data.universityName.toUpperCase(), { align: 'center' });

      if (data.universityDomain) {
        doc.fillColor('#64748B')
          .fontSize(10)
          .font('Helvetica')
          .text(`Official Accredited Issuer • ${data.universityDomain}`, { align: 'center' });
      }

      doc.moveDown(0.8);

      // Decorative divider
      const centerX = width / 2;
      doc.moveTo(centerX - 100, doc.y)
        .lineTo(centerX + 100, doc.y)
        .lineWidth(1.5)
        .strokeColor('#C5A059')
        .stroke();

      doc.moveDown(0.8);

      // 3. Conferral Subheading
      doc.fillColor('#475569')
        .fontSize(11)
        .font('Helvetica')
        .text('THIS IS TO CERTIFY THAT', { align: 'center', characterSpacing: 2 });

      doc.moveDown(0.6);

      // Student Name
      doc.fillColor('#0B1B3A')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text(data.studentName, { align: 'center' });

      if (data.studentNumber) {
        doc.fillColor('#64748B')
          .fontSize(10)
          .font('Helvetica')
          .text(`Student ID: ${data.studentNumber}`, { align: 'center' });
      }

      doc.moveDown(0.6);

      // Degree Award
      doc.fillColor('#475569')
        .fontSize(11)
        .font('Helvetica')
        .text('HAS SUCCESSFULLY FULFILLED ALL REQUIREMENTS AND IS DULY ADMITTED TO THE DEGREE OF', {
          align: 'center',
          characterSpacing: 0.5,
        });

      doc.moveDown(0.5);

      // Degree Title & Major
      doc.fillColor('#1E3A8A')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(data.degreeTitle, { align: 'center' });

      if (data.major) {
        doc.fillColor('#334155')
          .fontSize(13)
          .font('Helvetica-Bold')
          .text(`With Specialization in ${data.major}`, { align: 'center' });
      }

      doc.moveDown(0.4);

      // Award Date
      const dateStr = data.graduationDate || new Date(data.issuedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      doc.fillColor('#64748B')
        .fontSize(10)
        .font('Helvetica')
        .text(`Awarded on ${dateStr}`, { align: 'center' });

      // 4. Footer Section: QR Code on Left, Cryptographic Proofs on Right
      const footerY = height - 145;

      // Draw QR Code
      doc.image(qrBuffer, 50, footerY, { width: 90, height: 90 });

      // QR label
      doc.fillColor('#64748B')
        .fontSize(8)
        .font('Helvetica')
        .text('Scan to Verify on TrustLink', 42, footerY + 95, { width: 110, align: 'center' });

      // Center Security Seal / Status
      const isRevoked = data.status === 'revoked';
      const isSuspended = data.status === 'suspended';
      const statusLabel = isRevoked ? 'REVOKED' : isSuspended ? 'SUSPENDED' : 'CRYPTOGRAPHICALLY VERIFIED';
      const statusColor = isRevoked ? '#DC2626' : isSuspended ? '#D97706' : '#059669';

      doc.roundedRect(centerX - 90, footerY + 15, 180, 26, 4)
        .lineWidth(1)
        .strokeColor(statusColor)
        .stroke();

      doc.fillColor(statusColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(statusLabel, centerX - 90, footerY + 23, { width: 180, align: 'center' });

      doc.fillColor('#64748B')
        .fontSize(8)
        .font('Helvetica')
        .text(`Issued: ${new Date(data.issuedAt).toISOString().split('T')[0]}`, centerX - 90, footerY + 48, {
          width: 180,
          align: 'center',
        });

      // Right: Cryptographic Fingerprints & Metadata
      const rightX = width - 290;
      doc.fillColor('#0B1B3A')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text('DECENTRALIZED CREDENTIAL METADATA', rightX, footerY);

      doc.fillColor('#475569')
        .fontSize(7.5)
        .font('Helvetica')
        .text(`Credential ID: `, rightX, footerY + 14, { continued: true })
        .font('Courier-Bold')
        .text(data.credentialId);

      doc.font('Helvetica')
        .text(`Issuer Key ID (kid): `, rightX, footerY + 26, { continued: true })
        .font('Courier')
        .text(data.kid.length > 28 ? data.kid.substring(0, 28) + '...' : data.kid);

      doc.font('Helvetica')
        .text(`SHA-256 Hash: `, rightX, footerY + 38, { continued: true })
        .font('Courier')
        .text(data.payloadHash.substring(0, 24) + '...');

      doc.font('Helvetica')
        .text(`Signing Algorithm: ECDSA P-256 (secp256r1) SHA-256`, rightX, footerY + 50);

      doc.fillColor('#64748B')
        .fontSize(7)
        .font('Helvetica-Oblique')
        .text(
          'Root of trust is cryptographically established by university private key. Tampering with this certificate immediately invalidates verification on the TrustLink public registry.',
          rightX,
          footerY + 64,
          { width: 240 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
