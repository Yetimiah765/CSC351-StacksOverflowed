// A labeled box on the profile page. A field with onEdit gets a pencil button
// that opens its pop-up; the others are read-only for now.
export default function ProfileField({
  label,
  value,
  onEdit,
  multiline = false,
  secret = false,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  multiline?: boolean;
  // Shows dots instead of the value, for the password, which is never sent
  // to the page (only its hash is stored, SRS-104.5).
  secret?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-widest text-slate-400">{label}</span>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${label.toLowerCase()}`}
            title={`Edit ${label.toLowerCase()}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800 hover:text-emerald-200"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
              <path d="m13.5 8.5 3 3" />
            </svg>
          </button>
        ) : null}
      </div>
      <div
        className={`mt-1 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-slate-100 ${
          multiline ? 'min-h-[6.5rem] whitespace-pre-line' : 'truncate'
        }`}
      >
        {secret ? (
          <>
            <span aria-hidden="true">••••••••</span>
            <span className="sr-only">Hidden</span>
          </>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
