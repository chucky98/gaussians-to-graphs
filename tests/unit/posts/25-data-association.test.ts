/** Every concrete claim in post 25, checked against AssociationGating's defaults (CLAUDE.md rules 13, 14). */
import { describe, expect, it } from 'vitest';
import {
  RUN25,
  SCENE,
  applyHypothesis,
  associate,
  makeScene,
  positionError,
  runUnlabelled,
  tally,
  type Method,
  type SceneParams,
} from '../../../src/lib/demos/association';

const f2 = (v: number) => v.toFixed(2);
function scene(o: Partial<SceneParams>, m: Method) {
  const p = { ...SCENE.defaults, ...o };
  const sc = makeScene(p);
  const h = associate(sc, m, p.gateProb);
  return {
    t: tally(sc, h),
    before: positionError(sc.state, sc.truth),
    after: positionError(applyHypothesis(sc, h), sc.truth),
  };
}

describe('post 25: the scene', () => {
  it('defaults: 0.6 m off, no clutter, gate 0.99, JCBB; landmarks 1 m apart', () => {
    expect(SCENE.defaults).toEqual({ offset: 0.6, clutter: 0, gateProb: 0.99 });
    expect(SCENE.landmarks.slice(0, 5).map((m) => m[1])).toEqual([-2, -1, 0, 1, 2]);
  });
  it('JCBB: all six correct, 0.60 → 0.01; NN: four wrong, one unpaired, 0.60 → 0.51', () => {
    const j = scene({}, 'jcbb');
    expect([j.t.correct, j.t.wrong, f2(j.before), f2(j.after)]).toEqual([6, 0, '0.60', '0.01']);
    const n = scene({}, 'nn');
    expect([n.t.wrong, n.t.missed, f2(n.after)]).toEqual([4, 1, '0.51']);
  });
  it('NN correct at 0.45 m, one wrong at 0.55 m; JCBB correct up to 1.2 m', () => {
    expect(scene({ offset: 0.45 }, 'nn').t.correct).toBe(6);
    expect(scene({ offset: 0.55 }, 'nn').t.wrong).toBe(1);
    for (const offset of [0.45, 0.6, 0.8, 1, 1.2]) expect(scene({ offset }, 'jcbb').t.correct).toBe(6);
  });
  it('1.5 m off: gate 0.99 → five correct, 0.08 m; gate 0.9 → four wrong, 1.04 m', () => {
    const a = scene({ offset: 1.5 }, 'jcbb');
    expect([a.t.correct, a.t.wrong, f2(a.after)]).toEqual([5, 0, '0.08']);
    const b = scene({ offset: 1.5, gateProb: 0.9 }, 'jcbb');
    expect([b.t.correct, b.t.wrong, f2(b.after)]).toEqual([0, 4, '1.04']);
  });
  it('8 clutter readings, gate 0.999: NN accepts one, JCBB pairs only the six real readings', () => {
    expect(scene({ clutter: 8, gateProb: 0.999 }, 'nn').t.clutterAccepted).toBe(1);
    const j = scene({ clutter: 8, gateProb: 0.999 }, 'jcbb').t;
    expect([j.correct, j.wrong, j.clutterAccepted]).toEqual([6, 0, 0]);
  });
});

describe('post 25: the run without labels', () => {
  const sum = (r: ReturnType<typeof runUnlabelled>) =>
    r.steps.reduce((a, s) => ({ c: a.c + s.correct, w: a.w + s.wrong, d: a.d + s.duplicates }), { c: 0, w: 0, d: 0 });
  const clean = runUnlabelled('jcbb', null);
  const forced = runUnlabelled('jcbb', RUN25.forced);
  it('JCBB: 581 pairings, all correct, 16 landmarks, 4 of 601 readings unused; final error 0.72 m', () => {
    expect(sum(clean)).toEqual({ c: 581, w: 0, d: 0 });
    expect(clean.steps.at(-1)!.state.ids).toHaveLength(16);
    expect(clean.run.readings.reduce((s, r) => s + r.length, 0)).toBe(601);
    expect(601 - 581 - 16).toBe(4);
    expect(f2(clean.steps[240]!.robotError)).toBe('0.72');
  });
  it('forced at step 131 (15 → 14): 19 more wrong, 13 duplicates, 3.11 m at 160 (0.20 without), 4.12 at the end', () => {
    expect(RUN25.forced).toEqual({ step: 131, from: 15, to: 14 });
    expect(sum(forced)).toMatchObject({ w: 20, d: 13 });
    expect(forced.steps[131]!.robotError).toBeLessThan(clean.steps[131]!.robotError);
    expect([f2(forced.steps[160]!.robotError), f2(clean.steps[160]!.robotError)]).toEqual(['3.11', '0.20']);
    expect(f2(forced.steps[240]!.robotError)).toBe('4.12');
  });
});
