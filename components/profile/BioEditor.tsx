'use client';

import { useEffect, useRef, useState } from 'react';
import { BIO_MAX_WORDS, countBioWords } from '../../lib/bio';
import EditDialog from './EditDialog';

// The bio pop-up (UR-114): the current bio in a large text box, with a live
// "N / 50 words" count that turns red past the limit (SRS-114.1), when Save
// is disabled. Saving an empty box clears the bio (SRS-114.2, SRS-114.4).
export default function BioEditor({
  initialBio,
  onSave,
  onCancel,
}: {
  initialBio: string;
  // Resolves to an error message, or null once saved (the parent then closes
  // the pop-up).
  onSave: (bio: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const words = countBioWords(text);
  const overLimit = words > BIO_MAX_WORDS;

  // Start typing at the end of the current bio.
  useEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    const saveError = await onSave(text);
    if (saveError) {
      setError(saveError);
      setSaving(false);
    }
  }

  return (
    <EditDialog
      title="Edit bio"
      saving={saving}
      saveDisabled={overLimit}
      error={error}
      onSave={handleSave}
      onCancel={onCancel}
    >
      <label htmlFor="bio-editor" className="sr-only">
        Bio
      </label>
      <textarea
        id="bio-editor"
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={7}
        placeholder="Tell other players about yourself."
        className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg leading-relaxed text-slate-100 outline-none transition focus:border-emerald-400"
      />
      <p
        aria-live="polite"
        className={`mt-2 text-right text-sm ${overLimit ? 'font-semibold text-red-400' : 'text-slate-400'}`}
      >
        {words} / {BIO_MAX_WORDS} words
      </p>
    </EditDialog>
  );
}
