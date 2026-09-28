import CertificateDao from '../../dao/certificate.dao';
import ErrorHandler from '../../utils/error-handler';
import { renderCertificatePdf } from '../../utils/certificate-pdf';
import { NAMES } from '../../config/gamification.config';
import { ICertificate } from '../../interfaces/lms-rewards.interface';

// Printed on the PDF: the frontend page that calls the verify API below
export const verifyUrlFor = (certificateId: string): string | undefined => {
  const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}/verify/${certificateId}` : undefined;
};

// API path the profile screen uses for the download button
export const downloadPathFor = (certificateId: string): string => `/api/v1/public/lms/certificates/${certificateId}/pdf`;

const notFound = () => new ErrorHandler(404, 'Certificate not found');

const render = (c: ICertificate) =>
  renderCertificatePdf({
    type: c.type,
    studentName: c.metadata?.userName ?? 'Student',
    courseName: c.metadata?.courseName ?? 'Course',
    issueDate: new Date(c.issueDate),
    certificateId: c.certificateId,
    verifyUrl: verifyUrlFor(c.certificateId)
  });

const fileNameFor = (c: ICertificate): string => {
  const course = (c.metadata?.courseName ?? 'course').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `Kokoon-Labs-${course || 'course'}-${c.type === 'excellence' ? 'Excellence' : 'Completion'}.pdf`;
};

// ---------------------------------------------------------------------
// Download (owner only). Rendered on request from the snapshot saved at
// issue time, so the PDF always matches the record and nothing is stored.
// ---------------------------------------------------------------------
export const downloadCertificate = async (userId: string, certificateId: string) => {
  const cert = await CertificateDao.findForOwner(certificateId, userId);
  if (!cert) throw notFound();
  return { fileName: fileNameFor(cert), bytes: await render(cert) };
};

// Students are 13-15, so the public page shows first name + last initial only
const maskName = (full: string): string => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Student';
  const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${parts[0]}${last}`;
};

// ---------------------------------------------------------------------
// Public verification (no login): confirms a certificate id is genuine
// ---------------------------------------------------------------------
export const verifyCertificate = async (certificateId: string) => {
  const cert = await CertificateDao.findByCertificateId(certificateId);
  if (!cert) {
    return { valid: false, message: 'No certificate found with this ID. Check it and try again.' };
  }
  return {
    valid: true,
    message: 'This certificate is genuine and was issued by Kokoon Labs.',
    certificateId: cert.certificateId,
    name: NAMES.certificate[cert.type],
    type: cert.type,
    studentName: maskName(cert.metadata?.userName ?? ''),
    courseName: cert.metadata?.courseName ?? null,
    issueDate: cert.issueDate
  };
};
