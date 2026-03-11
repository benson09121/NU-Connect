const pool = require('../../config/db');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);
const { validateSignature } = require('../utils/signatureValidator');

// =====================================================================
// E-SIGNATURE CONTROLLER
// Handles user e-signature upload, retrieval, and deletion
// =====================================================================

/**
 * Upload or update user's e-signature
 * @route POST /api/esignature/upload
 */
exports.uploadESignature = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userEmail = req.user.email;
        
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please select an image file (PNG, JPG) to upload'
            });
        }

        console.log(`🔍 Validating signature for user: ${userEmail}`);
        
        // Get user_id from email (using pattern from other controllers)
        const [userResult] = await connection.query(
            'SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1',
            [userEmail]
        );
        
        if (userResult.length === 0) {
            // If user not found, delete uploaded file
            try {
                await unlinkAsync(req.file.path);
            } catch (deleteError) {
                console.error('⚠️ Failed to delete uploaded file:', deleteError);
            }
            return res.status(401).json({ 
                error: 'User not found',
                message: 'Your account could not be found in the system' 
            });
        }
        
        const userId = userResult[0].user_id;
        console.log(`✅ Found user_id: ${userId} for email: ${userEmail}`);

        // Validate signature image
        const imageBuffer = await fs.promises.readFile(req.file.path);
        const validation = await validateSignature(imageBuffer, req.file.originalname);

        // If validation fails, delete uploaded file and return error
        if (!validation.isValid) {
            try {
                await unlinkAsync(req.file.path);
                console.log(`🗑️ Deleted invalid signature file: ${req.file.filename}`);
            } catch (deleteError) {
                console.error('⚠️ Failed to delete invalid file:', deleteError);
            }

            return res.status(400).json({
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
                        'Crop the image to show only the signature'
                    ]
                }
            });
        }

        console.log(`✅ Signature validated successfully (confidence: ${validation.confidence}%)`);
        
        // Store only filename in database (not full path)
        const signaturePath = req.file.filename;
        
        console.log(`💾 Saving signature to database:`, { userId, userEmail, signaturePath });
        
        // Check if user already has a signature (to delete old file later)
        const [existingSignature] = await connection.query(
            'SELECT signature_path FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        const oldSignaturePath = existingSignature.length > 0 ? existingSignature[0].signature_path : null;
        
        // Insert or update signature in database
        await connection.query(
            `INSERT INTO tbl_user_esignature (user_id, signature_path, uploaded_at, updated_at)
             VALUES (?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE 
                signature_path = VALUES(signature_path),
                updated_at = NOW()`,
            [userId, signaturePath]
        );
        
        console.log(`✅ Database updated successfully`);
        
        // If there was an old signature file, delete it
        if (oldSignaturePath && oldSignaturePath !== signaturePath) {
            try {
                const oldFilePath = path.join('/app/esignatures', oldSignaturePath);
                if (fs.existsSync(oldFilePath)) {
                    await unlinkAsync(oldFilePath);
                    console.log(`🗑️ Deleted old e-signature: ${oldSignaturePath}`);
                }
            } catch (deleteError) {
                console.error('⚠️ Failed to delete old signature file:', deleteError);
                // Don't fail the request if old file deletion fails
            }
        }
        
        const spResult = { success: true };
        
        console.log(`✅ Complete: E-signature uploaded and saved successfully`);
        
        res.status(200).json({
            success: true,
            message: 'E-signature uploaded successfully',
            validation: {
                confidence: validation.confidence,
                quality: validation.confidence >= 80 ? 'Excellent' : validation.confidence >= 60 ? 'Good' : 'Acceptable'
            },
            data: {
                signature_path: signaturePath,
                signature_url: `/api/web/esignature/file/${signaturePath}`, // ✅ Correct endpoint for file serving
                uploaded_at: new Date()
            }
        });
        
    } catch (error) {
        console.error('❌ Error uploading e-signature:', error);
        
        // If file was uploaded but DB operation failed, clean it up
        if (req.file) {
            try {
                const filePath = path.join('/app/esignatures', req.file.filename);
                if (fs.existsSync(filePath)) {
                    await unlinkAsync(filePath);
                }
            } catch (cleanupError) {
                console.error('⚠️ Failed to cleanup uploaded file:', cleanupError);
            }
        }
        
        res.status(500).json({
            error: 'Failed to upload e-signature',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Get current user's e-signature
 * @route GET /api/esignature/me
 */
exports.getMyESignature = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userEmail = req.user.email;
        
        console.log(`🔍 Fetching e-signature for user: ${userEmail}`);
        
        // Get user_id from email (using pattern from other controllers)
        const [userResult] = await connection.query(
            'SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1',
            [userEmail]
        );
        
        if (userResult.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        
        const userId = userResult[0].user_id;
        
        // Get signature from database
        const [signatureResult] = await connection.query(
            'SELECT user_id, signature_path, uploaded_at, updated_at FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        if (signatureResult.length === 0) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No e-signature found'
            });
        }
        
        const signature = signatureResult[0];
        
        // Construct full path from filename stored in database
        const fullPath = `uploads/esignatures/${signature.signature_path}`;
        
        res.status(200).json({
            success: true,
            data: {
                user_id: signature.user_id,
                signature_path: fullPath,
                signature_url: `/api/web/esignature/file/${signature.signature_path}`, // ✅ Correct endpoint
                uploaded_at: signature.uploaded_at,
                updated_at: signature.updated_at
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching e-signature:', error);
        res.status(500).json({
            error: 'Failed to fetch e-signature',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Delete current user's e-signature
 * @route DELETE /api/esignature/me
 */
exports.deleteMyESignature = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userEmail = req.user.email;
        
        console.log(`🗑️ Deleting e-signature for user: ${userEmail}`);
        
        // Get user_id from email (using pattern from other controllers)
        const [userResult] = await connection.query(
            'SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1',
            [userEmail]
        );
        
        if (userResult.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        
        const userId = userResult[0].user_id;
        
        // Get signature path before deleting
        const [signatureResult] = await connection.query(
            'SELECT signature_path FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        if (signatureResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No e-signature found to delete'
            });
        }
        
        const deletedSignaturePath = signatureResult[0].signature_path;
        
        // Delete from database
        await connection.query(
            'DELETE FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        // Delete the physical file
        if (deletedSignaturePath) {
            try {
                const filePath = path.join('/app/esignatures', deletedSignaturePath);
                if (fs.existsSync(filePath)) {
                    await unlinkAsync(filePath);
                    console.log(`🗑️ Deleted e-signature file: ${deletedSignaturePath}`);
                }
            } catch (deleteError) {
                console.error('⚠️ Failed to delete signature file:', deleteError);
                // Don't fail the request if file deletion fails
            }
        }
        
        res.status(200).json({
            success: true,
            message: 'E-signature deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting e-signature:', error);
        res.status(500).json({
            error: 'Failed to delete e-signature',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Get specific user's e-signature (for admin/approvers)
 * @route GET /api/esignature/user/:userId
 */
exports.getUserESignature = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { userId } = req.params;
        
        // TODO: Add authorization check - only admins or approvers can view other users' signatures
        // For now, allow any authenticated user (will be restricted in production)
        
        console.log(`🔍 Fetching e-signature for user_id: ${userId}`);
        
        // Get signature directly by user_id (since userId is passed in params)
        const [signatureResult] = await connection.query(
            'SELECT user_id, signature_path, uploaded_at, updated_at FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        if (signatureResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User has no e-signature uploaded'
            });
        }
        
        const signature = signatureResult[0];
        
        res.status(200).json({
            success: true,
            data: {
                user_id: signature.user_id,
                signature_path: signature.signature_path,
                signature_url: `/api/web/esignature/file/${signature.signature_path}`, // ✅ Correct endpoint
                uploaded_at: signature.uploaded_at,
                updated_at: signature.updated_at
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching user e-signature:', error);
        res.status(500).json({
            error: 'Failed to fetch e-signature',
            message: error.message
        });
    } finally {
        connection.release();
    }
};
