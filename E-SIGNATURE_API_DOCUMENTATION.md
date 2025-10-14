# E-Signature Approval Chain - API Documentation

## Overview
This document describes the e-signature verification and upload system for the organization approval chain. When an approver clicks "Mark As Received", the system verifies if they have an e-signature on file. If not, they must upload one before proceeding.

---

## Database Schema

### Table: `tbl_organization_approval_chain`
```sql
CREATE TABLE IF NOT EXISTS tbl_organization_approval_chain (
    chain_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    period_id INT NULL,
    approver_user_id VARCHAR(200) NOT NULL,
    approver_role_id INT NOT NULL,
    approval_order INT NOT NULL,
    is_final_approval BOOLEAN DEFAULT FALSE,
    status ENUM('Pending', 'Received', 'Signed', 'Approved') DEFAULT 'Pending',
    signature_path VARCHAR(255) NULL COMMENT 'Stored e-signature file path',
    received_at TIMESTAMP NULL,
    signed_at TIMESTAMP NULL,
    approved_at TIMESTAMP NULL,
    remarks TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ...
);
```

**Key Field**: `signature_path` - Stores the filename of the user's uploaded e-signature

---

## API Endpoints

### 1. Check E-Signature Status
**Endpoint**: `GET /api/organizations/approval/:chain_id/check-signature`

**Description**: Checks if the current user has an e-signature uploaded for the specified approval chain.

**Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Parameters**:
- `chain_id` (URL parameter): The approval chain ID

**Response Success** (200):
```json
{
  "success": true,
  "data": {
    "hasSignature": true,
    "signature_path": "123_user_id_1234567890.png",
    "status": "Pending"
  }
}
```

**Response No Signature** (200):
```json
{
  "success": true,
  "data": {
    "hasSignature": false,
    "signature_path": null,
    "status": "Pending"
  }
}
```

**Response Error** (500):
```json
{
  "success": false,
  "error": "Approval chain not found or user not authorized"
}
```

---

### 2. Upload E-Signature
**Endpoint**: `POST /api/organizations/approval/:chain_id/upload-signature`

**Description**: Uploads the user's e-signature image file for the specified approval chain.

**Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**Parameters**:
- `chain_id` (URL parameter): The approval chain ID

**Request Body** (multipart/form-data):
- `signature` (file): Image file (PNG, JPG, JPEG, GIF)
  - Max size: 2MB
  - Accepted formats: image/png, image/jpeg, image/jpg, image/gif

**Response Success** (200):
```json
{
  "success": true,
  "message": "E-signature uploaded successfully.",
  "data": {
    "success": true,
    "chain_id": 123,
    "signature_path": "123_user_id_1234567890.png",
    "message": "E-signature uploaded successfully"
  }
}
```

**Response Error - No File** (400):
```json
{
  "success": false,
  "error": "E-signature file is required."
}
```

**Response Error - Invalid Type** (400):
```json
{
  "success": false,
  "error": "Invalid file type. Please upload a PNG, JPG, or GIF image."
}
```

**Response Error - File Too Large** (400):
```json
{
  "success": false,
  "error": "File size exceeds 2MB limit."
}
```

**Response Error - Server** (500):
```json
{
  "success": false,
  "error": "An error occurred while uploading e-signature."
}
```

---

### 3. Mark As Received
**Endpoint**: `PUT /api/organizations/approval/:chain_id/received`

**Description**: Marks an approval step as received. **Note**: The frontend should check if the user has an e-signature BEFORE calling this endpoint.

**Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Parameters**:
- `chain_id` (URL parameter): The approval chain ID

**Response Success** (200):
```json
{
  "success": true,
  "message": "Approval marked as received.",
  "data": {
    // Stored procedure result
  }
}
```

**Response Error** (500):
```json
{
  "success": false,
  "error": "An error occurred while marking approval as received."
}
```

---

## Frontend Implementation Flow

### User Flow for "Mark As Received"

```
1. User clicks "Mark As Received" button
   ↓
2. Frontend calls: GET /api/organizations/approval/:chain_id/check-signature
   ↓
3. Check response.data.hasSignature
   
   IF hasSignature === false:
   ├─→ Show modal: "Upload E-Signature Required"
   │   ├─→ User uploads signature file
   │   ├─→ Show confirmation: "Are you sure you want to upload your e-signature?"
   │   ├─→ If confirmed: POST /api/organizations/approval/:chain_id/upload-signature
   │   ├─→ On success: Show "E-signature uploaded successfully"
   │   └─→ Continue to step 4
   │
   IF hasSignature === true:
   └─→ Continue to step 4
   
4. Show confirmation: "Are you sure you want to mark this as received?"
   ↓
5. If confirmed: PUT /api/organizations/approval/:chain_id/received
   ↓
6. Show success message and refresh approval status
```

### React/Frontend Example (Pseudo-code)

```javascript
const handleMarkAsReceived = async (chainId) => {
  try {
    // Step 1: Check if user has e-signature
    const signatureCheck = await fetch(
      `/api/organizations/approval/${chainId}/check-signature`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    const { data } = await signatureCheck.json();
    
    // Step 2: If no signature, prompt upload
    if (!data.hasSignature) {
      const shouldUpload = await showConfirmDialog(
        "E-Signature Required",
        "You need to upload your e-signature before marking this as received. Would you like to upload it now?"
      );
      
      if (!shouldUpload) return;
      
      // Show file upload dialog
      const file = await showFileUploadDialog({
        accept: 'image/png,image/jpeg,image/jpg,image/gif',
        maxSize: 2 * 1024 * 1024 // 2MB
      });
      
      if (!file) return;
      
      // Confirm upload
      const confirmUpload = await showConfirmDialog(
        "Confirm E-Signature Upload",
        "Are you sure you want to upload your e-signature? This will be used for all your approvals."
      );
      
      if (!confirmUpload) return;
      
      // Upload signature
      const formData = new FormData();
      formData.append('signature', file);
      
      const uploadResponse = await fetch(
        `/api/organizations/approval/${chainId}/upload-signature`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        }
      );
      
      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'Failed to upload e-signature');
      }
      
      showNotification({
        title: 'Success',
        message: 'E-signature uploaded successfully',
        type: 'success'
      });
    }
    
    // Step 3: Confirm mark as received
    const confirmReceived = await showConfirmDialog(
      "Mark As Received",
      "Are you sure you want to mark this as received?"
    );
    
    if (!confirmReceived) return;
    
    // Step 4: Mark as received
    const receiveResponse = await fetch(
      `/api/organizations/approval/${chainId}/received`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    if (!receiveResponse.ok) {
      throw new Error('Failed to mark as received');
    }
    
    showNotification({
      title: 'Success',
      message: 'Successfully marked as received',
      type: 'success'
    });
    
    // Refresh approval data
    await refreshApprovalData();
    
  } catch (error) {
    showNotification({
      title: 'Error',
      message: error.message,
      type: 'error'
    });
  }
};
```

---

## File Storage

### Upload Directory
```
uploads/approval-signatures/
```

### File Naming Convention
```
{chain_id}_{user_id}_{timestamp}.{ext}

Example: 123_user123_1640000000000.png
```

### Allowed File Types
- PNG (image/png)
- JPG/JPEG (image/jpeg, image/jpg)
- GIF (image/gif)

### File Size Limit
- Maximum: 2MB (2 * 1024 * 1024 bytes)

---

## Security Considerations

1. **Authentication Required**: All endpoints require valid JWT token
2. **Authorization Check**: System verifies user is the approver for the chain
3. **File Validation**: 
   - Type validation (only images)
   - Size validation (max 2MB)
   - MIME type validation
4. **File Cleanup**: Failed uploads are automatically cleaned up
5. **Unique Filenames**: Prevents file collisions using chain_id + user_id + timestamp

---

## Error Handling

### Common Error Codes

| Status Code | Error Message | Solution |
|------------|---------------|----------|
| 400 | chain_id is required | Include chain_id in URL |
| 400 | E-signature file is required | Upload a file |
| 400 | Invalid file type | Upload PNG, JPG, or GIF only |
| 400 | File size exceeds 2MB limit | Reduce file size |
| 401 | Unauthorized | Provide valid JWT token |
| 403 | Approval chain not found or user not authorized | User is not the approver for this chain |
| 500 | Server error | Check server logs |

---

## Testing Checklist

### Backend Testing
- [ ] Check signature status for existing signature
- [ ] Check signature status for non-existing signature
- [ ] Upload valid image file (PNG, JPG, GIF)
- [ ] Upload invalid file type (PDF, DOCX)
- [ ] Upload file exceeding 2MB
- [ ] Upload without authentication
- [ ] Upload for chain_id user is not authorized for
- [ ] Mark as received with existing signature
- [ ] Mark as received without signature (should fail on frontend)
- [ ] Verify signature_path is updated in database

### Frontend Testing
- [ ] Check signature flow shows correct modal
- [ ] Upload dialog accepts only images
- [ ] Upload dialog shows file size error
- [ ] Confirmation dialogs appear in correct order
- [ ] Success messages display correctly
- [ ] Error messages display correctly
- [ ] Approval status refreshes after successful operation
- [ ] Loading states work correctly
- [ ] Multiple sequential uploads work correctly

---

## Migration Notes

### Existing Data
- Existing approval chains without `signature_path` will have `NULL`
- Users will be prompted to upload on first "Mark As Received" action
- Once uploaded, signature_path is reused for future approvals

### Backward Compatibility
- Old approval chains continue to work
- No data migration required
- Signature upload is enforced only on new "Mark As Received" actions

---

## Support

For questions or issues, contact the development team:
- Backend: Review `organizationsModel.js`, `organizationsController.js`
- Routes: Review `organizations.js`
- Database: Review `init.sql` line 21694-21730

---

**Last Updated**: 2025-01-12
**Version**: 1.0.0
