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

        let data = await requirementModel.addRequirement(
            requirement_name.trim(),
            is_applicable_to,
            filename,
            req.user.user_id
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
    const { startDate, endDate, startTime, endTime } = req.body;
    try {

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const result = await requirementModel.addApplicationPeriod(startDate, endDate, startTime, endTime, req.user.user_id);
        res.status(201).json({ message: result });
        publishToChannel('application_periods', {
            operation: 'CREATE',
            data: result
        });

    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while adding the requirement period.",
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
    const { startDate, endDate, startTime, endTime, periodId } = req.body;
    try {
        const result = await requirementModel.updateApplicationPeriod(startDate, endDate, startTime, endTime, periodId);
        console.log('Updated application period:', result);
        publishToChannel('application_periods', {
            operation: 'UPDATE',
            data: result
        });
        res.status(200).json({ message: 'Requirement period updated successfully' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while updating the requirement period.",
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
        if (!req.files || !req.files.template) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const uploadedFile = req.files.template;

        // Save file to disk
        const requirementsDir = '/app/requirements';
        if (!fs.existsSync(requirementsDir)) {
            fs.mkdirSync(requirementsDir, { recursive: true });
        }
        const filename = `requirement-${Date.now()}-${uploadedFile.name}`;
        const savePath = path.join(requirementsDir, filename);

        try {
            fs.writeFileSync(savePath, uploadedFile.data);
        } catch (writeError) {
            return res.status(500).json({ message: 'Error saving file', error: writeError.message });
        }

        await requirementModel.addEventRequirement(requirement_name, requirement_type, filename, req.user.user_id);
        res.status(201).json({ message: 'Requirement uploaded successfully' });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
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

        // Handle ADD operations
        for (let i = 0; i < addItems.length; i++) {
            const item = addItems[i];
            const fileKey = `add_file_${i}`;
            
            if (req.files && req.files[fileKey]) {
                const uploadedFile = req.files[fileKey];
                
                // Save file to disk
                const requirementsDir = '/app/requirements';
                if (!fs.existsSync(requirementsDir)) {
                    fs.mkdirSync(requirementsDir, { recursive: true });
                }
                
                const filename = `requirement-${Date.now()}-${uploadedFile.name}`;
                const savePath = path.join(requirementsDir, filename);
                
                try {
                    fs.writeFileSync(savePath, uploadedFile.data);
                } catch (writeError) {
                    console.error('Error saving file:', writeError);
                    continue; // Skip this item if file save fails
                }
                
                // Add to database
                const result = await requirementModel.addEventRequirement(
                    item.requirement_name, 
                    item.is_applicable_to, 
                    filename, 
                    user.user_id
                );
                results.added.push(result);
            } else if (item.file_path) {
                // Use existing file path (if updating with existing file)
                const result = await requirementModel.addEventRequirement(
                    item.requirement_name, 
                    item.is_applicable_to, 
                    item.file_path, 
                    user.user_id
                );
                results.added.push(result);
            }
        }

        // Handle UPDATE operations
        for (let i = 0; i < updateItems.length; i++) {
            const item = updateItems[i];
            const fileKey = `update_file_${i}`;
            
            // Get current requirement to check existing file
            const [currentRequirement] = await requirementModel.getSpecificEventRequirement(item.requirement_id);
            if (!currentRequirement) {
                continue; // Skip if requirement not found
            }
            
            let newFileName = currentRequirement.file_path;
            
            if (req.files && req.files[fileKey]) {
                // New file uploaded
                const uploadedFile = req.files[fileKey];
                
                // Delete old file if it exists
                if (currentRequirement.file_path) {
                    const oldFilePath = path.join('/app/requirements', currentRequirement.file_path);
                    try {
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    } catch (fileErr) {
                        console.error('Error deleting old file:', fileErr);
                    }
                }
                
                // Save new file
                const filename = `requirement-${Date.now()}-${uploadedFile.name}`;
                const savePath = path.join('/app/requirements', filename);
                
                try {
                    fs.writeFileSync(savePath, uploadedFile.data);
                    newFileName = filename;
                } catch (writeError) {
                    console.error('Error saving new file:', writeError);
                    continue; // Skip this update if file save fails
                }
            }
            
            // Update in database
            const result = await requirementModel.updateEventRequirement(
                item.requirement_id,
                item.requirement_name,
                item.is_applicable_to,
                newFileName,
                user.user_id
            );
            results.updated.push(result);
        }

        // Handle DELETE (Archive) operations
        for (const item of deleteItemsArray) {
            try {
                // Archive the requirement instead of deleting
                const result = await requirementModel.archiveEventRequirement(
                    item.requirement_id,
                    user.user_id
                );
                results.deleted.push(result);
            } catch (error) {
                console.error('Error archiving requirement:', error);
                continue; // Continue with other deletions
            }
        }

        // Publish updates to SSE channels
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
};
