// The paytable from SRS-309.2, shown on the slot machine page before the
// player spins (SRS-309.4): each winning combination as it reads on the
// payline, its multiplier, and what it pays at the selected bet.

import { PAYTABLE } from '../../lib/slots';
import SlotSymbol from './SlotSymbol';

/**
 * `bet` is the selected bet, or null while the bet amounts load (then only the
 * multipliers show). `winningRow` is the index of the row the last spin won,
 * passed once the reels have stopped, which lights up with the reels (SRS-308.1).
 */
export default function Paytable({ bet, winningRow = null }: { bet: number | null; winningRow?: number | null }) {
  return (
    <section
      aria-labelledby="slots-paytable-heading"
      className="w-full max-w-2xl rounded-[1.5rem] border-4 border-amber-600 bg-gradient-to-b from-zinc-900 to-black px-4 pb-4 pt-3 shadow-[0_18px_30px_rgba(0,0,0,0.6)] sm:px-6"
    >
      <h2
        id="slots-paytable-heading"
        className="text-center text-sm font-black uppercase tracking-[0.4em] text-amber-300 [text-shadow:0_0_8px_#f59e0b]"
      >
        Paytable
      </h2>
      <p className="mt-0.5 text-center text-xs text-amber-100/60">Read along the payline, left to right. One win per spin.</p>

      <table className="mt-3 w-full border-separate border-spacing-y-1.5 text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">Combination</th>
            <th scope="col">Pays</th>
            {bet !== null && <th scope="col">At your bet of {bet}</th>}
          </tr>
        </thead>
        <tbody>
          {PAYTABLE.map((row, index) => {
            const won = index === winningRow;
            return (
            <tr key={row.label} data-winning={won || undefined}>
              <th scope="row" className="py-0 text-left font-normal">
                <span className="sr-only">
                  {row.label}
                  {won && ' (your win)'}
                </span>
                <span aria-hidden className={`flex w-fit gap-1.5 rounded-lg p-0.5 ${won ? 'slots-paytable-win' : ''}`}>
                  {row.reels.map((symbol, i) => (
                    <span
                      key={i}
                      className="flex h-9 w-10 items-center justify-center rounded-md bg-gradient-to-b from-zinc-200 via-white to-zinc-300 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.25)] sm:h-10 sm:w-12"
                    >
                      {symbol ? (
                        <SlotSymbol name={symbol} size="small" />
                      ) : (
                        <span className="text-center text-[0.6rem] font-black uppercase leading-tight text-zinc-500">
                          Any
                          <br />
                          other
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              </th>
              <td
                className={`whitespace-nowrap px-2 text-right font-mono text-lg font-bold tabular-nums ${
                  won ? 'text-emerald-300 [text-shadow:0_0_10px_#34d399]' : 'text-amber-300'
                }`}
              >
                {row.multiplier}×
              </td>
              {bet !== null && (
                <td
                  className={`whitespace-nowrap text-right font-mono tabular-nums ${won ? 'text-emerald-200' : 'text-amber-100/80'}`}
                >
                  {(row.multiplier * bet).toLocaleString()} coins
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
