const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const middleware = require('../../middlewares/middleWare');

// Protected file serving endpoint using nginx X-Accel-Redirect
router.get('/protected/:filePath(*)', middleware.validateAzureJWT, (req, res) => {
  try {
    const { filePath } = req.params;
    console.log('[files] Serving protected file:', filePath);

    // Security: validate file path to prevent directory traversal
    if (filePath.includes('..') || filePath.includes('\\')) {
      return res.status(400).json({ message: 'Invalid file path' });
    }

    // Extract filename from path for validation
    const filename = path.basename(filePath);
    if (!filename || filename.startsWith('.')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    // Use nginx X-Accel-Redirect to serve the file through the protected location
    const protectedPath = `/protected-files/${filePath}`;
    console.log('[files] X-Accel-Redirect to:', protectedPath);

    res.set('X-Accel-Redirect', protectedPath);
    res.end();
  } catch (error) {
    console.error('[files] Error serving protected file:', error);
    res.status(500).json({ error: 'Internal server error while serving protected file' });
  }
});

// Generic file serving endpoint
router.get('/files/:filename', middleware.validateAzureJWT, (req, res) => {
  try {
    const { filename } = req.params;
    console.log('[files] Serving file:', filename);

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    
    // Define possible file directories to check
    const possibleDirs = [
      path.join(__dirname, '../../uploads'),
      path.join(__dirname, '../../files'),
      path.join(__dirname, '../../logs'),
      path.join(__dirname, '../../activity-logs'),
      path.join(__dirname, '../../static'),
      path.join(__dirname, '../../public')
    ];

    // Try to find the file in various directories
    let filePath = null;
    for (const dir of possibleDirs) {
      const testPath = path.join(dir, sanitizedFilename);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        console.log('[files] File found at:', filePath);
        break;
      }
    }

    if (!filePath) {
      console.log('[files] File not found:', sanitizedFilename, 'in directories:', possibleDirs);
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Set appropriate content type based on file extension
    const ext = path.extname(sanitizedFilename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.txt': 'text/plain',
      '.csv': 'text/csv'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (error) => {
      console.error('[files] Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file' });
      }
    });

    fileStream.pipe(res);

  } catch (error) {
    console.error('[files] Error serving file:', error);
    res.status(500).json({ error: 'Internal server error while serving file' });
  }
});

// Alternative endpoint that accepts full file path
router.get('/:filePath(*)', middleware.validateAzureJWT, (req, res) => {
  try {
    const { filePath } = req.params;
    console.log('[files] Serving file by path:', filePath);

    // If it's just a filename without path, redirect to the filename endpoint
    if (!filePath.includes('/')) {
      return res.redirect(`/api/web/files/${filePath}`);
    }

    // Extract filename from path
    const filename = path.basename(filePath);
    
    // Sanitize filename
    const sanitizedFilename = path.basename(filename);
    
    // Define possible base directories
    const baseDirs = [
      path.join(__dirname, '../../'),
      path.join(__dirname, '../../uploads/'),
      path.join(__dirname, '../../files/'),
      path.join(__dirname, '../../static/')
    ];

    // Try to construct the full path
    let fullPath = null;
    for (const baseDir of baseDirs) {
      const testPath = path.join(baseDir, filePath);
      const normalizedPath = path.normalize(testPath);
      
      // Security check: ensure the path doesn't go outside allowed directories
      if (normalizedPath.startsWith(path.normalize(baseDir)) && fs.existsSync(normalizedPath)) {
        fullPath = normalizedPath;
        console.log('[files] File found at:', fullPath);
        break;
      }
    }

    if (!fullPath) {
      // Fallback: try just the filename in standard directories
      console.log('[files] Full path not found, trying filename only:', sanitizedFilename);
      return res.redirect(`/api/web/files/${sanitizedFilename}`);
    }

    // Get file stats
    const stats = fs.statSync(fullPath);
    
    // Set appropriate content type
    const ext = path.extname(sanitizedFilename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.txt': 'text/plain',
      '.csv': 'text/csv'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);

    // Stream the file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.on('error', (error) => {
      console.error('[files] Error streaming file by path:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file' });
      }
    });

    fileStream.pipe(res);

  } catch (error) {
    console.error('[files] Error serving file by path:', error);
    res.status(500).json({ error: 'Internal server error while serving file by path' });
  }
});

module.exports = router;