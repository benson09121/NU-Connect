const { TemplateHandler, MimeType } = require('easy-template-x');
const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const convertToPdf = require('../../config/convertToPdf');

/**
 * Requirement lists for NEW and RENEWAL applications
 */
const NEW_REQUIREMENTS = [
    'Letter of Intent',
    'Application Form',
    'By Laws of the Organization (approved by the officers, adviser/s, program chairs and dean)',
    'List of Officers/Founders',
    'Official Logo (send to sdao@nu-dasma.edu.ph)',
    'Letter from the College Dean endorsing the Faculty Adviser (Co-Curricular organizations)',
    'List of Members',
    'Latest Certificate of Grades of Officers',
    'Biodata/CV of Officers',
    'Resume/CV of Adviser',
    'Letter from the College Dean/Department Chair endorsing the Faculty Adviser',
    'List of Proposed Projects with Proposed Budget for the AY',
    'Others'
];

const RENEWAL_REQUIREMENTS = [
    'Letter of Intent',
    'Application Form',
    'By Laws of the Organization (if there is an update done last AY and approved by the officers, adviser/s, program chairs and dean)',
    'Updated List of Officers/Founders for the AY',
    'Updated Logo (send to sdao@nu-dasma.edu.ph)',
    'Letter from the College Dean/Department Chair endorsing the Faculty Adviser',
    'List of Members',
    'Latest Certificate of Grades of Officers',
    'Biodata/CV of New Elected Officers',
    'List of Proposed Projects with Proposed Budget for the AY',
    'List of Past Projects',
    'Financial Statement of the previous AY (signed by officers and adviser)',
    'Summary of Evaluation of the Past Projects',
    'Others'
];

/**
 * Helper function to create a slug from requirement name
 */
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, '_')        // Replace spaces with underscores
        .replace(/_+/g, '_')         // Replace multiple underscores with single
        .replace(/^_|_$/g, '');      // Remove leading/trailing underscores
}

/**
 * Check if a requirement was submitted
 */
function hasRequirement(requirementName, submittedRequirements) {
    const reqLower = requirementName.toLowerCase().trim();
    
    const found = submittedRequirements.some(r => {
        const submittedLower = r.requirement_name.toLowerCase().trim();
        
        // 1. Exact match
        if (submittedLower === reqLower) {
            return true;
        }
        
        // 2. Check if submitted requirement contains the target requirement
        if (submittedLower.includes(reqLower)) {
            return true;
        }
        
        // 3. Check if target requirement contains the submitted requirement
        if (reqLower.includes(submittedLower)) {
            return true;
        }
        
        // 4. Check for key words (first 3 significant words)
        const reqWords = reqLower.split(' ').filter(w => w.length > 3).slice(0, 3);
        const submittedWords = submittedLower.split(' ').filter(w => w.length > 3);
        
        const hasCommonWords = reqWords.some(word => submittedWords.some(sw => sw.includes(word) || word.includes(sw)));
        if (hasCommonWords) {
            return true;
        }
        
        return false;
    });
    
    return found;
}

/**
 * Generate Student Organization Application Form
 * @param {number} applicationId - Application ID
 * @param {string} format - Output format: 'docx' or 'pdf' (default: 'docx')
 * @returns {Promise<string>} - Path to generated document
 */
async function generateApplicationForm(applicationId, format = 'docx') {
    const connection = await pool.getConnection();
    
    try {
        console.log('📄 [DOC-GEN] Starting document generation for application:', applicationId, 'Format:', format);
        
        // 1. Fetch application data
        const appData = await fetchApplicationData(connection, applicationId);
        
        // 2. Fetch approval chain with signatures
        const approvalData = await fetchApprovalChainData(connection, applicationId);
        
        // 3. Fetch requirements
        const requirements = await fetchRequirementsData(connection, applicationId);
        
        // 4. Map data to template
        const templateData = mapDataToTemplate(appData, approvalData, requirements);
        
        // 5. Load template
        const templatePath = path.join('/app/templates', 'NUD-ACS-SDA-F-003 - Student Org Application Form.docx');
        
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`);
        }
        
        console.log('📄 [DOC-GEN] Template file loaded successfully:', templatePath);
        const templateFile = fs.readFileSync(templatePath);
        
        // 6. Generate document
        console.log('🔍 [TEMPLATE-DEBUG] ALL DATA being passed to template:');
        
        // Show ALL placeholders and their values
        const allPlaceholders = Object.keys(templateData).sort();
        allPlaceholders.forEach(key => {
            if (key.includes('checkbox') || key.includes('app_') || key.includes('req_')) {
                console.log(`  ${key}: "${templateData[key]}"`);
            }
        });
        
        console.log('🔍 [TEMPLATE-DEBUG] Total placeholders count:', allPlaceholders.length);
        
        const handler = new TemplateHandler();
        const doc = await handler.process(templateFile, templateData);
        
        // 7. Save DOCX document first
        const outputDir = path.join('/app/applications', String(applicationId), 'documents');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log('📄 [DOC-GEN] Created output directory:', outputDir);
        }
        
        const timestamp = Date.now();
        const docxOutputPath = path.join(outputDir, `Application-Form-${applicationId}-${timestamp}.docx`);
        fs.writeFileSync(docxOutputPath, doc);
        
        console.log('✅ [DOC-GEN] DOCX document generated successfully:', docxOutputPath);
        
        // Verify DOCX file was created
        const docxFileStats = fs.statSync(docxOutputPath);
        console.log('✅ [DOC-GEN] DOCX file size:', docxFileStats.size, 'bytes');
        
        // Update database with DOCX path
        await updateDocumentStatus(applicationId, 'docx', docxOutputPath, 'completed');
        
        // 8. Convert to PDF if requested
        if (format === 'pdf') {
            console.log('📄 [DOC-GEN] Converting DOCX to PDF...');
            const pdfOutputPath = path.join(outputDir, `Application-Form-${applicationId}-${timestamp}.pdf`);
            
            try {
                // Mark PDF as processing
                await updateDocumentStatus(applicationId, 'pdf', null, 'processing');
                
                await convertToPdf(docxOutputPath, pdfOutputPath);
                console.log('✅ [DOC-GEN] PDF document generated successfully:', pdfOutputPath);
                
                // Verify PDF file was created
                const pdfFileStats = fs.statSync(pdfOutputPath);
                console.log('✅ [DOC-GEN] PDF file size:', pdfFileStats.size, 'bytes');
                
                // Update database with PDF path
                await updateDocumentStatus(applicationId, 'pdf', pdfOutputPath, 'completed');
                
                return pdfOutputPath;
            } catch (pdfError) {
                console.error('❌ [DOC-GEN] PDF conversion failed:', pdfError);
                console.log('⚠️ [DOC-GEN] Returning DOCX file instead');
                
                // Mark PDF as failed
                await updateDocumentStatus(applicationId, 'pdf', null, 'failed');
                
                return docxOutputPath;
            }
        }
        
        return docxOutputPath;
        
    } catch (error) {
        console.error('❌ [DOC-GEN] Error generating document:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Fetch application data from database
 */
async function fetchApplicationData(connection, applicationId) {
    const [appRows] = await connection.query(`
        SELECT 
            a.application_id,
            a.submitted_org_name,
            a.description as submitted_org_description,
            a.category,
            a.application_type,
            a.student_id,
            a.submitter_contact_no,
            a.base_program_id,
            CONCAT(
                DATE_FORMAT(ap.start_date, '%Y'), 
                '-', 
                DATE_FORMAT(ap.end_date, '%Y')
            ) as academic_year,
            p.name as college,
            CONCAT(u.f_name, ' ', u.l_name) as submitter_name,
            u.email as submitter_email,
            o.created_at as organization_created_at
        FROM tbl_application a
        JOIN tbl_period ap ON a.period_id = ap.period_id
        LEFT JOIN tbl_user u ON a.student_id = u.user_id
        LEFT JOIN tbl_program p ON a.base_program_id = p.program_id
        LEFT JOIN tbl_organization o ON a.organization_id = o.organization_id
        WHERE a.application_id = ?
    `, [applicationId]);
    
    if (appRows.length === 0) {
        throw new Error('Application not found');
    }
    
    console.log('📄 [DOC-GEN] Application data fetched:', appRows[0]);
    
    return appRows[0];
}

/**
 * Fetch approval chain data with signatures
 */
async function fetchApprovalChainData(connection, applicationId) {
    const [chainRows] = await connection.query(`
        SELECT 
            ac.chain_id,
            ac.approver_user_id,
            ac.approver_role_id,
            ac.approval_order,
            ac.uses_endorsed,
            ac.is_final_approval,
            ac.status,
            ac.remarks,
            ac.signature_path,
            ac.endorsed_at,
            ac.received_at,
            ac.signed_at,
            ac.approved_at,
            CONCAT(u.f_name, ' ', u.l_name) as approver_name,
            u.email as approver_email,
            r.role_name
        FROM tbl_organization_approval_chain ac
        JOIN tbl_user u ON ac.approver_user_id = u.user_id
        JOIN tbl_role r ON ac.approver_role_id = r.role_id
        WHERE ac.application_id = ?
        ORDER BY ac.approval_order
    `, [applicationId]);
    
    console.log('📄 [DOC-GEN] Approval chain data fetched:', chainRows.length, 'approvers');
    
    return chainRows;
}

/**
 * Fetch requirements data
 */
async function fetchRequirementsData(connection, applicationId) {
    const [reqRows] = await connection.query(`
        SELECT 
            ors.requirement_id,
            ar.requirement_name,
            ors.file_path,
            ors.submitted_at
        FROM tbl_organization_requirement_submission ors
        JOIN tbl_application_requirement ar ON ors.requirement_id = ar.requirement_id
        WHERE ors.application_id = ?
    `, [applicationId]);
    
    console.log('📄 [DOC-GEN] Requirements fetched:', reqRows.length, 'requirements');
    
    return reqRows;
}

/**
 * Map database data to template placeholders
 */
function mapDataToTemplate(appData, approvalData, requirements) {
    // More robust application type detection
    const appTypeStr = (appData.application_type || '').toLowerCase().trim();
    const isNewApplication = appTypeStr === 'new' || appTypeStr === 'new organization' || appTypeStr === 'new org';
    
    console.log('📄 [DOC-GEN] Application type detection:', {
        raw_application_type: appData.application_type,
        normalized_application_type: appTypeStr,
        isNewApplication: isNewApplication,
        category: appData.category
    });
    
    const data = {
        // Basic information
        'academic-year': appData.academic_year || '',
        'organization_name': appData.submitted_org_name || '',
        'submitter_name': appData.submitter_name || '',
        'submitter_contactno': appData.submitter_contact_no || '',
        'submitter_emaill': appData.submitter_email || '',
        'date_of_organization_created': formatDate(appData.organization_created_at),
        'description': appData.submitted_org_description || '',
        'College': appData.college || '',
        
        // Category checkboxes - TEST with X/empty instead of Unicode
        'checkbox_cocurricular': appData.category === 'Co-Curricular Organization' ? 'X' : '',
        'checkbox_extracurricular': appData.category === 'Extra Curricular Organization' ? 'X' : '',
        
        // Application type checkboxes - TEST with X/empty instead of Unicode
        'app_new': isNewApplication ? 'X' : '',
        'app_renewal': !isNewApplication ? 'X' : '',
    };
    
    console.log('� [CHECKBOX-DEBUG] Final checkbox values:', {
        'app_new': data['app_new'],
        'app_renewal': data['app_renewal'],
        'checkbox_cocurricular': data['checkbox_cocurricular'],
        'checkbox_extracurricular': data['checkbox_extracurricular']
    });
    
    // Add dynamic requirement checkboxes based on application type
    const requirementList = isNewApplication ? NEW_REQUIREMENTS : RENEWAL_REQUIREMENTS;
    const requirementPrefix = isNewApplication ? 'req_new_' : 'req_renewal_';
    
    console.log(`📄 [DOC-GEN] Generating ${isNewApplication ? 'NEW' : 'RENEWAL'} requirements (${requirementList.length} items)`);
    
    requirementList.forEach((reqName, index) => {
        const placeholderName = `${requirementPrefix}${index + 1}`;
        const isSubmitted = hasRequirement(reqName, requirements);
        data[placeholderName] = isSubmitted ? 'X' : '';  // TEST with X/empty instead of Unicode
        
        if (isSubmitted) {
            console.log(`✓ ${placeholderName}: X - "${reqName}" (SUBMITTED)`);
        }
    });
    
    // Map approval chain signatures
    const endorsers = approvalData.filter(a => a.uses_endorsed === 1);
    const receivers = approvalData.filter(a => a.status === 'Received');
    const approvers = approvalData.filter(a => a.is_final_approval === 1);
    
    // Endorsers - Updated placeholder names
    if (endorsers[0]) {
        data['1-endorser-e-signature'] = loadSignatureImage(endorsers[0].signature_path);
        data['1-endorser-e-sig-date'] = formatDate(endorsers[0].endorsed_at);
        data['1-endorser-e-sig-time'] = formatTime(endorsers[0].endorsed_at);
    }
    if (endorsers[1]) {
        data['2-endorser-e-signature'] = loadSignatureImage(endorsers[1].signature_path);
        data['2-endorser-e-sig-date'] = formatDate(endorsers[1].endorsed_at);
        data['2-endorser-e-sig-time'] = formatTime(endorsers[1].endorsed_at);
    }
    
    // Receivers - Updated placeholder names
    if (receivers[0]) {
        data['1-rec-e-signature'] = loadSignatureImage(receivers[0].signature_path);
        data['1-rec-e-signature-date'] = formatDate(receivers[0].received_at);
        data['1-rec-e-signature-time'] = formatTime(receivers[0].received_at);
    }
    if (receivers[1]) {
        data['2-rec-e-signature'] = loadSignatureImage(receivers[1].signature_path);
        data['2-rec-e-signature-date'] = formatDate(receivers[1].received_at);
        data['2-rec-e-signature-time'] = formatTime(receivers[1].received_at);
    }
    
    // Final Approvers - Updated placeholder names
    if (approvers[0]) {
        data['1-final-e-signature'] = loadSignatureImage(approvers[0].signature_path);
        data['1-app-e-sig-date'] = formatDate(approvers[0].approved_at);
    }
    if (approvers[1]) {
        data['2-final-e-signature'] = loadSignatureImage(approvers[1].signature_path);
        data['2-app-e-sig-date'] = formatDate(approvers[1].approved_at);
    }
    
    // Remarks
    const sdao = approvalData.find(a => a.approver_role_id === 4);
    const academicDirector = approvalData.find(a => a.approver_role_id === 6);
    
    data['sdao_remarks'] = sdao?.remarks || 'No remarks';
    data['academic_director_remarks'] = academicDirector?.remarks || 'No remarks';
    
    // Requirements checklist - use checkbox characters
    const reqNames = requirements.map(r => r.requirement_name.toLowerCase());
    
    data['checkbox_letter_of_intent'] = reqNames.some(n => n.includes('letter of intent')) ? '☑' : '☐';
    data['checkbox_application_form'] = reqNames.some(n => n.includes('application form')) ? '☑' : '☐';
    data['checkbox_by_laws'] = reqNames.some(n => n.includes('by laws') || n.includes('bylaws')) ? '☑' : '☐';
    data['checkbox_officers_list'] = reqNames.some(n => n.includes('officers') || n.includes('founders')) ? '☑' : '☐';
    data['checkbox_logo'] = reqNames.some(n => n.includes('logo')) ? '☑' : '☐';
    data['checkbox_dean_letter'] = reqNames.some(n => n.includes('dean') && n.includes('adviser')) ? '☑' : '☐';
    data['checkbox_members_list'] = reqNames.some(n => n.includes('members')) ? '☑' : '☐';
    data['checkbox_grades'] = reqNames.some(n => n.includes('grades')) ? '☑' : '☐';
    data['checkbox_biodata'] = reqNames.some(n => (n.includes('biodata') || n.includes('cv')) && n.includes('officers')) ? '☑' : '☐';
    data['checkbox_adviser_cv'] = reqNames.some(n => (n.includes('resume') || n.includes('cv')) && n.includes('adviser')) ? '☑' : '☐';
    data['checkbox_endorsing_letter'] = reqNames.some(n => n.includes('endorsing') && n.includes('adviser')) ? '☑' : '☐';
    data['checkbox_projects'] = reqNames.some(n => n.includes('projects')) ? '☑' : '☐';
    
    console.log('📄 [DOC-GEN] Requirements checklist:', {
        letter_of_intent: data['checkbox_letter_of_intent'],
        application_form: data['checkbox_application_form'],
        by_laws: data['checkbox_by_laws'],
        officers_list: data['checkbox_officers_list'],
        logo: data['checkbox_logo'],
        dean_letter: data['checkbox_dean_letter'],
        members_list: data['checkbox_members_list'],
        grades: data['checkbox_grades'],
        biodata: data['checkbox_biodata'],
        adviser_cv: data['checkbox_adviser_cv'],
        endorsing_letter: data['checkbox_endorsing_letter'],
        projects: data['checkbox_projects']
    });
    
    return data;
}

/**
 * Load signature image for embedding in document
 * @param {string} signaturePath - Filename from database (e.g., 'mendozasm_at_students_nu-dasma_edu_ph_signature.jpg')
 * @returns {Object|null} Image object for easy-template-x or null if not found
 */
function loadSignatureImage(signaturePath) {
    if (!signaturePath) {
        console.log('⚠️ [DOC-GEN] No signature path provided');
        return null;
    }
    
    try {
        // Database stores just the filename, prepend the directory path
        const fullPath = path.join('/app/esignatures', signaturePath);
        
        console.log('🔍 [DOC-GEN] Looking for signature at:', fullPath);
        
        if (fs.existsSync(fullPath)) {
            const imageBuffer = fs.readFileSync(fullPath);
            const fileExt = path.extname(signaturePath).toLowerCase();
            
            // Determine format from extension
            let format = MimeType.Png; // Default
            if (fileExt === '.jpg' || fileExt === '.jpeg') {
                format = MimeType.Jpeg;
            } else if (fileExt === '.gif') {
                format = MimeType.Gif;
            } else if (fileExt === '.bmp') {
                format = MimeType.Bmp;
            }
            
            console.log('✅ [DOC-GEN] Signature loaded:', fullPath);
            console.log('   📊 Size:', imageBuffer.length, 'bytes');
            console.log('   🖼️ Format:', format);
            
            // Return proper image object for easy-template-x
            return {
                _type: "image",
                source: imageBuffer,
                format: format,
                width: 150,   // Signature width in pixels
                height: 75,   // Signature height in pixels
                altText: "Digital Signature"
            };
        } else {
            console.log('❌ [DOC-GEN] Signature file not found:', fullPath);
            return null;
        }
    } catch (error) {
        console.error('❌ [DOC-GEN] Error loading signature:', error);
        return null;
    }
}

/**
 * Format date as MM/DD/YYYY
 */
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
    });
}

/**
 * Format time as HH:MM AM/PM
 */
function formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });
}

/**
 * Update document generation status in database
 * @param {number} applicationId - Application ID
 * @param {string} format - Document format ('docx' or 'pdf')
 * @param {string} filePath - Path to generated document
 * @param {string} status - Status ('processing', 'completed', 'failed')
 */
async function updateDocumentStatus(applicationId, format, filePath = null, status = 'processing') {
    const connection = await pool.getConnection();
    
    try {
        console.log(`📄 [DOC-STATUS] Updating ${format.toUpperCase()} status for application ${applicationId}:`, {
            status,
            filePath
        });
        
        if (format === 'docx') {
            await connection.query(`
                UPDATE tbl_application 
                SET 
                    docx_path = ?,
                    docx_generated_at = ${filePath ? 'NOW()' : 'NULL'},
                    document_generation_status = ?
                WHERE application_id = ?
            `, [filePath, status, applicationId]);
        } else if (format === 'pdf') {
            await connection.query(`
                UPDATE tbl_application 
                SET 
                    pdf_path = ?,
                    pdf_generated_at = ${filePath ? 'NOW()' : 'NULL'},
                    document_generation_status = ?
                WHERE application_id = ?
            `, [filePath, status, applicationId]);
        }
        
        console.log(`✅ [DOC-STATUS] ${format.toUpperCase()} status updated successfully`);
        
    } catch (error) {
        console.error(`❌ [DOC-STATUS] Error updating ${format} status:`, error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Get document status from database
 * @param {number} applicationId - Application ID
 * @returns {Promise<object>} - Document status object
 */
async function getDocumentStatus(applicationId) {
    const connection = await pool.getConnection();
    
    try {
        const [rows] = await connection.query(`
            SELECT 
                document_generation_status,
                docx_path,
                pdf_path,
                docx_generated_at,
                pdf_generated_at
            FROM tbl_application
            WHERE application_id = ?
        `, [applicationId]);
        
        if (rows.length === 0) {
            return null;
        }
        
        const status = rows[0];
        
        return {
            status: status.document_generation_status,
            documents: {
                docx: {
                    available: !!status.docx_path,
                    path: status.docx_path,
                    generated_at: status.docx_generated_at,
                    download_url: status.docx_path ? `/api/web/download-application-form/${applicationId}?format=docx` : null
                },
                pdf: {
                    available: !!status.pdf_path,
                    path: status.pdf_path,
                    generated_at: status.pdf_generated_at,
                    download_url: status.pdf_path ? `/api/web/download-application-form/${applicationId}?format=pdf` : null
                }
            }
        };
        
    } catch (error) {
        console.error('❌ [DOC-STATUS] Error fetching document status:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    generateApplicationForm,
    updateDocumentStatus,
    getDocumentStatus
};
