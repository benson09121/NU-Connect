/**
 * Signature Validator Utility
 * Validates that uploaded images are legitimate signatures, not documents, photos, or random images
 */

const sharp = require('sharp');

/**
 * Validate if image is a legitimate signature
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} filename - Original filename
 * @returns {Promise<Object>} Validation result with isValid, confidence, and issues
 */
async function validateSignature(imageBuffer, filename) {
    const issues = [];
    let confidence = 100;

    try {
        // Get image metadata
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        const { width, height, format } = metadata;

        console.log(`📊 Validating signature: ${filename} (${width}x${height}, ${format})`);

        // 1. Check image format
        if (!['png', 'jpeg', 'jpg'].includes(format)) {
            issues.push('Invalid image format. Please use PNG or JPG.');
            confidence -= 100;
        }

        // 2. Check dimensions - Signatures are typically horizontal and reasonable size
        if (width < 100 || height < 50) {
            issues.push('Image is too small. Minimum dimensions: 100x50 pixels.');
            confidence -= 50;
        }

        if (width > 2000 || height > 1000) {
            issues.push('Image is too large. Maximum dimensions: 2000x1000 pixels.');
            confidence -= 30;
        }

        // Check aspect ratio - Signatures are typically wider than tall
        const aspectRatio = width / height;
        if (aspectRatio < 1.2) {
            issues.push('Signature should be horizontal (wider than tall). This looks like a photo or document.');
            confidence -= 40;
        }

        if (aspectRatio > 10) {
            issues.push('Image aspect ratio is unusual for a signature.');
            confidence -= 30;
        }

        // 3. Analyze image content
        const stats = await image.stats();
        const { channels } = stats;

        // Get raw pixel data for analysis
        const { data, info } = await image
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Analyze pixel distribution
        const analysis = analyzePixels(data, info);

        // 4. Check background (should be mostly white/light)
        if (analysis.backgroundPercent < 60) {
            issues.push('Background is not clear enough. Please use a signature on white or transparent background.');
            confidence -= 40;
        }

        // 5. Check for dark ink strokes (signatures should have dark strokes)
        if (analysis.darkPixelPercent < 2) {
            issues.push('No clear signature strokes detected. Image appears too light or empty.');
            confidence -= 50;
        }

        if (analysis.darkPixelPercent > 50) {
            issues.push('Image is too dark. This looks like a document or photo, not a signature.');
            confidence -= 60;
        }

        // 6. Check complexity (not just a line or dot)
        // ADJUSTED: Lower threshold for simpler signatures (was 10, now 1)
        if (analysis.complexityScore < 1) {
            issues.push('Signature is too simple (appears to be just a dot or line).');
            confidence -= 30;
        }

        // 7. Detect if it's a document (has text-like patterns)
        if (analysis.textLikePatterns > 30) {
            issues.push('Image appears to contain text or document content. Please upload only your signature.');
            confidence -= 70;
        }

        // 8. Check for photo-like characteristics (varied colors, gradients)
        if (analysis.colorVariety > 50) {
            issues.push('Image has too much color variation. This looks like a photo, not a signature.');
            confidence -= 60;
        }

        // Ensure confidence doesn't go below 0
        confidence = Math.max(0, confidence);

        // ADJUSTED: Lower confidence threshold for acceptance (was 50, now 65)
        // This allows simpler signatures to pass validation
        const isValid = confidence >= 65 && issues.length === 0;

        console.log(`✅ Validation result: ${isValid ? 'VALID' : 'INVALID'} (confidence: ${confidence}%)`);
        if (issues.length > 0) {
            console.log(`⚠️ Issues found:`, issues);
        }

        return {
            isValid,
            confidence,
            issues,
            metadata: {
                width,
                height,
                format,
                aspectRatio: aspectRatio.toFixed(2),
                fileSize: imageBuffer.length
            },
            analysis: {
                backgroundPercent: analysis.backgroundPercent.toFixed(1),
                darkPixelPercent: analysis.darkPixelPercent.toFixed(1),
                complexityScore: analysis.complexityScore.toFixed(1),
                textLikePatterns: analysis.textLikePatterns.toFixed(1),
                colorVariety: analysis.colorVariety.toFixed(1)
            }
        };

    } catch (error) {
        console.error('❌ Signature validation error:', error);
        return {
            isValid: false,
            confidence: 0,
            issues: ['Failed to process image. Please ensure it is a valid PNG or JPG file.'],
            metadata: {},
            analysis: {}
        };
    }
}

/**
 * Analyze pixel data to detect signature characteristics
 * @param {Buffer} data - Raw pixel data
 * @param {Object} info - Image info (width, height, channels)
 * @returns {Object} Analysis results
 */
function analyzePixels(data, info) {
    const { width, height, channels } = info;
    const totalPixels = width * height;

    let whitePixels = 0;
    let darkPixels = 0;
    let grayPixels = 0;
    let coloredPixels = 0;
    let edgePixels = 0;

    // Sample pixels for performance (check every 4th pixel)
    const sampleRate = 4;
    const sampledPixels = Math.floor(totalPixels / sampleRate);

    for (let i = 0; i < data.length; i += channels * sampleRate) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = channels === 4 ? data[i + 3] : 255;

        // Skip transparent pixels
        if (a < 128) {
            whitePixels++;
            continue;
        }

        // Calculate brightness
        const brightness = (r + g + b) / 3;

        // Classify pixel
        if (brightness > 240) {
            whitePixels++;
        } else if (brightness < 50) {
            darkPixels++;
        } else if (brightness < 200) {
            grayPixels++;
        }

        // Check for color variety (photos have varied colors)
        const colorDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
        if (colorDiff > 30) {
            coloredPixels++;
        }

        // Simple edge detection (check if adjacent pixels differ significantly)
        if (i > 0 && i + channels < data.length) {
            const prevBrightness = (data[i - channels] + data[i - channels + 1] + data[i - channels + 2]) / 3;
            if (Math.abs(brightness - prevBrightness) > 50) {
                edgePixels++;
            }
        }
    }

    // Calculate percentages
    const backgroundPercent = (whitePixels / sampledPixels) * 100;
    const darkPixelPercent = (darkPixels / sampledPixels) * 100;
    const grayPixelPercent = (grayPixels / sampledPixels) * 100;
    const colorVariety = (coloredPixels / sampledPixels) * 100;
    
    // Complexity score based on edges and gray areas
    const complexityScore = ((edgePixels + grayPixels) / sampledPixels) * 100;

    // Text-like patterns: documents have evenly distributed dark pixels
    // Signatures have less uniform distribution
    const textLikePatterns = (darkPixelPercent > 5 && darkPixelPercent < 40 && complexityScore > 20) 
        ? Math.min(100, complexityScore * 1.5) 
        : 0;

    return {
        backgroundPercent,
        darkPixelPercent,
        complexityScore,
        textLikePatterns,
        colorVariety
    };
}

/**
 * Quick validation for file size and type (frontend can use this too)
 * @param {Object} file - File object with name and size
 * @returns {Object} Validation result
 */
function validateSignatureFile(file) {
    const issues = [];
    const maxSize = 2 * 1024 * 1024; // 2MB
    const minSize = 1024; // 1KB

    // Check file size
    if (file.size > maxSize) {
        issues.push('File size exceeds 2MB. Please compress or crop your signature image.');
    }

    if (file.size < minSize) {
        issues.push('File size is too small. Please upload a clear signature image.');
    }

    // Check file type
    const validExtensions = ['.png', '.jpg', '.jpeg'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(extension)) {
        issues.push('Invalid file type. Please upload PNG or JPG images only.');
    }

    return {
        valid: issues.length === 0,
        error: issues.join(' ')
    };
}

module.exports = {
    validateSignature,
    validateSignatureFile
};
