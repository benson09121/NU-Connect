const express = require('express');
const router = express.Router();
const esignatureController = require('../controllers/esignatureController');
const middleware = require('../../middlewares/middleWare');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =====================================================================
// MULTER CONFIGURATION FOR E-SIGNATURE UPLOADS
// =====================================================================

// Ensure upload directory exists (using absolute path like organizationsController)
const uploadDir = '/app/esignatures';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Format: {user_email}_signature.png (sanitize email for filename)
        const userEmail = req.user.email;
        const ext = path.extname(file.originalname);
        // Sanitize email: replace @ and . with _
        const sanitizedEmail = userEmail.replace(/@/g, '_at_').replace(/\./g, '_');
        cb(null, `${sanitizedEmail}_signature${ext}`);
    }
});

// File filter: only images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files (PNG, JPG, JPEG) are allowed for e-signatures'));
    }
};

// Multer upload instance
const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 2 * 1024 * 1024 // 2MB max
    },
    fileFilter: fileFilter
});

// =====================================================================
// E-SIGNATURE ROUTES
// =====================================================================

/**
 * @route   POST /api/esignature/upload
 * @desc    Upload or update user's e-signature
 * @access  Private (Any authenticated user)
 * @body    multipart/form-data with 'signature' file
 */
router.post(
    '/upload',
    middleware.validateAzureJWT,
    upload.single('signature'),
    esignatureController.uploadESignature
);

/**
 * @route   GET /api/esignature/me
 * @desc    Get current user's e-signature
 * @access  Private
 */
router.get(
    '/me',
    middleware.validateAzureJWT,
    esignatureController.getMyESignature
);

/**
 * @route   DELETE /api/esignature/me
 * @desc    Delete current user's e-signature
 * @access  Private
 */
router.delete(
    '/me',
    middleware.validateAzureJWT,
    esignatureController.deleteMyESignature
);

/**
 * @route   GET /api/esignature/user/:userId
 * @desc    Get specific user's e-signature (for admin/approvers)
 * @access  Private (Admin or approver roles)
 */
router.get(
    '/user/:userId',
    middleware.validateAzureJWT,
    esignatureController.getUserESignature
);

/**
 * @route   GET /api/esignature/file/:filename
 * @desc    Serve e-signature file (protected, authenticated access only)
 * @access  Private
 */
router.get(
    '/file/:filename',
    middleware.validateAzureJWT,
    (req, res) => {
        try {
            const { filename } = req.params;
            console.log('[esignature] Serving e-signature file:', filename);

            // Security: validate filename (no directory traversal)
            const sanitizedFilename = path.basename(filename);
            if (!sanitizedFilename || sanitizedFilename.includes('..') || sanitizedFilename.includes('\\')) {
                return res.status(400).json({ error: 'Invalid filename' });
            }

            // Verify file exists in database (additional security)
            // For now, use nginx X-Accel-Redirect to serve through protected location
            const protectedPath = `/protected-esignatures/${sanitizedFilename}`;
            console.log('[esignature] X-Accel-Redirect to:', protectedPath);

            res.set('X-Accel-Redirect', protectedPath);
            res.set('Content-Type', 'image/png');
            res.end();
        } catch (error) {
            console.error('[esignature] Error serving file:', error);
            res.status(500).json({ error: 'Failed to serve e-signature file' });
        }
    }
);

module.exports = router;
