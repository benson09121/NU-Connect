# Transaction Audit Trail - Quick Reference

## 🔒 Status Lock Rules

| Status | Can Edit? | Can Archive? | Why? |
|--------|-----------|--------------|------|
| **Pending** | ✅ Yes | ✅ Yes | Still being processed |
| **Completed** | ❌ LOCKED | ❌ LOCKED | Permanent financial record |
| **Failed** | ❌ LOCKED | ✅ Yes | Terminal state, but can archive |
| **Cancelled** | ❌ LOCKED | ✅ Yes | Terminal state, but can archive |

## ✅ Valid Status Transitions

```
Pending ──► Completed ✅
Pending ──► Failed ✅
Pending ──► Cancelled ✅
Completed ──► X ❌ (LOCKED)
Failed ──► X ❌ (LOCKED)
Cancelled ──► X ❌ (LOCKED)
```

## 📊 API Endpoints

### Get Audit Trail for Specific Transaction
```bash
GET /api/web/transactions/:id/audit-trail
Authorization: Bearer <token>
Permission: VIEW_TRANSACTIONS or MANAGE_TRANSACTIONS
```

### Get All Transaction Audits (Paginated)
```bash
GET /api/web/transaction-audits?limit=50&offset=0
Authorization: Bearer <token>
Permission: VIEW_TRANSACTIONS or MANAGE_TRANSACTIONS
Max limit: 200
```

## 🗄️ Database Procedures

### Update Transaction (Enhanced)
```sql
CALL UpdateTransaction(
    123,                          -- transaction_id
    'admin@example.com',          -- user_email
    'Updated description',        -- payment_description
    600.00,                       -- amount
    'Completed',                  -- status
    NULL,                         -- proof_image
    'RCP-001',                    -- receipt_no
    'EVENT_FEE',                  -- category_code
    'John Doe',                   -- payer_name
    NULL,                         -- payee_name
    NULL,                         -- payer_name_override
    NULL,                         -- event_remarks
    0,                            -- remove_proof_image
    5                             -- org_version_id
);
```

### Archive Transaction (Enhanced)
```sql
CALL ArchiveTransaction(
    123,                          -- transaction_id
    'admin@example.com',          -- user_email
    'Duplicate entry'             -- reason
);
```

### Get Audit Trail
```sql
CALL GetTransactionAuditTrail(123);
```

### Get All Audits
```sql
CALL GetAllTransactionAudits(50, 0);
```

## 🚨 Common Errors

### "Cannot modify a completed transaction"
**Cause:** Trying to update a transaction with status = 'Completed'
**Solution:** Create a new correcting transaction or refund transaction

### "Cannot archive a completed transaction"
**Cause:** Trying to archive a completed transaction
**Solution:** Completed transactions are permanent records - they should not be archived

### "Invalid status transition"
**Cause:** Trying to change from a terminal state (Completed/Failed/Cancelled)
**Solution:** Status transitions are one-way only from Pending

## 📝 Audit Trail Fields

Every change logs:
- `action_type` - CREATE, UPDATE, ARCHIVE, COMPLETE, CANCEL, DELETE
- `changed_by` - User who made the change
- `changed_at` - Timestamp of change
- `old_status` / `new_status` - Status before/after
- `old_amount` / `new_amount` - Amount before/after
- `old_payment_type_id` / `new_payment_type_id` - Payment type before/after
- `old_category_id` / `new_category_id` - Category before/after
- `old_proof_image` / `new_proof_image` - Proof image before/after
- `changes_json` - Detailed field-by-field changes
- `reason` - Reason for change (optional)

## 🧪 Testing Commands

### Create Test Transaction
```sql
INSERT INTO tbl_transaction (user_id, payer_name, payment_description, amount, transaction_type_id, payment_type_id, status, transaction_date)
VALUES ('test@user.com', 'Test User', 'Test Payment', 100.00, 1, 1, 'Pending', NOW());
```

### Check Audit Log
```sql
SELECT * FROM tbl_transaction_audit_trail 
WHERE transaction_id = LAST_INSERT_ID()
ORDER BY changed_at DESC;
```

### Test Lock (Should Fail)
```sql
-- First complete it
UPDATE tbl_transaction SET status = 'Completed' WHERE transaction_id = 123;

-- Then try to update (SHOULD FAIL)
UPDATE tbl_transaction SET amount = 999.00 WHERE transaction_id = 123;
-- ERROR 1644 (45000): Cannot modify a transaction that has reached Completed status
```

## 📦 Deployment Checklist

- [ ] Backup database
- [ ] Restart MySQL container (`docker-compose restart mysql`)
- [ ] Verify schema (`SHOW TABLES LIKE '%audit%'`)
- [ ] Verify triggers (`SHOW TRIGGERS WHERE \`Table\` = 'tbl_transaction'`)
- [ ] Verify procedures (`SHOW PROCEDURE STATUS WHERE Name LIKE '%Audit%'`)
- [ ] Restart Node.js container (`docker-compose restart node-app`)
- [ ] Test API endpoints
- [ ] Check logs for errors

## 🔍 Monitoring Queries

### Count Total Audits
```sql
SELECT COUNT(*) FROM tbl_transaction_audit_trail;
```

### Count Locked Transactions
```sql
SELECT status, COUNT(*) 
FROM tbl_transaction 
WHERE status IN ('Completed', 'Failed', 'Cancelled')
GROUP BY status;
```

### Recent Audit Actions
```sql
SELECT action_type, COUNT(*) as count
FROM tbl_transaction_audit_trail
WHERE changed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY action_type;
```

### Most Active Users
```sql
SELECT u.email, u.f_name, u.l_name, COUNT(*) as audit_count
FROM tbl_transaction_audit_trail tat
JOIN tbl_user u ON tat.changed_by = u.user_id
WHERE tat.changed_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY u.user_id
ORDER BY audit_count DESC
LIMIT 10;
```

## 🎯 Best Practices

✅ **DO:**
- Use `UpdateTransaction()` procedure instead of raw SQL
- Always provide meaningful reasons for changes
- Review audit trail before making changes
- Mark transactions as Completed only when verified

❌ **DON'T:**
- Try to update completed transactions
- Archive completed transactions
- Use raw SQL updates - use stored procedures
- Revert Failed or Cancelled transactions

## 💡 Tips

1. **View Before Update:** Always check audit trail before attempting updates
2. **Reason is Important:** Provide clear reasons for cancellations and archives
3. **One-Way Street:** Status changes are permanent - be sure before completing
4. **Permanent Records:** Completed transactions = permanent financial records
5. **Use Procedures:** Always use stored procedures for safety and audit logging
