const eventModel = require('../models/eventModel');
const { redisClient, redisSubscriber } = require('../../config/redis');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
// const { scanner, virusCheck } = require('../config/clamav');
const { Auth } = require("../models/userIdModel");
const TemplateHandler = require('easy-template-x').TemplateHandler;
const convertDocxToPdf = require('../../config/convertToPdf');
const { get } = require('http');

async function getEvents(req, res) {
    try {
        const events = await eventModel.getAllEvents();
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function createEvent(req, res) {
    try {
        const { user_id, title, description, venue, date, start_time, end_time, organization_id, status, type, is_open_to_all } = req.body;
        const orgId = parseInt(organization_id, 10);
        const newEvent = await eventModel.createEvent(user_id, title, description, venue, date, start_time, end_time, orgId, status, type, is_open_to_all);

        // No cache updates or notifications here since the event is pending approval
        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function registerEvent(req, res) {
    try {
        const event_id = parseInt(req.body.event_id, 10);
        const checkRegister = await eventModel.checkEventRegistration(event_id);
        if (checkRegister) {
            return res.status(400).json({ message: 'Already registered for this event' });
        }
        const newAttendee = await eventModel.registerEvent(event_id);
        if (!newAttendee) {
            return res.status(404).json({ message: 'Event not found' });
        }
        redisClient.publish(`events:attendees:${event_id}`, JSON.stringify({ type: 'Register', attendee: newAttendee }));

        // Refresh the cache
        await eventModel.refreshAttendeesCache(event_id);

        res.status(201).json(newAttendee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function archiveEvent(req, res) {
    try {
        const { event_id } = req.body;
        await eventModel.archiveEvent(event_id);

        redisClient.publish('events', JSON.stringify({ type: 'archive', event_id }));

        res.status(200).json({ message: 'Event Archived' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getSpecificEvent(req, res) {
    try {
        const eventId = parseInt(req.params.eventId, 10);
        const userId = req.params.userId;
        console.log(userId);
        const event = await eventModel.getSpecificEvent(eventId, userId);
        let attendees = await eventModel.getEventAttendees(eventId);
        if (attendees) {
            attendees = attendees[0][0];
        }
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

// // SSE endpoint for real-time updates
// function sseUpdates(req, res) {
//     const userId = req.userId; // Extract user_id from the authenticated request

//     res.setHeader('Content-Type', 'text/event-stream');
//     res.setHeader('Cache-Control', 'no-cache');
//     res.setHeader('Connection', 'keep-alive');

//     const onMessage = (channel, message) => {
//         if (channel === `events:user:${userId}`) {
//             res.write(`data: ${message}\n\n`);
//         }
//     };

//     redisSubscriber.on('message', onMessage);
//     redisSubscriber.subscribe(`events:user:${userId}`);

//     req.on('close', () => {
//         redisSubscriber.unsubscribe(`events:user:${userId}`);
//         redisSubscriber.removeListener('message', onMessage);
//         res.end();
//     });
// }

async function sseEventAttendees(req, res) {
    const eventId = parseInt(req.params.eventId, 10);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const onMessage = (channel, message) => {
        if (channel === `events:attendees:${eventId}`) {
            res.write(`data: ${message}\n\n`);
        }
    };

    redisSubscriber.on('message', onMessage);
    redisSubscriber.subscribe(`events:attendees:${eventId}`);

    req.on('close', () => {
        redisSubscriber.unsubscribe(`events:attendees:${eventId}`);
        redisSubscriber.removeListener('message', onMessage);
        res.end();
    });
}

async function getTickets(req, res) {
    try {
        const getTicket = await eventModel.getTickets();
        res.json(getTicket);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }

}

async function getUpcomingEvents(req, res) {
    try {
        const upcomingEvents = await eventModel.getUpcomingEvents();
        res.json(upcomingEvents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function addGeneratedCertificate(req) {
    try {
        const { event_id } = req.body;
        const verification_code = uuidv4();

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
            name: `${Auth.get_first_name} ${Auth.get_last_name}`,
        };

        // Generate filenames
        const safeFirstName = Auth.get_first_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const safeLastName = Auth.get_last_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
        console.log(response);

        await eventModel.submitEvaluation(response);

        // Call addGeneratedCertificate and handle its result
        const certificateResult = await addGeneratedCertificate({ body: { event_id } });
        console.log(certificateResult);

        res.status(201).json({ message: 'Evaluation submitted successfully', certificate: certificateResult });
    } catch (error) {
        console.error('submitEvaluation: Error:', error.message);
        res.status(500).json({ message: error.message });
    }
}

async function getAllEventCertificates(req, res) {
    try {
        const certificates = await eventModel.getAllEventCertificates();
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
        const { email, event_title } = req.body;
        console.log('scanTicket: email:', email, 'event_title:', event_title);

        const scannedTicket = await eventModel.scanTicket(email,event_title);
        if (!scannedTicket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        console.log('scanTicket: Scanned ticket:', scannedTicket);
        res.status(200).json(scannedTicket);
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.error('scanTicket: Error:', error.message);
    }
}
module.exports = {
    getEvents,
    createEvent,
    registerEvent,
    archiveEvent,
    getSpecificEvent,
    getTickets,
    sseEventAttendees,
    getUpcomingEvents,
    addGeneratedCertificate,
    getEvaluation,
    submitEvaluation,
    getEventCertificate,
    getAllEventCertificates,
    scanTicket  
};
