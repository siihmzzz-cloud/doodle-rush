import test from 'node:test';
import assert from 'node:assert/strict';
import { drawerPoints, normalizeGuess, pickWord, pointsForGuess } from '../shared/game.js';

test('category selection only draws from the requested word pack', () => {
  const selected = pickWord('Animals', () => 0.4);
  assert.ok(['giraffe', 'octopus', 'penguin', 'hedgehog', 'dolphin', 'turtle'].includes(selected));
});

test('random selection uses the full enabled word pool', () => {
  assert.equal(pickWord('Random', () => 0), 'giraffe');
  assert.equal(pickWord('Random', () => 0.999), 'sunflower');
});

test('guess comparison ignores spaces, case, and punctuation', () => {
  assert.equal(normalizeGuess('  Red-FOX! '), 'redfox');
  assert.equal(normalizeGuess('RED fox'), normalizeGuess('redfox'));
});

test('earlier correct guesses score more while points stay above the floor', () => {
  assert.ok(pointsForGuess(55, 60) > pointsForGuess(5, 60));
  assert.equal(pointsForGuess(0, 60), 100);
  assert.equal(pointsForGuess(-2, 60), 100);
});

test('drawer points increase with successful guesses and cap at seven', () => {
  assert.equal(drawerPoints(0), 0);
  assert.equal(drawerPoints(3), 150);
  assert.equal(drawerPoints(20), 350);
});
