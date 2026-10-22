import BlindBoxShop from '../../components/BlindBoxShop';
import DailyLoginBox from '../../components/DailyLoginBox';

// SRS-128.1: the Daily Login Box is the first item, before the purchasable
// blind boxes (UR-122 through UR-127).
export default function ShopPage() {
  return (
    <main className="min-h-page bg-slate-950 px-6 py-12 text-slate-100">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">Cosmetic Shop</h1>
        <DailyLoginBox />
        <BlindBoxShop />
      </section>
    </main>
  );
}
