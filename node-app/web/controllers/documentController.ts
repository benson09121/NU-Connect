/**
 * web/controllers/documentController.ts
 *
 * Handles application form document status checks and downloads.
 * Documents are generated automatically after the final approver approves.
 *
 * Routes (registered in organizationsPage.ts):
 *   GET /api/web/organizations/applications/:applicationId/document-status
 *   GET /api/web/organizations/applications/:applicationId/download-document?format=pdf|docx
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

// Root of the nuconnect-files tree (same base used across all controllers)
const FILES_ROOT = path.join(__dirname, '../../nuconnect-files');

// ---------------------------------------------------------------------------
// 1. GET /organizations/applications/:applicationId/document-status
// ---------------------------------------------------------------------------

export async function getDocumentStatus(req: Request, res: Response): Promise<void> {
  try {
    const applicationId = parseInt(req.params.applicationId as string, 10);
    if (isNaN(applicationId)) {
      res.status(400).json({ success: false, error: 'Invalid applicationId' });
      return;
    }

    const { prisma } = await import('../../config/db');

    const app = await prisma.tbl_application.findUnique({
      where:  { application_id: applicationId },
      select: {
        status:                     true,
        document_generation_status: true,
        docx_path:                  true,
        pdf_path:                   true,
      },
    });

    if (!app) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }

    // If the application is not yet Approved, always return pending regardless of stored value
    if (app.status !== 'Approved') {
      res.status(200).json({
        success:       true,
        applicationId,
        status:        'pending',
        documents: {
          pdf:  { available: false },
          docx: { available: false },
        },
      });
      return;
    }

    const genStatus = app.document_generation_status ?? 'pending';

    // Verify actual file existence — don't trust the DB flag alone
    const pdfExists =
      !!app.pdf_path && fs.existsSync(path.join(FILES_ROOT, app.pdf_path));
    const docxExists =
      !!app.docx_path && fs.existsSync(path.join(FILES_ROOT, app.docx_path));

    res.status(200).json({
      success:       true,
      applicationId,
      status:        genStatus,
      documents: {
        pdf:  { available: pdfExists  },
        docx: { available: docxExists },
      },
    });
  } catch (error: any) {
    console.error('Error fetching document status:', error);
    res.status(500).json({ error: 'Failed to fetch document status', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 2. GET /organizations/applications/:applicationId/download-document?format=
// ---------------------------------------------------------------------------

export async function downloadDocument(req: Request, res: Response): Promise<void> {
  try {
    const applicationId = parseInt(req.params.applicationId as string, 10);
    const format = (req.query.format as string | undefined)?.toLowerCase();

    if (isNaN(applicationId)) {
      res.status(400).json({ success: false, error: 'Invalid applicationId' });
      return;
    }

    if (format !== 'pdf' && format !== 'docx') {
      res.status(400).json({ success: false, error: 'format query param must be "pdf" or "docx"' });
      return;
    }

    const { prisma } = await import('../../config/db');

    const app = await prisma.tbl_application.findUnique({
      where:  { application_id: applicationId },
      select: {
        status:             true,
        pdf_path:           true,
        docx_path:          true,
        submitted_org_name: true,
        tbl_user_tbl_application_applicant_user_idTotbl_user: {
          select: { email: true },
        },
        tbl_application_approval_chain: {
          select: { tbl_user: { select: { email: true } } },
        },
      },
    });

    if (!app) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }

    // Access gate — requester must be the submitter OR one of the chain approvers
    const userEmail: string = req.user.email;
    const submitterEmail = app.tbl_user_tbl_application_applicant_user_idTotbl_user.email;
    const approverEmails = app.tbl_application_approval_chain.map((c) => c.tbl_user.email);
    const hasAccess = userEmail === submitterEmail || approverEmails.includes(userEmail);

    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'You do not have access to this application document' });
      return;
    }

    const relPath = format === 'pdf' ? app.pdf_path : app.docx_path;

    if (!relPath) {
      res.status(404).json({ success: false, error: 'Document has not been generated yet' });
      return;
    }

    const fullPath = path.join(FILES_ROOT, relPath);

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: 'Document file not found on server' });
      return;
    }

    // Build a friendly filename: "NU-Developers-Guild-Application-Form-OR042.pdf"
    const orgSlug = (app.submitted_org_name ?? 'Application')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const ref = `OR${String(applicationId).padStart(3, '0')}`;
    const filename = `${orgSlug}-Application-Form-${ref}.${format}`;

    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fs.statSync(fullPath).size);

    const fileStream = fs.createReadStream(fullPath);
    fileStream.on('error', (err) => {
      console.error('Error streaming document:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream document' });
      }
    });
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('Error downloading document:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download document', message: error.message });
    }
  }
}

