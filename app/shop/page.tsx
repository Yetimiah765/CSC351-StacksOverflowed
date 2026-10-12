import DailyLoginBox from '../../components/DailyLoginBox';

// SRS-128.1: the Daily Login Box is the first item, before the purchasable
// blind boxes (UR-122 through UR-127, not built yet).
export default function ShopPage() {
  return (
    <main className="min-h-page bg-slate-950 px-6 py-12 text-slate-100">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">Cosmetic Shop</h1>
        <DailyLoginBox />
        <article className="rounded-3xl border border-slate-800/60 bg-slate-900/40 p-6">
          <h2 className="text-xl font-semibold text-slate-400">Blind boxes</h2>
          <p className="mt-2 text-sm text-slate-400">Coming soon.</p>
        </article>
      </section>
    </main>
  );
}
