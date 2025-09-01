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
    if (!['new', 'renew', 'both', undefined, null, ''].includes(is_applicable_to)) {
      return res.status(400).json({ message: 'Invalid type selection' });
    }
    if (!is_applicable_to) is_applicable_to = 'new';

    let filename = null;
    if (req.files && req.files.template) {
      const uploadedFile = req.files.template;
      console.log('Raw uploaded file details:', {
        name: uploadedFile.name,
        size: uploadedFile.size,
        mimetype: uploadedFile.mimetype
      });
      
      const requirementsDir = '/app/requirements';
      if (!fs.existsSync(requirementsDir)) fs.mkdirSync(requirementsDir, { recursive: true });

      const ext = path.extname(uploadedFile.name).toLowerCase();
      console.log('Uploaded file extension:', ext);

      const allowed = ['.pdf', '.docx', '.xlsx', '.doc', '.xls', '.txt'];
      if (!allowed.includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Allowed: pdf, docx, xlsx, doc, xls, txt' });
      }

      const baseName = path.basename(uploadedFile.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      console.log('Processed filename components:', { originalName: uploadedFile.name, ext, baseName });
      filename = `requirement-${Date.now()}-${baseName}${ext}`;
      fs.writeFileSync(path.join(requirementsDir, filename), uploadedFile.data);
    }

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

    // Broadcast full list via SNAPSHOT
    const fullList = await requirementModel.getRequirements();
    publishToChannel('application_requirements', {
      channel: 'application_requirements',
      operation: 'SNAPSHOT',
      data: Array.isArray(fullList) ? fullList : []
    });

    res.status(201).json({ message: 'Requirement saved', requirement: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.sqlMessage || err.message || 'Internal server error' });
  }
}

async function getRequirements(req, res) {
  const { sessionId, type } = req.query;
  try {
    let filterType = null;

    if (type !== undefined && type !== null && type !== '') {
      const t = type.toString().toLowerCase().trim();
      if (!['new', 'renew'].includes(t)) {
        return res.status(400).json({ message: 'Invalid type filter (use new or renew)' });
      }
      filterType = t;
    } else {
      const perms = req.user?.permissions || [];
      const hasNew = perms.includes('APPLY_NEW_ORGANIZATION');
      const hasRenew = perms.includes('APPLY_RENEWAL_ORGANIZATION');
      if (hasNew && !hasRenew) filterType = 'new';
      else if (hasRenew && !hasNew) filterType = 'renew';
    }

    const requirements = await requirementModel.getRequirements(filterType);

    if (sessionId) {
      subscribeToChannel(sessionId, 'application_requirements');
      publishToChannel('application_requirements', {
        channel: 'application_requirements',
        operation: 'SNAPSHOT',
        data: Array.isArray(requirements) ? requirements : []
      });
    }

    res.json(requirements);
  } catch (error) {
    console.error('[getRequirements] error:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while fetching the requirements.'
    });
  }
}

async function downloadTemplate(req, res) {
  try {
    const raw = req.query.template_name;
    const view = req.query.view === '1' || req.query.view === 'true';
    console.log('[downloadTemplate] raw query:', raw, 'view:', view);

    if (!raw) return res.status(400).json({ message: 'template_name is required' });

    const template_name = decodeURIComponent(raw);
    console.log('[downloadTemplate] decoded template_name:', template_name);

    if (path.basename(template_name) !== template_name) {
      console.warn('[downloadTemplate] basename mismatch:', template_name);
      return res.status(400).json({ message: 'Invalid template_name' });
    }

    const requirementsDir = '/app/requirements';
    const filePath = path.join(requirementsDir, template_name);
    console.log('[downloadTemplate] resolved filePath:', filePath);

    if (!fs.existsSync(filePath)) {
      console.warn('[downloadTemplate] file NOT found at path:', filePath);
      return res.status(404).json({ message: 'Template not found', filePath });
    }

    const userFilename = template_name.replace(/^requirement-\d+-?/, '');

    // Use X-Accel for NGINX if enabled
    if (process.env.USE_X_ACCEL === '1') {
      res.setHeader(
        'Content-Disposition',
        view
          ? `inline; filename="${userFilename}"`
          : `attachment; filename="${userFilename}"`
      );
      res.setHeader('X-Accel-Redirect', `/protected-requirements/${template_name}`);
      return res.end();
    }

    // For direct serving, set Content-Disposition based on view param
    if (view) {
      res.setHeader('Content-Disposition', `inline; filename="${userFilename}"`);
      // Optionally set Content-Type based on file extension
      const ext = path.extname(userFilename).toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.txt': 'text/plain'
      };
      if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext]);
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
    const [requirement] = await requirementModel.getSpecificRequirement(requirement_id);
    if (!requirement) {
      return res.status(404).json({ message: requirement_id });
    }

    await requirementModel.deleteRequirement(requirement_id);

    // Publish full snapshot after delete
    const fullList = await requirementModel.getRequirements();
    publishToChannel('application_requirements', {
      channel: 'application_requirements',
      operation: 'SNAPSHOT',
      data: Array.isArray(fullList) ? fullList : []
    });

    // Remove file if present
    const filename = requirement.file_path;
    if (filename) {
      const filePath = path.join('/app/requirements', filename);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fileErr) {
        console.error('Error deleting file:', fileErr);
      }
    }

    res.status(200).json({ message: 'Requirement deleted successfully' });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An error occurred while deleting the requirement.'
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

    is_applicable_to = (is_applicable_to || '').toString().trim().toLowerCase();
    if (!['new', 'renew', 'both'].includes(is_applicable_to)) {
      return res.status(400).json({ message: 'Invalid type selection' });
    }

    console.log('[CTRL updateRequirement] body:', {
      id,
      requirement_name,
      is_applicable_to,
      hasFile: !!(req.files && req.files.template)
    });

    const existingArr = await requirementModel.getSpecificRequirement(id);
    const existing = existingArr[0];
    if (!existing) return res.status(404).json({ message: 'Requirement not found' });

    let newFileName = null;

    if (req.files && req.files.template) {
      if (existing.file_path) {
        const oldFile = path.join('/app/requirements', existing.file_path);
        if (fs.existsSync(oldFile)) {
          try {
            fs.unlinkSync(oldFile);
          } catch (e) {
            console.error('File delete error', e);
          }
        }
      }
      const uploadedFile = req.files.template;
      console.log('Update - Raw uploaded file details:', {
        name: uploadedFile.name,
        size: uploadedFile.size,
        mimetype: uploadedFile.mimetype
      });
      
      const ext = path.extname(uploadedFile.name).toLowerCase();
      console.log('Update - Uploaded file extension:', ext);

      const allowed = ['.pdf', '.docx', '.xlsx', '.doc', '.xls', '.txt'];
      if (!allowed.includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Allowed: pdf, docx, xlsx, doc, xls, txt' });
      }

      const baseName = path.basename(uploadedFile.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      console.log('Update - Processed filename components:', { originalName: uploadedFile.name, ext, baseName });
      newFileName = `requirement-${Date.now()}-${baseName}${ext}`;
      fs.writeFileSync(path.join('/app/requirements', newFileName), uploadedFile.data);
    }

    let data = await requirementModel.updateRequirement(id, requirement_name, is_applicable_to, newFileName);
    data = Array.isArray(data) ? data[0] : data;

    const fullList = await requirementModel.getRequirements();
    publishToChannel('application_requirements', {
      channel: 'application_requirements',
      operation: 'SNAPSHOT',
      data: Array.isArray(fullList) ? fullList : []
    });

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
        error: 'All fields (start_date, end_date, start_time, end_time) are required.'
      });
    }

    const result = await requirementModel.addApplicationPeriod(
      start_date,
      end_date,
      start_time,
      end_time,
      req.user.email
    );

    // Publish consistent update
    await publishApplicationPeriodUpdate();

    res.status(201).json({
      success: true,
      message: 'Application period created successfully.',
      data: result
    });
  } catch (error) {
    console.error('[addApplicationPeriod] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while creating the application period.'
    });
  }
}

async function getAllPeriodsWithApplications(req, res) {
  try {
    const periods = await requirementModel.getAllPeriodsWithApplications();
    res.json(periods);
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An error occurred while fetching periods with applications.'
    });
  }
}

async function getActiveApplicationPeriodSimple(req, res) {
  const { sessionId } = req.query;
  try {
    const period = await requirementModel.getActiveApplicationPeriodSimple();

    if (sessionId) {
      subscribeToChannel(sessionId, 'application_periods');
      publishToChannel('application_periods', {
        channel: 'application_periods',
        operation: 'SNAPSHOT',
        data: Array.isArray(period) ? period : [period].filter(Boolean)
      });
    }

    if (!period || period.length === 0) {
      return res.status(404).json({ message: 'No active application period found.' });
    }
    res.json(period);
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An error occurred while fetching the active application period.'
    });
  }
}

async function getActiveApplicationPeriod(req, res) {
  const { sessionId } = req.query;
  try {
    const activePeriod = await requirementModel.getActiveApplicationPeriod();
    
    // Ensure consistent data structure - always return array
    const dataToPublish = Array.isArray(activePeriod) 
      ? activePeriod 
      : (activePeriod ? [activePeriod] : []);

    if (sessionId) {
      subscribeToChannel(sessionId, 'application_periods');
      // Publish with consistent structure
      publishToChannel('application_periods', {
        channel: 'application_periods',
        operation: 'SNAPSHOT',
        data: dataToPublish
      });
    }

    res.status(200).json(dataToPublish); // Return array consistently
  } catch (error) {
    console.error('[getActiveApplicationPeriod] Error:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while fetching the active application period.'
    });
  }
}

async function publishApplicationPeriodUpdate() {
  try {
    const activePeriods = await requirementModel.getActiveApplicationPeriod();
    const dataToPublish = Array.isArray(activePeriods) 
      ? activePeriods 
      : (activePeriods ? [activePeriods] : []);
    
    publishToChannel('application_periods', {
      channel: 'application_periods',
      operation: 'SNAPSHOT',
      data: dataToPublish
    });
    
    console.log('[publishApplicationPeriodUpdate] Published:', dataToPublish.length, 'periods');
  } catch (error) {
    console.error('[publishApplicationPeriodUpdate] Error:', error);
  }
}

async function updateApplicationPeriod(req, res) {
  try {
    console.log('[updateApplicationPeriod] req.body:', req.body);

    const period_id = req.body.period_id || req.body.id || req.body.periodId;
    const start_date = req.body.start_date || req.body.startDate || req.body.start;
    const end_date = req.body.end_date || req.body.endDate || req.body.end;
    const start_time = req.body.start_time || req.body.startTime;
    const end_time = req.body.end_time || req.body.endTime;

    if (!start_date || !end_date || !start_time || !end_time || !period_id) {
      return res.status(400).json({
        error: 'All fields (start_date, end_date, start_time, end_time, period_id) are required.',
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

    // Publish consistent update
    await publishApplicationPeriodUpdate();

    res.status(200).json({
      success: true,
      message: 'Application period updated successfully.',
      data: result
    });
  } catch (error) {
    console.error('[updateApplicationPeriod] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while updating the application period.'
    });
  }
}

async function initiateApprovalProcess(req, res) {
  try {
    const { application_id } = req.body;

    if (!application_id) {
      return res.status(400).json({
        error: 'application_id is required.'
      });
    }

    const result = await requirementModel.initiateApprovalProcess(application_id, req.user.email);

    res.status(200).json({
      success: true,
      message: 'Approval process initiated successfully.',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while initiating the approval process.'
    });
  }
}

async function terminateActiveApplicationPeriod(req, res) {
  try {
    const user = await requirementModel.getUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await requirementModel.terminateActiveApplicationPeriod(user.user_id);

    // Publish empty array consistently
    publishToChannel('application_periods', {
      channel: 'application_periods',
      operation: 'SNAPSHOT',
      data: []
    });

    res.status(200).json({ 
      success: true,
      message: 'Active application period terminated successfully.' 
    });
  } catch (error) {
    console.error('[terminateActiveApplicationPeriod] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while terminating the active application period.'
    });
  }
}

async function addEventRequirement(req, res) {
  try {
    const { requirement_name, requirement_type } = req.body;

    let filename = null;
    if (req.files && req.files.template) {
      const uploadedFile = req.files.template;
      const requirementsDir = '/app/requirements';
      if (!fs.existsSync(requirementsDir)) fs.mkdirSync(requirementsDir, { recursive: true });

      const ext = path.extname(uploadedFile.name).toLowerCase();
      console.log('Event req - Uploaded file extension:', ext);

      const allowed = ['.pdf', '.docx', '.xlsx', '.doc', '.xls', '.txt'];
      if (!allowed.includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Allowed: pdf, docx, xlsx, doc, xls, txt' });
      }

      const baseName = path.basename(uploadedFile.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      filename = `requirement-${Date.now()}-${baseName}${ext}`;
      const savePath = path.join(requirementsDir, filename);
      try {
        fs.writeFileSync(savePath, uploadedFile.data);
      } catch (writeError) {
        return res.status(500).json({ message: 'Error saving file', error: writeError.message });
      }
    }

    const user = await requirementModel.getUserByEmail(req.user.email);
    if (!user || !user.user_id) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await requirementModel.addEventRequirement(requirement_name, requirement_type, filename, user.user_id);

    // Try to publish full snapshot (if model has a getter); otherwise skip
    try {
      const fullEventReqs = await (requirementModel.getEventRequirements?.());
      if (Array.isArray(fullEventReqs)) {
        publishToChannel('event_requirements', {
          channel: 'event_requirements',
          operation: 'SNAPSHOT',
          data: fullEventReqs
        });
      }
    } catch (e) {
      // Silent fallback if getter is not available
      console.warn('[addEventRequirement] snapshot publish skipped:', e?.message);
    }

    res.status(201).json({ message: 'Requirement created successfully' });
  } catch (err) {
    console.error('[addEventRequirement] error:', err);
    return res.status(500).json({ message: err.sqlMessage || err.message || 'Internal server error' });
  }
}

async function batchUpdateEventRequirements(req, res) {
  try {
    const { add, update, delete: deleteItems, user_email } = req.body;

    const addItems = Array.isArray(add) ? add : JSON.parse(add || '[]');
    const updateItems = Array.isArray(update) ? update : JSON.parse(update || '[]');
    const deleteItemsArray = Array.isArray(deleteItems) ? deleteItems : JSON.parse(deleteItems || '[]');

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

    // ADD
    for (let i = 0; i < addItems.length; i++) {
      const item = addItems[i];
      const fileKey = `add_file_${i}`;
      let filename = null;

      if (req.files && req.files[fileKey]) {
        const uploadedFile = req.files[fileKey];
        
        const ext = path.extname(uploadedFile.name).toLowerCase();
        console.log('Batch ADD - Uploaded file extension:', ext);

        const allowed = ['.pdf', '.docx', '.xlsx', '.doc', '.xls', '.txt'];
        if (!allowed.includes(ext)) {
          console.error(`Invalid file type for ADD item: ${ext}. Allowed: pdf, docx, xlsx, doc, xls, txt`);
          continue;
        }

        const baseName = path.basename(uploadedFile.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        filename = `requirement-${Date.now()}-${baseName}${ext}`;
        const savePath = path.join(requirementsDir, filename);
        try {
          fs.writeFileSync(savePath, uploadedFile.data);
        } catch (writeError) {
          console.error('Error saving file for ADD item:', writeError);
          continue;
        }
      } else if (item.file_path !== undefined && item.file_path !== null && item.file_path !== '') {
        filename = item.file_path;
      } else {
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

    // UPDATE
    for (let i = 0; i < updateItems.length; i++) {
      const item = updateItems[i];
      const fileKey = `update_file_${i}`;

      const specificArr = await requirementModel.getSpecificEventRequirement(item.requirement_id);
      const currentRequirement = Array.isArray(specificArr) ? specificArr[0] : specificArr;
      if (!currentRequirement) {
        console.warn('Update skipped: requirement not found', item.requirement_id);
        continue;
      }

      let p_file_path = null;

      if (req.files && req.files[fileKey]) {
        const uploadedFile = req.files[fileKey];
        
        const ext = path.extname(uploadedFile.name).toLowerCase();
        console.log('Batch UPDATE - Uploaded file extension:', ext);

        const allowed = ['.pdf', '.docx', '.xlsx', '.doc', '.xls', '.txt'];
        if (!allowed.includes(ext)) {
          console.error(`Invalid file type for UPDATE item: ${ext}. Allowed: pdf, docx, xlsx, doc, xls, txt`);
          continue;
        }

        if (currentRequirement.file_path) {
          const oldFilePath = path.join(requirementsDir, currentRequirement.file_path);
          try {
            if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
          } catch (fileErr) {
            console.error('Error deleting old file during update:', fileErr);
          }
        }

        const baseName = path.basename(uploadedFile.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const filename = `requirement-${Date.now()}-${baseName}${ext}`;
        const savePath = path.join(requirementsDir, filename);
        try {
          fs.writeFileSync(savePath, uploadedFile.data);
          p_file_path = filename;
        } catch (writeError) {
          console.error('Error saving new file for update:', writeError);
          continue;
        }
      } else if (Object.prototype.hasOwnProperty.call(item, 'file_path')) {
        if (item.file_path === '') {
          p_file_path = '';
        } else if (item.file_path === null) {
          p_file_path = null;
        } else {
          p_file_path = item.file_path;
        }
      } else {
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

    // DELETE (archive)
    for (const item of deleteItemsArray) {
      try {
        const result = await requirementModel.archiveEventRequirement(
          item.requirement_id,
          user.user_id
        );
        results.deleted.push(Array.isArray(result) ? result[0] : result);
      } catch (error) {
        console.error('Error archiving requirement:', error);
        continue;
      }
    }

    // Prefer SNAPSHOT of full list to avoid merge issues in client
    try {
      const fullEventReqs = await (requirementModel.getEventRequirements?.());
      if (Array.isArray(fullEventReqs)) {
        publishToChannel('event_requirements', {
          channel: 'event_requirements',
          operation: 'SNAPSHOT',
          data: fullEventReqs
        });
      } else {
        // Fallback to per-batch operations with channel if getter not available
        if (results.added.length > 0) {
          publishToChannel('event_requirements', {
            channel: 'event_requirements',
            operation: 'CREATE',
            data: results.added
          });
        }
        if (results.updated.length > 0) {
          publishToChannel('event_requirements', {
            channel: 'event_requirements',
            operation: 'UPDATE',
            data: results.updated
          });
        }
        if (results.deleted.length > 0) {
          publishToChannel('event_requirements', {
            channel: 'event_requirements',
            operation: 'DELETE',
            data: results.deleted
          });
        }
      }
    } catch (e) {
      console.warn('[batchUpdateEventRequirements] snapshot publish skipped:', e?.message);
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
      error: error.message || 'An error occurred during batch update of event requirements.'
    });
  }
}

async function getEventRequirementTemplate(req, res) {
  const template_name = req.query.template_name;
  try {
    res.setHeader('X-Accel-Redirect', `/protected-requirements/${template_name}`);
    const match = template_name.match(/requirement-(\d+)-(.+)/);
    const downloadName = match ? match[0] : template_name;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.end();
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An error occurred while fetching the requirements.'
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