import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  firebaseAuth,
  getInMemoryAccessToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  ensureFolderPath,
  findExistingFileInFolder,
  uploadBlobToDriveFolder,
  DriveUploadResult,
  sanitizeDriveName,
} from '../services/googleDrive';
import { AlertTriangle, HardDrive, X } from 'lucide-react';

interface PendingOverwriteRequest {
  fileName: string;
  folderPath: string;
  resolve: (choice: 'overwrite' | 'keep_both' | 'cancel') => void;
}

interface GoogleDriveContextValue {
  user: User | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectDrive: () => Promise<string | null>;
  disconnectDrive: () => Promise<void>;
  getValidAccessToken: (promptIfNeeded?: boolean) => Promise<string | null>;
  uploadWithOverwriteGuard: (params: {
    blob: Blob;
    fileName: string;
    mimeType: string;
    folderSegments: string[];
    promptSignIn?: boolean;
  }) => Promise<DriveUploadResult | null>;
}

const GoogleDriveContext = createContext<GoogleDriveContextValue | null>(null);

export const GoogleDriveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser);
  const [hasToken, setHasToken] = useState<boolean>(Boolean(getInMemoryAccessToken()));
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwriteRequest | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u);
      if (!u) {
        setHasToken(false);
      } else {
        setHasToken(Boolean(getInMemoryAccessToken()));
      }
    });
    return () => unsub();
  }, []);

  const connectDrive = useCallback(async (): Promise<string | null> => {
    try {
      setIsConnecting(true);
      const { user: signedInUser, accessToken } = await signInWithGoogleDrive();
      setUser(signedInUser);
      setHasToken(true);
      return accessToken;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return null;
      }
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectDrive = useCallback(async () => {
    await signOutGoogleDrive();
    setUser(null);
    setHasToken(false);
  }, []);

  const getValidAccessToken = useCallback(
    async (promptIfNeeded = true): Promise<string | null> => {
      const existing = getInMemoryAccessToken();
      if (existing && firebaseAuth.currentUser) {
        setHasToken(true);
        return existing;
      }
      if (!promptIfNeeded) {
        return null;
      }
      return await connectDrive();
    },
    [connectDrive]
  );

  /**
   * Checks if a file with the same name already exists in the target Drive folder.
   * If so, asks the user via an explicit in-app confirmation modal before overwriting.
   */
  const uploadWithOverwriteGuard = useCallback(
    async (params: {
      blob: Blob;
      fileName: string;
      mimeType: string;
      folderSegments: string[];
      promptSignIn?: boolean;
    }): Promise<DriveUploadResult | null> => {
      const token = await getValidAccessToken(params.promptSignIn ?? true);
      if (!token) return null;

      const cleanFileName = sanitizeDriveName(params.fileName, `File_${Date.now()}`);
      const { folderId, folderPath } = await ensureFolderPath(params.folderSegments, token);
      const existing = await findExistingFileInFolder(cleanFileName, folderId, token);

      let existingFileIdToOverwrite: string | undefined = undefined;
      let finalFileName = cleanFileName;

      if (existing) {
        const choice = await new Promise<'overwrite' | 'keep_both' | 'cancel'>((resolve) => {
          setPendingOverwrite({
            fileName: cleanFileName,
            folderPath,
            resolve,
          });
        });
        setPendingOverwrite(null);

        if (choice === 'cancel') {
          return null;
        }
        if (choice === 'overwrite') {
          existingFileIdToOverwrite = existing.id;
        } else if (choice === 'keep_both') {
          const dotIdx = cleanFileName.lastIndexOf('.');
          const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
          finalFileName =
            dotIdx > 0
              ? `${cleanFileName.slice(0, dotIdx)}_${stamp}${cleanFileName.slice(dotIdx)}`
              : `${cleanFileName}_${stamp}`;
        }
      }

      return await uploadBlobToDriveFolder({
        blob: params.blob,
        fileName: finalFileName,
        mimeType: params.mimeType,
        folderSegments: params.folderSegments,
        accessToken: token,
        existingFileIdToOverwrite,
      });
    },
    [getValidAccessToken]
  );

  const isConnected = Boolean(user && hasToken && getInMemoryAccessToken());

  return (
    <GoogleDriveContext.Provider
      value={{
        user,
        isConnected,
        isConnecting,
        connectDrive,
        disconnectDrive,
        getValidAccessToken,
        uploadWithOverwriteGuard,
      }}
    >
      {children}

      {/* Explicit Confirmation Modal before Overwriting an Existing Google Drive File */}
      {pendingOverwrite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">File Already Exists in Google Drive</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Confirm how you want to save this file</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => pendingOverwrite.resolve('cancel')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 text-slate-500">
                <HardDrive className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-mono truncate">{pendingOverwrite.folderPath}</span>
              </div>
              <p className="font-semibold text-slate-900 break-all">{pendingOverwrite.fileName}</p>
            </div>

            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              A file with this name already exists in this Google Drive folder. Replace the existing file or upload as a new timestamped copy?
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => pendingOverwrite.resolve('cancel')}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => pendingOverwrite.resolve('keep_both')}
                className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300"
              >
                Keep Both (New Copy)
              </button>
              <button
                type="button"
                onClick={() => pendingOverwrite.resolve('overwrite')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
              >
                Replace Existing File
              </button>
            </div>
          </div>
        </div>
      )}
    </GoogleDriveContext.Provider>
  );
};

export function useGoogleDrive(): GoogleDriveContextValue {
  const ctx = useContext(GoogleDriveContext);
  if (!ctx) {
    throw new Error('useGoogleDrive must be used inside a GoogleDriveProvider');
  }
  return ctx;
}
