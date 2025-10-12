# Event Requirement Submission - Viewed Status Feature

## Overview
Added a "Viewed" status to track when event requirement submissions are viewed by authorized users. This enhancement maintains backward compatibility while providing better tracking of submission review progress.

---

## Database Changes

### 1. Table Schema Update

**Table:** `tbl_event_requirement_submissions`

**Changes:**
```sql
-- OLD ENUM
status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending'

-- NEW ENUM (added 'Viewed')
status ENUM('Pending', 'Approved', 'Rejected', 'Viewed') DEFAULT 'Pending'

-- NEW FIELDS
viewed_by VARCHAR(200) NULL,
viewed_at TIMESTAMP NULL,

-- NEW FOREIGN KEY
FOREIGN KEY (viewed_by) REFERENCES tbl_user(user_id)
```

**Complete Updated Schema:**
```sql
CREATE TABLE tbl_event_requirement_submissions (
    submission_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT,
    event_application_id INT,
    requirement_id INT NOT NULL,
    cycle_number INT NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected', 'Viewed') DEFAULT 'Pending',
    organization_id INT NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    submitted_by VARCHAR(200) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    viewed_by VARCHAR(200) NULL,                    -- NEW: Who viewed it
    viewed_at TIMESTAMP NULL,                       -- NEW: When it was viewed
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id),
    FOREIGN KEY (event_application_id) REFERENCES tbl_event_application(event_application_id),
    FOREIGN KEY (requirement_id) REFERENCES tbl_event_application_requirement(requirement_id),
    FOREIGN KEY (submitted_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (viewed_by) REFERENCES tbl_user(user_id),  -- NEW
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE
);
```

### 2. New Stored Procedure

**Procedure:** `MarkEventRequirementAsViewed`

**Purpose:** Updates submission status to 'Viewed' when a user views the requirement

**Parameters:**
- `p_submission_id INT` - The submission to mark as viewed
- `p_user_email VARCHAR(100)` - Email of the user viewing the submission

**Logic:**
```sql
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE MarkEventRequirementAsViewed(
    IN p_submission_id INT,
    IN p_user_email VARCHAR(100)
)
BEGIN
    -- Resolves user_id from email
    -- Gets current status
    -- Updates to 'Viewed' ONLY if status is 'Pending' or 'Viewed'
    -- Does NOT change 'Approved' or 'Rejected' status
    -- Records viewer and timestamp
    -- Logs the action via LogAction
    -- Returns updated submission with full details
END$$
DELIMITER ;
```

**Status Transition Rules:**
- ✅ **Pending** → Viewed (allowed)
- ✅ **Viewed** → Viewed (allowed, updates timestamp)
- ❌ **Approved** → Viewed (blocked, maintains Approved)
- ❌ **Rejected** → Viewed (blocked, maintains Rejected)

**Security:**
- Validates user exists before proceeding
- Validates submission exists before updating
- Logs all view actions for audit trail

### 3. Updated Stored Procedure

**Procedure:** `GetEventRequirementSubmissions`

**Changes:** Added viewer information to result set

**New Fields in Result:**
```sql
-- Existing fields...
ers.status,                    -- Now includes 'Viewed' option
ers.viewed_by,                 -- NEW: Viewer user_id
v.f_name AS viewer_f_name,     -- NEW: Viewer first name
v.l_name AS viewer_l_name,     -- NEW: Viewer last name
v.email AS viewer_email,       -- NEW: Viewer email
ers.viewed_at                  -- NEW: View timestamp
```

---

## API Implementation

### 1. Node.js Model

**File:** `node-app/web/models/eventModel.js`

**New Function:**
```javascript
async function markEventRequirementAsViewed(submission_id, user_email) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL MarkEventRequirementAsViewed(?, ?);',
      [submission_id, user_email]
    );
    return rows[0]?.[0] || null;
  } finally {
    connection.release();
  }
}
```

**Updated Exports:**
```javascript
module.exports = {
  // ... existing exports
  markEventRequirementAsViewed,  // NEW
  // ... remaining exports
};
```

### 2. Node.js Controller

**File:** `node-app/web/controllers/eventController.js`

**New Function:**
```javascript
async function markEventRequirementAsViewed(req, res) {
  try {
    const { submission_id } = req.params;
    const user_email = req.user?.email;

    if (!submission_id) {
      return res.status(400).json({ message: "submission_id is required." });
    }

    if (!user_email) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const result = await eventModel.markEventRequirementAsViewed(
      parseInt(submission_id),
      user_email
    );

    if (!result) {
      return res.status(404).json({ 
        message: "Submission not found or could not be updated." 
      });
    }

    res.status(200).json({
      message: "Event requirement marked as viewed successfully.",
      submission: result
    });
  } catch (error) {
    console.error('[markEventRequirementAsViewed] Error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while marking requirement as viewed.",
    });
  }
}
```

### 3. Route

**File:** `node-app/web/routes/events.js`

**New Route:**
```javascript
router.put(
  '/event-requirements/submissions/:submission_id/mark-viewed',
  middleware.validateAzureJWT,
  middleware.hasPermission("VIEW_EVENT"),
  eventController.markEventRequirementAsViewed
);
```

**Permissions Required:**
- `VIEW_EVENT` - User must have event viewing permissions

---

## API Usage

### Endpoint
```
PUT /event-requirements/submissions/:submission_id/mark-viewed
```

### Authentication
- **Required:** Yes (Azure JWT)
- **Permission:** VIEW_EVENT

### Request

**URL Parameters:**
- `submission_id` (integer) - The ID of the submission to mark as viewed

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Example:**
```bash
curl -X PUT \
  https://your-api.com/event-requirements/submissions/123/mark-viewed \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json"
```

### Response

**Success (200 OK):**
```json
{
  "message": "Event requirement marked as viewed successfully.",
  "submission": {
    "submission_id": 123,
    "event_id": 45,
    "event_title": "Annual Conference 2024",
    "event_application_id": 67,
    "requirement_id": 12,
    "requirement_name": "Post-Event Report",
    "status": "Viewed",
    "file_path": "organizations/5/10/events/45/requirements/report-123.pdf",
    "submitted_by": "USER123",
    "submitted_by_name": "John Doe",
    "submitted_at": "2024-01-15T10:30:00.000Z",
    "viewed_by": "ADMIN456",
    "viewed_by_name": "Jane Admin",
    "viewed_at": "2024-01-15T14:45:00.000Z",
    "organization_id": 5,
    "cycle_number": 1
  }
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "message": "submission_id is required."
}
```

**401 Unauthorized:**
```json
{
  "message": "User not authenticated."
}
```

**404 Not Found:**
```json
{
  "message": "Submission not found or could not be updated."
}
```

**500 Internal Server Error:**
```json
{
  "error": "Database error message"
}
```

---

## Status Flow Diagram

```
┌─────────┐
│ Pending │ ◄─── Initial state when submitted
└────┬────┘
     │
     ├──► View Button Clicked ──► ┌────────┐
     │                             │ Viewed │
     │                             └────────┘
     │
     ├──► Approve Action ────────► ┌──────────┐
     │                             │ Approved │ (Cannot change to Viewed)
     │                             └──────────┘
     │
     └──► Reject Action ─────────► ┌──────────┐
                                   │ Rejected │ (Cannot change to Viewed)
                                   └──────────┘
```

---

## Backward Compatibility

### Database Level
✅ **Fully backward compatible**
- New ENUM value 'Viewed' added without breaking existing values
- New columns `viewed_by` and `viewed_at` are nullable
- Existing queries continue to work
- Default status remains 'Pending'

### API Level
✅ **Fully backward compatible**
- New endpoint is optional (existing flows unaffected)
- Existing endpoints return new fields (safe for clients to ignore)
- `GetEventRequirementSubmissions` includes new fields but doesn't break existing parsers

### Frontend Impact
⚠️ **Optional updates needed:**
- Can continue using existing status values (Pending/Approved/Rejected)
- To utilize new feature:
  - Add "View" button in UI
  - Call new endpoint when clicked
  - Display viewed status and viewer info

---

## Use Cases

### 1. **Track Review Progress**
**Scenario:** SDAO wants to know which submissions have been reviewed

**Before:**
- No way to differentiate between "not yet looked at" vs "reviewed but not decided"

**After:**
```javascript
// Fetch submissions
GET /event-requirements/submissions?event_id=45

// Mark as viewed when admin opens the file
PUT /event-requirements/submissions/123/mark-viewed

// Result: Status changes from 'Pending' to 'Viewed'
```

### 2. **Audit Trail**
**Scenario:** Need to track who reviewed which submission and when

**Query:**
```sql
SELECT 
    submission_id,
    requirement_name,
    CONCAT(submitter.f_name, ' ', submitter.l_name) AS submitted_by,
    submitted_at,
    CONCAT(viewer.f_name, ' ', viewer.l_name) AS viewed_by,
    viewed_at,
    status
FROM tbl_event_requirement_submissions ers
LEFT JOIN tbl_user submitter ON ers.submitted_by = submitter.user_id
LEFT JOIN tbl_user viewer ON ers.viewed_by = viewer.user_id
WHERE viewed_at IS NOT NULL
ORDER BY viewed_at DESC;
```

### 3. **Dashboard Statistics**
**Scenario:** Show submission review metrics

**Queries:**
```sql
-- Pending (not yet viewed)
SELECT COUNT(*) FROM tbl_event_requirement_submissions 
WHERE status = 'Pending';

-- Viewed (reviewed but not decided)
SELECT COUNT(*) FROM tbl_event_requirement_submissions 
WHERE status = 'Viewed';

-- Approved
SELECT COUNT(*) FROM tbl_event_requirement_submissions 
WHERE status = 'Approved';

-- Rejected
SELECT COUNT(*) FROM tbl_event_requirement_submissions 
WHERE status = 'Rejected';
```

---

## Frontend Integration Example

### React Component Example

```jsx
import React, { useState } from 'react';
import axios from 'axios';

function EventRequirementCard({ submission }) {
  const [status, setStatus] = useState(submission.status);
  const [viewedInfo, setViewedInfo] = useState({
    viewed_by: submission.viewed_by_name,
    viewed_at: submission.viewed_at
  });

  const handleViewClick = async () => {
    try {
      const response = await axios.put(
        `/event-requirements/submissions/${submission.submission_id}/mark-viewed`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      // Update UI
      setStatus(response.data.submission.status);
      setViewedInfo({
        viewed_by: response.data.submission.viewed_by_name,
        viewed_at: response.data.submission.viewed_at
      });

      alert('Marked as viewed!');
    } catch (error) {
      console.error('Error marking as viewed:', error);
      alert('Failed to mark as viewed');
    }
  };

  return (
    <div className="submission-card">
      <h3>{submission.requirement_name}</h3>
      <p>Status: <span className={`status-${status}`}>{status}</span></p>
      <p>Submitted by: {submission.submitted_by_name}</p>
      <p>Submitted at: {new Date(submission.submitted_at).toLocaleString()}</p>
      
      {viewedInfo.viewed_at && (
        <p>
          Viewed by {viewedInfo.viewed_by} at{' '}
          {new Date(viewedInfo.viewed_at).toLocaleString()}
        </p>
      )}

      <div className="actions">
        {status === 'Pending' && (
          <button onClick={handleViewClick} className="btn-view">
            View Submission
          </button>
        )}
        
        <a 
          href={`/files/${submission.file_path}`} 
          target="_blank" 
          className="btn-download"
        >
          Download
        </a>
      </div>
    </div>
  );
}
```

---

## Testing Checklist

### Database Level
- [ ] Status ENUM accepts 'Viewed' value
- [ ] viewed_by foreign key constraint works
- [ ] viewed_at timestamp records correctly
- [ ] Pending → Viewed transition allowed
- [ ] Approved/Rejected → Viewed blocked
- [ ] GetEventRequirementSubmissions returns new fields
- [ ] MarkEventRequirementAsViewed creates audit log

### API Level
- [ ] PUT endpoint requires authentication
- [ ] PUT endpoint requires VIEW_EVENT permission
- [ ] Returns 400 if submission_id missing
- [ ] Returns 401 if not authenticated
- [ ] Returns 404 if submission not found
- [ ] Returns 200 with updated submission
- [ ] Updates database correctly
- [ ] Logs action properly

### Integration
- [ ] Frontend can call new endpoint
- [ ] UI updates after marking viewed
- [ ] Viewer info displays correctly
- [ ] Status badge shows correct color
- [ ] Existing functionality unaffected

---

## Migration Notes

### Deployment Steps

1. **Database Migration:**
   ```sql
   -- Update table schema
   ALTER TABLE tbl_event_requirement_submissions 
   MODIFY COLUMN status ENUM('Pending', 'Approved', 'Rejected', 'Viewed') DEFAULT 'Pending';
   
   ALTER TABLE tbl_event_requirement_submissions 
   ADD COLUMN viewed_by VARCHAR(200) NULL AFTER submitted_at,
   ADD COLUMN viewed_at TIMESTAMP NULL AFTER viewed_by,
   ADD FOREIGN KEY (viewed_by) REFERENCES tbl_user(user_id);
   
   -- Create new stored procedure
   -- (Run MarkEventRequirementAsViewed creation script)
   
   -- Update existing stored procedure
   -- (Run updated GetEventRequirementSubmissions script)
   ```

2. **Backend Deployment:**
   - Deploy updated Node.js code
   - Restart Node.js server

3. **Frontend Updates (Optional):**
   - Add "View" button to submission cards
   - Display viewer information
   - Update status badges to include 'Viewed'

### Rollback Plan

**If issues occur:**
```sql
-- Remove new columns
ALTER TABLE tbl_event_requirement_submissions 
DROP FOREIGN KEY tbl_event_requirement_submissions_ibfk_viewed;

ALTER TABLE tbl_event_requirement_submissions 
DROP COLUMN viewed_by,
DROP COLUMN viewed_at;

-- Revert ENUM
ALTER TABLE tbl_event_requirement_submissions 
MODIFY COLUMN status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending';

-- Drop new procedure
DROP PROCEDURE IF EXISTS MarkEventRequirementAsViewed;
```

---

## Related Documentation
- Event Application Flow
- Event Requirements Management
- Audit Trail System

---

## Summary

The "Viewed" status enhancement provides better tracking of event requirement submission reviews while maintaining full backward compatibility. Organizations can now distinguish between submissions that haven't been reviewed yet (Pending) and those that have been viewed but are awaiting approval decisions (Viewed). The feature includes proper audit logging and preserves final decision statuses (Approved/Rejected).

**Key Benefits:**
✅ Better review progress tracking
✅ Audit trail of who viewed what and when
✅ No breaking changes to existing functionality
✅ Simple frontend integration
✅ Proper permission controls
