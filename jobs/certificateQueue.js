const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const convertDocxToPdf = require('../config/convertToPdf');
const eventModel = require('../mobile/models/eventModel');
const webEeventModel = require('../web/models/eventModel');
const userModel = require('../mobile/models/userModel');

class CertificateQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.currentJob = null;
    }

    // Add certificate generation job to queue (fire and forget)
    async addToQueue(event_id, email) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            event_id,
            email,
            status: 'queued',
            created_at: new Date().toISOString()
        };

        this.queue.push(job);
        console.log(`Certificate job ${jobId} added to queue for user ${email}. Queue length: ${this.queue.length}`);
        
        // Start processing if not already running
        if (!this.isProcessing) {
            this.processQueue();
        }

        return { 
            job_id: jobId, 
            status: 'queued',
            queue_position: this.queue.length,
            message: 'Your certificate is being generated in the background. You can check back later.'
        };
    }

    // Get current queue status
    getQueueStatus() {
        return {
            queue_length: this.queue.length,
            is_processing: this.isProcessing,
            current_job: this.currentJob ? {
                id: this.currentJob.id,
                email: this.currentJob.email,
                event_id: this.currentJob.event_id
            } : null
        };
    }

    // Process the queue one by one
    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        console.log('Starting certificate queue processing...');

        while (this.queue.length > 0) {
            const job = this.queue.shift(); // Get first job from queue
            this.currentJob = job;
            
            console.log(`Processing certificate job ${job.id} for ${job.email}. Remaining in queue: ${this.queue.length}`);

            try {
                // Update job status
                job.status = 'processing';
                job.started_at = new Date().toISOString();

                // Generate certificate using the working logic from getSampleCertificate
                const result = await this.generateCertificate(job);
                
                // Update job status
                job.status = 'completed';
                job.completed_at = new Date().toISOString();
                job.result = result;

                console.log(`Certificate job ${job.id} completed successfully. File: ${result.filename}`);
                
                // Optional: Add notification logic here
                // await this.notifyUserCertificateReady(job.email, result);

            } catch (error) {
                console.error(`Error processing job ${job.id}:`, error);
                
                // Update job status
                job.status = 'failed';
                job.error = error.message;
                job.failed_at = new Date().toISOString();

                // Optional: Add error notification logic here
                // await this.notifyUserCertificateError(job.email, error.message);
            }

            this.currentJob = null;
            
            // Small delay between jobs to prevent overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }

        this.isProcessing = false;
        console.log('Certificate queue processing completed');
    }

    // Generate certificate using exact logic from getSampleCertificate
    async generateCertificate(job) {
        const { event_id, email } = job;
        const verification_code = uuidv4();
        const user = await userModel.getUser(email);
        
        console.log('generateCertificate: Starting for event_id:', event_id, 'email:', email);
        
        const template = await eventModel.getCertificateTemplate(event_id);
        if (!template || !template[0]) throw new Error('No template found for this event');
        
        const templatePath = path.join(__dirname, '..', 'nuconnect-files', 'certificates', 'templates', template[0].template_path);
        console.log('generateCertificate: Template path:', templatePath);

        // Use exact logic from getSampleCertificate
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);

        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true
        });

        const fullName = `${user.f_name} ${user.l_name}`;
        console.log('generateCertificate: Full name:', fullName);

        const data = { name: fullName };
        doc.render(data);

        const buf = doc.getZip().generate({ type: 'nodebuffer' });

        // Generate filenames
        const safeFirstName = user.f_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const safeLastName = user.l_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const baseFilename = `Certificate_${safeFirstName}_${safeLastName}`;
        const docxPath = path.join("/tmp", `${baseFilename}_${verification_code}.docx`);
        const pdfFilename = `${baseFilename}_${verification_code}.pdf`;
        
        // Ensure generated directory exists
        const generatedDir = path.join(__dirname, '..', 'nuconnect-files', 'certificates', 'generated');
        if (!fs.existsSync(generatedDir)) {
            fs.mkdirSync(generatedDir, { recursive: true });
        }
        const pdfPath = path.join(generatedDir, pdfFilename);

        // Write DOCX file (same as getSampleCertificate)
        fs.writeFileSync(docxPath, buf);
        console.log('generateCertificate: DOCX written to:', docxPath);

        // Convert to PDF (same as getSampleCertificate)
        await convertDocxToPdf(docxPath, pdfPath, { name: fullName });
        console.log('generateCertificate: PDF conversion completed');

        // Check if PDF was created (same as getSampleCertificate)
        if (!fs.existsSync(pdfPath)) {
            throw new Error(`PDF file was not created: ${pdfPath}`);
        }

        // Clean up DOCX file (same as getSampleCertificate)
        try { 
            await fs.promises.unlink(docxPath); 
        } catch (unlinkError) { 
            console.warn('generateCertificate: Failed to clean up DOCX:', unlinkError.message); 
        }

        // Save to database
        const template_id = template[0].template_id;
        await eventModel.addGeneratedCertificate({
            event_id,
            template_id,
            pdfFilename,
            verification_code,
            user_id: user.user_id
        });

        console.log('generateCertificate: Certificate generation complete:', pdfPath);
        
        return { 
            message: 'Certificate generated successfully', 
            filename: pdfFilename,
            verification_code,
            path: pdfPath
        };
    }

    // Optional: Notification methods (implement as needed)
    async notifyUserCertificateReady(email, result) {
        // Implement your notification logic here
        // Examples:
        // - Send email notification
        // - Update notification table in database
        // - Send push notification
        console.log(`Certificate ready notification for ${email}: ${result.filename}`);
    }

    async notifyUserCertificateError(email, error) {
        // Implement your error notification logic here
        console.log(`Certificate error notification for ${email}: ${error}`);
    }
}

// Create singleton instance
const certificateQueue = new CertificateQueue();

module.exports = certificateQueue;