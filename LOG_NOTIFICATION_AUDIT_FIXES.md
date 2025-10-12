# Log Action and Create Notification Audit Fixes

## Summary
This document tracks all fixes needed to remove IDs and sensitive information from user-facing log messages and notifications while keeping them in metadata for debugging.

## Principles
1. **User-facing messages** should be descriptive and human-readable
2. **IDs should ONLY appear in metadata JSON**, never in the message text
3. **Sensitive data** (user_ids, transaction_ids, etc.) should be in metadata only
4. **Notifications** should focus on actions and outcomes, not technical details
5. **Dates/times** should be formatted in human-readable format

## Files to Fix

### mysql/init.sql

#### Line 1640 - CreateEventTransaction
**Before:**
```sql
CALL LogAction(
    p_user_email,
    'Successfully created event payment transaction',
    'Event Payment',
    JSON_OBJECT(
        'transaction_id', v_transaction_id,
        'amount', p_amount,
        'event_id', p_event_id,
        ...
    ),
    ...
);
```

**After:**
```sql
CALL LogAction(
    p_user_email,
    CONCAT('Payment submitted for event registration (Amount: ', p_amount, ')'),
    'Event Payment',
    JSON_OBJECT(
        'transaction_id', v_transaction_id,
        'amount', p_amount,
        'event_id', p_event_id,
        ...
    ),
    ...
);
```

#### Line 1895 - CreateEvent (SDAO)
**Status:** ✅ Already good - uses event title, no IDs in message

#### Line 1910 - CreateEvent Notification
**Status:** ✅ Already good - user-friendly notification

#### Line 2107 - ArchiveEvent
**Status:** ✅ Already good - uses event title, not ID

#### Line 2148 - UnarchiveEvent
**Status:** ✅ Already good - uses event title, not ID

#### Line 2239 - UpdateEvent
**Status:** ✅ Already good - uses event title, not ID

#### Line 2277 - DeleteEvent
**Before:**
```sql
CALL LogAction(
    v_user_email,
    CONCAT('Permanently deleted event', IF(p_reason IS NOT NULL, CONCAT(' - Reason: ', p_reason), '')),
    'Event Management',
    JSON_OBJECT('event_id', p_event_id, 'deleted_at', NOW(), 'reason', p_reason),
    ...
);
```

**After:**
```sql
CALL LogAction(
    v_user_email,
    CONCAT('Permanently deleted event "', v_event_title, '"', IF(p_reason IS NOT NULL, CONCAT(' - Reason: ', p_reason), '')),
    'Event Management',
    JSON_OBJECT('event_id', p_event_id, 'deleted_at', NOW(), 'reason', p_reason),
    ...
);
```

#### Line 2928 - AddCertificateTemplate
**Before:**
```sql
CALL LogAction(
    v_user_email,
    'Updated certificate template',
    'Certificate Management',
    JSON_OBJECT('event_id', p_event_id, 'template_path', p_template_path),
    ...
);
```

**After:**
```sql
CALL LogAction(
    v_user_email,
    CONCAT('Updated certificate template for event "', v_event_title, '"'),
    'Certificate Management',
    JSON_OBJECT('event_id', p_event_id, 'template_path', p_template_path, 'event_title', v_event_title),
    ...
);
```

#### Line 2968 - DeleteCertificateTemplate
**Before:**
```sql
CALL LogAction(
    v_user_email,
    'Removed certificate template',
    'Certificate Management',
    JSON_OBJECT('event_id', p_event_id),
    ...
);
```

**After:**
```sql
CALL LogAction(
    v_user_email,
    CONCAT('Removed certificate template for event "', v_event_title, '"'),
    'Certificate Management',
    JSON_OBJECT('event_id', p_event_id, 'event_title', v_event_title),
    ...
);
```

#### Line 3129 - CreateMembershipTransaction
**Before:**
```sql
CALL LogAction(
    p_user_email,
    CONCAT('Created membership transaction for organization ', p_organization_id),
    'MEMBERSHIP_TRANSACTION_CREATE',
    ...
);
```

**After:**
```sql
CALL LogAction(
    p_user_email,
    CONCAT('Membership payment submitted for organization "', v_organization_name, '" (Amount: ', p_amount, ')'),
    'Membership Payment',
    JSON_OBJECT(
        'transaction_id', v_transaction_id,
        'amount', p_amount,
        'organization_id', p_organization_id,
        'organization_name', v_organization_name,
        ...
    ),
    ...
);
```

#### Line 4556-4568 - CreateApplicationPeriod
**Status:** ✅ Already good - user-friendly messages without IDs

#### Line 4651-4663 - UpdateApplicationPeriod
**Status:** ✅ Already good - user-friendly messages without IDs

#### Line 6826-6844 - ApprovePaidEventRegistration
**Status:** ✅ Good - uses event title and user email, IDs in metadata

#### Line 6922-6940 - RejectPaidEventRegistration
**Status:** ✅ Good - uses event title and user email, IDs in metadata

## Priority Fixes Needed

### High Priority
1. **Line 1640** - CreateEventTransaction - Remove "Successfully created event payment transaction"
2. **Line 3129** - CreateMembershipTransaction - Remove organization ID from message
3. **Line 2277** - DeleteEvent - Add event title to message
4. **Line 2928** - AddCertificateTemplate - Add event title
5. **Line 2968** - DeleteCertificateTemplate - Add event title

### Additional Checks Needed
- Search for any remaining transaction_id, user_id, event_id, organization_id in CONCAT strings
- Verify all notifications are user-friendly
- Ensure all dates are formatted properly

## Testing Checklist
- [ ] CreateEventTransaction log message doesn't expose IDs
- [ ] CreateMembershipTransaction uses organization name
- [ ] DeleteEvent includes event title
- [ ] Certificate operations include event titles
- [ ] All notifications are user-friendly
- [ ] All IDs remain in metadata JSON for debugging
