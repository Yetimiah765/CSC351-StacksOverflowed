import CasinoFloor from '../components/casinoFloor/CasinoFloor';

// SRS-107.1/107.2: the home page is a casino floor to walk around, with
// every game on it (and as a plain list under it); guests can view it too.
// It fills the window below the nav bar edge to edge, like a video game.
export default function Home() {
  return (
    <main className="flex h-[calc(100vh-4rem)] min-h-[320px] flex-col overflow-hidden bg-black text-slate-100">
      <CasinoFloor />
    </main>
  );
}
