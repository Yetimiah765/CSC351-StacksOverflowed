// The blank person icon shown in place of a profile photo for an account that
// has none (SRS-115.5). It fills its container, which crops it to a circle.
export default function DefaultAvatar() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full bg-slate-800 text-slate-500">
      <circle cx="50" cy="38" r="18" fill="currentColor" />
      <path d="M14 100c2-22 17-34 36-34s34 12 36 34z" fill="currentColor" />
    </svg>
  );
}
