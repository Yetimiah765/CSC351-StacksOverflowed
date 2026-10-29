import CasinoFloor from '../components/casinoFloor/CasinoFloor';

// SRS-107.1/107.2: the home page is a casino floor to walk around, with
// every game on it (and as a plain list under it); guests can view it too.
// On a laptop or desktop it fills the window below the nav bar.
export default function Home() {
  return (
    <main className="flex min-h-page flex-col bg-[#0b0618] bg-[radial-gradient(ellipse_at_top,_#2a0f3d_0%,_#0b0618_60%)] text-slate-100 lg:h-[calc(100vh-4rem)]">
      <CasinoFloor />
    </main>
  );
}
