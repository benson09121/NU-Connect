const requirementModel = require('../models/requirementModel');
const path = require('path');
const fs = require('fs');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function addRequirement(req, res) {
    try {
        let { requirement_name, is_applicable_to } = req.body;
        if (!requirement_name || requirement_name.trim().length < 2) {
            return res.status(400).json({ message: 'Requirement name is required' });
        }
        if (!['new','renew','both', undefined, null, ''].includes(is_applicable_to)) {
            return res.status(400).json({ message: 'Invalid type selection' });
        }
        if (!is_applicable_to) is_applicable_to = 'new';

        let filename = null;
        if (req.files && req.files.template) {
            const uploadedFile = req.files.template;
            const requirementsDir = '/app/requirements';
            if (!fs.existsSync(requirementsDir)) fs.mkdirSync(requirementsDir, { recursive: true });
            filename = `requirement-${Date.now()}-${uploadedFile.name}`;
            fs.writeFileSync(path.join(requirementsDir, filename), uploadedFile.data);
        }

        // Lookup user_id by email (optimized)
        const user = await requirementModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {
            return res.status(404).json({ message: 'User not found.' });
        }
        let data = await requirementModel.addRequirement(
            requirement_name.trim(),
            is_applicable_to,
            filename,
            user.user_id
        );
        data = Array.isArray(data) ? data[0] : data;

        // Broadcast full list for consistency
        const fullList = await requirementModel.getRequirements();
        publishToChannel('application_requirements', { operation: 'SYNC', data: fullList });

        res.status(201).json({ message: 'Requirement saved', requirement: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.sqlMessage || err.message || 'Internal server error' });
    }
}

async function getRequirements(req, res) {
    const { sessionId, type, realtime } = req.query; // realtime optional flag (any truthy value)
    try {
        let filterType = null;

        // Explicit type filter from query (highest priority)
        if (type !== undefined && type !== null && type !== '') {
            const t = type.toString().toLowerCase().trim();
            if (!['new', 'renew'].includes(t)) {
                return res.status(400).json({ message: 'Invalid type filter (use new or renew)' });
            }
            filterType = t;
        } else {
            // Auto-apply based on permissions if no type given
            const perms = req.user?.permissions || [];

            const hasNew = perms.includes("APPLY_NEW_ORGANIZATION");
            const hasRenew = perms.includes("APPLY_RENEWAL_ORGANIZATION");

            if (hasNew && !hasRenew) {
                filterType = "new";
            } else if (hasRenew && !hasNew) {
                filterType = "renew";
            }
            // If user has both, keep filterType = null (return all, like old behavior)
        }

        const requirements = await requirementModel.getRequirements(filterType);

        // Realtime (SSE) support
        if (sessionId) {
            subscribeToChannel(sessionId, "application_requirements");

            // Push current snapshot immediately
            publishToChannel('application_requirements', {
                operation: 'SYNC',
                data: requirements
            });
        }

        res.json(requirements);
    } catch (error) {
        console.error('[getRequirements] error:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching the requirements.",
        });
    }
}

async function downloadTemplate(req, res) {
  try {
    const raw = req.query.template_name;
    console.log('[downloadTemplate] raw query:', raw);
    if (!raw) return res.status(400).json({ message: 'template_name is required' });

    const template_name = decodeURIComponent(raw);
    console.log('[downloadTemplate] decoded template_name:', template_name);

    // basic basename/path traversal guard
    if (path.basename(template_name) !== template_name) {
      console.warn('[downloadTemplate] basename mismatch:', template_name);
      return res.status(400).json({ message: 'Invalid template_name' });
    }

    // Use the same directory as addRequirement (single source of truth)
    const requirementsDir = '/app/requirements';
    const filePath = path.join(requirementsDir, template_name);
    console.log('[downloadTemplate] resolved filePath:', filePath);

    if (!fs.existsSync(filePath)) {
      console.warn('[downloadTemplate] file NOT found at path:', filePath);
      return res.status(404).json({ message: 'Template not found', filePath });
    }

    const userFilename = template_name.replace(/^requirement-\d+-?/, '');

    if (process.env.USE_X_ACCEL === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${userFilename}"`);
      res.setHeader('X-Accel-Redirect', `/protected-requirements/${template_name}`);
      return res.end();
    }

    return res.download(filePath, userFilename, (err) => {
      if (err) {
        console.error('[downloadTemplate] download error:', err);
        if (!res.headersSent) res.status(500).json({ message: 'Error sending file' });
      }
    });
  } catch (error) {
    console.error('[downloadTemplate] error:', error);
    res.status(500).json({ error: error.message || 'An error occurred while fetching the template.' });
  }
}

async function deleteRequirement(req, res) {
    try {
        const requirement_id = req.query.requirement_id;
        // Get the requirement to find the filename
        const [requirement] = await requirementModel.getSpecificRequirement(requirement_id);
        if (!requirement) {
            return res.status(404).json({ message: requirement_id });
        }

        const data = await requirementModel.deleteRequirement(requirement_id);
        publishToChannel('application_requirements', {
            operation: 'DELETE',
            data: data
        })

        const filename = requirement.file_path;
        if (filename) {
            const filePath = path.join('/app/requirements', filename);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (fileErr) {

                console.error('Error deleting file:', fileErr);
            }
        }
        res.status(204).json({ message: 'Requirement deleted successfully' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while deleting the requirement.",
        });
    }
}

async function updateRequirement(req, res) {
  let { requirement_name, id, is_applicable_to } = req.body;
  try {
    if (!id) return res.status(400).json({ message: 'Missing id' });

    requirement_name = (requirement_name || '').trim();
    if (requirement_name.length < 2) {
      return res.status(400).json({ message: 'Requirement name is required' });
    }

    // Normalize & validate type BEFORE calling model
    is_applicable_to = (is_applicable_to || '').toString().trim().toLowerCase();
    if (!['new', 'renew', 'both'].includes(is_applicable_to)) {
      return res.status(400).json({ message: 'Invalid type selection' });
    }

    console.log('[CTRL updateRequirement] body:', {
      id,
      requirement_name,
      is_applicable_to,
      hasFile: !!(req.files && req.files.template),
    });

    const existingArr = await requirementModel.getSpecificRequirement(id);
    const existing = existingArr[0];
    if (!existing) return res.status(404).json({ message: 'Requirement not found' });

    let newFileName = null;

    if (req.files && req.files.template) {
      if (existing.file_path) {
        const oldFile = path.join('/app/requirements', existing.file_path);
        if (fs.existsSync(oldFile)) {
          try { fs.unlinkSync(oldFile); } catch (e) { console.error('File delete error', e); }
        }
      }
      const uploadedFile = req.files.template;
      newFileName = `requirement-${Date.now()}-${uploadedFile.name}`;
      fs.writeFileSync(path.join('/app/requirements', newFileName), uploadedFile.data);
    }

    // Pass NULL for file to preserve (proc COALESCE handles)
    let data = await requirementModel.updateRequirement(
      id,
      requirement_name,
      is_applicable_to,
      newFileName
    );
    data = Array.isArray(data) ? data[0] : data;

    const fullList = await requirementModel.getRequirements();
    publishToChannel('application_requirements', { operation: 'SYNC', data: fullList });

    res.status(200).json({ message: 'Requirement updated', requirement: data });
  } catch (error) {
    console.error('[CTRL updateRequirement] error:', error);
    res.status(500).json({ message: error.sqlMessage || error.message || 'Internal server error' });
  }
}

async function addApplicationPeriod(req, res) {
    try {
        const { start_date, end_date, start_time, end_time } = req.body;
        
        if (!start_date || !end_date || !start_time || !end_time) {
            return res.status(400).json({ 
                error: "All fields (start_date, end_date, start_time, end_time) are required." 
            });
        }

        const result = await requirementModel.addApplicationPeriod(
            start_date,
            end_date,
            start_time,
            end_time,
            req.user.email
        );

        res.status(201).json({
            success: true,
            message: "Application period created successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while creating the application period."
        });
    }
}

async function getAllPeriodsWithApplications(req, res) {
    try {
        const periods = await requirementModel.getAllPeriodsWithApplications();
        res.json(periods);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching periods with applications.",
        });
    }
}

async function getActiveApplicationPeriodSimple(req, res) {
    try {
        const period = await requirementModel.getActiveApplicationPeriodSimple();
        if (!period || period.length === 0) {
            return res.status(404).json({ message: 'No active application period found.' });
        }
        res.json(period);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the active application period.",
        });
    }
}

async function getActiveApplicationPeriod(req, res) {
    const { sessionId } = req.query;
    try {
        const activePeriod = await requirementModel.getActiveApplicationPeriod();
        if (sessionId) {
            subscribeToChannel(sessionId, "application_periods");
        }
        res.status(200).json(activePeriod);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the active application period.",
        });
    }
}

async function updateApplicationPeriod(req, res) {
    try {
        // Log body for debugging when frontend sends unexpected payload
        console.log('[updateApplicationPeriod] req.body:', req.body);

        // Accept either period_id or id from client
        const period_id = req.body.period_id || req.body.id || req.body.periodId;
        // Accept multiple possible field names for dates/times
        const start_date = req.body.start_date || req.body.startDate || req.body.start;
        const end_date = req.body.end_date || req.body.endDate || req.body.end;
        const start_time = req.body.start_time || req.body.startTime || req.body.start_time;
        const end_time = req.body.end_time || req.body.endTime || req.body.end_time;

        if (!start_date || !end_date || !start_time || !end_time || !period_id) {
            return res.status(400).json({
                error: "All fields (start_date, end_date, start_time, end_time, period_id) are required.",
                received: { start_date, end_date, start_time, end_time, period_id }
            });
        }

        const result = await requirementModel.updateApplicationPeriod(
            start_date,
            end_date,
            start_time,
            end_time,
            period_id,
            req.user.email
        );

        res.status(200).json({
            success: true,
            message: "Application period updated successfully.",
            data: result
        });
    } catch (error) {
        console.error('[requirementController.updateApplicationPeriod] error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while updating the application period."
        });
    }
}

async function initiateApprovalProcess(req, res) {
    try {
        const { application_id } = req.body;
        
        if (!application_id) {
            return res.status(400).json({ 
                error: "application_id is required." 
            });
        }

        const result = await requirementModel.initiateApprovalProcess(
            application_id,
            req.user.email
        );

        res.status(200).json({
            success: true,
            message: "Approval process initiated successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while initiating the approval process."
        });
    }
}

async function terminateActiveApplicationPeriod(req, res) {
    try {
        // Use model to look up user by email
        const user = await requirementModel.getUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const result = await requirementModel.terminateActiveApplicationPeriod(user.user_id);
        publishToChannel('application_periods', {
            operation: 'DELETE',
            data: result
        });
        res.status(200).json({ message: 'Active application period terminated successfully.' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while terminating the active application period.",
        });
    }
}

async function addEventRequirement(req, res) {
    try {
        const { requirement_name, requirement_type } = req.body;

        // Accept optional file/template
        let filename = null;
        if (req.files && req.files.template) {
            const uploadedFile = req.files.template;

            // Ensure directory
            const requirementsDir = '/app/requirements';
            if (!fs.existsSync(requirementsDir)) fs.mkdirSync(requirementsDir, { recursive: true });

            filename = `requirement-${Date.now()}-${uploadedFile.name}`;
            const savePath = path.join(requirementsDir, filename);
            try {
                fs.writeFileSync(savePath, uploadedFile.data);
            } catch (writeError) {
                return res.status(500).json({ message: 'Error saving file', error: writeError.message });
            }
        }

        // Call model; filename may be null
        // Lookup user_id by email (optimized)
        const user = await requirementModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {
            return res.status(404).json({ message: 'User not found.' });
        }
        await requirementModel.addEventRequirement(requirement_name, requirement_type, filename, user.user_id);
        res.status(201).json({ message: 'Requirement created successfully' });
    } catch (err) {
        console.error('[addEventRequirement] error:', err);
        return res.status(500).json({ message: err.sqlMessage || err.message || "Internal server error" });
    }
}

async function batchUpdateEventRequirements(req, res) {
    try {
        const { add, update, delete: deleteItems, user_email } = req.body;

        // Parse JSON strings if they come as strings
        const addItems = Array.isArray(add) ? add : JSON.parse(add || '[]');
        const updateItems = Array.isArray(update) ? update : JSON.parse(update || '[]');
        const deleteItemsArray = Array.isArray(deleteItems) ? deleteItems : JSON.parse(deleteItems || '[]');

        // Get user_id from email
        const user = await requirementModel.getUserByEmail(user_email);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const results = {
            added: [],
            updated: [],
            deleted: []
        };

        const requirementsDir = '/app/requirements';
        if (!fs.existsSync(requirementsDir)) {
            fs.mkdirSync(requirementsDir, { recursive: true });
        }

        // Handle ADD operations
        for (let i = 0; i < addItems.length; i++) {
            const item = addItems[i];
            const fileKey = `add_file_${i}`;
            let filename = null;

            if (req.files && req.files[fileKey]) {
                const uploadedFile = req.files[fileKey];
                filename = `requirement-${Date.now()}-${uploadedFile.name}`;
                const savePath = path.join(requirementsDir, filename);
                try {
                    fs.writeFileSync(savePath, uploadedFile.data);
                } catch (writeError) {
                    console.error('Error saving file for ADD item:', writeError);
                    // skip this add item on file save failure
                    continue;
                }
            } else if (item.file_path !== undefined && item.file_path !== null && item.file_path !== '') {
                // client provided an existing file path to use
                filename = item.file_path;
            } else {
                // no file provided; allow NULL
                filename = null;
            }

            try {
                const result = await requirementModel.addEventRequirement(
                    item.requirement_name,
                    item.is_applicable_to,
                    filename,
                    user.user_id
                );
                results.added.push(Array.isArray(result) ? result[0] : result);
            } catch (err) {
                console.error('Error adding requirement item:', err);
                continue;
            }
        }

        // Handle UPDATE operations
        for (let i = 0; i < updateItems.length; i++) {
            const item = updateItems[i];
            const fileKey = `update_file_${i}`;

            // Get current requirement to check existing file
            const specificArr = await requirementModel.getSpecificEventRequirement(item.requirement_id);
            const currentRequirement = Array.isArray(specificArr) ? specificArr[0] : specificArr;
            if (!currentRequirement) {
                console.warn('Update skipped: requirement not found', item.requirement_id);
                continue; // Skip if requirement not found
            }

            let p_file_path = null; // default: NULL => instruct SP to preserve existing file_path

            if (req.files && req.files[fileKey]) {
                // New file uploaded: delete old and save new
                const uploadedFile = req.files[fileKey];

                if (currentRequirement.file_path) {
                    const oldFilePath = path.join(requirementsDir, currentRequirement.file_path);
                    try {
                        if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
                    } catch (fileErr) {
                        console.error('Error deleting old file during update:', fileErr);
                        // continue — we still attempt to save new file
                    }
                }

                const filename = `requirement-${Date.now()}-${uploadedFile.name}`;
                const savePath = path.join(requirementsDir, filename);
                try {
                    fs.writeFileSync(savePath, uploadedFile.data);
                    p_file_path = filename; // pass filename so SP will update file_path
                } catch (writeError) {
                    console.error('Error saving new file for update:', writeError);
                    continue; // skip this update if file save fails
                }
            } else if (Object.prototype.hasOwnProperty.call(item, 'file_path')) {
                // Client explicitly provided file_path:
                // - empty string -> explicit clear (SP treats '' => NULL)
                // - non-empty string -> set to that value
                if (item.file_path === '') {
                    p_file_path = ''; // SP will convert '' => NULL
                } else if (item.file_path === null) {
                    p_file_path = null; // preserve existing
                } else {
                    p_file_path = item.file_path;
                }
            } else {
                // No file info sent: keep existing file (pass NULL so SP preserves)
                p_file_path = null;
            }

            try {
                const result = await requirementModel.updateEventRequirement(
                    item.requirement_id,
                    item.requirement_name,
                    item.is_applicable_to,
                    p_file_path,
                    user.user_id
                );
                results.updated.push(Array.isArray(result) ? result[0] : result);
            } catch (err) {
                console.error('Error updating requirement item:', err);
                continue;
            }
        }

        // Handle DELETE (Archive) operations
        for (const item of deleteItemsArray) {
            try {
                // Archive the requirement instead of deleting
                const result = await requirementModel.archiveEventRequirement(
                    item.requirement_id,
                    user.user_id
                );
                results.deleted.push(Array.isArray(result) ? result[0] : result);
            } catch (error) {
                console.error('Error archiving requirement:', error);
                continue; // Continue with other deletions
            }
        }

        // Publish updates to SSE channels (only if there are changes)
        if (results.added.length > 0) {
            publishToChannel('event_requirements', {
                operation: 'BATCH_ADD',
                data: results.added
            });
        }

        if (results.updated.length > 0) {
            publishToChannel('event_requirements', {
                operation: 'BATCH_UPDATE',
                data: results.updated
            });
        }

        if (results.deleted.length > 0) {
            publishToChannel('event_requirements', {
                operation: 'BATCH_ARCHIVE',
                data: results.deleted
            });
        }

        res.status(200).json({
            message: 'Event requirements batch update completed successfully',
            results: {
                added: results.added.length,
                updated: results.updated.length,
                archived: results.deleted.length
            },
            data: results
        });

    } catch (error) {
        console.error('Batch update error:', error);
        res.status(500).json({
            error: error.message || "An error occurred during batch update of event requirements."
        });
    }
}

async function getEventRequirementTemplate(req, res) {
    const template_name = req.query.template_name;
    try {
        res.setHeader('X-Accel-Redirect', `/protected-requirements/${template_name}`);
        const match = template_name.match(/requirement-(\d+)-(.+)/);
        // Use the original filename if available, fallback to template_name
        const downloadName = match[0];
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        // Optionally, send a short message for debugging (remove in production)
        // res.end('File download triggered');
        res.end();
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the requirements.",
        });
    }
}



module.exports = {
    addRequirement,
    getRequirements,
    downloadTemplate,
    deleteRequirement,
    updateRequirement,
    addApplicationPeriod,
    getAllPeriodsWithApplications,
    getActiveApplicationPeriodSimple,
    getActiveApplicationPeriod,
    updateApplicationPeriod,
    terminateActiveApplicationPeriod,
    getEventRequirementTemplate,
    addEventRequirement,
    batchUpdateEventRequirements,
    initiateApprovalProcess
};
