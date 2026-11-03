// One symbol on a slot reel. Cherry, Lemon, Orange and Bell are emoji; Bar
// and Seven are drawn as lettering, the way a real machine shows them.

import type { SlotSymbolName } from '../../lib/slots';

export type { SlotSymbolName };

const EMOJI: Partial<Record<SlotSymbolName, string>> = {
  Cherry: '🍒',
  Lemon: '🍋',
  Orange: '🍊',
  Bell: '🔔',
};

export default function SlotSymbol({ name }: { name: SlotSymbolName }) {
  const emoji = EMOJI[name];
  if (emoji) {
    return (
      <span role="img" aria-label={name} className="text-5xl leading-none sm:text-6xl">
        {emoji}
      </span>
    );
  }
  if (name === 'Bar') {
    return (
      <span
        aria-label="Bar"
        className="rounded-md border-2 border-slate-900 bg-slate-900 px-2 py-0.5 text-2xl font-black tracking-widest text-white sm:text-3xl"
      >
        BAR
      </span>
    );
  }
  return (
    <span
      aria-label="Seven"
      className="text-6xl font-black leading-none text-red-600 drop-shadow-[0_2px_0_#7f1d1d] sm:text-7xl"
    >
      7
    </span>
  );
}
