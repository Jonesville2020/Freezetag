export const SERIES_RULES = {
  tag: { rounds: 5, duration: 40 },
  outbreak: { rounds: 3, duration: 120 },
};

// Scores belong to player slots, not to the current seeker/runner role.
export function createSeries(mode, entities) {
  const rules = SERIES_RULES[mode];
  if (!rules) throw new Error(`Unknown series mode: ${mode}`);
  return {
    mode,
    round: 1,
    rounds: rules.rounds,
    duration: rules.duration,
    scores: new Map(entities.filter((e) => !e.scout).map((e) => [e.id, 0])),
  };
}

export function startSeriesRound(series, entities, nextIt) {
  for (const e of entities) {
    e.frozen = false;
    e.thaw = 0;
    e.grace = 0;
    e.handoff = 0;
    e.infection = 0;
    if (series.mode === 'tag') e.seeker = e.id === nextIt;
    else e.seeker = Boolean(e.scout);
  }
}

export function updateSeries(series, entities, dt) {
  const events = [];
  for (const e of entities) {
    if (series.scores.has(e.id)) {
      const earnsTime = series.mode === 'tag' ? e.seeker : !e.seeker && !e.frozen;
      if (earnsTime) series.scores.set(e.id, series.scores.get(e.id) + dt);
    }
    if (series.mode === 'tag' && e.handoff > 0) {
      e.handoff = Math.max(0, e.handoff - dt);
      if (e.handoff === 0) { e.frozen = false; events.push({ type: 'handoff', player: e }); }
    }
    if (series.mode === 'outbreak' && e.frozen && !e.seeker && e.infection > 0) {
      e.infection = Math.max(0, e.infection - dt);
      if (e.infection === 0) {
        e.frozen = false;
        e.thaw = 0;
        e.seeker = true;
        events.push({ type: 'infected', player: e });
      }
    }
  }
  return events;
}

export function seriesTag(series, seeker, runner) {
  if (!seeker.seeker || seeker.frozen || runner.seeker || runner.frozen || runner.grace > 0) return false;
  if (series.mode === 'tag') {
    seeker.seeker = false;
    seeker.grace = 4.25;
    runner.seeker = true;
    runner.frozen = true;
    runner.handoff = 3;
  } else {
    runner.frozen = true;
    runner.thaw = 0;
    runner.infection = 8;
    if (series.scores.has(seeker.id) && series.scores.has(runner.id)) {
      const amount = Math.min(5, series.scores.get(runner.id));
      series.scores.set(runner.id, series.scores.get(runner.id) - amount);
      series.scores.set(seeker.id, series.scores.get(seeker.id) + amount);
    }
  }
  return true;
}

export function standings(series) {
  const direction = series.mode === 'tag' ? 1 : -1;
  return [...series.scores].map(([id, score]) => ({ id, score }))
    .sort((a, b) => direction * (a.score - b.score) || a.id - b.id);
}

export function seriesLeaders(series) {
  const ranked = standings(series);
  return ranked.filter((entry) => Math.abs(entry.score - ranked[0].score) < 0.005);
}
