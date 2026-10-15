// The profile page's cosmetics section (UR-119, UR-120). Every player starts
// with one default per category, equipped (SRS-119.4, SRS-120.3). Until the
// cosmetics step stores cosmetics in the database, each category shows just
// its default, with the green border that marks the equipped item.
const CATEGORIES = ['Cards', 'Poker Chips', 'Profile Outline'];

export default function CosmeticsSection() {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
      <h2 className="text-xl font-semibold">Cosmetics</h2>
      <div className="mt-4 divide-y divide-slate-800">
        {CATEGORIES.map((category) => (
          <div key={category} className="py-4 first:pt-0 last:pb-0">
            <h3 className="text-sm uppercase tracking-widest text-slate-400">{category}</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              {/* The default is always the leftmost option. */}
              <div className="flex flex-col items-center gap-1">
                <div className="h-16 w-16 rounded-xl border-2 border-emerald-400 bg-slate-950" aria-hidden="true" />
                <span className="text-xs text-slate-300">
                  Default<span className="sr-only"> (equipped)</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
