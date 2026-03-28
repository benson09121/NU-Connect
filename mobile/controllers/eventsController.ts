// @ts-nocheck
const eventModel = require('../models/eventModel.ts');
const webEventModel = require('../../web/models/eventModel');
const userModel = require('../models/userModel.ts');
const { redisClient, redisSubscriber } = require('../../config/redis');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
// const { scanner, virusCheck } = require('../config/clamav');
const { Auth } = require("../models/userIdModel");
const TemplateHandler = require('easy-template-x').TemplateHandler;
const convertDocxToPdf = require('../../config/convertToPdf');
const { get } = require('http');
const certificateQueue = require('../../jobs/certificateQueue');
const { subscribeToChannel, publishToChannel } = require('../../web/controllers/sseController');
const { broadcastToPage, broadcastToOrgDetail, broadcastToUser } = require('../../services/websocketService');

const MAX_PAYMENT_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PAYMENT_PROOF_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]);

function emitMobileEventUpdate(eventName, payload) {
    try {
        broadcastToPage('events', eventName, payload);
    } catch (e) {
        console.warn('[eventsController] websocket page emit failed:', e?.message || e);
    }
}

function emitMobileOrgDetailUpdate(orgId, eventName, payload) {
    if (!orgId) return;
    try {
        broadcastToOrgDetail(Number(orgId), eventName, payload);
    } catch (e) {
        console.warn('[eventsController] websocket org-detail emit failed:', e?.message || e);
    }
}

// robust extractor for mysql/mysql2 SP return shapes
function extractTransactionId(spResult) {
  const q = [spResult];
  while (q.length) {
    const cur = q.shift();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (const item of cur) q.push(item);
      continue;
    }
    if (typeof cur === 'object') {
      // final SELECT v_transaction_id AS transaction_id
      if ('transaction_id' in cur && cur.transaction_id != null) {
        return Number(cur.transaction_id);
      }
      // fallback for OkPacket (if ever used)
      if ('insertId' in cur && cur.insertId) {
        return Number(cur.insertId);
      }
    }
  }
  return null;
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

async function getEvents(req, res) {
    try {
        const user = await userModel.getPermissions(req.user.email);
        console.log(user.user_info.organizations);
        const events = await eventModel.getAllEvents(user.user_info.organizations);
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function registerEvent(req, res) {
    try {
        const event_id = parseInt(req.body.event_id, 10);
        if (!Number.isInteger(event_id) || event_id <= 0) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'event_id is required and must be a positive integer',
            });
        }

        const user = await userModel.getUser(req.user.email);
        let transaction_id = null;
        let status = 'Registered';

        const paymentMethod = typeof req.body.payment_method === 'string' ? req.body.payment_method.trim() : '';
        const paidAmount = Number(req.body.paid_amount);
        const hasPaymentData = Boolean(paymentMethod) || Number.isFinite(paidAmount);

        const rawFile = req.files?.payment_proof || req.files?.file;
        const uploadedFile = Array.isArray(rawFile) ? rawFile[0] : rawFile;

        const checkRegister = await eventModel.checkEventRegistration(event_id, user.user_id);
        if (checkRegister) {
            if (checkRegister.status === 'Pending' && checkRegister.transaction_id) {
                return res.status(409).json({
                    error: 'DUPLICATE_PENDING_SUBMISSION',
                    message: 'You already have a pending payment submission for this event',
                    transactionId: Number(checkRegister.transaction_id),
                    studentStatus: 'Pending',
                    paymentStatus: 'Pending',
                });
            }
            return res.status(400).json({
                error: 'ALREADY_REGISTERED',
                message: 'Already registered for this event',
            });
        }

        // Get event details including payment and term option information
        const eventDetails = await eventModel.getSpecificEvent(event_id, user.user_id);
        if (!eventDetails) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'Event not found',
            });
        }

        const eventFee = Number(eventDetails.fee ?? 0);
        const isPaidEvent = Number.isFinite(eventFee) && eventFee > 0;

        if (isPaidEvent && !hasPaymentData) {
            return res.status(400).json({
                error: 'PAYMENT_REQUIRED',
                message: 'This is a paid event. payment_method, paid_amount, and payment_proof are required.',
            });
        }

        if (!isPaidEvent && hasPaymentData) {
            return res.status(400).json({
                error: 'EVENT_NOT_PAYABLE',
                message: 'This event is free. Do not submit payment details.',
            });
        }

        // Check if user can register based on term payment requirements
        if (!eventDetails.can_join_if_unpaid && !eventDetails.is_paid_on_term) {
            return res.status(403).json({ 
                message: 'Term payment required to register for this event. Please pay your term fees first.',
                requiresTermPayment: true,
                organizationId: eventDetails.organization_id,
                organizationVersionId: eventDetails.organization_version_id
            });
        }

        // Check if this is a paid event with payment data
        if (isPaidEvent) {
            if (!uploadedFile) {
                return res.status(400).json({
                    error: 'VALIDATION_ERROR',
                    message: 'payment_proof file is required for paid events',
                });
            }

            if (!ALLOWED_PAYMENT_PROOF_MIME.has(String(uploadedFile.mimetype || '').toLowerCase())) {
                return res.status(400).json({
                    error: 'INVALID_FILE_TYPE',
                    message: 'payment_proof must be one of: image/jpeg, image/png, image/webp, application/pdf',
                });
            }

            if (Number(uploadedFile.size || 0) > MAX_PAYMENT_PROOF_BYTES) {
                return res.status(413).json({
                    error: 'FILE_TOO_LARGE',
                    message: 'payment_proof exceeds the 10MB limit',
                });
            }

            if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
                return res.status(400).json({
                    error: 'VALIDATION_ERROR',
                    message: 'paid_amount must be a positive number',
                });
            }

            if (!paymentMethod) {
                return res.status(400).json({
                    error: 'VALIDATION_ERROR',
                    message: 'payment_method is required for paid events',
                });
            }

            // Handle paid event with transaction
            let uploadedFileName = null;
            
            // Handle file upload if there's a payment proof file
            const uploadDir = `/app/organizations/${eventDetails.organization_id}/${eventDetails.organization_version_id}/events/${event_id}/transactions`;
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const ext = path.extname(String(uploadedFile.name || '')).toLowerCase() || '.bin';
            uploadedFileName = `payment-proof-${Date.now()}-${user.user_id}${ext}`;
            const uploadPath = path.join(uploadDir, uploadedFileName);
            await uploadedFile.mv(uploadPath);
            console.log('File uploaded to:', uploadPath);

            const payer = user.f_name + ' ' + user.l_name;
            
            // Create event transaction
            const transactionResult = await eventModel.createEventTransaction(
                user.email,
                payer,
                paidAmount,
                paymentMethod,
                uploadedFileName,
                event_id,
                eventDetails.organization_id,
                eventDetails.organization_version_id
            );
            
            // ✅ FIX: pull id from the SP result
            transaction_id = extractTransactionId(transactionResult);
            if (!transaction_id) {
                return res.status(500).json({ message: 'Failed to create transaction id' });
            }
            
            publishToChannel('transactions', { 
                type: 'created', 
                data: transactionResult 
            });

            publishToChannel(`transactions:organization:${eventDetails.organization_id}`, { 
                type: 'created', 
                data: transactionResult 
            });
            
            status = 'Pending';

            const newAttendee = await eventModel.registerEvent(event_id, user.user_id,status, transaction_id);
            if (!newAttendee) {
                return res.status(404).json({ message: 'Event not found' });
            }
            
            publishToChannel(`attendees_${event_id}`, {
                operation: 'CREATE',
                data: newAttendee
            });

            emitMobileEventUpdate('events:registration:changed', {
                operation: 'REGISTER',
                event_id,
                organization_id: eventDetails.organization_id,
                organization_version_id: eventDetails.organization_version_id,
                user_id: user.user_id,
                status,
                transaction_id,
            });
            emitMobileOrgDetailUpdate(eventDetails.organization_id, 'org-detail:events:changed', {
                operation: 'REGISTER',
                event_id,
                user_id: user.user_id,
                status,
            });

            broadcastToUser(user.email, 'events:payment-status:changed', {
                eventId: event_id,
                transactionId: transaction_id,
                studentStatus: 'Pending',
                paymentStatus: 'Pending',
                updatedAt: new Date().toISOString(),
            });

            res.status(201).json({
                message: 'Event payment transaction created successfully',
                transactionId: transaction_id,
                studentStatus: 'Pending',
                paymentStatus: 'Pending',
                attendee: newAttendee
            });
        } else {
            // Handle free event registration (existing logic)
            const newAttendee = await eventModel.registerEvent(event_id, user.user_id, status, transaction_id);
            if (!newAttendee) {
                return res.status(404).json({ message: 'Event not found' });
            }
            
            publishToChannel(`attendees_${event_id}`, {
                operation: 'CREATE',
                data: newAttendee
            });

            emitMobileEventUpdate('events:registration:changed', {
                operation: 'REGISTER',
                event_id,
                organization_id: eventDetails.organization_id,
                organization_version_id: eventDetails.organization_version_id,
                user_id: user.user_id,
                status,
                transaction_id: null,
            });
            emitMobileOrgDetailUpdate(eventDetails.organization_id, 'org-detail:events:changed', {
                operation: 'REGISTER',
                event_id,
                user_id: user.user_id,
                status,
            });
            
            res.status(201).json({
                message: 'Successfully registered for free event',
                transactionId: null,
                studentStatus: 'Registered',
                paymentStatus: null,
                attendee: newAttendee
            });
        }
    } catch (error) {
        console.error('Register event error:', error);
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: error.message,
        });
    }
}

async function unregisterEvent(req, res) {
    try {
        const event_id = parseInt(req.body.event_id, 10);
        const user = await userModel.getUser(req.user.email);
        const unregister = await eventModel.unregisterEvent(event_id, user.user_id);
        if (!unregister) {
            return res.status(404).json({ message: 'Event not found or not registered' });
        }
        publishToChannel(`attendees_${event_id}`, {
            operation: 'DELETE',
            data: unregister
        });

        emitMobileEventUpdate('events:registration:changed', {
            operation: 'UNREGISTER',
            event_id,
            user_id: user.user_id,
        });
        res.status(200).json({ message: 'Successfully unregistered from the event' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getSpecificEvent(req, res) {
    try {
        const rawEventId = req.query.eventId || req.params.id;
        const eventId = Number(rawEventId);
        if (!Number.isFinite(eventId) || eventId <= 0) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'eventId must be a positive integer',
                details: {
                    eventId: rawEventId ?? null,
                },
            });
        }

        const userEmail = req.user.email;
        const user = await userModel.getUser(userEmail);
        const event = await eventModel.getSpecificEvent(eventId, user.user_id);
        let attendees = await eventModel.getEventAttendees(eventId);
        if (!event) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'Event not found',
                details: {
                    eventId,
                },
            });
        }


        const response = {
            event: event,
            attendees: attendees
        };
        res.json(response);
    } catch (error) {
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: error?.message || 'Failed to fetch event details',
        });
    }
}

async function getTickets(req, res) {
    try {
        const user = await userModel.getUser(req.user.email);
        const rawEventId = req.query.eventId || req.params.eventId;
        const eventId = rawEventId != null ? Number(rawEventId) : null;

        if (rawEventId != null && (!Number.isInteger(eventId) || eventId <= 0)) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'eventId must be a positive integer',
            });
        }

        const getTicket = await eventModel.getTickets(user.user_id, eventId);
        res.json(getTicket);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }

}

async function getUpcomingEvents(req, res) {
    try {
        const perms = await userModel.getPermissions(req.user.email);
        const organizations = perms?.organizations || [];
        const upcomingEvents = await eventModel.getUpcomingEvents(organizations);
        res.json(upcomingEvents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function addGeneratedCertificate(req) {
    try {
        const { event_id, email } = req.body;
        const verification_code = uuidv4();
        const user = await userModel.getUser(email);
        console.log('addGeneratedCertificate: Fetching certificate template for event_id:', event_id);
        const template = await eventModel.getCertificateTemplate(event_id);
        if (!template || !template[0]) throw new Error('No template found for this event');
        const templatePath = `/app/certificates/templates/${template[0].template_path}`;
        console.log('addGeneratedCertificate: Template path:', templatePath);
        console.log('addGeneratedCertificate: Reading template file:', templatePath);
        const templateContent = await fs.promises.readFile(templatePath);
        if (!templateContent || templateContent.length === 0) {
            throw new Error('Template file is empty or corrupted');
        }

        const data = {
            name: `${user.f_name} ${user.l_name}`,
        };

        // Generate filenames
        const safeFirstName = user.f_name.replace(/[^a-z0-9]/g, '_').toLowerCase();
        const safeLastName = user.l_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const baseFilename = `Certificate_${safeFirstName}_${safeLastName}`;
        const docxPath = path.join("/app/certificates/templates", `${baseFilename}_${verification_code}.docx`);
        const pdfFilename = `${baseFilename}_${verification_code}.pdf`;
        const pdfPath = `/app/certificates/generated/${pdfFilename}`;
        console.log(pdfFilename);

        // Use default TemplateHandler (no explicit delimiter configuration)
        const handler = new TemplateHandler();
        const doc = await handler.process(templateContent, data);


        await fs.promises.writeFile(docxPath, doc);


        await convertDocxToPdf(docxPath, pdfPath);


        await fs.promises.unlink(docxPath);

        // Database insert
        const template_id = template[0].template_id;

        await eventModel.addGeneratedCertificate({
            event_id,
            template_id,
            pdfFilename,
            verification_code,
        });

        console.log('addGeneratedCertificate: Certificate generation complete:', pdfPath);
        return { message: 'Certificate generated successfully', path: pdfPath };
    } catch (error) {
        console.error('addGeneratedCertificate: Error:', error.message);
        throw error; // Throw the error to be handled by the caller
    }
}

async function getEvaluation(req, res) {
    try {
        const event_id = parseInt(req.params.eventId, 10);
        const evaluation = await eventModel.getEvaluation(event_id);
        if (!evaluation) {
            return res.status(404).json({ message: 'Evaluation not found' });
        }
        res.json(evaluation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function submitEvaluation(req, res) {
    try {
        const response = req.body;
        const event_id = req.body.event_id;
        const email = req.user.email;
        
        console.log('Submitting evaluation:', response);
        const user = await userModel.getUser(email);

        // Submit evaluation first - this must complete successfully
        await eventModel.submitEvaluation(response);

        const updatedMember = await eventModel.updateMemberEventStatus(user.user_id, event_id);
        publishToChannel(`attendees_${event_id}`, {
            operation: 'UPDATE',
            data: updatedMember
        });

        emitMobileEventUpdate('events:attendees:changed', {
            operation: 'UPDATE',
            event_id,
            user_id: user.user_id,
            source: 'evaluation-submit',
        });

        // Private ping for UI refresh after evaluation
        try {
            broadcastToUser(req.user.email, 'events:my-tickets:changed', {
                event_id,
                source: 'evaluation-submit',
            });
        } catch (e) {
            console.warn('[eventsController] websocket user emit failed:', e?.message || e);
        }

        // Add to certificate queue (fire and forget)
        const queueResult = await certificateQueue.addToQueue(event_id, email);
        
        console.log('Certificate generation queued:', queueResult);

        // Return immediate success response
        res.status(201).json({ 
            message: 'Evaluation submitted successfully! Your certificate is being generated in the background.',
            evaluation_submitted: true,
            certificate: {
                status: 'queued',
                job_id: queueResult.job_id,
                queue_position: queueResult.queue_position,
                message: queueResult.message
            }
        });
        
    } catch (error) {
        console.error('submitEvaluation: Error:', error.message);
        res.status(500).json({ message: error.message });
    }
}

async function getAllEventCertificates(req, res) {
    try {
        const user = await userModel.getUser(req.user.email);
        const certificates = await eventModel.getAllEventCertificates(user.user_id);
        if (!certificates || certificates.length === 0) {
            return res.status(404).json({ message: 'No certificates found for this event' });
        }

        const normalized = certificates.map((row) => ({
            certificate_id: row.certificate_id,
            certificate_type: 'event',
            event_title: row.tbl_event?.title || '',
            issued_at: row.issued_at || null,
            certificate_path: row.certificate_path || null,
            event_id: row.event_id,
            organization_id: row.tbl_event?.organization_id ?? null,
            organization_version_id: row.tbl_event?.organization_version_id ?? null,
            image: row.tbl_event?.image || null,
        }));

        res.json(normalized);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getEventCertificate(req, res) {
    const certificate_name  = req.query.certificate_name;
    try {
        res.setHeader('X-Accel-Redirect', `/protected-certificates/generated/${certificate_name}`);

        // Use the original filename if available, fallback to template_name
        res.setHeader('Content-Disposition', `attachment; filename="hulu"`);
        // Optionally, send a short message for debugging (remove in production)
        // res.end('File download triggered');
        res.end();
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the requirements.",
        });
    }
}

async function scanTicket(req, res) {
    try {
        const { email, event_id } = req.body;  // Changed from event_title to event_id
        const user = await userModel.getUser(req.user.email);
        console.log('scanTicket: email:', email, 'event_id:', event_id);

        const scannedTicket = await eventModel.scanTicket(email, event_id, user.user_id);
        if (!scannedTicket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        await webEventModel.getAttendeesByEventId(event_id);
        
        const attendees = await webEventModel.getOneEventAttendeesWithDetails(event_id, email);
        const ch = `attendees_${event_id}`;
    publishToChannel(ch, {
      channel: ch,
      operation: 'UPDATE',
      data: attendees
    });
                emitMobileEventUpdate('events:attendees:changed', {
                        operation: 'UPDATE',
                        event_id,
                        source: 'scan-ticket',
                        email,
                });
        console.log('scanTicket: Scanned ticket:', scannedTicket);
        res.status(200).json(scannedTicket);
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.error('scanTicket: Error:', error.message);
    }
}

async function getEventPublicationImage(req, res) {
  let { organization_id, organization_version_id, event_id, image, image_name } = req.query;

  // Support both 'image' and 'image_name' parameters for backward compatibility
  let finalImageName = image_name || image;
  
  // CRITICAL: Explicitly decode the image name if it's still URL-encoded
  // Sometimes Express doesn't decode query params depending on how the URL is constructed
  if (finalImageName && finalImageName.includes('%')) {
    finalImageName = decodeURIComponent(finalImageName);
    console.log('getEventPublicationImage: Decoded image name from URL encoding');
  }

  console.log('getEventPublicationImage: Received parameters:', {
    organization_id,
    organization_version_id,
    event_id,
    image: image || 'not provided',
    image_name: image_name || 'not provided',
    finalImageName,
    finalImageNameType: typeof finalImageName,
    finalImageNameHasSpace: finalImageName?.includes(' '),
    finalImageNameHasPercent: finalImageName?.includes('%')
  });

  if (!event_id || !finalImageName) {
    return res.status(400).json({
      error: "Missing required parameters: event_id and image (or image_name)"
    });
  }

  // NOTE: Express already URL-decodes query parameters automatically
  // So finalImageName = "Organizational_Logo (6).png" (with space, not %20)
  // We should NOT encode it again for the physical path
  
  // Keep IDs as-is (already decoded by Express)
  // Only encode when building X-Accel-Redirect path for nginx
  
  // Determine if it's an SDAO event
  const isSDAO = !organization_id || organization_id === 'null' || organization_id === '' || organization_id === 'undefined';

  // Only encode for nginx X-Accel-Redirect path, NOT for physical filesystem path
  const image_name_encoded = encodeURIComponent(finalImageName);

  let xAccelPath;
  let physicalPath;

  if (isSDAO) {
    // SDAO event: serve from /app/events/SDAO/{event_id}/publication_images/{image_name}
    xAccelPath = `/protected-events/SDAO/${event_id}/publication_images/${image_name_encoded}`;
    physicalPath = path.join('/app/events/SDAO', String(event_id), 'publication_images', finalImageName);
  } else {
    // Organization event: use the complex path
    if (!organization_version_id) {
      return res.status(400).json({
        error: "Missing required parameter: organization_version_id for organization event"
      });
    }
    physicalPath = path.join(
      '/app/organizations',
      String(organization_id),
      String(organization_version_id),
      'events',
      String(event_id),
      'publication_images',
      finalImageName
    );
    xAccelPath = `/protected-organization-requirements/${organization_id}/${organization_version_id}/events/${event_id}/publication_images/${image_name_encoded}`;
  }

  // Log for debugging
  console.log(`getEventPublicationImage: Attempting to serve image`, {
    event_id,
    finalImageName,
    organization_id,
    isSDAO,
    xAccelPath,
    physicalPath,
    exists: physicalPath ? fs.existsSync(physicalPath) : false
  });

  // Check if file exists before trying to serve it
  if (!fs.existsSync(physicalPath)) {
    console.error(`getEventPublicationImage: File not found at ${physicalPath}`);
    
    // Try to list what files actually exist in the directory
    const dirPath = path.dirname(physicalPath);
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        console.error(`getEventPublicationImage: Files in directory ${dirPath}:`, files);
      } else {
        console.error(`getEventPublicationImage: Directory does not exist: ${dirPath}`);
      }
    } catch (err) {
      console.error(`getEventPublicationImage: Error reading directory: ${err.message}`);
    }
    
    return res.status(404).json({
      error: "Image not found",
      message: "The requested image file does not exist.",
      debug: {
        requestedFile: finalImageName,
        physicalPath: physicalPath,
        directory: dirPath
      }
    });
  }

  try {
    // Get file stats for ETag and Last-Modified headers
    const stats = fs.statSync(physicalPath);
    const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
    const lastModified = stats.mtime.toUTCString();
    
    // Check If-None-Match (ETag) header
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag === etag) {
      console.log('getEventPublicationImage: Client has current version (ETag match), returning 304');
      return res.status(304).end();
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Content-Type', getContentType(finalImageName));
    res.setHeader('Content-Disposition', `inline; filename="${finalImageName}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate'); // Cache but validate
    res.setHeader('ETag', etag); // Add ETag for cache validation
    res.setHeader('Last-Modified', lastModified); // Add Last-Modified header
    res.setHeader('X-Accel-Redirect', xAccelPath);
    res.end();
  } catch (error) {
    console.error('getEventPublicationImage error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while fetching the publication image.",
    });
  }
}

async function getQRPermission(req, res) {
    try {
        const user = await userModel.getPermissions(req.user.email);
        const userInfo = user?.user_info;
        
        if (!userInfo) {
            return res.status(404).json({ message: 'User not found' });
        }

        const permissions = userInfo.permissions || [];
        const organizations = userInfo.organizations || [];
        
        // Get user's organization IDs
        const userOrgIds = organizations.map(org => org.organization_id);
        
        // Check for SCAN_QR permission
        const hasScanQRPermission = permissions.some(permission => {
            // Handle simple string permissions (global permissions)
            if (typeof permission === 'string' && permission === 'SCAN_QR') {
                return true;
            }
            
            // Handle JSON string permissions (organization-scoped permissions)
            if (typeof permission === 'string' && permission.startsWith('{')) {
                try {
                    const parsedPerm = JSON.parse(permission);
                    
                    // Check if this is a SCAN_QR permission
                    if (parsedPerm.permission === 'SCAN_QR') {
                        // Parse the organization_ids array
                        const allowedOrgIds = JSON.parse(parsedPerm.organization_ids);
                        
                        // Check if user belongs to any of the allowed organizations
                        const hasMatchingOrg = allowedOrgIds.some(orgId => 
                            userOrgIds.includes(orgId)
                        );
                        
                        return hasMatchingOrg;
                    }
                } catch (parseError) {
                    console.error('Error parsing permission:', parseError);
                    return false;
                }
            }
            
            return false;
        });

        if (hasScanQRPermission) {
            res.status(200).json({ 
                permission: 'allowed',
                message: 'User has SCAN_QR permission for their organizations'
            });
        } else {
            res.status(403).json({ 
                permission: 'denied',
                message: 'User does not have SCAN_QR permission for any of their organizations'
            });
        }
        
    } catch (error) {
        console.error('getQRPermission error:', error);
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getEvents,
    registerEvent,
    getSpecificEvent,
    getTickets,
    getUpcomingEvents,
    addGeneratedCertificate,
    getEvaluation,
    submitEvaluation,
    getEventCertificate,
    getAllEventCertificates,
    scanTicket,
    getEventPublicationImage,
    unregisterEvent,
    getQRPermission
};
