'use client';

import { useEffect, useId, useRef, useState } from 'react';
import EditDialog from './EditDialog';

// The pop-up for a one-line profile field: first name and last name now, the
// username next. The server checks the field's rules (SRS-112.3) and its
// message is shown here. Save stays disabled while the box is empty or
// unchanged.
export default function TextFieldEditor({
  title,
  label,
  initialValue,
  hint,
  onSave,
  onCancel,
}: {
  title: string;
  label: string;
  initialValue: string;
  hint: string;
  // Resolves to an error message, or null once saved (the parent then closes
  // the pop-up).
  onSave: (value: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Start with the current value selected, so typing replaces it.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    const saveError = await onSave(text.trim());
    if (saveError) {
      setError(saveError);
      setSaving(false);
    }
  }

  return (
    <EditDialog
      title={title}
      saving={saving}
      saveDisabled={!text.trim() || text.trim() === initialValue}
      error={error}
      onSave={handleSave}
      onCancel={onCancel}
    >
      <label htmlFor={inputId} className="text-xs uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
      />
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </EditDialog>
  );
}
