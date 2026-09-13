const assert = require('assert');
const game = require('../js/makeup-battle.js');

/* 주제의 목표 메이크업을 그대로 따라하면 100점, 도전장은 색+진하기를 모두 싣는다. */
const perfect = game.THEMES['cat-idol'].target;
assert.strictEqual(game.scoreLook('cat-idol', perfect), 100, '주제에 정확히 맞는 조합은 100점');
assert.strictEqual(game.scoreLook('cat-idol', perfect), game.scoreLook('cat-idol', perfect),
  '점수는 같은 조합에서 항상 동일');

const payload = game.createChallenge('동용', 'cat-idol', perfect);
const token = game.encodeChallenge(payload);
const restored = game.decodeChallenge(token);
assert.strictEqual(restored.name, '동용');
assert.strictEqual(restored.score, 100);
Object.keys(game.OPTIONS).forEach(function (k) {
  assert.strictEqual(restored.look[k].value, perfect[k].value, k + ' 색 보존');
  assert.strictEqual(restored.look[k].level, perfect[k].level, k + ' 진하기 보존');
});
assert.ok(!token.includes('data:image'), '도전 링크에는 사진 원본을 넣지 않는다');

assert.strictEqual(game.decodeChallenge('broken-token'), null, '손상된 도전장은 거부');
console.log('PASS: makeup battle scoring and challenge links');
