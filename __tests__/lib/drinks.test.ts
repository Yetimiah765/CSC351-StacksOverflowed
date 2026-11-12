import { describe, expect, it } from 'vitest';
import {
  CLEAR_HEAD_AT,
  DRINK_AMOUNT,
  EMPTY_METER,
  EMPTY_SECONDS,
  SIPS_PER_DRINK,
  SIP_AMOUNT,
  addSip,
  sloshAmount,
  canOrder,
  meterAt,
  parseMeter,
  secondsUntilEmpty,
  serializeMeter,
  STUMBLE_EVERY_MIN,
  STUMBLE_LEAN,
  STUMBLE_SECONDS,
  noStumble,
  stepStumble,
  type DrinkMeter,
} from '../../lib/drinks';

const T = 1_000_000;

function drinks(count: number, at = T): DrinkMeter {
  let meter = EMPTY_METER;
  for (let i = 0; i < count * SIPS_PER_DRINK; i++) meter = addSip(meter, at);
  return meter;
}

describe('drink meter', () => {
  it('fills a sip at a time', () => {
    const meter = addSip(EMPTY_METER, T);
    expect(meter.level).toBeCloseTo(SIP_AMOUNT);
    expect(meter.maxed).toBe(false);
    expect(drinks(1).level).toBeCloseTo(DRINK_AMOUNT);
  });

  it('goes down slowly over time, never below empty', () => {
    const meter = drinks(1);
    expect(meterAt(meter, T + 30_000).level).toBeCloseTo(DRINK_AMOUNT - 30 / EMPTY_SECONDS);
    expect(meterAt(meter, T + EMPTY_SECONDS * 1000).level).toBe(0);
    expect(secondsUntilEmpty(meter, T)).toBeCloseTo(DRINK_AMOUNT * EMPTY_SECONDS);
  });

  it('never fills past full, and full is maxed out', () => {
    const meter = drinks(5);
    expect(meter.level).toBe(1);
    expect(meter.maxed).toBe(true);
    expect(drinks(3).maxed).toBe(false);
  });

  it('takes about four drinks in a row to max out', () => {
    // Four drinks over a minute: the meter goes down a little meanwhile.
    let meter = EMPTY_METER;
    for (let i = 0; i < 4 * SIPS_PER_DRINK; i++) meter = addSip(meter, T + i * 5_000);
    expect(meter.maxed).toBe(true);
  });

  it('sloshes once maxed out, easing off until it is back down to CLEAR_HEAD_AT', () => {
    const meter = drinks(4);
    expect(sloshAmount(meter, T)).toBe(1);
    const halfway = ((1 - CLEAR_HEAD_AT) / 2) * EMPTY_SECONDS * 1000;
    expect(sloshAmount(meter, T + halfway)).toBeCloseTo(0.5);
    const clear = (1 - CLEAR_HEAD_AT) * EMPTY_SECONDS * 1000 + 1;
    expect(sloshAmount(meter, T + clear)).toBe(0);
    expect(meterAt(meter, T + clear).maxed).toBe(false);
    // Not maxed: never sloshed, however full.
    expect(sloshAmount(drinks(3), T)).toBe(0);
  });

  it("won't pour another while maxed out", () => {
    const meter = drinks(4);
    expect(canOrder(meter, T)).toBe(false);
    expect(canOrder(meter, T + (1 - CLEAR_HEAD_AT) * EMPTY_SECONDS * 1000 + 1)).toBe(true);
    expect(canOrder(drinks(2), T)).toBe(true);
  });

  it('stays clear once back down, until it is filled to the top again', () => {
    const later = T + (1 - CLEAR_HEAD_AT) * EMPTY_SECONDS * 1000 + 1;
    const meter = addSip(meterAt(drinks(4), later), later);
    expect(meter.maxed).toBe(false);
    expect(sloshAmount(meter, later)).toBe(0);
  });

  it('round-trips through storage, and refuses anything odd', () => {
    const meter = drinks(2);
    expect(parseMeter(serializeMeter(meter))).toEqual(meter);
    expect(parseMeter(null)).toEqual(EMPTY_METER);
    expect(parseMeter('not json')).toEqual(EMPTY_METER);
    expect(parseMeter(JSON.stringify({ level: 2, at: T }))).toEqual(EMPTY_METER);
    expect(parseMeter(JSON.stringify({ level: 0.5, at: 'x' }))).toEqual(EMPTY_METER);
    expect(parseMeter(JSON.stringify({ level: 0.5, at: T }))).toEqual({ level: 0.5, at: T, maxed: false });
  });
});

describe('stumbling', () => {
  const fixed = (value: number) => () => value;

  it('never stumbles sober', () => {
    let state = noStumble(fixed(0));
    for (let i = 0; i < 1000; i++) {
      const step = stepStumble(state, 0.05, true, 0, fixed(0));
      expect(step.push).toBe(0);
      expect(step.keep).toBe(1);
      state = step.state;
    }
    expect(state.t).toBeNull();
  });

  it('stumbles now and then while walking drunk, never standing still', () => {
    let state = noStumble(fixed(0));
    expect(state.wait).toBe(STUMBLE_EVERY_MIN);
    // Standing still: the wait doesn't run down.
    for (let i = 0; i < 200; i++) state = stepStumble(state, 0.05, false, 1, fixed(0)).state;
    expect(state.t).toBeNull();
    expect(state.wait).toBe(STUMBLE_EVERY_MIN);
    // Walking: once the wait is up, a stumble starts.
    let pushed = 0;
    for (let i = 0; i < Math.ceil((STUMBLE_EVERY_MIN + STUMBLE_SECONDS) / 0.05) + 2; i++) {
      const step = stepStumble(state, 0.05, true, 1, fixed(0.9));
      pushed = Math.max(pushed, Math.abs(step.push));
      state = step.state;
    }
    expect(pushed).toBeGreaterThan(0.9);
  });

  it('lurches one way, slows them and leans into it, then is over', () => {
    let state: ReturnType<typeof stepStumble>['state'] = { wait: 0, t: 0, side: -1 };
    const mid = stepStumble({ ...state, t: STUMBLE_SECONDS / 2 - 0.01 }, 0.01, true, 1);
    expect(mid.push).toBeCloseTo(-1);
    expect(mid.keep).toBeCloseTo(0.4);
    expect(mid.lean).toBeCloseTo(-STUMBLE_LEAN);
    // Half as drunk, half as bad.
    expect(stepStumble({ ...state, t: STUMBLE_SECONDS / 2 - 0.01 }, 0.01, true, 0.5).push).toBeCloseTo(-0.5);
    for (let t = 0; t < STUMBLE_SECONDS + 0.1; t += 0.05) state = stepStumble(state, 0.05, true, 1, fixed(0)).state;
    expect(state.t).toBeNull();
    // The next one is a while off (a little of the wait has run down since).
    expect(state.wait).toBeGreaterThan(STUMBLE_EVERY_MIN - 0.2);
  });

  it('stops a stumble straight away once sobered up', () => {
    const step = stepStumble({ wait: 0, t: 0.3, side: 1 }, 0.05, true, 0, fixed(0));
    expect(step.state.t).toBeNull();
    expect(step.push).toBe(0);
  });
});
