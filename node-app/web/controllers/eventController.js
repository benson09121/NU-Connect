const eventModel = require('../models/eventModel');
const fs = require('fs');
const path = require('path');
const TemplateHandler = require('easy-template-x').TemplateHandler;
const convertDocxToPdf = require('../../config/convertToPdf');
const { subscribeToChannel, publishToChannel } = require('./sseController');
const { get } = require('http');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

function parseCollaboratorsField(event) {
  if (event && typeof event.collaborators === 'string') {
    try {
      event.collaborators = JSON.parse(event.collaborators) || [];
    } catch {
      event.collaborators = [];
    }
  }
  if (!Array.isArray(event.collaborators)) event.collaborators = [];
  return event;
}

async function addEvent(req, res) {
  try {
    const event = req.body;
    const result = await eventModel.addEvent(event);

    // Fetch all events and broadcast SNAPSHOT
    const allEvents = await eventModel.getEvents();
    publishToChannel('events', {
      channel: 'events',
      operation: 'SNAPSHOT',
      data: Array.isArray(allEvents) ? allEvents : []
    });

    res.status(201).json({ message: 'Event created successfully', event_id: result.insertId });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while creating the event.",
    });
  }
}

async function getEventRequirements(req, res) {
  try {
    const requirements = await eventModel.getEventRequirements();
    res.status(200).json(requirements);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching event requirements.",
    });
  }
}

async function saveEventRequirements(req, res) {
  try {
    let { user_id, user_email, requirements } = req.body;

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }

    if (!user_id || !Array.isArray(requirements)) {
      return res.status(400).json({ message: "user_id (or user_email) and requirements array are required." });
    }

    await eventModel.saveEventRequirements(user_id, requirements);
    res.status(200).json({ message: "Event requirements saved successfully." });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while saving event requirements.",
    });
  }
}

async function getEvents(req, res) {
  const { sessionId } = req.query;
  try {
    let events = await eventModel.getEvents();
    events = events.map(parseCollaboratorsField);

    if (sessionId) {
      subscribeToChannel(sessionId, "events");
      publishToChannel('events', {
        channel: 'events',
        operation: 'SNAPSHOT',
        data: Array.isArray(events) ? events : []
      });
    }

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching events.",
    });
  }
}

async function getaddEventStatus(req, res){
  const { orgName, sessionId } = req.query;
  try {
    const status = await eventModel.getaddEventStatus(orgName);

    if (sessionId) {
      const ch = `addEvent_${orgName}`;
      subscribeToChannel(sessionId, ch);
      publishToChannel(ch, {
        channel: ch,
        operation: 'SNAPSHOT',
        data: status ? [status] : []
      });
    }

    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching add event status.",
    });
  }
}

async function getEventById(req, res) {
  try {
    const event_id = req.params.id || req.query.event_id;
    const { sessionId } = req.query;

    let eventResult = await eventModel.getEventById(event_id);
    let event = Array.isArray(eventResult) ? eventResult[0] : eventResult;

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    event = parseCollaboratorsField(event);

    // Fetch attendees with details
    let attendees = [];
    try {
      attendees = await eventModel.getAttendeesByEventId(event_id);
    } catch (attErr) {
      console.warn('[getEventById] Failed to fetch attendees:', attErr.message);
    }
    event.attendees = attendees;

    // Fetch event statistics
    try {
      const stats = await eventModel.getEventStats(event_id);
      event.stats = stats || {};
    } catch (statsErr) {
      console.warn('[getEventById] Failed to fetch event stats:', statsErr.message);
      event.stats = {};
    }

    if (sessionId) {
      const ch = `event_${event_id}`;
      subscribeToChannel(sessionId, ch);
      publishToChannel(ch, {
        channel: ch,
        operation: 'SNAPSHOT',
        data: [event]
      });
    }

    res.status(200).json(event);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching the event.",
    });
  }
}

async function getAttendeesbyEventId(req, res) {
  try {
    const { event_id, sessionId } = req.query;

    const attendees = await eventModel.getAttendeesByEventId(event_id);

    if (sessionId) {
      const ch = `attendees_${event_id}`;
      subscribeToChannel(sessionId, ch);
      publishToChannel(ch, {
        channel: ch,
        operation: 'SNAPSHOT',
        data: Array.isArray(attendees) ? attendees : []
      });
    }

    res.status(200).json(attendees);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching attendees for the event.",
    });
  }
}

async function getEventsByStatus(req, res) {
  try {
    const status = req.params.status;
    let events = await eventModel.getEventsByStatus(status);
    events = events.map(parseCollaboratorsField);
    if (events.length === 0) {
      return res.status(404).json({ message: 'No events found with the specified status' });
    }
    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching events by status.",
    });
  }
}

async function updateEvent(req, res) {
  try {
    const event_id = req.params.id;
    const event = req.body;
    const result = await eventModel.updateEvent(event_id, event);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const allEvents = await eventModel.getEvents();
    publishToChannel('events', {
      channel: 'events',
      operation: 'SNAPSHOT',
      data: Array.isArray(allEvents) ? allEvents : []
    });

    const updatedEvent = await eventModel.getEventById(event_id);
    const ch = `event_${event_id}`;
    publishToChannel(ch, {
      channel: ch,
      operation: 'SNAPSHOT',
      data: [updatedEvent]
    });

    res.status(200).json({ message: 'Event updated successfully' });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while updating the event.",
    });
  }
}

async function deleteEvent(req, res) {
  try {
    const event_id = req.params.id;
    const result = await eventModel.deleteEvent(event_id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const allEvents = await eventModel.getEvents();
    publishToChannel('events', {
      channel: 'events',
      operation: 'SNAPSHOT',
      data: Array.isArray(allEvents) ? allEvents : []
    });

    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while deleting the event.",
    });
  }
}

async function approvePaidEventRegistration(req, res) {
  try {
    const { event_id, user_id, approver_email } = req.params;
    const { remarks } = req.body;

    if (!approver_email) {
      return res.status(400).json({ message: "Approver email is required." });
    }

    const approver = await eventModel.getUserByEmail(approver_email);
    if (!approver) {
      return res.status(404).json({ message: "Approver not found." });
    }

    const result = await eventModel.approvePaidEventRegistration(
      event_id,
      user_id,
      approver.user_id,
      remarks
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Registration not found or already approved' });
    }

    const attendees = await eventModel.getAttendeesByEventId(event_id);
    const ch = `attendees_${event_id}`;
    publishToChannel(ch, {
      channel: ch,
      operation: 'SNAPSHOT',
      data: Array.isArray(attendees) ? attendees : []
    });

    res.status(200).json({ message: 'Registration approved successfully' });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while approving the registration.",
    });
  }
}

async function rejectPaidEventRegistration(req, res) {
  try {
    const { event_id, user_id, approver_email } = req.params;
    const { remarks } = req.body;

    if (!approver_email) {
      return res.status(400).json({ message: "Approver email is required." });
    }
    if (!remarks) {
      return res.status(400).json({ message: "Remarks are required." });
    }

    const approver = await eventModel.getUserByEmail(approver_email);
    if (!approver) {
      return res.status(404).json({ message: "Approver not found." });
    }

    const result = await eventModel.rejectPaidEventRegistration(
      event_id,
      user_id,
      approver.user_id,
      remarks
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Registration not found or already rejected' });
    }

    const attendees = await eventModel.getAttendeesByEventId(event_id);
    const ch = `attendees_${event_id}`;
    publishToChannel(ch, {
      channel: ch,
      operation: 'SNAPSHOT',
      data: Array.isArray(attendees) ? attendees : []
    });

    res.status(200).json({ message: 'Registration rejected successfully' });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while rejecting the registration.",
    });
  }
}

async function getEventStats(req, res) {
  try {
    const event_id = req.params.id;
    const stats = await eventModel.getEventStats(event_id);
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getAllEvaluationQuestions(req, res) {
  try {
    const questions = await eventModel.getAllEvaluationQuestions();
    if (!questions || questions.length === 0) {
      return res.status(404).json({ message: 'No evaluation questions found' });
    }
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching evaluation questions.",
    });
  }
}

async function getEventEvaluationResponsesByGroup(req, res) {
  try {
    const { event_id, sessionId } = req.query;
    const responses = await eventModel.getEventEvaluationResponsesByGroup(event_id);

    if (sessionId) {
      const ch = `evaluation_${event_id}`;
      subscribeToChannel(sessionId, ch);
      publishToChannel(ch, {
        channel: ch,
        operation: 'SNAPSHOT',
        data: Array.isArray(responses) ? responses : []
      });
    }

    res.status(200).json(responses);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching grouped evaluation responses.",
    });
  }
}

async function getEventApplicationDetails(req, res) {
  try {
    const proposed_event_id = req.params.id;
    const event_application_id = await eventModel.getEventApplicationIdByProposedEventId(proposed_event_id);
    if (!event_application_id) {
      return res.status(404).json({ message: 'No event application found for this proposed event.' });
    }
    const details = await eventModel.getEventApplicationDetails(event_application_id);
    if (!details.application) {
      return res.status(404).json({ message: 'Event application not found' });
    }
    res.status(200).json(details);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching event application details.",
    });
  }
}

async function createEventApplication(req, res) {
  try {
    const event = JSON.parse(req.body.event);
    const requirements = JSON.parse(req.body.requirements);
    const publicationImage = req.files?.publicationImage;
    let collaborators = [];

    // Accept collaborators from body if provided
    if (req.body.collaborators) {
      try {
        collaborators = typeof req.body.collaborators === 'string'
          ? JSON.parse(req.body.collaborators)
          : req.body.collaborators;
      } catch {
        collaborators = [];
      }
    }

    let applicant_user_id = req.user?.user_id;

    if (!applicant_user_id || applicant_user_id.startsWith('_') || applicant_user_id.length > 32) {
      let email = req.body.user_email || req.user?.email;
      if (!email) {
        return res.status(400).json({ message: "user_email is required to resolve user_id." });
      }
      const user = await eventModel.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      applicant_user_id = user.user_id;
    }
    let organization_id = event.organization_id;
    let cycle_number = event.cycle_number;
    if ((!organization_id || !cycle_number) && applicant_user_id) {
      const orgMember = await eventModel.getOrganizationMembership(applicant_user_id);
      if (orgMember) {
        organization_id = orgMember.organization_id;
        cycle_number = orgMember.cycle_number;
      }
    }

    const requirementFiles = {};
    requirements.forEach(reqItem => {
      const fileKey = `requirement_${reqItem.requirement_id}`;
      if (req.files && req.files[fileKey]) {
        requirementFiles[reqItem.requirement_id] = req.files[fileKey];
      }
    });

    const requirementFilePaths = requirements.map(reqItem => {
      const file = requirementFiles[reqItem.requirement_id];
      if (file) {
        const filename = `requirement-${Date.now()}-${file.name}`;
        return {
          requirement_id: reqItem.requirement_id,
          file_path: filename
        };
      } else {
        return {
          requirement_id: reqItem.requirement_id,
          file_path: reqItem.file_path || null
        };
      }
    });

    if (publicationImage) {
      const publicationImageFilename = publicationImage.name || 'publication_image.png';
      event.image = publicationImageFilename;
    }

    const dbResult = await eventModel.createEventApplication(
      organization_id,
      cycle_number,
      applicant_user_id,
      event,
      requirementFilePaths,
      collaborators // <-- pass collaborators
    );

    const orgDir = path.join('/app/organizations', String(dbResult[0].organization_name), String(dbResult[0].cycle_number), 'events', String(dbResult[0].event_id));
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    const requirementsDir = path.join(orgDir, 'requirements');
    if (!fs.existsSync(requirementsDir)) {
      fs.mkdirSync(requirementsDir, { recursive: true });
    }

    if (publicationImage) {
      const publicationImageDir = path.join(orgDir, 'publication_images');
      if (!fs.existsSync(publicationImageDir)) {
        fs.mkdirSync(publicationImageDir, { recursive: true });
      }
      const publicationImageFilename = publicationImage.name || 'publication_image.png';
      fs.writeFileSync(
        path.join(publicationImageDir, publicationImageFilename),
        publicationImage.data
      );
    }

    requirements.forEach(reqItem => {
      const file = requirementFiles[reqItem.requirement_id];
      if (file) {
        const filename = requirementFilePaths.find(r => r.requirement_id === reqItem.requirement_id)?.file_path;
        fs.writeFileSync(
          path.join(requirementsDir, filename),
          file.data
        );
      }
    });

    const allEvents = await eventModel.getEvents();
    publishToChannel('events', {
      channel: 'events',
      operation: 'SNAPSHOT',
      data: Array.isArray(allEvents) ? allEvents : []
    });

    res.status(201).json({
      message: 'Event application submitted successfully',
      data: dbResult[0]
    });
  } catch (error) {
    console.error("CreateEventApplication error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function getEventApplicationRequirement(req, res) {
  const requirement_name = req.query.requirement_name;
  let org_name = req.query.organization_name;
  let event_id = req.query.event_id;
  let cycle_number = req.query.cycle_number;
  org_name = encodeURIComponent(org_name);
  event_id = encodeURIComponent(event_id);
  cycle_number = encodeURIComponent(cycle_number);

  try {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader(
      'X-Accel-Redirect',
      `/protected-organization-requirements/${org_name}/${cycle_number}/events/${event_id}/requirements/${requirement_name}`
    );
    const match = requirement_name.match(/requirement-(\d+)-(.+)/);
    const downloadName = match ? match[0] : requirement_name;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.end();
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching the event requirement.",
    });
  }
}

async function getEventApplicationPublicationImage(req, res) {
  let { organization_name, cycle_number, event_id, image_name } = req.query;

  if (!organization_name || !cycle_number || !event_id || !image_name) {
    return res.status(400).json({
      error: "Missing required parameters: organization_name, cycle_number, event_id, image_name"
    });
  }

  // Encode for URL and filesystem safety
  const organization_name_encoded = encodeURIComponent(organization_name);
  const image_name_encoded = encodeURIComponent(image_name);

  // Physical path for existence check (optional, but good for error handling)
  const physicalPath = path.join(
    '/app/organizations',
    organization_name,
    String(cycle_number),
    'events',
    String(event_id),
    'publication_images',
    image_name
  );

  // Log for debugging
  console.log(`getEventApplicationPublicationImage: Attempting to serve image`, {
    organization_name,
    cycle_number,
    event_id,
    image_name,
    physicalPath,
    exists: fs.existsSync(physicalPath)
  });

  if (!fs.existsSync(physicalPath)) {
    return res.status(404).json({
      error: "Image not found",
      message: "The requested publication image does not exist."
    });
  }

  try {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Content-Type', getContentType(image_name));
    res.setHeader('Content-Disposition', `inline; filename="${image_name}"`);
    res.setHeader(
      'X-Accel-Redirect',
      `/protected-organization-requirements/${organization_name_encoded}/${cycle_number}/events/${event_id}/publication_images/${image_name_encoded}`
    );
    res.end();
  } catch (error) {
    console.error('getEventApplicationPublicationImage error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while fetching the publication image.",
    });
  }
}

async function approveEventApplication(req, res) {
  try {
    const { approval_id, event_application_id } = req.params;
    const { comment, user_email, user_id } = req.body;

    let approver_id = user_id;
    if (!approver_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "Approver not found for the provided email." });
      }
      approver_id = user.user_id;
    }
    const result = await eventModel.approveEventApplication(
      approval_id,
      comment || null,
      event_application_id,
      approver_id
    );

    const timeline = await eventModel.getEventApprovalTimeline(event_application_id);
    const ch = `event_approval_timeline_${event_application_id}`;
    publishToChannel(ch, {
      channel: ch,
      operation: 'SNAPSHOT',
      data: Array.isArray(timeline) ? timeline : []
    });

    res.status(200).json({ message: "Event application approved successfully.", data: result });
  } catch (error) {
    console.error("approveEventApplication error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function rejectEventApplication(req, res) {
  try {
    const { approval_id, event_application_id } = req.params;
    const { comment, user_email, user_id } = req.body;

    let approver_id = user_id;
    if (!approver_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "Approver not found for the provided email." });
      }
      approver_id = user.user_id;
    }
    if (!approver_id) {
      return res.status(400).json({ message: "Approver user_id or user_email is required." });
    }

    const result = await eventModel.rejectEventApplication(
      approval_id,
      event_application_id,
      comment || null,
      approver_id
    );

    const timeline = await eventModel.getEventApprovalTimeline(event_application_id);
    const ch = `event_approval_timeline_${event_application_id}`;
    publishToChannel(ch, {
      channel: ch,
      operation: 'SNAPSHOT',
      data: Array.isArray(timeline) ? timeline : []
    });

    res.status(200).json({ message: "Event application rejected successfully." });
  } catch (error) {
    console.error("rejectEventApplication error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function getEventEvaluationConfig(req, res) {
  try {
    const event_id = req.params.id;
    const config = await eventModel.getEventEvaluationConfig(event_id);
    if (!config.settings) {
      return res.status(404).json({ message: 'No evaluation config found for this event.' });
    }
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching event evaluation config.",
    });
  }
}

async function updateEventEvaluationConfig(req, res) {
  try {
    const event_id = req.params.id;
    let { group_ids, evaluation_end_date, evaluation_end_time, user_id, user_email } = req.body;

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }

    if (!user_id || !Array.isArray(group_ids)) {
      return res.status(400).json({ message: "user_id (or user_email) and group_ids array are required." });
    }

    await eventModel.updateEventEvaluationConfig(
      event_id,
      group_ids,
      evaluation_end_date || null,
      evaluation_end_time || null,
      user_id
    );
    res.status(200).json({ message: "Event evaluation config updated successfully." });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while updating event evaluation config.",
    });
  }
}

async function uploadOrUpdatePostEventRequirement(req, res) {
  try {
    const event_id = parseInt(req.body.event_id);
    const requirement_id = parseInt(req.body.requirement_id);
    const cycle_number = parseInt(req.body.cycle_number);
    const organization_id = parseInt(req.body.organization_id);
    const submitted_by_email = req.body.submitted_by_email;

    const event_application_id = req.body.event_application_id === "" ?
      null : parseInt(req.body.event_application_id);

    let submitted_by = req.body.submitted_by;
    if (!submitted_by && submitted_by_email) {
      const user = await eventModel.getUserByEmail(submitted_by_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      submitted_by = user.user_id;
    }

    const file_path = req.body.file_path;

    if (!event_id || !requirement_id || !cycle_number || !organization_id || !file_path || !submitted_by_email) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    let savedFilePath = file_path;
    if (req.file) {
      const requirementsDir = path.join(
        '/app/organizations',
        String(organization_id),
        'events',
        String(event_id),
        'requirements'
      );

      if (!fs.existsSync(requirementsDir)) {
        fs.mkdirSync(requirementsDir, { recursive: true });
      }

      const filename = `requirement-${Date.now()}-${req.file.originalname}`;
      savedFilePath = filename;

      fs.writeFileSync(
        path.join(requirementsDir, filename),
        req.file.buffer || req.file.data
      );
    }

    await eventModel.uploadOrUpdatePostEventRequirement({
      event_id,
      event_application_id,
      requirement_id,
      cycle_number,
      organization_id,
      file_path: savedFilePath,
      submitted_by
    });

    res.status(200).json({
      message: "Post-event requirement uploaded/updated successfully.",
      file_path: savedFilePath
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while uploading/updating the post-event requirement.",
    });
  }
}

async function createEvent(req, res) {
  try {
    const event = req.body;
    let imageFile = req.files?.image || null;
    let imageFilename = null;
    let tempImagePath = null;

    // Handle user_id - convert email to user_id if needed
    let user_id = event.user_id;
    if (user_id && user_id.includes('@')) {
      const user = await eventModel.getUserByEmail(user_id);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    } else if (!user_id && event.user_email) {
      const user = await eventModel.getUserByEmail(event.user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }
    
    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }
    
    event.user_id = user_id;

    // Handle null/empty values
    event.venue = event.venue || null;
    event.capacity = event.capacity === "" ? null : event.capacity;
    event.fee = event.fee === "" ? null : event.fee;

    // Parse collaborators if sent as JSON string
    if (typeof event.collaborators === 'string') {
      try {
        event.collaborators = JSON.parse(event.collaborators);
      } catch (e) {
        console.log('Failed to parse collaborators:', e);
        event.collaborators = [];
      }
    }
    
    // Ensure collaborators is an array or null
    if (!Array.isArray(event.collaborators) || event.collaborators.length === 0) {
      event.collaborators = null;
    }

    // Handle image upload
    if (imageFile) {
      const fileExt = path.extname(imageFile.name);
      const baseName = path.basename(imageFile.name, fileExt)
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .substring(0, 50);
      imageFilename = `event-${Date.now()}-${baseName}${fileExt}`;
      
      if (event.organization_id) {
        const orgDir = path.join('/app/events', String(event.organization_id));
        if (!fs.existsSync(orgDir)) {
          fs.mkdirSync(orgDir, { recursive: true });
        }
        const imagePath = path.join(orgDir, imageFilename);
        fs.writeFileSync(imagePath, imageFile.data);
        event.image = imageFilename;
        console.log(`[createEvent] Saved organization event image: ${imagePath}`);
      } else {
        const tempDir = path.join('/app/events/SDAO/tmp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        tempImagePath = path.join(tempDir, imageFilename);
        fs.writeFileSync(tempImagePath, imageFile.data);
        event.image = imageFilename;
        console.log(`[createEvent] Saved SDAO event image to temp: ${tempImagePath}`);
      }
    }

    // Create event in database
    console.log(`[createEvent] Creating event in database...`);
    const dbResponse = await eventModel.createEvent(event);
    console.log(`[createEvent] Database response:`, JSON.stringify(dbResponse, null, 2));

    // WORKAROUND: Fetch the created event by title and user_id
    let createdEvent = null;
    let eventId = null;

    try {
      // Get the most recently created event for this user with this title
      const recentEvents = await eventModel.getEventsByUserAndTitle(event.user_id, event.title);
      if (recentEvents && recentEvents.length > 0) {
        // Sort by created_at descending and get the most recent
        createdEvent = recentEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        eventId = createdEvent.event_id || createdEvent.id;
        console.log(`[createEvent] Found created event with ID: ${eventId}`);
      }
    } catch (fetchError) {
      console.error(`[createEvent] Error fetching created event:`, fetchError);
    }

    // Alternative: Query all events and find the most recent one
    if (!eventId) {
      try {
        const allEvents = await eventModel.getEvents();
        if (allEvents && allEvents.length > 0) {
          // Find the most recent event (assuming it's the one we just created)
          const sortedEvents = allEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const mostRecent = sortedEvents[0];
          
          // Verify it matches our event data
          if (mostRecent.title === event.title && mostRecent.user_id === event.user_id) {
            createdEvent = mostRecent;
            eventId = mostRecent.event_id || mostRecent.id;
            console.log(`[createEvent] Found event by matching recent events: ${eventId}`);
          }
        }
      } catch (fetchError) {
        console.error(`[createEvent] Error fetching all events:`, fetchError);
      }
    }

    // Move SDAO image from temp to final location
    if (!event.organization_id && imageFile && eventId) {
      const destDir = path.join('/app/events/SDAO', String(eventId), 'publication_images');
      
      console.log(`[createEvent] Creating destination directory: ${destDir}`);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        console.log(`[createEvent] Directory created successfully`);
      }
      
      const finalPath = path.join(destDir, imageFilename);
      console.log(`[createEvent] Moving file from ${tempImagePath} to ${finalPath}`);
      
      if (fs.existsSync(tempImagePath)) {
        try {
          fs.copyFileSync(tempImagePath, finalPath);
          console.log(`[createEvent] File copied successfully`);
          fs.unlinkSync(tempImagePath);
          console.log(`[createEvent] Temp file deleted successfully`);
          console.log(`[createEvent] Image successfully moved to: ${finalPath}`);
        } catch (moveError) {
          console.error(`[createEvent] Error moving file:`, moveError);
        }
      } else {
        console.error(`[createEvent] Temp file not found: ${tempImagePath}`);
      }
    } else {
      if (!event.organization_id && imageFile && !eventId) {
        console.error(`[createEvent] Cannot move SDAO image - no event_id available`);
      }
    }

    // Fetch all events and publish to SSE channel
    try {
      const allEvents = await eventModel.getEvents();
      publishToChannel('events', {
        channel: 'events',
        operation: 'SNAPSHOT',
        data: Array.isArray(allEvents) ? allEvents : []
      });
      console.log(`[createEvent] Published events snapshot to SSE channel`);
    } catch (sseError) {
      console.error(`[createEvent] Failed to publish SSE update:`, sseError);
    }

    // Send success response
    res.status(201).json({ 
      success: true,
      message: 'Event created successfully', 
      event: createdEvent || dbResponse,
      data: createdEvent || dbResponse,
      event_id: eventId
    });
    
  } catch (error) {
    console.error("[createEvent] Error creating event:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred while creating the event.",
      message: error.message || "Failed to create event. Please try again."
    });
  }
}

async function getEventApprovalTimeline(req, res) {
  try {
    const event_id = req.query.event_id;
    const sessionId = req.query.sessionId;

    const result = await eventModel.getEventApprovalTimeline(event_id);

    if (sessionId) {
      const ch = `event_approval_timeline_${event_id}`;
      subscribeToChannel(sessionId, ch);
      publishToChannel(ch, {
        channel: ch,
        operation: 'SNAPSHOT',
        data: Array.isArray(result) ? result : []
      });
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching the event approval timeline.",
    });
  }
}

async function getEventEvaluationFeedbackPeriod(req, res) {
  try {
    const event_id = req.query.event_id;
    const sessionId = req.query.sessionId;

    const result = await eventModel.getEventEvaluationFeedbackPeriod(event_id);

    if (sessionId) {
      const ch = `event_evaluation_feedback_period_${event_id}`;
      subscribeToChannel(sessionId, ch);
      publishToChannel(ch, {
        channel: ch,
        operation: 'SNAPSHOT',
        data: Array.isArray(result) ? result : [result].filter(Boolean)
      });
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching the event evaluation feedback period.",
    });
  }
}

async function addCertificate(req, res) {
  try {
    console.log('addCertificate: Request received');
    const { event_id, user_email } = req.body;
    console.log('addCertificate: event_id:', event_id);

    if (!req.files || !req.files.file) {
      console.error('addCertificate: No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Always prefer DB user_id if email is provided
    let user_id = req.user?.user_id;
    if (user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }
    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    const uploadedFile = req.files.file;
    console.log('addCertificate: Uploaded file details:', uploadedFile);

    const fileBuffer = uploadedFile.data;
    console.log('addCertificate: File buffer size:', fileBuffer.length);

    if (!uploadedFile.mimetype.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
      console.error('addCertificate: Invalid file type:', uploadedFile.mimetype);
      return res.status(400).json({ message: 'Only .docx files allowed' });
    }

    const filename = `event-${event_id}-template.docx`;
    const templatePath = path.join('/app/certificates/templates', filename);
    console.log('addCertificate: Saving file to path:', templatePath);

    try {
      fs.writeFileSync(templatePath, uploadedFile.data);
      console.log('addCertificate: File saved successfully');
    } catch (writeError) {
      console.error('addCertificate: Error saving file:', writeError);
      return res.status(500).json({ message: 'Error saving file', error: writeError.message });
    }

    await eventModel.AddCertificateTemplate(event_id, filename, user_id);
    console.log('addCertificate: Database insert successful');

    res.status(201).json({ path: templatePath });
  } catch (error) {
    console.error('addCertificate: Unexpected error:', error);
    res.status(500).json({ message: 'An unexpected error occurred', error: error.message });
  }
}

async function getCert(req, res) {
  try {
    const { event_id } = req.query;
    console.log('getCert: Starting for event_id:', event_id);

    if (!event_id) {
      return res.status(400).json({ message: "event_id is required." });
    }

    const template = await eventModel.getCertificateTemplate(event_id);
    if (!template || !template[0] || !template[0].template_path) {
      throw new Error("Certificate template not found for this event.");
    }

    const templatePath = `/app/certificates/templates/${template[0].template_path}`;
    console.log('getCert: Template path:', templatePath);

    if (!fs.existsSync(templatePath)) {
      throw new Error("Certificate file not found on server.");
    }

    // Stream the file as a download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${template[0].template_path}"`);
    const readStream = fs.createReadStream(templatePath);
    readStream.on('error', (err) => {
      console.error('getCert: File stream error:', err);
      res.status(500).json({ message: 'Error reading certificate file.', error: err.message });
    });
    readStream.pipe(res);
  } catch (error) {
    console.error('getCert: Error:', error);
    res.status(500).json({ message: 'An error occurred while downloading the certificate template.', error: error.message });
  }
}

async function debugDocumentXML(inputPath) {
  const JSZip = require('jszip');
  const data = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file("word/document.xml").async("string");

  console.log('=== FULL DOCUMENT XML ===');
  console.log(docXml);
  console.log('=== END XML ===');

  const nameMatches = docXml.match(/{name}.*?/g);
  console.log('=== NAME PLACEHOLDER MATCHES ===');
  console.log(nameMatches);

  const textboxMatches = docXml.match(/<w:txbxContent>.*?<\/w:txbxContent>/gs);
  console.log('=== TEXTBOX CONTENT ===');
  console.log(textboxMatches);

  return docXml;
}

async function getSampleCertificate(req, res) {
  try {
    const { event_id } = req.query;

    console.log('getSampleCertificate: Starting for event_id:', event_id);

    const template = await eventModel.getCertificateTemplate(event_id);
    if (!template || !template[0]) throw new Error('No template found for this event');

    const templatePath = `/app/certificates/templates/${template[0].template_path}`;
    console.log('getSampleCertificate: Template path:', templatePath);

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    const fullName = `${req.user.f_name} ${req.user.l_name}`;
    console.log('getSampleCertificate: Full name:', fullName);

    const data = { name: fullName };
    doc.render(data);

    const buf = doc.getZip().generate({ type: 'nodebuffer' });

    const baseFilename = `Certificate_${req.user.f_name.replace(/[^a-z0-9]/gi, '_')}_${req.user.l_name.replace(/[^a-z0-9]/gi, '_')}`;
    const docxPath = path.join("/tmp", `${baseFilename}_${Date.now()}.docx`);
    const pdfPath = path.join("/tmp", `${baseFilename}_${Date.now()}.pdf`);

    fs.writeFileSync(docxPath, buf);
    console.log('getSampleCertificate: DOCX written to:', docxPath);

    await convertDocxToPdf(docxPath, pdfPath, { name: fullName });
    console.log('getSampleCertificate: PDF conversion completed');

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file was not created: ${pdfPath}`);
    }

    const pdfBuffer = await fs.promises.readFile(pdfPath);
    await debugDocumentXML(docxPath);
    try { await fs.promises.unlink(docxPath); } catch (unlinkError) { console.warn('getSampleCertificate: Failed to clean up DOCX:', unlinkError.message); }
    try { await fs.promises.unlink(pdfPath); } catch (unlinkError) { console.warn('getSampleCertificate: Failed to clean up PDF:', unlinkError.message); }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('getSampleCertificate: Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

async function getEventPublicationImage(req, res) {
  let { event_id, image_name, cycle_number, organization_name, organization_id } = req.query;

  if (!event_id || !image_name) {
    return res.status(400).json({
      error: "Missing required parameters: event_id, image_name"
    });
  }

  // Determine if it's an SDAO event
  const isSDAO = !organization_id || organization_id === 'null' || organization_id === '' || organization_id === 'undefined';

  const image_name_encoded = encodeURIComponent(image_name);

  let xAccelPath;
  let physicalPath;

  if (isSDAO) {
    // SDAO event: serve from /app/events/SDAO/{event_id}/publication_images/{image_name}
    xAccelPath = `/protected-events/SDAO/${event_id}/publication_images/${image_name_encoded}`;
    physicalPath = path.join('/app/events/SDAO', String(event_id), 'publication_images', image_name);
  } else {
    // Organization event: Always use the complex path
    if (!organization_name || !cycle_number) {
      return res.status(400).json({
        error: "Missing required parameters: organization_name, cycle_number for organization event"
      });
    }
    const organization_name_encoded = encodeURIComponent(organization_name);
    physicalPath = path.join(
      '/app/organizations',
      organization_name,
      String(cycle_number),
      'events',
      String(event_id),
      'publication_images',
      image_name
    );
    xAccelPath = `/protected-organization-requirements/${organization_name_encoded}/${cycle_number}/events/${event_id}/publication_images/${image_name_encoded}`;
  }

  // Log for debugging
  console.log(`getEventPublicationImage: Attempting to serve image`, {
    event_id,
    image_name,
    organization_id,
    isSDAO,
    xAccelPath,
    physicalPath,
    exists: physicalPath ? fs.existsSync(physicalPath) : false
  });

  // Check if file exists before trying to serve it
  if (!fs.existsSync(physicalPath)) {
    console.error(`getEventPublicationImage: File not found at ${physicalPath}`);
    return res.status(404).json({
      error: "Image not found",
      message: "The requested image file does not exist."
    });
  }

  try {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Content-Type', getContentType(image_name));
    res.setHeader('Content-Disposition', `inline; filename="${image_name}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Accel-Redirect', xAccelPath);
    res.end();
  } catch (error) {
    console.error('getEventPublicationImage error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while fetching the publication image.",
    });
  }
}

// Helper function to get content type
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

async function checkEventTitle(req, res) {
  try {
    const { event_title } = req.query;

    if (!event_title || event_title.trim().length === 0) {
      return res.status(400).json({ message: 'Event title is required' });
    }

    const result = await eventModel.checkEventTitle(event_title.trim());
    const taken = result && result.exists === 1;

    res.status(200).json({ taken });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while checking event title.",
    });
  }
}

async function checkScheduleConflict(req, res) {
  try {
    const { start_date, end_date, start_time, end_time, venue, venue_type, event_id } = req.body;

    if (!start_date || !start_time || !end_time) {
      return res.status(400).json({
        message: 'start_date, start_time, and end_time are required'
      });
    }

    const checkVenueConflict = venue_type === 'Face to face' && venue && venue.trim().length > 0;

    const conflicts = await eventModel.checkScheduleConflict({
      start_date,
      end_date: end_date || start_date,
      start_time,
      end_time,
      venue: checkVenueConflict ? venue.trim() : null,
      event_id: event_id || null
    });

    const hasConflict = conflicts && conflicts.length > 0;

    res.status(200).json({
      conflict: hasConflict,
      conflicts: hasConflict ? conflicts : []
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while checking schedule conflicts.",
    });
  }
}

async function createBlockedPeriod(req, res) {
  try {
    let { start_date, end_date, reason, user_id, user_email } = req.body;

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }

    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    await eventModel.createBlockedPeriod({ start_date, end_date, reason, created_by: user_id });

    const periods = await eventModel.getBlockedPeriodsByStatus('unarchived');
    publishToChannel('blocked_periods', {
      channel: 'blocked_periods',
      operation: 'SNAPSHOT',
      data: Array.isArray(periods) ? periods : []
    });

    res.status(201).json({ message: 'Blocked period created.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateBlockedPeriod(req, res) {
  try {
    const blocked_period_id = req.params.id || req.body.blocked_period_id;
    let { start_date, end_date, reason, user_id, user_email } = req.body;

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }
    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    await eventModel.updateBlockedPeriod({ blocked_period_id, start_date, end_date, reason, updated_by: user_id });

    const periods = await eventModel.getBlockedPeriodsByStatus('unarchived');
    publishToChannel('blocked_periods', {
      channel: 'blocked_periods',
      operation: 'SNAPSHOT',
      data: Array.isArray(periods) ? periods : []
    });

    res.status(200).json({ message: 'Blocked period updated.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function archiveBlockedPeriod(req, res) {
  try {
    const blocked_period_id = req.params.id || req.body.blocked_period_id;
    let { user_id, user_email, archived_reason } = req.body;
    if (!archived_reason) return res.status(400).json({ message: 'Archive reason required.' });

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }
    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    await eventModel.archiveBlockedPeriod({ blocked_period_id, archived_by: user_id, archived_reason });

    const periods = await eventModel.getBlockedPeriodsByStatus('unarchived');
    publishToChannel('blocked_periods', {
      channel: 'blocked_periods',
      operation: 'SNAPSHOT',
      data: Array.isArray(periods) ? periods : []
    });

    res.status(200).json({ message: 'Blocked period archived.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function unarchiveBlockedPeriod(req, res) {
  try {
    const blocked_period_id = req.params.id || req.body.blocked_period_id;
    let { user_id, user_email, unarchived_reason } = req.body;

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }
    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    await eventModel.unarchiveBlockedPeriod({ blocked_period_id, unarchived_by: user_id, unarchived_reason });

    const periods = await eventModel.getBlockedPeriodsByStatus('unarchived');
    publishToChannel('blocked_periods', {
      channel: 'blocked_periods',
      operation: 'SNAPSHOT',
      data: Array.isArray(periods) ? periods : []
    });

    res.status(200).json({ message: 'Blocked period unarchived.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteBlockedPeriod(req, res) {
  try {
    const blocked_period_id = req.params.id || req.body.blocked_period_id;
    let { user_id, user_email } = req.body;

    if (!user_id && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }
    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    await eventModel.deleteBlockedPeriod({ blocked_period_id, deleted_by: user_id });

    const periods = await eventModel.getBlockedPeriodsByStatus('unarchived');
    publishToChannel('blocked_periods', {
      channel: 'blocked_periods',
      operation: 'SNAPSHOT',
      data: Array.isArray(periods) ? periods : []
    });

    res.status(200).json({ message: 'Blocked period deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getBlockedPeriodsByStatus(req, res) {
  try {
    const { status, sessionId } = req.query;

    const periods = await eventModel.getBlockedPeriodsByStatus(status);

    if (sessionId) {
      subscribeToChannel(sessionId, 'blocked_periods');
      publishToChannel('blocked_periods', {
        channel: 'blocked_periods',
        operation: 'SNAPSHOT',
        data: Array.isArray(periods) ? periods : []
      });
    }

    res.status(200).json(periods);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getEventsByUserRole(req, res) {
  try {
    let user_id = req.user?.user_id || req.query.user_id;
    const user_email = req.query.user_email;

    // If user_id is not provided but user_email is, look up user_id
    if ((!user_id || user_id === 'undefined' || user_id === 'null') && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    }

    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    const events = await eventModel.getEventsByUserRole(user_id);
    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching events by user role.",
    });
  }
}

async function archiveEvent(req, res) {
    try {
        const { event_id, reason } = req.body;
        const user_id = req.user?.user_id;
        if (!event_id || !user_id || !reason) {
            return res.status(400).json({ message: "event_id, user_id, and reason are required." });
        }
        const result = await eventModel.archiveEvent(event_id, user_id, reason);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function unarchiveEvent(req, res) {
    try {
        const { event_id, reason } = req.body;
        const user_id = req.user?.user_id;
        if (!event_id || !user_id) {
            return res.status(400).json({ message: "event_id and user_id are required." });
        }
        const result = await eventModel.unarchiveEvent(event_id, user_id, reason || null);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function updateEventSDAO(req, res) {
    try {
        const event_id = req.params.id;
        const event = req.body;
        const user_id = req.user?.user_id;
        if (!event_id || !user_id) {
            return res.status(400).json({ message: "event_id and user_id are required." });
        }
        const result = await eventModel.updateEventSDAO(event_id, event, user_id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function deleteEventSDAO(req, res) {
    try {
        const { event_id, reason } = req.body;
        const user_id = req.user?.user_id;
        if (!event_id || !user_id || !reason) {
            return res.status(400).json({ message: "event_id, user_id, and reason are required." });
        }
        await eventModel.deleteEventSDAO(event_id, user_id, reason);
        res.status(200).json({ message: "Event deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
  addEvent,
  getEventRequirements,
  saveEventRequirements,
  getEvents,
  getEventById,
  getAttendeesbyEventId,
  updateEvent,
  deleteEvent,
  getEventsByStatus,
  approvePaidEventRegistration,
  rejectPaidEventRegistration,
  getEventStats,
  getAllEvaluationQuestions,
  getEventEvaluationResponsesByGroup,
  getEventApplicationDetails,
  createEventApplication,
  getEventApplicationRequirement,
  approveEventApplication,
  rejectEventApplication,
  getEventEvaluationConfig,
  updateEventEvaluationConfig,
  uploadOrUpdatePostEventRequirement,
  createEvent,
  getaddEventStatus,
  getEventApprovalTimeline,
  getEventEvaluationFeedbackPeriod,
  addCertificate,
  getSampleCertificate,
  getEventPublicationImage,
  checkEventTitle,
  checkScheduleConflict,
  createBlockedPeriod,
  updateBlockedPeriod,
  archiveBlockedPeriod,
  unarchiveBlockedPeriod,
  deleteBlockedPeriod,
  getBlockedPeriodsByStatus,
  getEventApplicationPublicationImage,
  getCert,
  getEventsByUserRole,
  archiveEvent,
  unarchiveEvent,
  updateEventSDAO,
  deleteEventSDAO
};