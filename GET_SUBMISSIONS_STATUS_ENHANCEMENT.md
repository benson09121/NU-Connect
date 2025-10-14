# Get Event Requirement Submissions by Organization - Enhancement

## Overview
Enhanced the `GetEventRequirementSubmissionsByOrganization` stored procedure to include submission status and viewer information for better tracking and transparency.

## What Changed

### Database Changes
Updated stored procedure `GetEventRequirementSubmissionsByOrganization` to return additional fields:
- `status` - Current status of submission (Pending, Viewed, Approved, Rejected)
- `viewed_by` - User ID who viewed the submission
- `viewed_by_first_name` - First name of the viewer
- `viewed_by_last_name` - Last name of the viewer
- `viewed_by_email` - Email of the viewer
- `viewed_at` - Timestamp when submission was viewed

### API Response Format
**Endpoint:** `GET /api/web/organizations/event-requirement-submissions?organization_id={id}`

**Response Structure (Enhanced):**
```json
[
  {
    "submission_id": 1,
    "event_id": 1,
    "event_title": "TIS Event 1",
    "event_application_id": 1,
    "cycle_number": 1,
    "organization_id": 1,
    "organization_name": "CS Tech Innovators Society",
    "requirement_id": 1,
    "requirement_name": "Event Proposal",
    "is_applicable_to": "pre-event",
    "file_path": "uploads/events/1-1.pdf",
    "submitted_by": "6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0",
    "submitted_by_first_name": "Benson",
    "submitted_by_last_name": "Javier",
    "submitted_by_email": "javierbb@students.nu-dasma.edu.ph",
    "submitted_at": "2025-10-14 15:47:58",
    
    // NEW FIELDS
    "status": "Approved",
    "viewed_by": "user_id_here",
    "viewed_by_first_name": "John",
    "viewed_by_last_name": "Doe",
    "viewed_by_email": "john.doe@example.com",
    "viewed_at": "2025-10-14 16:00:00"
  }
]
```

### Status Values
- **Pending** - Newly submitted, not yet viewed
- **Viewed** - SDAO has viewed the submission
- **Approved** - SDAO approved the submission
- **Rejected** - SDAO rejected the submission

## Files Modified

### 1. Database Procedure
**File:** `mysql/init.sql`
- Updated `GetEventRequirementSubmissionsByOrganization` procedure
- Added LEFT JOIN to `tbl_user` for viewer details
- Added 6 new fields to SELECT statement

### 2. Migration Script
**File:** `mysql/migrations/add_status_viewed_details_to_get_submissions.sql`
- Migration to update the procedure in production
- Applied: 2025-10-14 16:17:04

### 3. Model & Controller
**Files:** 
- `node-app/web/models/organizationsModel.js`
- `node-app/web/controllers/organizationsController.js`

**No changes needed** - They automatically return the new fields from the stored procedure.

## Testing

### Test Query
```sql
-- Get all submissions for organization 1
CALL GetEventRequirementSubmissionsByOrganization(1);
```

### Test API Endpoint
```bash
# Using curl
curl -X GET "http://localhost:3000/api/web/organizations/event-requirement-submissions?organization_id=1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Expected Results
All submissions should include:
- ✅ Status field (Pending/Viewed/Approved/Rejected)
- ✅ Viewer information (name and email) if viewed
- ✅ Viewed timestamp if viewed
- ✅ NULL values for unviewed submissions

## Use Cases

### 1. Organization Dashboard
Organizations can now see:
- Which submissions have been reviewed
- Who reviewed their submissions
- When submissions were reviewed
- Current approval status

### 2. SDAO Dashboard
SDAO staff can track:
- Pending submissions needing review
- Approved vs rejected submissions
- Review history with timestamps
- Workload distribution among reviewers

### 3. Frontend Display
```javascript
// Example usage in frontend
submissions.forEach(submission => {
  console.log(`${submission.requirement_name}: ${submission.status}`);
  
  if (submission.viewed_by) {
    console.log(`Reviewed by: ${submission.viewed_by_first_name} ${submission.viewed_by_last_name}`);
    console.log(`Reviewed on: ${submission.viewed_at}`);
  } else {
    console.log('Status: Pending review');
  }
});
```

## Deployment

### Step 1: Apply Migration
```powershell
Get-Content "mysql/migrations/add_status_viewed_details_to_get_submissions.sql" | docker exec -i mysql mysql -uadmin -padmin db_nuconnect
```

### Step 2: Verify Procedure
```sql
SHOW CREATE PROCEDURE GetEventRequirementSubmissionsByOrganization\G
```

### Step 3: Test with Real Data
```sql
CALL GetEventRequirementSubmissionsByOrganization(1);
```

### Step 4: No Node.js Restart Needed
Since the model and controller just pass through the stored procedure results, **no restart is required**. The new fields will automatically appear in API responses.

## Benefits

1. **Transparency** - Organizations can see who reviewed their work
2. **Accountability** - Clear audit trail of reviews
3. **Status Tracking** - Easy to identify pending submissions
4. **Better UX** - Users know exactly where their submissions stand
5. **No Breaking Changes** - Existing API consumers get additional data without code changes

## Database Schema Reference

```sql
-- tbl_event_requirement_submissions structure
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
    viewed_by VARCHAR(200) NULL,
    viewed_at TIMESTAMP NULL,
    -- Foreign keys and constraints...
);
```

## Related Procedures
- `MarkEventRequirementAsViewed` - Sets viewed status and viewer details
- `ApprovePostEventRequirement` - Approves submissions
- `RejectPostEventRequirement` - Rejects submissions
- `GetEventRequirementSubmissions` - Gets submissions for specific event

## Quick Reference

| Field | Type | Description | Can be NULL |
|-------|------|-------------|-------------|
| status | ENUM | Current submission status | No (default: Pending) |
| viewed_by | VARCHAR(200) | User ID of reviewer | Yes (until viewed) |
| viewed_by_first_name | VARCHAR(50) | Reviewer's first name | Yes (until viewed) |
| viewed_by_last_name | VARCHAR(50) | Reviewer's last name | Yes (until viewed) |
| viewed_by_email | VARCHAR(100) | Reviewer's email | Yes (until viewed) |
| viewed_at | TIMESTAMP | When submission was viewed | Yes (until viewed) |

## Capstone Defense Notes

**Problem:** Organizations couldn't see the approval status or who reviewed their submissions.

**Solution:** Enhanced the submission query to include status tracking and viewer information from existing database fields.

**Implementation:** Added LEFT JOIN to viewer user data and included status field in SELECT statement.

**Impact:** 
- Zero breaking changes (additive only)
- Improved transparency
- Better user experience
- Supports SDAO workflow tracking

**Technical Decision:** Chose to return NULL for unviewed submissions rather than default values for data accuracy.
