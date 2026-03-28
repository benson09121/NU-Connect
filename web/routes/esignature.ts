/**
 * web/routes/esignature.ts
 *
 * Routes for E-Signature management (V2).
 *
 * Mounted at /api/web/esignature in server.ts.
 *
 * All routes require Azure AD JWT authentication.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { validateAzureJWT } from '../../middlewares/middleWare';
import {
  uploadESignature,
  getMyESignature,
  deleteMyESignature,
  getUserESignature,
} from '../controllers/esignatureController';

const router = Router();

// =====================================================================
// MULTER CONFIGURATION FOR E-SIGNATURE UPLOADS
// =====================================================================

const uploadDir =
  process.env.ESIGNATURES_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/app/nuconnect-files/esignatures'
    : path.join(__dirname, '../../nuconnect-files/esignatures'));

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(req, _file, cb) {
    const userEmail = req.user?.email ?? 'unknown';
    const ext = path.extname(_file.originalname);
    const sanitizedEmail = userEmail.replace(/@/g, '_at_').replace(/\./g, '_');
    cb(null, `${sanitizedEmail}_signature${ext}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowedTypes.test(file.mimetype);

  if (mimeOk && extOk) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (PNG, JPG, JPEG) are allowed for e-signatures'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter,
});

// =====================================================================
// E-SIGNATURE ROUTES
// =====================================================================

/**
 * @route   POST /api/web/esignature/upload
 * @desc    Upload or update user's e-signature
 * @body    multipart/form-data with 'signature' file
 */
router.post('/upload', validateAzureJWT, upload.single('signature'), uploadESignature);

/**
 * @route   GET /api/web/esignature/me
 * @desc    Get current user's e-signature
 */
router.get('/me', validateAzureJWT, getMyESignature);

/**
 * @route   DELETE /api/web/esignature/me
 * @desc    Delete current user's e-signature
 */
router.delete('/me', validateAzureJWT, deleteMyESignature);

/**
 * @route   GET /api/web/esignature/user/:userId
 * @desc    Get specific user's e-signature (admin/approvers)
 */
router.get('/user/:userId', validateAzureJWT, getUserESignature);

/**
 * @route   GET /api/web/esignature/file/:filename
 * @desc    Serve e-signature file (protected via nginx X-Accel-Redirect)
 */
router.get('/file/:filename', validateAzureJWT, (req: Request, res: Response) => {
  try {
    const filename = req.params.filename as string;

    // Security: validate filename (no directory traversal)
    const sanitizedFilename = path.basename(filename);
    if (!sanitizedFilename || sanitizedFilename.includes('..') || sanitizedFilename.includes('\\')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    const filePath = path.join(uploadDir, sanitizedFilename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'E-signature file not found' });
      return;
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('[esignature] Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve e-signature file' });
  }
});

export default router;
