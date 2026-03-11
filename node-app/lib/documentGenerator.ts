/**
 * lib/documentGenerator.ts
 *
 * Generates Application Form documents (DOCX + PDF) for approved applications.
 *
 * DOCX — fills `templates/NUD-ACS-SDA-F-003 - Student Org Application Form.docx`
 *         via `docxtemplater` + `pizzip` + `docxtemplater-image-module-free`.
 *         Template tags must use single-brace syntax: {tagName}
 *         Image tags must use percent-brace syntax: {%tagName}
 * PDF  — independently generated via `pdfmake` server-side Printer.
 *         Mirrors the same sections as the NU template.
 *
 * Entry point:
 *   generateApplicationDocuments(applicationId)  — async, call without await
 *
 * Output files:
 *   nuconnect-files/applications/{applicationId}/form.docx
 *   nuconnect-files/applications/{applicationId}/form.pdf
 *
 * DB fields updated on tbl_application:
 *   document_generation_status, docx_path, pdf_path,
 *   docx_generated_at, pdf_generated_at
 *
 * Socket.IO events emitted to the applicant's private room:
 *   document:generated          — on success
 *   document:generation-failed  — on failure
 */

import path from 'path';
import fs from 'fs';
import { getApplicationDetails } from '../web/models/createOrgModel';

// docxtemplater + pizzip — fills the official NU DOCX template
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImageModule = require('docxtemplater-image-module-free');

// pdfmake server-side Printer (not the browser bundle)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: PdfPrinter } = require('pdfmake/js/Printer');

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------

const TEMPLATE_PATH = path.join(
  __dirname,
  '../templates/NUD-ACS-SDA-F-003 - Student Org Application Form.docx',
);

const ROBOTO_DIR = path.join(require.resolve('pdfmake'), '../../build/fonts/Roboto');
const PDF_FONTS = {
  Roboto: {
    normal:      path.join(ROBOTO_DIR, 'Roboto-Regular.ttf'),
    bold:        path.join(ROBOTO_DIR, 'Roboto-Medium.ttf'),
    italics:     path.join(ROBOTO_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(ROBOTO_DIR, 'Roboto-MediumItalic.ttf'),
  },
};

const NU_NAVY   = '#1B1464';
const NU_GOLD   = '#F5A623';
const CHECKED   = '\u{1F5F9}';  // ☑
const UNCHECKED = '\u2610';  // ☐

// Base directory where user e-signature files are stored
const APPROVAL_SIG_DIR =
  process.env.ESIGNATURES_DIR ??
  path.join(__dirname, '../nuconnect-files/esignatures');

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type AppDetails = NonNullable<Awaited<ReturnType<typeof getApplicationDetails>>>;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function appRef(id: number): string {
  return `OR${String(id).padStart(3, '0')}`;
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function academicYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function feeLabel(details: AppDetails): string {
  const { fee_type, fee_amount } = details.organization.membership_info;
  if (!fee_type || fee_type === 'Free') return 'Free';
  const amount = fee_amount ? `\u20B1${fee_amount.toLocaleString()}` : '—';
  return fee_type === 'Per_Term' ? `${amount} per term` : `${amount} per academic year`;
}

// ----------------------------------------------------------------------------
// Resolve extra fields not returned by getApplicationDetails
// (college name, submitter contact number)
// ----------------------------------------------------------------------------

async function resolveExtraFields(applicationId: number, details: AppDetails) {
  const { prisma } = await import('../config/db');

  const raw = await prisma.tbl_application.findUnique({
    where:  { application_id: applicationId },
    select: { submitter_contact_no: true, created_at: true, status: true },
  });

  let collegeName = '';
  if (details.organization.programs.length > 0) {
    const prog = await prisma.tbl_program.findUnique({
      where:   { program_id: details.organization.programs[0].id },
      include: { tbl_college: { select: { name: true } } },
    });
    collegeName = prog?.tbl_college?.name ?? '';
  }

  // ── Adviser: try from tbl_organization first, fall back to approval chain ──
  let adviserName  = '';
  let adviserEmail = '';

  if (details.application.organization_id) {
    const org = await prisma.tbl_organization.findUnique({
      where:   { organization_id: details.application.organization_id },
      include: {
        tbl_user_tbl_organization_adviser_idTotbl_user: {
          select: { f_name: true, l_name: true, email: true },
        },
      },
    });
    if (org) {
      const u = org.tbl_user_tbl_organization_adviser_idTotbl_user;
      adviserName  = `${u.f_name ?? ''} ${u.l_name ?? ''}`.trim();
      adviserEmail = u.email ?? '';
    }
  }

  // Fallback: pull Adviser from the application’s approval chain.
  // Use a two-step lookup (role → role_id → chain) to avoid Prisma
  // relation-filter reliability issues.
  if (!adviserName) {
    const adviserRole = await prisma.tbl_role.findFirst({
      where:  { role_name: 'Adviser' },
      select: { role_id: true },
    });
    if (adviserRole) {
      const adviserChain = await prisma.tbl_application_approval_chain.findFirst({
        where: {
          application_id:   applicationId,
          approver_role_id: adviserRole.role_id,
        },
        include: {
          tbl_user: { select: { f_name: true, l_name: true, email: true } },
        },
      });
      if (adviserChain) {
        adviserName  = `${adviserChain.tbl_user.f_name ?? ''} ${adviserChain.tbl_user.l_name ?? ''}`.trim();
        adviserEmail = adviserChain.tbl_user.email ?? '';
      }
    }
  }

  console.log(`[doc-gen] adviser resolved for app ${applicationId}: name="${adviserName}" email="${adviserEmail}"`);

  return {
    submitter_contact_no: raw?.submitter_contact_no ?? '',
    date_created:         raw?.created_at            ?? null,
    college_name:         collegeName,
    adviser_name:         adviserName,
    adviser_email:        adviserEmail,
    // Fresh application status and academic year straight from DB
    is_approved:   (raw?.status as string | null) === 'Approved',
    academic_year: academicYear(raw?.created_at?.toISOString()),
  };
}

// ----------------------------------------------------------------------------
// Map approval chain signatories → form section slots (role-based)
//
//   Program Chair → endorser1
//   Dean          → endorser2
//   SDAO (×2)     → receiver1 / receiver2
//   final         → final1 / final2
// ----------------------------------------------------------------------------

interface SigSlot {
  name: string;
  email: string;
  date: string;
  time: string;
  signature_path: string | null;
}
const EMPTY_SLOT: SigSlot = { name: '', email: '', date: '', time: '', signature_path: null };

function mapSignatoriesToSlots(sigs: AppDetails['signatories']) {
  function toSlot(sig?: AppDetails['signatories'][number]): SigSlot {
    if (!sig) return EMPTY_SLOT;
    const ts = sig.approved_at ?? sig.signed_at ?? sig.endorsed_at ?? sig.received_at ?? null;
    return {
      name:           sig.signatory_name,
      email:          sig.signatory_email ?? '',
      date:           formatDateShort(ts),
      time:           formatTime(ts),
      signature_path: sig.signature_path ?? null,
    };
  }

  const programChair   = sigs.find((s) => s.role === 'Program Chair' && !s.is_final_approval);
  const dean           = sigs.find((s) => s.role === 'Dean'          && !s.is_final_approval);
  const sdaoList       = sigs.filter((s) => s.role === 'SDAO'        && !s.is_final_approval);
  const finalApprovers = sigs.filter((s) => s.is_final_approval);

  return {
    endorser1: toSlot(programChair),
    endorser2: toSlot(dean),
    receiver1: toSlot(sdaoList[0]),
    receiver2: toSlot(sdaoList[1]),
    final1:    toSlot(finalApprovers[0]),
    final2:    toSlot(finalApprovers[1]),
    sdao_remarks:              finalApprovers[0]?.remarks ?? '',
    academic_director_remarks: finalApprovers[1]?.remarks ?? '',
  };
}

type ExtraFields = Awaited<ReturnType<typeof resolveExtraFields>>;

// ----------------------------------------------------------------------------
// Resolve the absolute path of a stored signature file.
// Returns the full path string when the file exists, or null when missing.
//
// IMPORTANT: the value stored in the template data object MUST be a string
// (not a Buffer). docxtemplater-image-module-free checks `typeof value`:
//   • null/undefined/falsy → render empty (skip tag)
//   • object              → treat as pre-resolved {rId, sizePixel} (wrong for us)
//   • string              → call getImage(string) to obtain the Buffer  ← correct
// ----------------------------------------------------------------------------

function sigImage(sigPath: string | null | undefined): string | null {
  if (sigPath) {
    const fullPath = path.join(APPROVAL_SIG_DIR, path.basename(sigPath));
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Build {{new_box_N}} and {{ren_box_N}} checkbox values.
//
// Each box maps to a keyword; if any submitted requirement name contains that
// keyword (case-insensitive) the box gets CHECKED, otherwise UNCHECKED.
// When showing the wrong application type section, all boxes are UNCHECKED.
// ----------------------------------------------------------------------------

const NEW_BOX_KEYWORDS = [
  'letter of intent',                   // new_box_1
  'application form',                   // new_box_2
  'by laws',                            // new_box_3
  'list of officers',                   // new_box_4
  'logo',                               // new_box_5
  'faculty adviser',                    // new_box_6  Letter from Dean/Dept Chair endorsing the Faculty Adviser
  'list of members',                    // new_box_7
  'certificate of grades',              // new_box_8
  'biodata',                            // new_box_9
  'resume/cv of adviser',               // new_box_10
  'department chair endorsing',         // new_box_11
  'proposed projects',                  // new_box_12
  '',                                   // new_box_13  Others — always ☐
];

const REN_BOX_KEYWORDS = [
  'letter of intent',                   // ren_box_1
  'application form',                   // ren_box_2
  'by laws',                            // ren_box_3
  'list of officers',                   // ren_box_4
  'logo',                               // ren_box_5
  'faculty adviser',                    // ren_box_6  Letter from Dean/Dept Chair endorsing the Faculty Adviser
  'list of members',                    // ren_box_7
  'certificate of grades',              // ren_box_8
  'biodata',                            // ren_box_9
  'proposed projects',                  // ren_box_10
  'list of past projects',              // ren_box_11
  'financial statement',                // ren_box_12
  'list of past projects',              // ren_box_13  (second occurrence)
  'summary of evaluation',              // ren_box_14
  '',                                   // ren_box_15  Others — always ☐
];

function buildRequirementBoxes(details: AppDetails): Record<string, string> {
  const isNew = details.application.application_type === 'new';
  const submitted = details.application.requirements.map((r) => (r.name ?? '').toLowerCase());

  function check(keyword: string): string {
    if (!keyword) return UNCHECKED;
    return submitted.some((n) => n.includes(keyword)) ? CHECKED : UNCHECKED;
  }

  const boxes: Record<string, string> = {};

  for (let i = 0; i < NEW_BOX_KEYWORDS.length; i++) {
    boxes[`new_box_${i + 1}`] = isNew ? check(NEW_BOX_KEYWORDS[i]) : UNCHECKED;
  }
  for (let i = 0; i < REN_BOX_KEYWORDS.length; i++) {
    boxes[`ren_box_${i + 1}`] = !isNew ? check(REN_BOX_KEYWORDS[i]) : UNCHECKED;
  }

  return boxes;
}

// ----------------------------------------------------------------------------
// DOCX generator — fills the official NU template via docxtemplater + pizzip
// ----------------------------------------------------------------------------

async function generateDocx(details: AppDetails, extra: ExtraFields, outputPath: string): Promise<void> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
  }

  const { application, organization, signatories } = details;
  const isNew = application.application_type === 'new';

  // ── Application type checkboxes ──────────────────────────────────────────
  const newa = isNew ? CHECKED : UNCHECKED;  // {{newa}}
  const rena = isNew ? UNCHECKED : CHECKED;  // {{rena}}

  // ── Category checkboxes ──────────────────────────────────────────────────
  const co   = organization.category === 'Co_Curricular_Organization'    ? CHECKED : UNCHECKED;
  const xtra = organization.category === 'Extra_Curricular_Organization' ? CHECKED : UNCHECKED;

  // ── Org details ──────────────────────────────────────────────────────────────
  // adviser_name / adviser_email are resolved in resolveExtraFields (DB lookup)
  const orgDetails = {
    organization_name: organization.name,
    adviser_name:      extra.adviser_name,
    adviser_email:     extra.adviser_email,
    date_organized:    formatDate(extra.date_created),
    description:       organization.description ?? '',
    co,
    extra:             xtra,
    college_name:      extra.college_name,
  };

  // ── Signatories ──────────────────────────────────────────────────────────
  const slots = mapSignatoriesToSlots(signatories);

  // Image tags in the template must be written as {%tagName}.
  // Text tags use {tagName}.
  // Tag names use underscores — hyphens are invalid in docxtemplater expressions.
  const signatoryData = {
    // Section 3 — Endorsements (Program Chair + Dean) — images
    endorser_e_sig_1:  sigImage(slots.endorser1.signature_path),
    endorser_name_1:   slots.endorser1.name,
    endorser_date_1:    slots.endorser1.date,
    endorser_e_time_1: slots.endorser1.time,
    endorser_e_sig_2:  sigImage(slots.endorser2.signature_path),
    endorser_name_2:   slots.endorser2.name,
    endorser_date_2:    slots.endorser2.date,
    endorser_e_time_2: slots.endorser2.time,

    // Section 4 — Received By (SDAO × 2)
    rec_e_sig_1:  sigImage(slots.receiver1.signature_path),
    rec_name_1:   slots.receiver1.name,
    rec_date_1:   slots.receiver1.date,
    rec_time_1:   slots.receiver1.time,
    rec_e_sig_2:  sigImage(slots.receiver2.signature_path),
    rec_name_2:   slots.receiver2.name,
    rec_date_2:   slots.receiver2.date,
    rec_time_2:   slots.receiver2.time,

    // Section 5 — Final Approval
    final_e_sig_1: sigImage(slots.final1.signature_path),
    final_name_1:  slots.final1.name,
    final_date_1:  slots.final1.date,
    final_e_sig_2: sigImage(slots.final2.signature_path),
    final_name_2:  slots.final2.name,
    final_date_2:  slots.final2.date,

    // Remarks
    sdao_remarks:              slots.sdao_remarks,
    academic_director_remarks: slots.academic_director_remarks,
  };

  // ── Build final data object ───────────────────────────────────────────────
  const reqBoxes = buildRequirementBoxes(details);

  // If the org already has a logo uploaded, force the logo box to CHECKED
  // regardless of whether a "logo" requirement was explicitly submitted.
  if (organization.logo_url) {
    if (isNew) reqBoxes['new_box_5'] = CHECKED;
    else       reqBoxes['ren_box_5'] = CHECKED;
  }

  const data = {
    newa,
    rena,
    // {approved} — CHECKED when the application is fully approved (fresh from DB)
    approved:      extra.is_approved ? CHECKED : UNCHECKED,
    // {academic_year} — e.g. "2025-2026" (fresh from DB created_at)
    academic_year: extra.academic_year,
    ...orgDetails,
    ...signatoryData,
    ...reqBoxes,
  };

  console.log('[doc-gen] DOCX data keys:', Object.keys(data));
  console.log('[doc-gen] adviser_name:', data.adviser_name, '| adviser_email:', data.adviser_email);
  console.log('[doc-gen] approved:', data.approved, '| academic_year:', data.academic_year);

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = new PizZip(templateBuffer);

  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    // tagValue is the string path returned by sigImage()
    getImage(tagValue: string): Buffer {
      return fs.readFileSync(tagValue);
    },
    getSize(): [number, number] {
      return [120, 70];
    },
  });

  const doc = new Docxtemplater(zip, {
    modules:       [imageModule],
    paragraphLoop: true,
    linebreaks:    true,
  });

  doc.render(data);

  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, buf);
}

// ----------------------------------------------------------------------------
// PDF generator — mirrors the NU template sections for a clean digital copy
// ----------------------------------------------------------------------------

async function generatePdf(details: AppDetails, extra: ExtraFields, outputPath: string): Promise<void> {
  const { application, organization, leadership, signatories } = details;
  const ref      = appRef(application.application_id);
  const isNew    = application.application_type === 'new';
  const typeLabel = isNew ? 'New Organization' : 'Renewal';
  const slots    = mapSignatoriesToSlots(signatories);

  const docDefinition = {
    pageSize:    'A4',
    pageMargins: [40, 50, 40, 50],
    info: {
      title:   `${organization.name} — Application Form ${ref}`,
      author:  'NU Connect',
      subject: 'Student Organization Application Form',
    },
    styles: {
      docTitle:    { fontSize: 16, bold: true, color: NU_NAVY, alignment: 'center' },
      docRef:      { fontSize: 8, color: '#555555', alignment: 'right', italics: true },
      sectionNum:  { fontSize: 9.5, bold: true, color: NU_NAVY },
      sectionHead: { fontSize: 9, bold: true, color: '#FFFFFF', fillColor: NU_NAVY, margin: [4, 4, 4, 4] },
      label:       { fontSize: 8.5, bold: true, color: '#333333', margin: [4, 3, 4, 3] },
      value:       { fontSize: 8.5, color: '#111111', margin: [4, 3, 4, 3] },
      small:       { fontSize: 7.5, color: '#666666', italics: true, alignment: 'center' },
    },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, lineHeight: 1.3 },

    content: [
      // ── Header
      { text: 'STUDENT ORGANIZATION APPLICATION FORM', style: 'docTitle', margin: [0, 0, 0, 2] },
      { text: `NUD-ACS-SDA-F-003 ver 2024  |  ${ref}  |  A.Y. ${academicYear(application.submission_date)}`, style: 'docRef', margin: [0, 0, 0, 4] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: NU_GOLD }], margin: [0, 0, 0, 8] },

      // Application type
      { text: `APPLICATION FOR:  ${isNew ? CHECKED : UNCHECKED} New Application   ${isNew ? UNCHECKED : CHECKED} Renewal`, fontSize: 8.5, margin: [0, 0, 0, 8] },

      // ── Section 1: Contact Information
      { text: '1.  CONTACT INFORMATION', style: 'sectionNum', margin: [0, 4, 0, 4] },
      {
        table: {
          widths: [100, '*', 80, '*'],
          body: [
            [{ text: 'Organization Name', style: 'label' }, { text: organization.name,               style: 'value' },
             { text: 'Application Type',  style: 'label' }, { text: typeLabel,                        style: 'value' }],
            [{ text: 'Contact Person',    style: 'label' }, { text: application.submitted_by,          style: 'value' },
             { text: 'Contact No.',       style: 'label' }, { text: extra.submitter_contact_no || '—', style: 'value' }],
            [{ text: 'Email Address',     style: 'label' }, { text: application.submitter_email, style: 'value', colSpan: 3 }, {}, {}],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },

      // ── Section 2: Organization Details
      { text: '2.  DETAILS OF ORGANIZATION', style: 'sectionNum', margin: [0, 4, 0, 4] },
      {
        table: {
          widths: [110, '*'],
          body: [
            [{ text: 'Date Organized', style: 'label' }, { text: formatDate(extra.date_created),    style: 'value' }],
            [{ text: 'Purpose',        style: 'label' }, { text: organization.description || '—',   style: 'value' }],
            [{ text: 'College',        style: 'label' }, { text: extra.college_name || '—',          style: 'value' }],
            [{ text: 'Programs',       style: 'label' }, { text: organization.programs.map((p) => p.abbreviation ?? p.name ?? '').join(', ') || '—', style: 'value' }],
            [{ text: 'Membership Fee', style: 'label' }, { text: feeLabel(details),                  style: 'value' }],
            [{ text: 'Type of Org.',   style: 'label' }, {
              text: organization.category === 'Co_Curricular_Organization'
                ? `${CHECKED} Co-Curricular   ${UNCHECKED} Extra-Curricular`
                : `${UNCHECKED} Co-Curricular   ${CHECKED} Extra-Curricular`,
              style: 'value',
            }],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },

      // ── Section 3: Endorsements
      { text: '3.  ENDORSEMENTS (Department Chair / Dean)', style: 'sectionNum', margin: [0, 4, 0, 4] },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: slots.endorser1.name || '—', style: 'value', alignment: 'center' }, { text: slots.endorser2.name || '—', style: 'value', alignment: 'center' }],
            [{ text: `Date: ${slots.endorser1.date || '—'}   Time: ${slots.endorser1.time || '—'}`, style: 'small' },
             { text: `Date: ${slots.endorser2.date || '—'}   Time: ${slots.endorser2.time || '—'}`, style: 'small' }],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },

      // ── Section 4: Received By
      { text: '4.  RECEIVED BY', style: 'sectionNum', margin: [0, 4, 0, 4] },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: slots.receiver1.name || '—', style: 'value', alignment: 'center' }, { text: slots.receiver2.name || '—', style: 'value', alignment: 'center' }],
            [{ text: `Date: ${slots.receiver1.date || '—'}   Time: ${slots.receiver1.time || '—'}`, style: 'small' },
             { text: `Date: ${slots.receiver2.date || '—'}   Time: ${slots.receiver2.time || '—'}`, style: 'small' }],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },

      // ── Section 5: Final Approval
      { text: '5.  APPROVAL', style: 'sectionNum', margin: [0, 4, 0, 4] },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: `Student Affairs Office\n${slots.final1.name || '—'}`, style: 'value', alignment: 'center' },
             { text: `Academic Director\n${slots.final2.name || '—'}`,      style: 'value', alignment: 'center' }],
            [{ text: `Date: ${slots.final1.date || '—'}`, style: 'small' },
             { text: `Date: ${slots.final2.date || '—'}`, style: 'small' }],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },

      // ── Section 6: Remarks (only if present)
      ...(slots.sdao_remarks || slots.academic_director_remarks ? [
        { text: '6.  ADDITIONAL REMARKS', style: 'sectionNum', margin: [0, 4, 0, 4] },
        {
          table: {
            widths: ['*', '*'],
            body: [[
              { text: slots.sdao_remarks              || '—', style: 'value' },
              { text: slots.academic_director_remarks || '—', style: 'value' },
            ]],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 8],
        },
      ] : []),

      // ── Section 7: Requirements
      { text: `7.  REQUIREMENTS ATTACHED — ${isNew ? 'NEW APPLICATION' : 'RENEWAL APPLICATION'}`, style: 'sectionNum', margin: [0, 4, 0, 4] },
      ...(application.requirements.length > 0
        ? application.requirements.map((r, i) => ({ text: `${CHECKED}  ${r.name ?? 'Requirement ' + (i + 1)}`, fontSize: 8.5, margin: [8, 1, 0, 1] }))
        : [{ text: 'No requirements attached.', fontSize: 8.5, italics: true, margin: [8, 1, 0, 1] }]
      ),

      // ── Proposed Officers
      ...(leadership.length > 0 ? [
        { text: 'PROPOSED OFFICERS', style: 'sectionNum', margin: [0, 10, 0, 4] },
        {
          table: {
            widths: [18, 120, '*', '*'],
            body: [
              [{ text: '#', style: 'sectionHead' }, { text: 'Position', style: 'sectionHead' }, { text: 'Name', style: 'sectionHead' }, { text: 'Email', style: 'sectionHead' }],
              ...leadership.map((l, i) => [
                { text: String(i + 1),           style: 'value' },
                { text: l.proposed_title ?? '—', style: 'value' },
                { text: l.proposed_name ?? '—',  style: 'value' },
                { text: l.proposed_email ?? '—', style: 'value' },
              ]),
            ],
          },
          layout: {
            hLineColor: () => '#DDDDDD',
            vLineColor: () => '#DDDDDD',
            fillColor: (row: number) => row === 0 ? NU_NAVY : row % 2 === 0 ? '#F5F5F5' : null,
          },
          margin: [0, 0, 0, 10],
        },
      ] : []),

      // ── Footer
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }], margin: [0, 10, 0, 4] },
      { text: `Generated on ${new Date().toLocaleString('en-PH')} via NU Connect`, style: 'small' },
      { text: 'This is an officially generated document. Unauthorized alteration is prohibited.', style: 'small' },
    ],
  };

  const printer = new PdfPrinter(PDF_FONTS);
  const pdfDoc = await printer.createPdfKitDocument(docDefinition as any);

  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end',  () => { fs.writeFileSync(outputPath, Buffer.concat(chunks)); resolve(); });
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

// ----------------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------------

/**
 * Generates form.docx and form.pdf for the given approved application.
 *
 * Call without await — fire-and-forget after the approve response is sent:
 *   generateApplicationDocuments(applicationId)
 *     .catch(err => console.error('[doc-gen] failed:', err));
 */
export async function generateApplicationDocuments(applicationId: number): Promise<void> {
  const { prisma } = await import('../config/db');

  // Mark as processing immediately so the status endpoint shows feedback fast
  await prisma.tbl_application.update({
    where:  { application_id: applicationId },
    data:   { document_generation_status: 'processing' },
  });

  try {
    const details = await getApplicationDetails(applicationId);
    if (!details) throw new Error(`Application ${applicationId} not found`);

    const extra = await resolveExtraFields(applicationId, details);

    // Ensure output directory exists
    const baseDir = path.join(__dirname, '../nuconnect-files/applications', String(applicationId));
    fs.mkdirSync(baseDir, { recursive: true });

    const docxAbsPath = path.join(baseDir, 'form.docx');
    const pdfAbsPath  = path.join(baseDir, 'form.pdf');

    // Generate both formats concurrently
    await Promise.all([
      generateDocx(details, extra, docxAbsPath),
      generatePdf(details, extra, pdfAbsPath),
    ]);

    const now    = new Date();
    const relDocx = `applications/${applicationId}/form.docx`;
    const relPdf  = `applications/${applicationId}/form.pdf`;

    await prisma.tbl_application.update({
      where: { application_id: applicationId },
      data: {
        document_generation_status: 'completed',
        docx_path:         relDocx,
        pdf_path:          relPdf,
        docx_generated_at: now,
        pdf_generated_at:  now,
      },
    });

    const { broadcastToUser } = await import('../services/websocketService');
    broadcastToUser(details.application.submitter_email, 'document:generated', {
      applicationId,
      status: 'completed',
      documents: {
        pdf:  { available: true },
        docx: { available: true },
      },
    });

    console.log(`[doc-gen] Application ${applicationId}: documents generated successfully`);
  } catch (err: any) {
    console.error(`[doc-gen] Application ${applicationId} generation failed:`, err);

    await prisma.tbl_application.update({
      where: { application_id: applicationId },
      data:  { document_generation_status: 'failed' },
    }).catch((dbErr) => console.error('[doc-gen] DB update failed:', dbErr));

    // Try to notify the applicant of the failure
    try {
      const app = await prisma.tbl_application.findUnique({
        where:   { application_id: applicationId },
        include: { tbl_user_tbl_application_applicant_user_idTotbl_user: { select: { email: true } } },
      });
      if (app) {
        const { broadcastToUser } = await import('../services/websocketService');
        broadcastToUser(
          app.tbl_user_tbl_application_applicant_user_idTotbl_user.email,
          'document:generation-failed',
          {
            applicationId,
            status: 'failed',
            error: err.message ?? 'Document generation failed. Please contact administation.',
          },
        );
      }
    } catch (broadcastErr) {
      console.error('[doc-gen] Failed to broadcast failure:', broadcastErr);
    }

    throw err;
  }
}
