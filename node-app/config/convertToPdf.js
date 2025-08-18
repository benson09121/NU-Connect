const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');

function calculateOptimalFontSize(text, textboxWidth = 9898380, textboxHeight = 1388533) {
    // Convert from EMUs (English Metric Units) to points
    // 1 point = 12700 EMUs approximately
    const widthInPoints = textboxWidth / 12700; // ~779 points
    const heightInPoints = textboxHeight / 12700; // ~109 points
    
    console.log(`Textbox dimensions: ${widthInPoints.toFixed(1)}pt wide x ${heightInPoints.toFixed(1)}pt high`);
    
    // Estimate character width at different font sizes (ADLaM Display font is wider than average)
    // ADLaM Display is approximately 0.7-0.8 times the font size in width per character
    const charWidthRatio = 0.75; // Character width as ratio of font size
    
    // Calculate maximum font size that fits the width
    const maxFontSizeForWidth = (widthInPoints * 0.9) / (text.length * charWidthRatio);
    
    // Calculate maximum font size that fits the height (leave some padding)
    const maxFontSizeForHeight = heightInPoints * 0.7;
    
    // Use the smaller of the two constraints
    let optimalFontSize = Math.min(maxFontSizeForWidth, maxFontSizeForHeight);
    
    // Set reasonable bounds
    optimalFontSize = Math.max(24, Math.min(72, optimalFontSize)); // Between 24pt and 72pt
    
    console.log(`Calculated font size: width constraint=${maxFontSizeForWidth.toFixed(1)}pt, height constraint=${maxFontSizeForHeight.toFixed(1)}pt`);
    console.log(`Final optimal font size: ${optimalFontSize.toFixed(1)}pt`);
    
    return Math.round(optimalFontSize);
}

function convertDocxToPdf(inputPath, outputPath, userData = {}) {
    return new Promise(async (resolve, reject) => {
        console.log('convertDocxToPdf: Starting conversion with font adjustment');
        console.log('convertDocxToPdf: Input path:', inputPath);
        console.log('convertDocxToPdf: Output path:', outputPath);
        
        if (!fs.existsSync(inputPath)) {
            return reject(new Error(`Input file does not exist: ${inputPath}`));
        }

        // If no user data, just do regular conversion
        if (!userData.name) {
            return convertRegular(inputPath, outputPath).then(resolve).catch(reject);
        }

        try {
            // Read and analyze the DOCX
            const data = fs.readFileSync(inputPath);
            const zip = await JSZip.loadAsync(data);
            const docXml = await zip.file("word/document.xml").async("string");
            
            // Extract textbox dimensions from XML
            const extentMatch = docXml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
            let textboxWidth = 9898380; // Default from XML
            let textboxHeight = 1388533; // Default from XML
            
            if (extentMatch) {
                textboxWidth = parseInt(extentMatch[1]);
                textboxHeight = parseInt(extentMatch[2]);
                console.log(`Found textbox dimensions: ${textboxWidth} x ${textboxHeight} EMUs`);
            }
            
            // Calculate optimal font size based on textbox dimensions
            const fontSize = calculateOptimalFontSize(userData.name, textboxWidth, textboxHeight);
            const fontSizeInHalfPoints = fontSize * 2; // Word uses half-points
            
            console.log(`convertDocxToPdf: User name: "${userData.name}" (${userData.name.length} chars)`);
            console.log(`convertDocxToPdf: Optimal font size: ${fontSize}pt (${fontSizeInHalfPoints} half-points)`);
            
            let modifiedXml = docXml;
            
            // Extract existing name from textbox to replace with new name
            let existingName = null;
            const textboxSections = modifiedXml.match(/<w:txbxContent>.*?<\/w:txbxContent>/gs) || [];
            
            // Find the existing name in textboxes
            textboxSections.forEach((section) => {
                const textMatches = section.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
                if (textMatches) {
                    textMatches.forEach((textMatch) => {
                        const textContent = textMatch.replace(/<[^>]*>/g, '').trim();
                        if (textContent && textContent.length > 5 && !existingName) {
                            // Assume this is the name if it's substantial text content
                            existingName = textContent;
                            console.log(`convertDocxToPdf: Found existing name in textbox: "${existingName}"`);
                        }
                    });
                }
            });
            
            // Replace existing name with new name if found
            if (existingName && existingName !== userData.name) {
                console.log(`convertDocxToPdf: Replacing "${existingName}" with "${userData.name}"`);
                const escapedExistingName = existingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                modifiedXml = modifiedXml.replace(new RegExp(escapedExistingName, 'g'), userData.name);
            } else if (!existingName) {
                // Fallback: look for common placeholder patterns
                console.log('convertDocxToPdf: No existing name found, looking for placeholders');
                modifiedXml = modifiedXml.replace(/{name}/g, userData.name);
                modifiedXml = modifiedXml.replace(/{Name}/g, userData.name);
                modifiedXml = modifiedXml.replace(/\[NAME\]/g, userData.name);
                modifiedXml = modifiedXml.replace(/\[name\]/g, userData.name);
            }
            
            // Method 1: Target textboxes containing the user's name (now using the correct name)
            const updatedTextboxSections = modifiedXml.match(/<w:txbxContent>.*?<\/w:txbxContent>/gs) || [];
            let foundAndModified = false;
            
            updatedTextboxSections.forEach((section, index) => {
                if (section.includes(userData.name)) {
                    console.log(`convertDocxToPdf: Found textbox section ${index} containing user name`);
                    
                    // Replace font sizes in this specific section while preserving font family
                    let modifiedSection = section.replace(
                        /<w:sz w:val="\d+"/g,
                        `<w:sz w:val="${fontSizeInHalfPoints}"`
                    );
                    
                    modifiedSection = modifiedSection.replace(
                        /<w:szCs w:val="\d+"/g,
                        `<w:szCs w:val="${fontSizeInHalfPoints}"`
                    );
                    
                    // Replace the original section with the modified one
                    modifiedXml = modifiedXml.replace(section, modifiedSection);
                    foundAndModified = true;
                    
                    console.log(`convertDocxToPdf: Updated font sizes in textbox section ${index} to ${fontSizeInHalfPoints} half-points`);
                }
            });
            
            // Method 2: Set textbox anchor to bottom for textboxes containing the user's name
            modifiedXml = modifiedXml.replace(
                /(<wps:bodyPr[^>]*?)anchor="t"([^>]*?>)/g,
                (match, beforeAnchor, afterAnchor, offset, string) => {
                    const contextStart = Math.max(0, offset - 3000);
                    const contextEnd = Math.min(string.length, offset + 3000);
                    const context = string.substring(contextStart, contextEnd);
                    
                    if (context.includes(userData.name)) {
                        console.log('convertDocxToPdf: Setting textbox anchor to bottom');
                        return `${beforeAnchor}anchor="b"${afterAnchor}`;
                    }
                    return match;
                }
            );
            
            // Method 3: Fallback - Simple global replacement if Method 1 didn't find anything
            if (!foundAndModified) {
                console.log('convertDocxToPdf: Fallback - applying global font size and anchor replacement');
                
                // Replace all font sizes in the document (less precise but more reliable)
                modifiedXml = modifiedXml.replace(
                    /<w:sz w:val="\d+"/g,
                    `<w:sz w:val="${fontSizeInHalfPoints}"`
                );
                
                modifiedXml = modifiedXml.replace(
                    /<w:szCs w:val="\d+"/g,
                    `<w:szCs w:val="${fontSizeInHalfPoints}"`
                );
                
                // Also set all textboxes to bottom alignment
                modifiedXml = modifiedXml.replace(
                    /anchor="t"/g,
                    'anchor="b"'
                );
                
                console.log('convertDocxToPdf: Applied global font size replacement and bottom alignment');
            }
            
            console.log('convertDocxToPdf: Font size modification and alignment completed');
            
            // Update the document
            zip.file("word/document.xml", modifiedXml);
            
            // Generate modified DOCX
            const modifiedBuffer = await zip.generateAsync({ 
                type: "nodebuffer",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
            });
            
            // Write temporary modified file
            const tempModifiedPath = inputPath.replace('.docx', '_fontadjusted.docx');
            fs.writeFileSync(tempModifiedPath, modifiedBuffer);
            console.log('convertDocxToPdf: Font-adjusted DOCX written to:', tempModifiedPath);
            
            // Convert to PDF
            convertRegular(tempModifiedPath, outputPath)
                .then(() => {
                    try {
                        fs.unlinkSync(tempModifiedPath);
                    } catch (e) {
                        console.warn('convertDocxToPdf: Failed to cleanup temp file:', e.message);
                    }
                    resolve(outputPath);
                })
                .catch((convertError) => {
                    console.error('convertDocxToPdf: Font-adjusted conversion failed:', convertError);
                    // Fallback to original file
                    try {
                        fs.unlinkSync(tempModifiedPath);
                    } catch (e) {}
                    convertRegular(inputPath, outputPath).then(resolve).catch(reject);
                });
                
        } catch (error) {
            console.error('convertDocxToPdf: Font adjustment error:', error);
            console.log('convertDocxToPdf: Falling back to original conversion');
            convertRegular(inputPath, outputPath).then(resolve).catch(reject);
        }
    });
}

function convertRegular(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const command = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
        console.log('convertRegular: Executing:', command);
        
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            console.log('convertRegular: stdout:', stdout);
            if (stderr) console.log('convertRegular: stderr:', stderr);
            
            if (error) {
                return reject(new Error(`LibreOffice conversion failed: ${error.message}`));
            }

            const inputBasename = path.basename(inputPath, path.extname(inputPath));
            const possiblePdfPath = path.join(outputDir, `${inputBasename}.pdf`);
            
            if (fs.existsSync(outputPath)) {
                console.log('convertRegular: PDF found at expected path:', outputPath);
                resolve(outputPath);
            } else if (fs.existsSync(possiblePdfPath)) {
                console.log('convertRegular: PDF found at alternate path, renaming');
                fs.renameSync(possiblePdfPath, outputPath);
                resolve(outputPath);
            } else {
                console.error('convertRegular: PDF file not found');
                reject(new Error(`PDF file not created`));
            }
        });
    });
}

module.exports = convertDocxToPdf;