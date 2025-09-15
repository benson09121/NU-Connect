const eventModel = require('../models/eventModel');
const webEventModel = require('../../web/models/eventModel');
const userModel = require('../models/userModel');
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
        const events = await eventModel.getAllEvents(req.user.organizations);
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function registerEvent(req, res) {
    try {
        const event_id = parseInt(req.body.event_id, 10);
        const user = await userModel.getUser(req.user.email);
        const checkRegister = await eventModel.checkEventRegistration(event_id, user.user_id);
        if (checkRegister) {
            return res.status(400).json({ message: 'Already registered for this event' });
        }
        const newAttendee = await eventModel.registerEvent(event_id, user.user_id);
        if (!newAttendee) {
            return res.status(404).json({ message: 'Event not found' });
        }
        publishToChannel(`attendees_${event_id}`, {
            operation: 'CREATE',
            data: newAttendee
        });
        res.status(201).json(newAttendee);
    } catch (error) {
        res.status(500).json({ message: error.message });
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
        res.status(200).json({ message: 'Successfully unregistered from the event' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getSpecificEvent(req, res) {
    try {
        const { eventId } = req.query;
        const userEmail = req.user.email;
        const user = await userModel.getUser(userEmail);
        const event = await eventModel.getSpecificEvent(eventId, user.user_id);
        let attendees = await eventModel.getEventAttendees(eventId);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }


        const response = {
            event: event,
            attendees: attendees
        };
        res.json(response);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getTickets(req, res) {
    try {
        const user = await userModel.getUser(req.user.email);
        const getTicket = await eventModel.getTickets(user.user_id);
        res.json(getTicket);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }

}

async function getUpcomingEvents(req, res) {
    try {
        const upcomingEvents = await eventModel.getUpcomingEvents(req.user.organizations);
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

        const handler = new TemplateHandler(templateContent);
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
        res.json(certificates);
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
        console.log('scanTicket: Scanned ticket:', scannedTicket);
        res.status(200).json(scannedTicket);
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.error('scanTicket: Error:', error.message);
    }
}

async function getEventPublicationImage(req, res) {
  let { organization_id, organization_version_id, event_id, image } = req.query;
 console.log('getEventPublicationImage: Received parameters:', { organization_id, organization_version_id, event_id, image });
  try {
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Content-Type', getContentType(image));
    res.setHeader('Content-Disposition', `inline; filename="${image}"`);
    res.setHeader(
      'X-Accel-Redirect',
      `/protected-organization-requirements/${organization_id}/${organization_version_id}/events/${event_id}/publication_images/${image}`
    );
    res.end();
  } catch (error) {
    console.error('getEventPublicationImage error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while fetching the publication image.",
    });
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
    unregisterEvent
};
