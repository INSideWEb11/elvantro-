import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App safely once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

// Strictly least-privilege Google Drive scope for app-created folders and files
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// In-memory ONLY OAuth access token cache (never written to localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedTokenExpiry = 0;

// Clear token automatically when user signs out
onAuthStateChanged(firebaseAuth, (user) => {
  if (!user) {
    cachedAccessToken = null;
    cachedTokenExpiry = 0;
  }
});

export interface DriveAuthState {
  user: User | null;
  hasToken: boolean;
}

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  folderPath: string;
  folderId: string;
  replacedExisting?: boolean;
}

export interface DriveExistingFile {
  id: string;
  name: string;
  webViewLink?: string;
}

export function getInMemoryAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() > cachedTokenExpiry) {
    cachedAccessToken = null;
    return null;
  }
  return cachedAccessToken;
}

export function isDriveConnected(): boolean {
  return Boolean(firebaseAuth.currentUser && getInMemoryAccessToken());
}

/**
 * Interactive Google sign-in requesting least-privilege Drive file scope.
 * Caches the OAuth access token strictly in memory.
 */
export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  const result = await signInWithPopup(firebaseAuth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error('Could not obtain Google Drive access token. Please try signing in again.');
  }

  cachedAccessToken = accessToken;
  // Standard Google OAuth access tokens are valid for ~55 minutes
  cachedTokenExpiry = Date.now() + 55 * 60 * 1000;

  return { user: result.user, accessToken };
}

export async function signOutGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  cachedTokenExpiry = 0;
  await signOut(firebaseAuth);
}

/**
 * Sanitize folder/file names for Google Drive queries and clean paths.
 */
export function sanitizeDriveName(raw: string, fallback = 'General'): string {
  const cleaned = String(raw || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Token expired — clear in-memory token so caller can prompt re-auth
    cachedAccessToken = null;
    cachedTokenExpiry = 0;
    throw new Error('Google Drive session expired. Please click "Sign in with Google" to reconnect.');
  }
  return res;
}

/**
 * Finds an existing Drive folder by exact name under parentId (or Drive root),
 * or creates it if it does not yet exist.
 */
export async function findOrCreateFolder(
  folderName: string,
  accessToken: string,
  parentId?: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const cleanName = sanitizeDriveName(folderName, 'Elentory');
  const escapedName = escapeDriveQueryValue(cleanName);
  const parentClause = parentId
    ? `'${escapeDriveQueryValue(parentId)}' in parents`
    : `'root' in parents`;

  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and ${parentClause} and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=files(id,name,webViewLink)&spaces=drive`;

  const searchRes = await driveFetch(searchUrl, accessToken);
  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Google Drive folder lookup failed (${searchRes.status}): ${errText}`);
  }
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }

  // Create folder
  const metadata: Record<string, any> = {
    name: cleanName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    }
  );
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Google Drive folder creation failed (${createRes.status}): ${errText}`);
  }
  return await createRes.json();
}

/**
 * Ensures a nested folder path exists under My Drive, e.g.
 * ['Elentory ERP', 'Supplier Invoices', 'Mouser Electronics']
 */
export async function ensureFolderPath(
  segments: string[],
  accessToken: string
): Promise<{ folderId: string; folderPath: string; webViewLink?: string }> {
  let parentId: string | undefined = undefined;
  let lastFolder: { id: string; name: string; webViewLink?: string } | null = null;
  const cleanSegments: string[] = [];

  for (const seg of segments) {
    const clean = sanitizeDriveName(seg);
    cleanSegments.push(clean);
    lastFolder = await findOrCreateFolder(clean, accessToken, parentId);
    parentId = lastFolder.id;
  }

  return {
    folderId: lastFolder!.id,
    folderPath: cleanSegments.join(' / '),
    webViewLink: lastFolder!.webViewLink,
  };
}

/**
 * Checks whether a file with the same name already exists inside a Drive folder.
 */
export async function findExistingFileInFolder(
  fileName: string,
  folderId: string,
  accessToken: string
): Promise<DriveExistingFile | null> {
  const escapedName = escapeDriveQueryValue(fileName);
  const q = `name='${escapedName}' and '${escapeDriveQueryValue(folderId)}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=files(id,name,webViewLink)&spaces=drive`;

  const res = await driveFetch(url, accessToken);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}

/**
 * Converts a base64 Data URL into a Blob for multipart Drive upload.
 */
export function dataUrlToBlob(dataUrl: string, fallbackMime = 'application/octet-stream'): Blob {
  if (!dataUrl.startsWith('data:')) {
    return new Blob([dataUrl], { type: fallbackMime });
  }
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : fallbackMime;
  const binary = atob(base64 || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Uploads a Blob/File to Google Drive using multipart/related upload.
 * If existingFileId is provided (after explicit user confirmation), updates that file in place.
 */
export async function uploadBlobToDriveFolder(params: {
  blob: Blob;
  fileName: string;
  mimeType: string;
  folderSegments: string[];
  accessToken: string;
  existingFileIdToOverwrite?: string;
}): Promise<DriveUploadResult> {
  const { blob, fileName, mimeType, folderSegments, accessToken, existingFileIdToOverwrite } = params;

  const { folderId, folderPath } = await ensureFolderPath(folderSegments, accessToken);
  const boundary = `elentory_drive_boundary_${Date.now()}`;

  const metadata: Record<string, any> = existingFileIdToOverwrite
    ? { name: fileName, mimeType }
    : { name: fileName, mimeType, parents: [folderId] };

  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;

  const closingPart = `\r\n--${boundary}--`;
  const multipartBody = new Blob([metadataPart, blob, closingPart], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const uploadUrl = existingFileIdToOverwrite
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        existingFileIdToOverwrite
      )}?uploadType=multipart&fields=id,name,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`;

  const method = existingFileIdToOverwrite ? 'PATCH' : 'POST';

  const res = await driveFetch(uploadUrl, accessToken, {
    method,
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive upload failed (${res.status}): ${errText}`);
  }

  const uploaded = await res.json();
  return {
    fileId: uploaded.id,
    fileName: uploaded.name || fileName,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    folderPath,
    folderId,
    replacedExisting: Boolean(existingFileIdToOverwrite),
  };
}

/**
 * Convenience helper: Uploads a supplier invoice into:
 *   Elentory ERP / Supplier Invoices / <Supplier Name> / <fileName>
 */
export async function uploadSupplierInvoiceToDrive(params: {
  supplierName: string;
  fileName: string;
  blob: Blob;
  mimeType: string;
  accessToken: string;
  existingFileIdToOverwrite?: string;
}): Promise<DriveUploadResult> {
  const cleanSupplier = sanitizeDriveName(params.supplierName, 'Unspecified Supplier');
  return uploadBlobToDriveFolder({
    blob: params.blob,
    fileName: sanitizeDriveName(params.fileName, `Invoice_${Date.now()}.pdf`),
    mimeType: params.mimeType || 'application/pdf',
    folderSegments: ['Elentory ERP', 'Supplier Invoices', cleanSupplier],
    accessToken: params.accessToken,
    existingFileIdToOverwrite: params.existingFileIdToOverwrite,
  });
}

/**
 * Convenience helper: Uploads an Inward Report (Excel/CSV/DOCX) into:
 *   Elentory ERP / Inward / <fileName>
 */
export async function uploadInwardReportToDrive(params: {
  fileName: string;
  blob: Blob;
  mimeType: string;
  accessToken: string;
  existingFileIdToOverwrite?: string;
}): Promise<DriveUploadResult> {
  return uploadBlobToDriveFolder({
    blob: params.blob,
    fileName: sanitizeDriveName(params.fileName, `Inward_Report_${Date.now()}.xlsx`),
    mimeType: params.mimeType,
    folderSegments: ['Elentory ERP', 'Inward'],
    accessToken: params.accessToken,
    existingFileIdToOverwrite: params.existingFileIdToOverwrite,
  });
}

/**
 * Convenience helper: Uploads a Vendor Compliance PDF into:
 *   Elentory ERP / Supplier Invoices / <Supplier Name> / Compliance Docs / <fileName>
 */
export async function uploadVendorComplianceDocToDrive(params: {
  supplierName: string;
  fileName: string;
  blob: Blob;
  mimeType?: string;
  accessToken: string;
  existingFileIdToOverwrite?: string;
}): Promise<DriveUploadResult> {
  const cleanSupplier = sanitizeDriveName(params.supplierName, 'Unspecified Supplier');
  return uploadBlobToDriveFolder({
    blob: params.blob,
    fileName: sanitizeDriveName(params.fileName, `Compliance_Doc_${Date.now()}.pdf`),
    mimeType: params.mimeType || 'application/pdf',
    folderSegments: ['Elentory ERP', 'Supplier Invoices', cleanSupplier, 'Compliance Docs'],
    accessToken: params.accessToken,
    existingFileIdToOverwrite: params.existingFileIdToOverwrite,
  });
}
