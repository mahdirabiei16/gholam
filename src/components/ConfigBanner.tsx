import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { HealthStatus } from '../types/app';

interface ConfigBannerProps {
  health: HealthStatus | null;
  error: string | null;
  onDismissError: () => void;
}

export const ConfigBanner: React.FC<ConfigBannerProps> = ({
  health,
  error,
  onDismissError,
}) => {
  if ((!health || health.configured) && !error) {
    return null;
  }

  return (
    <div className="space-y-2">
      {health && !health.configured && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <div className="flex items-center gap-2.5 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>پیکربندی هوش مصنوعی کامل نیست:</strong>{' '}
              {health.missingReason || 'کلید GEMINI_API_KEY در تنظیمات Secrets سرور تنظیم نشده است.'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
        >
          <div className="flex items-center gap-2.5 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="بستن پیام خطا"
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
