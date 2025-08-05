const eventModel = require('../models/eventModel');
const fs = require('fs');
const path = require('path');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function addEvent(req, res) {
    try {
        const event = req.body;
        const result = await eventModel.addEvent(event);
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

    // If user_id is not provided but user_email is, look up user_id
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
        const events = await eventModel.getEvents();
        if (sessionId) {
            subscribeToChannel(sessionId, "events");
        }
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching events.",
        });
    }
}

async function getaddEventStatus(req, res){
   const {orgName, sessionId} = req.query;
   try {
      const events = await eventModel.getaddEventStatus(orgName);
      res.status(200).json(events);
      if (sessionId) {
          subscribeToChannel(sessionId, `addEvent_${orgName}`);
      }
   } catch (error) {
      res.status(500).json({
          error: error.message || "An error occurred while fetching add event status.",
      });
   }
}

async function getEventById(req, res) {
    try {
        const event_id = req.params.id;
        const event = await eventModel.getEventById(event_id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
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
        const event_id = req.params.id;
        const attendees = await eventModel.getAttendeesByEventId(event_id);
        if (attendees.length === 0) {
            return res.status(404).json({ message: 'No attendees found for this event' });
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
        const events = await eventModel.getEventsByStatus(status);
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
    const { remarks } = req.body; // remarks is optional

    if (!approver_email) {
      return res.status(400).json({ message: "Approver email is required." });
    }

    // Lookup user_id from email
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

    // Lookup user_id from email
    const approver = await eventModel.getUserByEmail(approver_email);
    if (!approver) {
      return res.status(404).json({ message: "Approver not found." });
    }

    const result = await eventModel.rejectPaidEventRegistration(
      event_id,
      user_id,
      approver.user_id, // pass the user_id to the stored procedure
      remarks
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Registration not found or already rejected' });
    }

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
    const event_id = req.params.id;
    const responses = await eventModel.getEventEvaluationResponsesByGroup(event_id);
    if (!responses || responses.length === 0) {
      return res.status(404).json({ message: 'No grouped evaluation responses found for this event' });
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
    // Lookup event_application_id from proposed_event_id
    const event_application_id = await eventModel.getEventApplicationIdByProposedEventId(proposed_event_id);
    if (!event_application_id) {
      return res.status(404).json({ message: 'No event application found for this proposed event.' });
    }
    // Use the existing method
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
    // Parse event and requirements from the request
    const event = JSON.parse(req.body.event);
    const requirements = JSON.parse(req.body.requirements);

    // Lookup user_id from email if not present
    let applicant_user_id = req.user?.user_id;
    if (!applicant_user_id && req.body.user_email) {
      const user = await eventModel.getUserByEmail(req.body.user_email);
      if (!user) {
        return res.status(404).json({ message: "User not found for the provided email." });
      }
      applicant_user_id = user.user_id;
    }

    // Lookup organization_id from tbl_organization_members if not provided
    let organization_id = event.organization_id;
    let cycle_number = event.cycle_number;
    if ((!organization_id || !cycle_number) && applicant_user_id) {
      const orgMember = await eventModel.getOrganizationMembership(applicant_user_id);
      if (orgMember) {
        organization_id = orgMember.organization_id;
        cycle_number = orgMember.cycle_number;
      }
    }

    // If still no organization_id, set to 1 as default
    if (!organization_id) {
      organization_id = 1;
    }
    // If still no cycle_number, set to 1 as default
    if (!cycle_number) {
      cycle_number = 1;
    }

    // Handle file uploads for requirements
    const requirementFiles = {};
    requirements.forEach(reqItem => {
      const fileKey = `requirement_${reqItem.requirement_id}`;
      if (req.files && req.files[fileKey]) {
        requirementFiles[reqItem.requirement_id] = req.files[fileKey];
      }
    });

    // Generate filenames for requirements and use them for both DB and file upload
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

    // Call the stored procedure
    const dbResult = await eventModel.createEventApplication(
      organization_id,
      cycle_number,
      applicant_user_id,
      event,
      requirementFilePaths
    );

    // Save files to disk
    const orgDir = path.join('/app/organizations', String(organization_id), 'events', String(dbResult[0].event_id));
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }
    const requirementsDir = path.join(orgDir, 'requirements');
    if (!fs.existsSync(requirementsDir)) {
      fs.mkdirSync(requirementsDir, { recursive: true });
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
    let org_id = req.query.organization_id;
    let event_id = req.query.event_id;

    // Encode organization_id and event_id for path safety (if needed)
    org_id = encodeURIComponent(org_id);
    event_id = encodeURIComponent(event_id);

    try {
        res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
        // Example path: /protected-event-requirements/{org_id}/events/{event_id}/requirements/{requirement_name}
        res.setHeader(
            'X-Accel-Redirect',
            `/protected-event-requirements/${org_id}/events/${event_id}/requirements/${requirement_name}`
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

async function approveEventApplication(req, res) {
  try {
    const { approval_id, event_application_id } = req.params;
    const { comment, user_email, user_id } = req.body;

    // Lookup user_id from email if not provided
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
    publishToChannel(`event_approval_timeline_${event_application_id}`, {
      operation: 'UPDATE',
      data: result
    });
    res.status(200).json({ message: "Event application approved successfully." });
  } catch (error) {
    console.error("approveEventApplication error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function rejectEventApplication(req, res) {
  try {
    const { approval_id, event_application_id } = req.params;
    const { comment, user_email, user_id } = req.body;

    // Lookup user_id from email if not provided
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
    publishToChannel(`event_approval_timeline_${event_application_id}`, {
      operation: 'UPDATE',
      data: result 
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

    // Lookup user_id from email if not provided
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
    // Parse numeric values from strings
    const event_id = parseInt(req.body.event_id);
    const requirement_id = parseInt(req.body.requirement_id);
    const cycle_number = parseInt(req.body.cycle_number);
    const organization_id = parseInt(req.body.organization_id);
    const submitted_by_email = req.body.submitted_by_email;
    
    // Handle null/empty string conversion for event_application_id
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

    // Validate required fields
    if (!event_id || !requirement_id || !cycle_number || !organization_id || !file_path || !submitted_by_email) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // File upload logic
    let savedFilePath = file_path;
    if (req.file) {
      // Create directory structure
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
      
      // Generate unique filename
      const filename = `requirement-${Date.now()}-${req.file.originalname}`;
      savedFilePath = filename;
      
      // Save file
      fs.writeFileSync(
        path.join(requirementsDir, filename),
        req.file.buffer || req.file.data
      );
    }

    // Call model with proper parameters
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
        console.log("Incoming event creation request:", req.body);
        const event = req.body;

        // Look up user_id from user_email if needed
        let user_id = event.user_id;
        if (!user_id && event.user_email) {
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

        // Clean up fields
        event.venue = event.venue || null;
        event.certificate = event.certificate ? String(event.certificate) : null;
        event.capacity = event.capacity === "" ? null : event.capacity;
        event.fee = event.fee === "" ? null : event.fee;

        const createdEvent = await eventModel.createEvent(event);
        res.status(201).json({ message: 'Event created successfully', event: createdEvent });
    } catch (error) {
        console.error("Error creating event:", error); // <-- Add this for debugging
        res.status(500).json({
            error: error.message || "An error occurred while creating the event.",
        });
    }
}
async function getEventApprovalTimeline(req, res) {
    try {
        const event_id = req.query.event_id;
        const sessionId = req.query.sessionId;

        if (sessionId) {
            subscribeToChannel(sessionId, `event_approval_timeline_${event_id}`);
        }

        const result = await eventModel.getEventApprovalTimeline(event_id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the event approval timeline.",
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
    getEventApprovalTimeline
};