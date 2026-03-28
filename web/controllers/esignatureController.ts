/**
 * web/controllers/esignatureController.ts
 *
 * TypeScript controller for E-Signature management (V2).
 *
 * Replaces the old JS controller that used MySQL pool queries.
 * Uses Prisma for database operations.
 *
 * Routes (all under /api/web/esignature):
 *   POST   /upload          → uploadESignature
 *   GET    /me              → getMyESignature
 *   DELETE /me              → deleteMyESignature
 *   GET    /user/:userId    → getUserESignature
 *   GET    /file/:filename  → (inline in routes file — serves via X-Accel-Redirect)
 */

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { prisma } from '../../config/db';

const unlinkAsync = promisify(fs.unlink);

// Multer file type (avoid dependency on @types/multer)
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

// Dynamically import signatureValidator (JS util, no .d.ts)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateSignature } = require('../utils/signatureValidator');

// ---------------------------------------------------------------------------
// 1. POST /esignature/upload — Upload or update user's e-signature
// ---------------------------------------------------------------------------

export async function uploadESignature(req: Request, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Check if file was uploaded (multer puts it on req.file)
    const file = (req as any).file as MulterFile | undefined;
    if (!file) {
      res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select an image file (PNG, JPG) to upload',
      });
      return;
    }

    console.log(`🔍 Validating signature for user: ${userEmail}`);

    // Get user_id from email
    const user = await prisma.tbl_user.findUnique({
      where: { email: userEmail },
      select: { user_id: true },
    });

    if (!user) {
      // Delete uploaded file if user not found
      try { await unlinkAsync(file.path); } catch { /* ignore */ }
      res.status(401).json({
        error: 'User not found',
        message: 'Your account could not be found in the system',
      });
      return;
    }

    // Validate signature image
    const imageBuffer = await fs.promises.readFile(file.path);
    const validation = await validateSignature(imageBuffer, file.originalname);

    if (!validation.isValid) {
      try {
        await unlinkAsync(file.path);
        console.log(`🗑️ Deleted invalid signature file: ${file.filename}`);
      } catch { /* ignore */ }

      res.status(400).json({
        error: 'Invalid signature image',
        message: 'The uploaded image does not appear to be a valid signature',
        issues: validation.issues,
        confidence: validation.confidence,
        details: {
          ...validation.analysis,
          suggestions: [
            'Use a clear signature on white or transparent background',
            'Ensure the image shows only your signature (no documents or photos)',
            'Sign on white paper and photograph/scan with good lighting',
            'Crop the image to show only the signature',
          ],
        },
      });
      return;
    }

    console.log(`✅ Signature validated successfully (confidence: ${validation.confidence}%)`);

    // Store only filename in database
    const signaturePath = file.filename;

    // Check for old signature to delete later
    const existing = await prisma.tbl_user_esignature.findUnique({
      where: { user_id: user.user_id },
      select: { signature_path: true },
    });
    const oldSignaturePath = existing?.signature_path ?? null;

    // Upsert signature record
    await prisma.tbl_user_esignature.upsert({
      where: { user_id: user.user_id },
      update: {
        signature_path: signaturePath,
        updated_at: new Date(),
      },
      create: {
        user_id: user.user_id,
        signature_path: signaturePath,
      },
    });

    console.log(`✅ Database updated successfully`);

    // Delete old signature file if different
    if (oldSignaturePath && oldSignaturePath !== signaturePath) {
      try {
        const esigDir = process.env.ESIGNATURES_DIR || path.join(__dirname, '../../nuconnect-files/esignatures');
        const oldFilePath = path.join(esigDir, oldSignaturePath);
        if (fs.existsSync(oldFilePath)) {
          await unlinkAsync(oldFilePath);
          console.log(`🗑️ Deleted old e-signature: ${oldSignaturePath}`);
        }
      } catch (deleteError) {
        console.error('⚠️ Failed to delete old signature file:', deleteError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'E-signature uploaded successfully',
      validation: {
        confidence: validation.confidence,
        quality:
          validation.confidence >= 80 ? 'Excellent'
          : validation.confidence >= 60 ? 'Good'
          : 'Acceptable',
      },
      data: {
        user_id: user.user_id,
        signature_path: signaturePath,
        signature_url: `api/web/esignature/file/${signaturePath}`,
        uploaded_at: new Date(),
      },
    });
  } catch (error: any) {
    console.error('❌ Error uploading e-signature:', error);

    // Cleanup uploaded file on failure
    const file = (req as any).file as MulterFile | undefined;
    if (file) {
      try {
        const esigDir = process.env.ESIGNATURES_DIR || path.join(__dirname, '../../nuconnect-files/esignatures');
        const filePath = path.join(esigDir, file.filename);
        if (fs.existsSync(filePath)) {
          await unlinkAsync(filePath);
        }
      } catch { /* ignore */ }
    }

    res.status(500).json({
      error: 'Failed to upload e-signature',
      message: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// 2. GET /esignature/me — Get current user's e-signature
// ---------------------------------------------------------------------------

export async function getMyESignature(req: Request, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const user = await prisma.tbl_user.findUnique({
      where: { email: userEmail },
      include: { tbl_user_esignature: true },
    });

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    if (!user.tbl_user_esignature) {
      res.status(200).json({
        success: true,
        data: null,
        message: 'No e-signature found',
      });
      return;
    }

    const sig = user.tbl_user_esignature;

    res.status(200).json({
      success: true,
      data: {
        user_id: sig.user_id,
        signature_path: `nuconnect-files/esignatures/${sig.signature_path}`,
        signature_url: `api/web/esignature/file/${sig.signature_path}`,
        uploaded_at: sig.created_at,
        updated_at: sig.updated_at,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching e-signature:', error);
    res.status(500).json({
      error: 'Failed to fetch e-signature',
      message: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. DELETE /esignature/me — Delete current user's e-signature
// ---------------------------------------------------------------------------

export async function deleteMyESignature(req: Request, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const user = await prisma.tbl_user.findUnique({
      where: { email: userEmail },
      include: { tbl_user_esignature: true },
    });

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    if (!user.tbl_user_esignature) {
      res.status(404).json({
        success: false,
        error: 'No e-signature found to delete',
      });
      return;
    }

    const deletedPath = user.tbl_user_esignature.signature_path;

    // Delete from database
    await prisma.tbl_user_esignature.delete({
      where: { user_id: user.user_id },
    });

    // Delete physical file
    if (deletedPath) {
      try {
        const esigDir = process.env.ESIGNATURES_DIR || path.join(__dirname, '../../nuconnect-files/esignatures');
        const filePath = path.join(esigDir, deletedPath);
        if (fs.existsSync(filePath)) {
          await unlinkAsync(filePath);
          console.log(`🗑️ Deleted e-signature file: ${deletedPath}`);
        }
      } catch (deleteError) {
        console.error('⚠️ Failed to delete signature file:', deleteError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'E-signature deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting e-signature:', error);
    res.status(500).json({
      error: 'Failed to delete e-signature',
      message: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. GET /esignature/user/:userId — Get specific user's e-signature (admin/approvers)
// ---------------------------------------------------------------------------

export async function getUserESignature(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId as string;

    const sig = await prisma.tbl_user_esignature.findUnique({
      where: { user_id: userId },
    });

    if (!sig) {
      res.status(404).json({
        success: false,
        message: 'User has no e-signature uploaded',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user_id: sig.user_id,
        signature_path: `nuconnect-files/esignatures/${sig.signature_path}`,
        signature_url: `api/web/esignature/file/${sig.signature_path}`,
        uploaded_at: sig.created_at,
        updated_at: sig.updated_at,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching user e-signature:', error);
    res.status(500).json({
      error: 'Failed to fetch e-signature',
      message: error.message,
    });
  }
}
