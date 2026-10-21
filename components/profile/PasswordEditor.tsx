'use client';

import { useEffect, useId, useRef, useState } from 'react';
import EditDialog from './EditDialog';

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const INPUT_CLASS =
  'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400';

// The Change Password pop-up (UR-113): the current password (SRS-113.1) and
// the new one typed twice, since there is no password reset to recover from
// a typo. Save stays disabled until every box is filled and the two new
// passwords match. The server checks the current password (SRS-113.2) and
// the registration rules (SRS-113.3), and its message is shown here.
export default function PasswordEditor({
  onSave,
  onCancel,
}: {
  // Resolves to an error message, or null once changed (the parent then
  // closes the pop-up).
  onSave: (change: PasswordChange) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentRef = useRef<HTMLInputElement>(null);
  const ids = { current: useId(), next: useId(), confirm: useId() };

  const mismatch = confirmPassword !== '' && newPassword !== confirmPassword;

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    const saveError = await onSave({ currentPassword, newPassword, confirmPassword });
    if (saveError) {
      setError(saveError);
      setSaving(false);
    }
  }

  return (
    <EditDialog
      title="Change password"
      saving={saving}
      saveDisabled={!currentPassword || !newPassword || !confirmPassword || mismatch}
      error={error}
      onSave={handleSave}
      onCancel={onCancel}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={ids.current} className="text-xs uppercase tracking-widest text-slate-400">
            Current password
          </label>
          <input
            id={ids.current}
            ref={currentRef}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={ids.next} className="text-xs uppercase tracking-widest text-slate-400">
            New password
          </label>
          <input
            id={ids.next}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className={INPUT_CLASS}
          />
          <p className="mt-2 text-sm text-slate-400">
            At least 8 characters, letters and numbers only, with at least one of each. Capitals count.
          </p>
        </div>
        <div>
          <label htmlFor={ids.confirm} className="text-xs uppercase tracking-widest text-slate-400">
            Confirm new password
          </label>
          <input
            id={ids.confirm}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={mismatch}
            className={INPUT_CLASS}
          />
          {mismatch ? (
            <p aria-live="polite" className="mt-2 text-sm font-semibold text-red-400">
              The new passwords don&apos;t match.
            </p>
          ) : null}
        </div>
      </div>
    </EditDialog>
  );
}
