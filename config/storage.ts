/**
 * config/storage.ts
 *
 * Storage adapter abstraction for file serving (org logos, event images, etc.)
 *
 * WHY THIS EXISTS
 * ---------------
 * Files can live in different places depending on the deployment:
 *   - Local disk (dev / single-server Docker)
 *   - Azure Blob Storage (Azure Container Instances, AKS)
 *   - AWS S3 / MinIO (other cloud)
 *
 * This file defines a common interface so the rest of the app (controllers,
 * services) never needs to know HOW a file is stored — they just call
 * `storage.resolve(relativePath)` and dispatch on the result type.
 *
 * HOW TO MIGRATE TO A DIFFERENT BACKEND
 * --------------------------------------
 * 1. Implement `StorageAdapter` (e.g. `AzureBlobStorageAdapter` below)
 * 2. Change `STORAGE_PROVIDER` env var → the factory picks it up automatically
 * 3. No other code change needed in controllers or models
 *
 * RELATIVE PATH CONVENTIONS
 * -------------------------
 * All paths passed to `resolve()` are relative and must follow these patterns:
 *
 *   Org logos:    organizations/{orgId}/{versionId}/logo/{filename}
 *   Event images: events/{eventId}/{filename}
 *   Uploads:      uploads/{category}/{filename}
 *
 * The adapter is responsible for turning that relative path into either a
 * local absolute path or a remote URL.
 */

import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * What the controller gets back from `storage.resolve()`.
 *
 * - `local`    → call res.sendFile(absolutePath)
 * - `redirect` → call res.redirect(302, url)  (Azure Blob SAS, S3 pre-signed, etc.)
 */
export type ServableFile =
  | { type: 'local'; absolutePath: string }
  | { type: 'redirect'; url: string };

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  /**
   * Resolve a relative storage path into a ServableFile.
   *
   * @param relativePath  e.g. "organizations/1/1/logo/file.png"
   * @returns             ServableFile with type 'local' or 'redirect'
   * @throws              Error if the file cannot be found / resolved
   */
  resolve(relativePath: string): Promise<ServableFile>;
}

// ---------------------------------------------------------------------------
// Adapter 1 — Local disk  (default, used for dev and single-container deploys)
// ---------------------------------------------------------------------------

/**
 * Serves files from the local filesystem inside the container.
 *
 * Base directory is controlled by STORAGE_BASE_PATH env var.
 * Default: /app  (so "organizations/1/1/logo/x.png" → /app/organizations/1/1/logo/x.png)
 *
 * When to use:
 *   - Local development
 *   - Single Docker container (files survive only as long as the container does —
 *     use a bind mount or named volume to persist across restarts)
 *
 * To migrate away: swap to AzureBlobStorageAdapter and files are never touched here.
 */
class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor() {
    // STORAGE_BASE_PATH env var wins.
    // Fallback: nuconnect-files/ inside the project root (works for ts-node in dev).
    // In Docker, set STORAGE_BASE_PATH=/app/nuconnect-files explicitly.
    this.baseDir = process.env.STORAGE_BASE_PATH ?? path.resolve(__dirname, '..', 'nuconnect-files');
  }

  async resolve(relativePath: string): Promise<ServableFile> {
    const absolutePath = path.resolve(this.baseDir, relativePath);

    // Prevent path traversal attacks — resolved path must stay inside baseDir
    if (!absolutePath.startsWith(path.resolve(this.baseDir))) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`FILE_NOT_FOUND: ${absolutePath}`);
    }

    return { type: 'local', absolutePath };
  }
}

// ---------------------------------------------------------------------------
// Adapter 2 — Azure Blob Storage  (uncomment + install SDK when ready)
// ---------------------------------------------------------------------------
//
// npm install @azure/storage-blob
//
// import {
//   BlobServiceClient,
//   StorageSharedKeyCredential,
//   generateBlobSASQueryParameters,
//   BlobSASPermissions,
// } from '@azure/storage-blob';
//
// class AzureBlobStorageAdapter implements StorageAdapter {
//   private readonly accountName   = process.env.AZURE_STORAGE_ACCOUNT!;
//   private readonly accountKey    = process.env.AZURE_STORAGE_KEY!;
//   private readonly containerName = process.env.AZURE_STORAGE_CONTAINER ?? 'nuconnect';
//   private readonly sasExpiryMins = Number(process.env.AZURE_SAS_EXPIRY_MINS ?? '5');
//
//   async resolve(relativePath: string): Promise<ServableFile> {
//     const credential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
//
//     const sasQuery = generateBlobSASQueryParameters(
//       {
//         containerName: this.containerName,
//         blobName: relativePath,
//         permissions: BlobSASPermissions.parse('r'),
//         expiresOn: new Date(Date.now() + this.sasExpiryMins * 60 * 1000),
//       },
//       credential
//     ).toString();
//
//     const url = `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${relativePath}?${sasQuery}`;
//     return { type: 'redirect', url };
//   }
// }

// ---------------------------------------------------------------------------
// Adapter 3 — AWS S3 / MinIO  (uncomment + install SDK when ready)
// ---------------------------------------------------------------------------
//
// npm install @aws-sdk/s3-request-presigner @aws-sdk/client-s3
//
// import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
//
// class S3StorageAdapter implements StorageAdapter {
//   private readonly client = new S3Client({
//     region:   process.env.AWS_REGION!,
//     endpoint: process.env.S3_ENDPOINT,          // set for MinIO
//     forcePathStyle: !!process.env.S3_ENDPOINT,  // required for MinIO
//   });
//   private readonly bucket     = process.env.S3_BUCKET!;
//   private readonly expiryMins = Number(process.env.S3_URL_EXPIRY_MINS ?? '5');
//
//   async resolve(relativePath: string): Promise<ServableFile> {
//     const command = new GetObjectCommand({ Bucket: this.bucket, Key: relativePath });
//     const url = await getSignedUrl(this.client, command, { expiresIn: this.expiryMins * 60 });
//     return { type: 'redirect', url };
//   }
// }

// ---------------------------------------------------------------------------
// Factory — picks the right adapter from STORAGE_PROVIDER env var
// ---------------------------------------------------------------------------

function createStorageAdapter(): StorageAdapter {
  const provider = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase();

  switch (provider) {
    case 'local':
      return new LocalStorageAdapter();

    // case 'azure-blob':
    //   return new AzureBlobStorageAdapter();

    // case 's3':
    // case 'minio':
    //   return new S3StorageAdapter();

    default:
      console.warn(`[storage] Unknown STORAGE_PROVIDER="${provider}", falling back to local`);
      return new LocalStorageAdapter();
  }
}

// ---------------------------------------------------------------------------
// Singleton — import this everywhere
// ---------------------------------------------------------------------------

export const storage: StorageAdapter = createStorageAdapter();
