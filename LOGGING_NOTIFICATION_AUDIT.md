# Logging and Notification Audit

## Objective
Add `LogAction` and `CreateNotification` calls to all CRUD operations in stored procedures to ensure comprehensive audit trails and user notifications without exposing sensitive information.

## Principles
1. **User-Friendly Messages**: All messages must be clear and readable without technical IDs
2. **No Sensitive Data**: Never expose passwords, tokens, or internal IDs in user-facing messages
3. **Backward Compatibility**: All changes must maintain existing functionality
4. **Comprehensive Logging**: Every create, update, delete, archive, and approval action should be logged
5. **Selective Notifications**: Only notify relevant users (not every log needs a notification)

## Procedures to Update

### Priority 1: Core CRUD Operations (High Impact)

#### Section Management
- [ ] **AddSection** - Add logging and notification
  - Log: "Created section '[section_name]' in [program_name]"
  - Notify: SDAO admins
  
- [ ] **UpdateSection** - Add logging and notification
  - Log: "Updated section '[old_name]' to '[new_name]'"
  - Notify: SDAO admins

- [ ] **ArchiveSection** - Add logging and notification
  - Log: "Archived section '[section_name]'"
  - Notify: SDAO admins, affected students
  
- [ ] **UnarchiveSection** - Add logging and notification
  - Log: "Restored section '[section_name]'"
  - Notify: SDAO admins

#### Event Registration  
- [ ] **RegisterEvent** - Add logging
  - Log: "Registered for event '[event_title]'"
  - Note: Already has transaction logging, add attendance logging
  
- [ ] **UnRegisterEvent** - Add logging
  - Log: "Cancelled registration for event '[event_title]'"

- [ ] **UpdateMemberEventStatus** - Add logging and notification
  - Log: "Updated attendance status for '[event_title]' to [status]"
  - Notify: User whose status changed

#### Requirement Management
- [ ] **AddRequirement** - Add logging and notification
  - Log: "Added requirement '[requirement_title]'"
  - Notify: Affected organizations
  
- [ ] **DeleteRequirement** - Add logging and notification
  - Log: "Removed requirement '[requirement_title]'"
  - Notify: Affected organizations

#### Evaluation Management
- [ ] **SubmitEvaluation** - Add logging
  - Log: "Submitted evaluation for event '[event_title]'"
  - Note: No notification needed (privacy)

#### Certificate Management
- [ ] **AddGeneratedCertificate** - Add logging
  - Log: "Generated certificate for event '[event_title]'"
  - Note: Certificate generation should be logged for audit

#### Organization Term Options
- [ ] **UpdateOrganizationTermOption** - Currently has logging, verify notification
  - Verify: Check if notification to org members needed

#### Application Period Management
- [ ] **UpdateApplicationPeriod** - Currently has logging and notification
  - Status: ✅ Already complete

#### Paid Event Registration Approval
- [ ] **ApprovePaidEventRegistration** - Review logging
  - Status: Needs review for user-friendly messages
  
- [ ] **RejectPaidEventRegistration** - Review logging
  - Status: Needs review for user-friendly messages

### Priority 2: Complex Operations (Medium Impact)

#### Account Management
- [ ] **CreatePendingMobileUser** - Add logging
  - Log: "Created pending mobile account for [email]"
  - Note: System operation, minimal notification

### Priority 3: Already Complete (Verified)
- ✅ **CreateEvent** - Has logging and notifications
- ✅ **UpdateEvent** - Has logging
- ✅ **DeleteEvent** - Has logging
- ✅ **ArchiveEvent** - Has logging
- ✅ **UnarchiveEvent** - Has logging
- ✅ **AddCertificateTemplate** - Has logging
- ✅ **DeleteCertificateTemplate** - Has logging
- ✅ **CreateEventTransaction** - Has logging
- ✅ **CreateMembershipTransaction** - Has logging
- ✅ **AddManagedAccount** - Has logging
- ✅ **UpdateManagedAccount** - Has logging
- ✅ **DeleteManagedAccount** - Has logging
- ✅ **UnarchiveManagedAccount** - Has logging
- ✅ **AddApplicationPeriod** - Has logging and notification
- ✅ **UpdateApplicationPeriod** - Has logging and notification
- ✅ **AddRequirement** - Has logging and notification
- ✅ **DeleteRequirement** - Has logging and notification
- ✅ **ApproveTransactionPayment** - Has logging

### Priority 4: Read-Only Operations (No Changes Needed)
- GetManagedAccounts
- GetAllSections
- GetSectionById
- GetEvents
- GetEventById
- GetSpecificEvent
- GetUserPermissions
- GetOrganizations
- GetLogs
- (All other GET procedures)

## Implementation Status

### Completed
- Initial audit completed
- Documentation created

### In Progress
- Adding logging/notifications to Priority 1 procedures

### Pending
- Priority 2 procedures
- Testing and verification
- Documentation updates

## Notes
- Some procedures already have proper logging (from previous audit)
- Focus on procedures that modify data
- Ensure all messages are human-readable
- Keep metadata JSON for technical details
- Test each update for backward compatibility
