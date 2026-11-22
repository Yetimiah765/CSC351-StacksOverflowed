'use client';

import { useEffect, useId, useRef } from 'react';

// SRS-106.1: the confirmation shown before an account is deleted. Nothing is
// deleted until the player presses Delete my account here; Cancel and Escape
// close it and leave the account as it was. Cancel has the focus to start
// with, so Enter alone doesn't delete anything.
export default function DeleteAccountDialog({
  deleting,
  error,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  deleting: boolean;
  error: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  const titleId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deleting, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur-sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmDisabled && !deleting) onConfirm();
        }}
        className="w-full max-w-xl rounded-3xl border border-red-500/50 bg-slate-900 p-6 shadow-2xl shadow-black/50"
      >
        <h2 id={titleId} className="text-xl font-semibold text-red-200">
          Delete your account?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          This permanently deletes your account and everything in it: your coins, cosmetics, statistics, game history
          and username. It can&apos;t be undone, and there&apos;s no way to get the account back.
        </p>

        {children ? <div className="mt-4">{children}</div> : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButton}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm transition hover:border-slate-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={confirmDisabled || deleting}
            className="rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </form>
    </div>
  );
}
