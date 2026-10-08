import GameGrid from '../components/GameGrid';

// SRS-107.1/107.2: lists every game, and guests can view it too.
export default function Home() {
  return (
    <main className="min-h-page bg-slate-950 px-6 py-12 text-slate-100">
      <section className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold">Games</h1>
        <GameGrid />
      </section>
    </main>
  );
}
