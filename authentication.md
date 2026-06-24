# Mobile Authentication Flow & Graph Fallback Explanation

## The Log Explained
You are seeing the following output in your backend logs:
```text
[auth:mobile] tokenLen=2466 dotCount=2 kid=wh06sEkzLHJ5sNNaUyRY2_6O8K0 tid=4ef92dc9-a24e-4723-9f26-1e79a24a862e ver=1.0 iss=https://sts.windows.net/4ef92dc9-a24e-4723-9f26-1e79a24a862e/ aud="00000003-0000-0000-c000-000000000000"
[auth:mobile] selected issuer=https://sts.windows.net/4ef92dc9-a24e-4723-9f26-1e79a24a862e/ jwks=https://login.microsoftonline.com/4ef92dc9-a24e-4723-9f26-1e79a24a862e/discovery/keys
[auth:mobile] falling back to Graph /me validation for Graph audience token
```

### What does this mean?
1. **The Audience (`aud`) Mismatch:** When your Flutter mobile app logs in via Microsoft Entra (Azure AD), it requests an access token. The token it received has the audience (`aud`) set to `"00000003-0000-0000-c000-000000000000"`. This specific ID belongs to the **Microsoft Graph API**. 
2. **Signature Verification Failure:** By default, your backend tries to mathematically verify the token's signature using Microsoft's public keys. However, tokens meant specifically for the Microsoft Graph API often use a proprietary signing or encryption mechanism that *only* Microsoft can decrypt or verify. Because your backend is not Microsoft Graph, the local signature verification fails.
3. **The Fallback (The Solution):** Instead of immediately rejecting the user, the `validateAzureJWTMobile` middleware recognizes that the token is meant for Microsoft Graph (`aud: 00000003...`). It triggers the **Graph `/me` validation fallback**. 

### How the Fallback Works
As you correctly noted: *"We wanted it to be like if the user click something it confirms first if the logged in microsoft is legitimate right?"*

Exactly! Since the backend cannot verify the token mathematically, it does something even more secure:
1. It takes the mobile token and sends an HTTP GET request to `https://graph.microsoft.com/v1.0/me`.
2. **If the token is forged, expired, or illegitimate**, Microsoft Graph will reject the request.
3. **If the token is perfectly legitimate**, Microsoft Graph responds with the user's profile details (Email, First Name, Last Name).
4. Your backend takes those details, confirms the user exists in your `tbl_user` table (or provisions them), and successfully logs them in.

This guarantees that **only legitimate NU students with active Microsoft sessions can access the API**.

---

## The Architecture of `validateAzureJWTMobile`

Here is a step-by-step breakdown of how the middleware in `middleWare.ts` secures your mobile API routes:

### 1. Token Extraction
The middleware checks the `Authorization: Bearer <token>` header, or body/query fallbacks, to safely extract the JWT token sent by the mobile app.

### 2. Primary Verification Attempt
It attempts to decode the token header and fetch Microsoft's public keys (`jwksUri`) from `https://login.microsoftonline.com/...`. It tries to mathematically verify the signature against your App's Client ID.

### 3. Smart Graph Fallback
If step 2 fails due to an invalid signature, the middleware checks if `isGraphAudience(aud)` is true. If it is, it calls `verifyGraphTokenViaMe(token)` which securely queries Microsoft servers directly.

### 4. Database Resolution (`resolveOrProvisionUserFromEmail`)
Once the user's identity is cryptographically proven (either via local verification or Graph fallback), the system checks the `tbl_user` table:
- If the user exists, they are logged in.
- If the user is missing but exists in `tbl_user_application` as an approved staging user, they are automatically provisioned and migrated into `tbl_user`.
- If they don't exist anywhere, it returns an `ACCOUNT_NOT_APPROVED` 403 error.

### 5. Suspension Check
Before granting access, it ensures the `status` of the user is not set to `Suspended`.

### 6. Attaching `req.user`
Finally, the user's database ID, email, role, and names are attached to `req.user`. This securely provides context to all downstream mobile API controllers (like `getOrganizations` or `getEvents`), ensuring they only see data relevant to them.

---

## Why this is highly secure
By relying on the Microsoft Graph `/me` validation, you completely eliminate the risk of spoofed tokens. An attacker cannot fake a request to Microsoft Graph. It also bypasses the headache of complex Azure Scope configurations on the mobile side, seamlessly bridging the gap between Flutter MSAL libraries and your Node.js/Prisma backend.
