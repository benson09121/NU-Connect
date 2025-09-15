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
    const event_id = req.query.event_id ;
    const { sessionId } = req.query;

    let eventResult = await eventModel.getEventById(event_id);
    let event = Array.isArray(eventResult) ? eventResult[0] : eventResult;

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    event = parseCollaboratorsField(event);

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
    console.log(event_id);
    const attendees = await eventModel.getAttendeesByEventId(event_id);

    if (sessionId) {
      const ch = `attendees_${event_id}`;
      subscribeToChannel(sessionId, ch);
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

    const orgDir = path.join('/app/organizations', String(dbResult[0].organization_id), String(dbResult[0].org_version_id), 'events', String(dbResult[0].event_id));
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
  let organization_id = req.query.organization_id;
  let organization_version_id = req.query.organization_version_id;
  let event_id = req.query.event_id;
  organization_id = encodeURIComponent(organization_id);
  organization_version_id = encodeURIComponent(organization_version_id);
  event_id = encodeURIComponent(event_id);

  try {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader(
      'X-Accel-Redirect',
      `/protected-organization-requirements/${organization_id}/${organization_version_id}/events/${event_id}/requirements/${requirement_name}`
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
  let { organization_id, organization_version_id, event_id, image_name } = req.query;

  if (!organization_id || !organization_version_id || !event_id || !image_name) {
    return res.status(400).json({
      error: "Missing required parameters: organization_id, organization_version_id, event_id, image_name"
    });
  }

  // Encode for URL and filesystem safety
  const image_name_encoded = encodeURIComponent(image_name);

  // Physical path for existence check (optional, but good for error handling)
  const physicalPath = path.join(
    '/app/organizations',
    String(organization_id),
    String(organization_version_id),
    'events',
    String(event_id),
    'publication_images',
    image_name
  );


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
      `/protected-organization-requirements/${organization_id}/${organization_version_id}/events/${event_id}/publication_images/${image_name_encoded}`
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

    const event_application_id = req.body.event_application_id === ""
      ? null : parseInt(req.body.event_application_id);

    // Always resolve submitted_by to user_id
    let submitted_by = req.body.submitted_by;
    if (!submitted_by || submitted_by.includes('@')) {
      const email = submitted_by || submitted_by_email;
      if (!email) {
        return res.status(400).json({ message: "submitted_by (user_id) or submitted_by_email is required." });
      }
      const user = await eventModel.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      submitted_by = user.user_id;
    }

    const file_path = req.body.file_path;

    if (!event_id || !requirement_id || !cycle_number || !organization_id || !file_path || !submitted_by) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // Fetch current organization version ID
    let organization_version_id = req.body.organization_version_id;
    if (!organization_version_id) {
      organization_version_id = await eventModel.getOrganizationVersionId(organization_id);
      if (!organization_version_id) {
        return res.status(400).json({ message: "Organization version not found." });
      }
    }

    let savedFilePath = file_path;
    const uploadedFile = req.files?.file;
    if (uploadedFile) {
      const requirementsDir = path.join(
        '/app/organizations',
        String(organization_id),
        String(organization_version_id),
        'events',
        String(event_id),
        'requirements'
      );

      if (!fs.existsSync(requirementsDir)) {
        fs.mkdirSync(requirementsDir, { recursive: true });
      }

      const filename = `requirement-${Date.now()}-${uploadedFile.name}`;
      savedFilePath = filename;

      fs.writeFileSync(
        path.join(requirementsDir, filename),
        uploadedFile.data
      );
    }

    await eventModel.uploadOrUpdatePostEventRequirement({
      event_id,
      event_application_id,
      requirement_id,
      cycle_number,
      organization_id,
      file_path: savedFilePath,
      submitted_by // <-- always user_id now
    });

    res.status(200).json({
      message: "Post-event requirement uploaded/updated successfully.",
      file_path: savedFilePath,
      organization_version_id
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
    const { event_id, user_email, user_id } = req.body;
    let uploader = user_id || user_email || req.user?.user_id || req.user?.email;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Always prefer DB user_id if email is provided
    if (uploader && uploader.includes('@')) {
      const user = await eventModel.getUserByEmail(uploader);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      uploader = user.user_id;
    }

    if (!uploader) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    const uploadedFile = req.files.file;
    const filename = `event-${event_id}-template.docx`;
    const templatePath = path.join('/app/certificates/templates', filename);

    fs.writeFileSync(templatePath, uploadedFile.data);

    await eventModel.AddCertificateTemplate(event_id, filename, uploader);

    res.status(201).json({ path: templatePath });
  } catch (error) {
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

async function deleteCertificate(req, res) {
  try {
    const { event_id } = req.params; // expects event_id from URL path
    console.log('[deleteCertificate] event_id received:', event_id);
    if (!event_id) {
      return res.status(400).json({ message: 'event_id is required' });
    }

    // Call SP to validate & delete DB row, while receiving the filename to remove
    const filename = await eventModel.DeleteCertificateTemplate(event_id);

    if (!filename) {
      return res.status(404).json({ message: 'No certificate template to delete for this event' });
    }

    // Always use the same directory as addCertificate
    const fullPath = path.join('/app/certificates/templates', filename);

    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      } else {
        console.warn('deleteCertificate: File not found at', fullPath);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn('deleteCertificate: File delete warning:', e.message);
      }
    }

    return res.status(200).json({
      message: 'Certificate template deleted',
      deleted_file: filename
    });
  } catch (err) {
    const msg = err?.sqlMessage || err?.message || 'Unexpected error';
    const notFound = /No certificate template|Event does not exist/i.test(msg);
    return res.status(notFound ? 404 : 500).json({ message: msg });
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
  let { image_name, event_id, organization_id, organization_version_id } = req.query;

  if (!event_id || !image_name) {
    return res.status(400).json({
      error: "Missing required parameters: event_id, image_name"
    });
  }
   organization_id = encodeURIComponent(organization_id || '');
   organization_version_id = encodeURIComponent(organization_version_id || '');

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
    if (!organization_id || !organization_version_id) {
      return res.status(400).json({
        error: "Missing required parameters: organization_id, organization_version_id for organization event"
      });
    }
    physicalPath = path.join(
      '/app/organizations',
      String(organization_id),
      String(organization_version_id),
      'events',
      String(event_id),
      'publication_images',
      image_name
    );
    xAccelPath = `/protected-organization-requirements/${organization_id}/${organization_version_id}/events/${event_id}/publication_images/${image_name_encoded}`;
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
    let user_id = req.query.user_id;
    let user_email = req.query.user_email;

    // If user_email is provided, always use it to look up user_id
    if (user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      console.log('[getEventsByUserRole] Looked up user by email:', user_email, 'Result:', user);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      user_id = user.user_id;
    } else if (!user_id) {
      // Fallback to JWT user_id if no user_id or user_email in query
      user_id = req.user?.user_id;
    }

    if (!user_id) {
      return res.status(400).json({ message: "user_id (or user_email) is required." });
    }

    const param = user_id;
    console.log('[getEventsByUserRole] Using param for SP:', param);

    const events = await eventModel.getEventsByUserRole(param);

    console.log('[getEventsByUserRole] Events returned:', Array.isArray(events) ? events.length : events, events);

    res.status(200).json(events);
  } catch (error) {
    console.error('[getEventsByUserRole] Error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while fetching events by user role.",
    });
  }
}

async function archiveEvent(req, res) {
    try {
        const { event_id, reason, user_email } = req.body;
        let user_id = req.user?.user_id;

        // Allow lookup by email if user_id is missing
        if ((!user_id || user_id === 'undefined' || user_id === 'null') && user_email) {
            const user = await eventModel.getUserByEmail(user_email);
            if (!user) {
                return res.status(404).json({ message: "User not found for the provided email." });
            }
            user_id = user.user_id;
        }

        if (!event_id || !user_id || !reason) {
            return res.status(400).json({ message: "event_id, user_id (or user_email), and reason are required." });
        }
        const result = await eventModel.archiveEvent(event_id, user_id, reason);
        res.status(200).json(result);
    } catch (error) {
        console.error('[archiveEvent] Error:', error);
        res.status(500).json({ message: error.message });
    }
}

async function unarchiveEvent(req, res) {
    try {
        const { event_id, reason, user_email } = req.body;
        let user_id = req.user?.user_id;

        if ((!user_id || user_id === 'undefined' || user_id === 'null') && user_email) {
            const user = await eventModel.getUserByEmail(user_email);
            if (!user) {
                return res.status(404).json({ message: "User not found for the provided email." });
            }
            user_id = user.user_id;
        }

        if (!event_id || !user_id) {
            return res.status(400).json({ message: "event_id and user_id (or user_email) are required." });
        }
        const result = await eventModel.unarchiveEvent(event_id, user_id, reason || null);
        res.status(200).json(result);
    } catch (error) {
        console.error('[unarchiveEvent] Error:', error);
        res.status(500).json({ message: error.message });
    }
}

async function updateEventSDAO(req, res) {
  try {
    const event_id = req.params.id;
    const body = req.body || {};
    let imageFile = req.files?.image || null;
    let imageFilename = null;

    // Resolve user_id (email → id)
    let user_id = req.user?.user_id || body.user_id;
    const user_email = body.user_email;
    if (user_id && typeof user_id === 'string' && user_id.includes('@')) {
      const u = await eventModel.getUserByEmail(user_id);
      if (!u) return res.status(404).json({ message: "User not found for the provided email." });
      user_id = u.user_id;
    } else if ((!user_id || user_id === 'undefined' || user_id === 'null') && user_email) {
      const u = await eventModel.getUserByEmail(user_email);
      if (!u) return res.status(404).json({ message: "User not found for the provided email." });
      user_id = u.user_id;
    }
    if (!event_id || !user_id) {
      return res.status(400).json({ message: "event_id and user_id (or user_email) are required." });
    }

    // Load existing event
    let existingEvent = null;
    try {
      existingEvent = eventModel.getEventById
        ? await eventModel.getEventById(event_id)
        : (await eventModel.getEvents()).find(e => String(e.event_id || e.id) === String(event_id));
    } catch (e) {
      console.warn('[updateEventSDAO] Could not fetch existing event by ID:', e);
    }

    // Build event payload with fallbacks (avoid nulling fields)
    const pick = (v, fb) => (v === undefined ? fb : v);
    const event = { ...body };
    event.user_id     = user_id;
    event.title       = pick(event.title,       existingEvent?.title);
    event.description = pick(event.description, existingEvent?.description);
    event.venue_type  = pick(event.venue_type,  existingEvent?.venue_type);
    event.venue       = pick(event.venue,       existingEvent?.venue ?? null);
    event.start_date  = pick(event.start_date,  existingEvent?.start_date);
    event.end_date    = pick(event.end_date,    existingEvent?.end_date);
    event.start_time  = pick(event.start_time,  existingEvent?.start_time);
    event.end_time    = pick(event.end_time,    existingEvent?.end_time);
    event.status      = pick(event.status,      existingEvent?.status);
    event.type        = pick(event.type,        existingEvent?.type);
    event.is_open_to  = pick(event.is_open_to,  existingEvent?.is_open_to);

    // Normalize numeric optionals
    const normNum = (v) => (v === "" ? null : v);
    event.capacity = pick(normNum(event.capacity), existingEvent?.capacity ?? null);
    event.fee      = pick(normNum(event.fee),      existingEvent?.fee ?? null);

    // collaborators: build a param for the SP (NULL = unchanged, '[]' = clear, JSON array = replace)
    let collaboratorsParam = null; // default: unchanged
    if (Object.prototype.hasOwnProperty.call(body, 'collaborators')) {
      if (typeof body.collaborators === 'string') {
        try {
          const arr = JSON.parse(body.collaborators);
          collaboratorsParam = Array.isArray(arr) ? JSON.stringify(arr) : '[]';
        } catch {
          collaboratorsParam = '[]';
        }
      } else if (Array.isArray(body.collaborators)) {
        collaboratorsParam = JSON.stringify(body.collaborators); // keep [] if empty
      } else if (body.collaborators === null) {
        collaboratorsParam = null; // unchanged
      } else {
        collaboratorsParam = '[]'; // invalid type → clear
      }
    }

    // Storage targeting
    const orgIdForStorage = event.organization_id ?? existingEvent?.organization_id ?? null;
    const isSDAO = !orgIdForStorage;

    const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
    const sanitizeBase = (n) => path.basename(n, path.extname(n)).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
    const parseTruthy = (v) => v === true || v === 1 || v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');

    const removeImage = parseTruthy(event.remove_image);
    const removeOldImageIfExists = () => {
      try {
        const oldName = existingEvent?.image;
        if (!oldName) return;
        if (existingEvent?.organization_id) {
          const oldOrgDir = path.join('/app/events', String(existingEvent.organization_id));
          const oldPath = path.join(oldOrgDir, oldName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } else {
          const oldSdaoDir = path.join('/app/events/SDAO', String(event_id), 'publication_images');
          const oldPath = path.join(oldSdaoDir, oldName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      } catch (e) {
        console.warn('[updateEventSDAO] Failed to remove old image:', e);
      }
    };

    // Image ops
    if (removeImage) {
      removeOldImageIfExists();
      event.image = null; // SP will set column to NULL
    } else if (imageFile) {
      const ext = path.extname(imageFile.name);
      const base = sanitizeBase(imageFile.name);
      imageFilename = `event-${Date.now()}-${base}${ext}`;
      event.image = imageFilename;

      if (isSDAO) {
        const destDir = path.join('/app/events/SDAO', String(event_id), 'publication_images');
        ensureDir(destDir);
        fs.writeFileSync(path.join(destDir, imageFilename), imageFile.data);
      } else {
        const orgDir = path.join('/app/events', String(orgIdForStorage));
        ensureDir(orgDir);
        fs.writeFileSync(path.join(orgDir, imageFilename), imageFile.data);
      }

      if (existingEvent?.image && existingEvent.image !== imageFilename) {
        removeOldImageIfExists();
      }
    } else {
      event.image = existingEvent?.image ?? null; // keep existing
    }

    // DB update (now includes collaborators as 17th param)
    const result = await eventModel.updateEventSDAO(event_id, event, user_id, collaboratorsParam);

    // SSE snapshot
    try {
      const allEvents = await eventModel.getEvents();
      publishToChannel('events', { channel: 'events', operation: 'SNAPSHOT', data: Array.isArray(allEvents) ? allEvents : [] });
    } catch (sseError) {
      console.error('[updateEventSDAO] Failed to publish SSE update:', sseError);
    }

    res.status(200).json({ success: true, message: 'Event updated successfully', event: result, data: result, event_id });
  } catch (error) {
    console.error('[updateEventSDAO] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteEventSDAO(req, res) {
  const start = Date.now();
  try {
    // Accept event_id from params or body (DELETE bodies can be stripped)
    const event_id = req.params?.id || req.body?.event_id;
    let reason = req.body?.reason;
    const user_email = req.body?.user_email;

    let user_id = req.user?.user_id;

    // Resolve user_id from email if missing
    if ((!user_id || user_id === 'undefined' || user_id === 'null') && user_email) {
      const user = await eventModel.getUserByEmail(user_email);
      if (!user) {
        console.warn('[deleteEventSDAO] User not found for email', { user_email });
        return res.status(404).json({
          success: false,
          message: "User not found for the provided email.",
          debug: { user_email }
        });
      }
      user_id = user.user_id;
    }

    if (!event_id || !user_id) {
      console.warn('[deleteEventSDAO] Missing required params', { event_id, user_id_present: !!user_id });
      return res.status(400).json({
        success: false,
        message: "event_id and user_id (or user_email) are required.",
        debug: { event_id, user_id_present: !!user_id }
      });
    }

    // Normalize optional reason
    if (!reason || String(reason).trim() === '') reason = null;

    console.log('[deleteEventSDAO] Deleting SDAO event...', { event_id, hasReason: !!reason, user_id });

    // Call SP
    const spResult = await eventModel.deleteEventSDAO(event_id, user_id, reason);

    // Try filesystem cleanup for SDAO images (best-effort)
    let fsCleanup = { attempted: true, removed: false, path: null, error: null };
    try {
      const sdaoDir = path.join('/app/events/SDAO', String(event_id));
      fsCleanup.path = sdaoDir;
      if (fs.existsSync(sdaoDir)) {
        // Node 16+: fs.rm supports recursive
        fs.rmSync(sdaoDir, { recursive: true, force: true });
        fsCleanup.removed = true;
        console.log('[deleteEventSDAO] Removed SDAO directory', sdaoDir);
      } else {
        console.log('[deleteEventSDAO] SDAO directory not found (skip)', sdaoDir);
      }
    } catch (e) {
      fsCleanup.error = e?.message || String(e);
      console.warn('[deleteEventSDAO] FS cleanup failed', fsCleanup);
    }

    // Publish SSE snapshot to refresh UI
    let ssePublished = false;
    try {
      const allEvents = await eventModel.getEvents();
      publishToChannel('events', {
        channel: 'events',
        operation: 'SNAPSHOT',
        data: Array.isArray(allEvents) ? allEvents : []
      });
      ssePublished = true;
    } catch (e) {
      console.error('[deleteEventSDAO] SSE publish failed', { error: e?.message });
    }

    const durationMs = Date.now() - start;

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully.",
      event_id,
      reason: reason ?? null,
      sp: spResult || null,
      debug: {
        durationMs,
        ssePublished,
        fsCleanup
      }
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    // Frontend-friendly error payload with structured debug info
    console.error('[deleteEventSDAO] Error', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      message: error.message
    });

    const httpStatus =
      error.code === 'ER_ROW_IS_REFERENCED_2' ? 409 : // FK constraint
      error.code === 'ER_SIGNAL_EXCEPTION'   ? 400 : // SIGNAL in SP
      500;

    return res.status(httpStatus).json({
      success: false,
      message: error.message || "Failed to delete event.",
      error_code: 'DELETE_EVENT_FAILED',
      debug: {
        sqlState: error.sqlState || null,
        errno: error.errno || null,
        code: error.code || null,
        durationMs
      }
    });
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
  deleteCertificate,
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