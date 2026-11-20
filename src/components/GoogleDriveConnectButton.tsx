import React from 'react';
import { LogOut, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useGoogleDrive } from '../context/GoogleDriveContext';

interface GoogleDriveConnectButtonProps {
  compact?: boolean;
  onStatusMessage?: (msg: string, type?: 'success' | 'error') => void;
}

const GoogleGLogo = () => (
  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

export const GoogleDriveConnectButton: React.FC<GoogleDriveConnectButtonProps> = ({
  compact = false,
  onStatusMessage,
}) => {
  const { user, isConnected, isConnecting, connectDrive, disconnectDrive } = useGoogleDrive();

  const handleConnect = async () => {
    try {
      const token = await connectDrive();
      if (token) {
        onStatusMessage?.('Connected to Google Drive for supplier folders & Inward exports', 'success');
      }
    } catch (err: any) {
      onStatusMessage?.(err?.message || 'Could not connect to Google Drive', 'error');
    }
  };

  const handleDisconnect = async () => {
    await disconnectDrive();
    onStatusMessage?.('Disconnected from Google Drive', 'success');
  };

  if (isConnected && user) {
    return (
      <div className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="font-semibold whitespace-nowrap">
          {compact ? 'Drive Connected' : `Drive: ${user.email || user.displayName || 'Connected'}`}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          title="Sign out of Google Drive"
          className="ml-1 p-0.5 text-emerald-700 hover:text-red-600 rounded transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isConnecting}
      onClick={handleConnect}
      className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-medium shadow-2xs transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
      title="Sign in with Google to sync Supplier Invoices & Inward Reports to Google Drive"
    >
      {isConnecting ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
      ) : (
        <GoogleGLogo />
      )}
      <span>{isConnecting ? 'Connecting...' : 'Sign in with Google'}</span>
    </button>
  );
};
