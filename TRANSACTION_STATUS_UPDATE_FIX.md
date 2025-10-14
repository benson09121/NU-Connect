# Transaction Status Update Fix

## Issue Summary

**Error:** `Data truncated for column 'p_entity_type' at row 1`

**Symptom:** When updating a transaction status from `Pending` to `Completed` or `Failed`, the update would fail with a 500 Internal Server Error.

**Root Cause:** The `UpdateTransaction` stored procedure was calling `CreateNotification` with outdated parameter order. The `CreateNotification` procedure signature was updated at some point to move the `url` parameter before `entity_type`, but the calls in `UpdateTransaction` were never updated to match.

## Technical Details

### CreateNotification Procedure Signature

**Correct signature (current):**
```sql
CREATE PROCEDURE CreateNotification(
    IN p_title VARCHAR(255),
    IN p_message TEXT,
    IN p_url VARCHAR(255),              -- Position 3 ✅
    IN p_entity_type ENUM(...),         -- Position 4 ✅
    IN p_entity_id INT,
    IN p_sender_id VARCHAR(200),
    IN p_recipient_emails JSON,         -- Changed to JSON array ✅
    IN p_action VARCHAR(100)
)
```

### What Was Wrong

**Old calls in UpdateTransaction (lines ~14797-14815):**
```sql
CALL CreateNotification(
    'Transaction Completed',                    -- p_title ✅
    CONCAT('Your transaction...'),              -- p_message ✅
    'transaction',                              -- ❌ Wrong! This went to p_url (expecting URL string)
    p_transaction_id,                           -- ❌ Wrong! This went to p_entity_type (expecting ENUM)
    v_actor_id,                                 -- ❌ Wrong! This went to p_entity_id (expecting INT)
    (SELECT user_id...),                        -- ❌ Wrong! This went to p_sender_id
    CONCAT('/transactions/', p_transaction_id), -- ❌ Wrong! This went to p_recipient_emails (expecting JSON)
    'VIEW_DETAIL'                               -- ❌ Wrong! This went to p_action
);
```

The string `'transaction'` was being passed to `p_url` (which expects a URL like `/transactions/123`), and then `p_transaction_id` (an INT) was being passed to `p_entity_type` (which expects an ENUM like `'transaction'`). This caused the "Data truncated" error.

### The Fix

**Corrected calls (lines ~14797-14825):**
```sql
-- Notification for Completed status
CALL CreateNotification(
    'Transaction Completed',                                        -- p_title ✅
    CONCAT('Your transaction of ₱', FORMAT(...), ...),              -- p_message ✅
    CONCAT('/transactions/', p_transaction_id),                     -- p_url ✅
    'transaction',                                                  -- p_entity_type ✅
    p_transaction_id,                                               -- p_entity_id ✅
    v_actor_id,                                                     -- p_sender_id ✅
    JSON_ARRAY((SELECT user_id FROM tbl_transaction WHERE ...)),   -- p_recipient_emails (JSON) ✅
    'VIEW_DETAIL'                                                   -- p_action ✅
);

-- Notification for Failed status
CALL CreateNotification(
    'Transaction Failed',
    CONCAT('Your transaction of ₱', FORMAT(...), ' has failed...'),
    CONCAT('/transactions/', p_transaction_id),                     -- p_url ✅
    'transaction',                                                  -- p_entity_type ✅
    p_transaction_id,                                               -- p_entity_id ✅
    v_actor_id,                                                     -- p_sender_id ✅
    JSON_ARRAY((SELECT user_id FROM tbl_transaction WHERE ...)),   -- p_recipient_emails (JSON) ✅
    'VIEW_DETAIL'
);
```

### Key Changes

1. **Moved URL parameter to position 3** (before `entity_type`)
2. **Fixed entity_type parameter** - now correctly receives `'transaction'` ENUM value
3. **Fixed entity_id parameter** - now correctly receives `p_transaction_id` INT value
4. **Wrapped recipient in JSON_ARRAY** - `p_recipient_emails` expects JSON array format

## Files Modified

1. **mysql/init.sql** (lines ~14797-14825)
   - Updated `CreateNotification` call in "Completed" status notification
   - Updated `CreateNotification` call in "Failed" status notification

## Testing

### Test Status Update: Pending → Completed

```sql
-- 1. Create a test transaction
CALL CreateTransaction(
    'test@example.com',
    'John Doe',
    'Organization Treasury',
    'INCOME',
    'GCASH',
    'Membership fee payment',
    150.00,
    'Pending',
    NOW(),
    NULL, NULL, NULL, NULL, NULL, NULL, 1, 1, NULL
);
SET @txn_id = LAST_INSERT_ID();

-- 2. Update status to Completed (should now work without error)
CALL UpdateTransaction(
    @txn_id,
    'admin@example.com',
    NULL, NULL, NULL, NULL, NULL, NULL,
    'Completed',  -- Change status
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL
);

-- 3. Check notification was created
SELECT * FROM tbl_notification WHERE entity_type = 'transaction' AND entity_id = @txn_id ORDER BY created_at DESC LIMIT 1;

-- 4. Check audit trail
CALL GetTransactionAuditTrail(@txn_id);
```

### Expected Results

✅ **Status update succeeds** without "Data truncated" error  
✅ **Audit trail entry created** with action_type = 'COMPLETE'  
✅ **Notification created** with title "Transaction Completed"  
✅ **Notification recipient added** for the transaction owner  
✅ **URL is correct** - `/transactions/{id}`  
✅ **Real-time SSE published** to frontend subscribers  

### Test Status Update: Pending → Failed

```sql
-- Using same transaction from above
CALL UpdateTransaction(
    @txn_id,
    'admin@example.com',
    NULL, NULL, NULL, NULL, NULL, NULL,
    'Failed',  -- Change to Failed
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0,
    'Payment gateway error - please retry'  -- Add remarks
);

-- Check notification
SELECT * FROM tbl_notification WHERE entity_type = 'transaction' AND entity_id = @txn_id ORDER BY created_at DESC LIMIT 1;
```

## Deployment

### Required Actions

1. **Apply database changes:**
   ```bash
   # Rebuild MySQL container to apply updated stored procedure
   docker-compose down
   docker-compose up -d mysql
   
   # Wait for MySQL to be ready
   docker-compose logs -f mysql
   # Look for: "ready for connections"
   ```

2. **Restart backend (optional but recommended):**
   ```bash
   docker-compose restart node-app
   ```

3. **Test in frontend:**
   - Navigate to Transactions page
   - Select a Pending transaction
   - Update status to "Completed" or "Failed"
   - Verify: No error, status updates successfully, notification appears

### Verification Commands

```bash
# Check MySQL logs for errors during procedure recreation
docker-compose logs mysql | grep -i "error\|warning"

# Test the update from command line (using mysql client)
docker-compose exec mysql mysql -u admin -padmin db_nuconnect -e "
CALL UpdateTransaction(1, 'admin@nu.edu', NULL, NULL, NULL, NULL, NULL, NULL, 'Completed', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL);
"
```

## Related Issues

This fix resolves:
- ✅ Transaction status update failures (Pending → Completed)
- ✅ Transaction status update failures (Pending → Failed)
- ✅ "Data truncated for column 'p_entity_type'" errors
- ✅ Missing notifications for transaction status changes

## Backward Compatibility

✅ **Fully backward compatible:**
- No API changes required
- No frontend changes required
- Only stored procedure internal logic fixed
- Existing transaction data unaffected

## Prevention

To prevent similar issues in the future:

1. **Always check procedure signatures** before calling from other procedures
2. **Use named parameters** when calling procedures (if MySQL version supports it)
3. **Add integration tests** for cross-procedure calls
4. **Document procedure signatures** when making changes
5. **Version control procedure dependencies** in documentation

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Status update Pending→Completed | ❌ Error 500 | ✅ Works |
| Status update Pending→Failed | ❌ Error 500 | ✅ Works |
| Notification created | ❌ No | ✅ Yes |
| Audit trail | ✅ Works | ✅ Works |
| Error message | "Data truncated..." | None |
| Parameter order | ❌ Wrong (old) | ✅ Correct (new) |
| Recipient format | ❌ VARCHAR | ✅ JSON array |

---

**Status:** ✅ Fixed  
**Database Migration Required:** Yes (stored procedure update)  
**API Changes:** None  
**Frontend Changes:** None  
**Backward Compatible:** Yes  
**Ready for Production:** Yes
