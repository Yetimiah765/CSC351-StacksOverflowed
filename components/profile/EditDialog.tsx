'use client';

import { useEffect, useId } from 'react';

// The pop-up every pencil on the profile page opens (the bio now; names,
// username, and password in later steps): a dimmed backdrop, a title, the
// field's own inputs, and Cancel / Save. Cancel and Escape close it without
// saving anything.
export default function EditDialog({
  title,
  saving,
  saveDisabled,
  error,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  saving: boolean;
  saveDisabled: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [saving, onCancel]);

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
          if (!saveDisabled && !saving) onSave();
        }}
        className="w-full max-w-xl rounded-3xl border border-emerald-400/40 bg-slate-900 p-6 shadow-2xl shadow-black/50"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>

        <div className="mt-4">{children}</div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm transition hover:border-slate-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveDisabled || saving}
            className="rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
