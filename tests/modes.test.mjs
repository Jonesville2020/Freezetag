import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeries, startSeriesRound, updateSeries, seriesTag, seriesLeaders } from '../docs/js/modes.js';

const player = (id, seeker = false, scout = false) => ({ id, seeker, scout, frozen: false, grace: 0 });

test('timed tag hands off IT with freeze and grace, including handoff time in the score', () => {
  const players = [player(0, true), player(1)];
  const series = createSeries('tag', players);
  updateSeries(series, players, 2);
  assert.equal(seriesTag(series, players[0], players[1]), true);
  assert.equal(players[0].grace, 4.25);
  assert.equal(players[1].handoff, 3);
  assert.equal(seriesTag(series, players[1], players[0]), false);
  updateSeries(series, players, 3);
  assert.equal(players[1].frozen, false);
  assert.equal(series.scores.get(1), 3);
  assert.equal(series.scores.get(0), 2);
  startSeriesRound(series, players, 1);
  assert.equal(players[1].seeker, true);
  assert.equal(series.scores.get(1), 3);
});

test('outbreak transfers up to five seconds to a scored seeker and infects after eight seconds', () => {
  const players = [player(0, true), player(1), player(2, true, true)];
  const series = createSeries('outbreak', players);
  updateSeries(series, players, 3);
  assert.equal(seriesTag(series, players[0], players[1]), true);
  assert.equal(series.scores.get(0), 3);
  assert.equal(series.scores.get(1), 0);
  updateSeries(series, players, 7.9);
  assert.equal(players[1].seeker, false);
  updateSeries(series, players, 0.2);
  assert.equal(players[1].seeker, true);
  assert.equal(players[1].frozen, false);
  startSeriesRound(series, players);
  assert.equal(players[1].seeker, false);
  assert.equal(players[2].seeker, true);
  assert.equal(series.scores.has(2), false);
});

test('the unscored scout does not steal survival time and close scores tie', () => {
  const players = [player(0), player(1), player(2, true, true)];
  const series = createSeries('outbreak', players);
  updateSeries(series, players, 4);
  seriesTag(series, players[2], players[1]);
  assert.equal(series.scores.get(1), 4);
  assert.deepEqual(seriesLeaders(series).map((e) => e.id), [0, 1]);
});
