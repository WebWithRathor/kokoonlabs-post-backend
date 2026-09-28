import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export interface CertificatePdfInput {
  type: 'progress' | 'excellence';
  studentName: string;
  courseName: string;
  issueDate: Date;
  certificateId: string;
  verifyUrl?: string;
}

// Standard PDF fonts only cover Latin (WinAnsi) characters. Anything else
// (e.g. a name typed in Devanagari) is transliterated where possible and
// otherwise dropped, so the PDF never fails to render. For full Unicode
// names, embed a TTF with @pdf-lib/fontkit.
const toWinAnsi = (s: string): string =>
  Array.from(s.normalize('NFC'))
    // Keep Latin-1 letters like "ë"; strip accents only from characters outside it
    .map(ch => (/[\x20-\x7E\xA0-\xFF]/.test(ch) ? ch : ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')))
    .join('')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    // A dropped non-Latin part can leave a dangling separator ("Zoe Fernandes -")
    .replace(/^[\s\-,.|/]+|[\s\-,.|/]+$/g, '')
    .trim();

const COLORS = {
  ink: rgb(0.11, 0.14, 0.2),
  quiet: rgb(0.42, 0.45, 0.5),
  brand: rgb(0.114, 0.62, 0.459), // #1D9E75
  gold: rgb(0.78, 0.6, 0.18),
  paper: rgb(0.99, 0.985, 0.97)
};

const TITLES = {
  progress: 'Certificate of Completion',
  excellence: 'Certificate of Excellence'
} as const;

const LINES = {
  progress: 'has successfully completed the course',
  excellence: 'has completed the course with excellence, finishing ahead of schedule in'
} as const;

// Shrinks the font until the text fits the width
const fitSize = (font: PDFFont, text: string, maxWidth: number, start: number, min: number): number => {
  let size = start;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  return size;
};

const centered = (page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = COLORS.ink) => {
  const { width } = page.getSize();
  page.drawText(text, { x: (width - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
};

const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);

// A4 landscape certificate. Returns the PDF bytes.
export const renderCertificatePdf = async (input: CertificatePdfInput): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TITLES[input.type]} - ${toWinAnsi(input.studentName)}`);
  pdf.setAuthor('Kokoon Labs');
  pdf.setSubject(toWinAnsi(input.courseName));

  const page = pdf.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = input.type === 'excellence' ? COLORS.gold : COLORS.brand;

  // Paper + double border
  page.drawRectangle({ x: 0, y: 0, width, height, color: COLORS.paper });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: accent, borderWidth: 3 });
  page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: accent, borderWidth: 0.75 });

  // Header
  centered(page, 'KOKOON LABS', height - 104, sansBold, 14, accent);
  const title = TITLES[input.type];
  centered(page, title, height - 166, serifBold, 40);
  page.drawLine({
    start: { x: width / 2 - 120, y: height - 184 },
    end: { x: width / 2 + 120, y: height - 184 },
    thickness: 1.5,
    color: accent
  });

  // Body
  centered(page, 'This is proudly presented to', height - 232, serifItalic, 16, COLORS.quiet);
  const name = toWinAnsi(input.studentName) || 'Student';
  centered(page, name, height - 286, serifBold, fitSize(serifBold, name, width - 200, 38, 20));
  const line = LINES[input.type];
  centered(page, line, height - 326, serif, fitSize(serif, line, width - 160, 16, 11), COLORS.quiet);
  const course = toWinAnsi(input.courseName) || 'Course';
  centered(page, course, height - 368, sansBold, fitSize(sansBold, course, width - 200, 24, 14), accent);

  // Footer: date (left), certificate id (right), verify link (center)
  const footY = 96;
  const date = formatDate(input.issueDate);
  page.drawText(date, { x: 110, y: footY, size: 13, font: sansBold, color: COLORS.ink });
  page.drawLine({ start: { x: 100, y: footY - 8 }, end: { x: 290, y: footY - 8 }, thickness: 0.75, color: COLORS.quiet });
  page.drawText('Date of issue', { x: 110, y: footY - 24, size: 10, font: sans, color: COLORS.quiet });

  const id = toWinAnsi(input.certificateId);
  const idWidth = sansBold.widthOfTextAtSize(id, 13);
  page.drawText(id, { x: width - 110 - idWidth, y: footY, size: 13, font: sansBold, color: COLORS.ink });
  page.drawLine({ start: { x: width - 290, y: footY - 8 }, end: { x: width - 100, y: footY - 8 }, thickness: 0.75, color: COLORS.quiet });
  const idLabel = 'Certificate ID';
  page.drawText(idLabel, { x: width - 110 - sans.widthOfTextAtSize(idLabel, 10), y: footY - 24, size: 10, font: sans, color: COLORS.quiet });

  if (input.verifyUrl) {
    const verify = toWinAnsi(`Verify at ${input.verifyUrl}`);
    centered(page, verify, 58, sans, fitSize(sans, verify, width - 200, 9, 7), COLORS.quiet);
  }

  return await pdf.save();
};
