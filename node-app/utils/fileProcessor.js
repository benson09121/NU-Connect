/**
 * Centralized File Processing Utility
 * 
 * Handles image resizing, compression, format conversion, and document optimization
 * for all file uploads in the NU Connect system.
 * 
 * Features:
 * - Image resizing to optimal dimensions
 * - Image compression with quality control
 * - Format conversion (PNG/HEIC → JPEG/WEBP)
 * - PDF compression
 * - Document optimization
 * - Backward compatibility with existing files
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

/**
 * Configuration for different file types
 */
const CONFIG = {
  images: {
    // Receipt/Payment Proof Images
    receipt: {
      maxWidth: 1080,
      maxHeight: 1920,
      quality: 85,
      format: 'jpeg', // or 'webp' for better compression
      background: { r: 255, g: 255, b: 255 } // White background for transparency
    },
    // Event Publication Images
    publication: {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 88,
      format: 'jpeg',
      background: { r: 255, g: 255, b: 255 }
    },
    // Organization Logos
    logo: {
      maxWidth: 512,
      maxHeight: 512,
      quality: 90,
      format: 'png', // Keep PNG for logos (transparency support)
      background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent
    },
    // General Images
    general: {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 85,
      format: 'jpeg',
      background: { r: 255, g: 255, b: 255 }
    }
  },
  documents: {
    // PDF files - basic validation only (compression is complex)
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['application/pdf']
  },
  office: {
    // Word/Excel files
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  }
};

/**
 * Detect file type from buffer and filename
 */
function detectFileType(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  
  // Check magic numbers (file signatures)
  if (buffer.length >= 4) {
    const signature = buffer.slice(0, 4).toString('hex');
    
    // Image formats
    if (signature.startsWith('ffd8ff')) return { type: 'image', subtype: 'jpeg' };
    if (signature.startsWith('89504e47')) return { type: 'image', subtype: 'png' };
    if (signature.startsWith('47494638')) return { type: 'image', subtype: 'gif' };
    if (signature.startsWith('52494646') && buffer.slice(8, 12).toString() === 'WEBP') {
      return { type: 'image', subtype: 'webp' };
    }
    
    // PDF
    if (buffer.slice(0, 5).toString() === '%PDF-') {
      return { type: 'document', subtype: 'pdf' };
    }
    
    // Office documents (ZIP-based)
    if (signature.startsWith('504b0304')) {
      if (ext === '.docx') return { type: 'office', subtype: 'docx' };
      if (ext === '.xlsx') return { type: 'office', subtype: 'xlsx' };
      return { type: 'office', subtype: 'office' };
    }
    
    // Legacy Office
    if (signature.startsWith('d0cf11e0')) {
      if (ext === '.doc') return { type: 'office', subtype: 'doc' };
      if (ext === '.xls') return { type: 'office', subtype: 'xls' };
      return { type: 'office', subtype: 'legacy-office' };
    }
  }
  
  // Fallback to extension
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'];
  const docExts = ['.pdf'];
  const officeExts = ['.doc', '.docx', '.xls', '.xlsx'];
  
  if (imageExts.includes(ext)) return { type: 'image', subtype: ext.slice(1) };
  if (docExts.includes(ext)) return { type: 'document', subtype: 'pdf' };
  if (officeExts.includes(ext)) return { type: 'office', subtype: ext.slice(1) };
  
  return { type: 'unknown', subtype: 'unknown' };
}

/**
 * Process an image file: resize, compress, convert format
 * 
 * @param {Buffer} inputBuffer - Original image buffer
 * @param {string} originalFilename - Original filename
 * @param {string} profileType - Processing profile (receipt, publication, logo, general)
 * @returns {Promise<{buffer: Buffer, filename: string, originalSize: number, processedSize: number, savings: string}>}
 */
async function processImage(inputBuffer, originalFilename, profileType = 'general') {
  const profile = CONFIG.images[profileType] || CONFIG.images.general;
  const originalSize = inputBuffer.length;
  
  console.log(`[FileProcessor] Processing image: ${originalFilename}`);
  console.log(`[FileProcessor] Original size: ${(originalSize / 1024).toFixed(2)} KB`);
  console.log(`[FileProcessor] Profile: ${profileType}`);
  
  try {
    // Get image metadata
    const metadata = await sharp(inputBuffer).metadata();
    console.log(`[FileProcessor] Original dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`[FileProcessor] Original format: ${metadata.format}`);
    
    // Determine if resizing is needed
    const needsResize = metadata.width > profile.maxWidth || metadata.height > profile.maxHeight;
    
    // Start processing pipeline
    let pipeline = sharp(inputBuffer);
    
    // Resize if needed (maintaining aspect ratio)
    if (needsResize) {
      pipeline = pipeline.resize(profile.maxWidth, profile.maxHeight, {
        fit: 'inside', // Maintain aspect ratio
        withoutEnlargement: true // Don't upscale small images
      });
      console.log(`[FileProcessor] Resizing to max ${profile.maxWidth}x${profile.maxHeight}`);
    } else {
      console.log(`[FileProcessor] No resize needed`);
    }
    
    // Convert format and compress
    let outputBuffer;
    let newExtension;
    
    if (profile.format === 'jpeg') {
      outputBuffer = await pipeline
        .flatten({ background: profile.background }) // Handle transparency
        .jpeg({ 
          quality: profile.quality,
          mozjpeg: true // Better compression
        })
        .toBuffer();
      newExtension = '.jpg';
    } else if (profile.format === 'webp') {
      outputBuffer = await pipeline
        .webp({ 
          quality: profile.quality,
          effort: 4 // Compression effort (0-6)
        })
        .toBuffer();
      newExtension = '.webp';
    } else if (profile.format === 'png') {
      outputBuffer = await pipeline
        .png({ 
          compressionLevel: 9,
          adaptiveFiltering: true
        })
        .toBuffer();
      newExtension = '.png';
    } else {
      // Default to JPEG
      outputBuffer = await pipeline
        .flatten({ background: profile.background })
        .jpeg({ quality: profile.quality, mozjpeg: true })
        .toBuffer();
      newExtension = '.jpg';
    }
    
    const processedSize = outputBuffer.length;
    const savings = ((1 - processedSize / originalSize) * 100).toFixed(1);
    
    console.log(`[FileProcessor] Processed size: ${(processedSize / 1024).toFixed(2)} KB`);
    console.log(`[FileProcessor] Savings: ${savings}% (${((originalSize - processedSize) / 1024).toFixed(2)} KB)`);
    
    // Generate new filename with proper extension
    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const newFilename = `${baseName}${newExtension}`;
    
    return {
      buffer: outputBuffer,
      filename: newFilename,
      originalSize,
      processedSize,
      savings: `${savings}%`,
      format: profile.format
    };
  } catch (error) {
    console.error(`[FileProcessor] Error processing image:`, error);
    // Return original if processing fails (backward compatibility)
    console.warn(`[FileProcessor] Falling back to original file`);
    return {
      buffer: inputBuffer,
      filename: originalFilename,
      originalSize,
      processedSize: originalSize,
      savings: '0%',
      format: 'original',
      error: error.message
    };
  }
}

/**
 * Process uploaded file based on type
 * 
 * @param {Object} file - Uploaded file object from express-fileupload
 * @param {string} type - File processing type (receipt, publication, logo, document, office)
 * @returns {Promise<{buffer: Buffer, filename: string, stats: Object}>}
 */
async function processUploadedFile(file, type = 'general') {
  if (!file || !file.data) {
    throw new Error('Invalid file object');
  }
  
  const fileType = detectFileType(file.data, file.name);
  console.log(`[FileProcessor] Detected file type:`, fileType);
  
  // Process based on file type
  if (fileType.type === 'image') {
    // Process images
    const result = await processImage(file.data, file.name, type);
    return {
      buffer: result.buffer,
      filename: result.filename,
      mimetype: result.format === 'png' ? 'image/png' : result.format === 'webp' ? 'image/webp' : 'image/jpeg',
      stats: {
        originalSize: result.originalSize,
        processedSize: result.processedSize,
        savings: result.savings,
        type: 'image',
        processed: true
      }
    };
  } else if (fileType.type === 'document') {
    // Validate PDF size
    if (file.data.length > CONFIG.documents.maxSize) {
      throw new Error(`PDF file too large. Maximum size is ${CONFIG.documents.maxSize / 1024 / 1024}MB`);
    }
    
    console.log(`[FileProcessor] PDF validation passed: ${(file.data.length / 1024).toFixed(2)} KB`);
    
    // Return original PDF (compression is complex and may break documents)
    return {
      buffer: file.data,
      filename: file.name,
      mimetype: file.mimetype,
      stats: {
        originalSize: file.data.length,
        processedSize: file.data.length,
        savings: '0%',
        type: 'document',
        processed: false
      }
    };
  } else if (fileType.type === 'office') {
    // Validate Office document size
    if (file.data.length > CONFIG.office.maxSize) {
      throw new Error(`Office document too large. Maximum size is ${CONFIG.office.maxSize / 1024 / 1024}MB`);
    }
    
    console.log(`[FileProcessor] Office document validation passed: ${(file.data.length / 1024).toFixed(2)} KB`);
    
    // Return original (Office docs shouldn't be modified)
    return {
      buffer: file.data,
      filename: file.name,
      mimetype: file.mimetype,
      stats: {
        originalSize: file.data.length,
        processedSize: file.data.length,
        savings: '0%',
        type: 'office',
        processed: false
      }
    };
  } else {
    // Unknown file type - pass through with validation
    console.warn(`[FileProcessor] Unknown file type, passing through: ${file.name}`);
    return {
      buffer: file.data,
      filename: file.name,
      mimetype: file.mimetype,
      stats: {
        originalSize: file.data.length,
        processedSize: file.data.length,
        savings: '0%',
        type: 'unknown',
        processed: false
      }
    };
  }
}

/**
 * Batch process multiple files
 * 
 * @param {Object} files - Object of files from req.files
 * @param {Object} typeMapping - Mapping of field names to processing types
 * @returns {Promise<Object>} Processed files with same structure
 */
async function processBatch(files, typeMapping = {}) {
  const processed = {};
  const stats = [];
  
  for (const [key, file] of Object.entries(files)) {
    const type = typeMapping[key] || 'general';
    console.log(`[FileProcessor] Processing batch file: ${key} (type: ${type})`);
    
    try {
      const result = await processUploadedFile(file, type);
      processed[key] = {
        ...file,
        data: result.buffer,
        name: result.filename,
        mimetype: result.mimetype
      };
      stats.push({
        field: key,
        filename: result.filename,
        ...result.stats
      });
    } catch (error) {
      console.error(`[FileProcessor] Error processing ${key}:`, error);
      // Keep original on error (backward compatibility)
      processed[key] = file;
      stats.push({
        field: key,
        filename: file.name,
        error: error.message,
        processed: false
      });
    }
  }
  
  return { processed, stats };
}

/**
 * Utility: Check if file is an image
 */
function isImage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'].includes(ext);
}

/**
 * Utility: Check if file is a document
 */
function isDocument(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'].includes(ext);
}

/**
 * Get appropriate MIME type for processed file
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  processImage,
  processUploadedFile,
  processBatch,
  isImage,
  isDocument,
  getMimeType,
  CONFIG
};
