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

/** `size="small"` draws the symbol for the paytable instead of a reel. */
export default function SlotSymbol({ name, size = 'reel' }: { name: SlotSymbolName; size?: 'reel' | 'small' }) {
  const small = size === 'small';
  const emoji = EMOJI[name];
  if (emoji) {
    return (
      <span role="img" aria-label={name} className={small ? 'text-xl leading-none sm:text-2xl' : 'text-5xl leading-none sm:text-6xl'}>
        {emoji}
      </span>
    );
  }
  if (name === 'Bar') {
    return (
      <span
        role="img"
        aria-label="Bar"
        className={`rounded-md border-2 border-slate-900 bg-slate-900 font-black text-white ${
          small ? 'px-0.5 text-[0.55rem] tracking-wider sm:text-[0.65rem]' : 'px-2 py-0.5 text-2xl tracking-widest sm:text-3xl'
        }`}
      >
        BAR
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label="Seven"
      className={`font-black leading-none text-red-600 ${
        small ? 'text-2xl drop-shadow-[0_1px_0_#7f1d1d] sm:text-3xl' : 'text-6xl drop-shadow-[0_2px_0_#7f1d1d] sm:text-7xl'
      }`}
    >
      7
    </span>
  );
}
