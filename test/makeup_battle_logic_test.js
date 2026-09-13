const assert = require('assert');
const game = require('../js/makeup-battle.js');

const perfect = {
  eye: 'pink', lip: 'berry', blush: 'rose', hair: 'black',
  accessory: 'cat', outfit: 'idol', bg: 'stage'
};
assert.strictEqual(game.scoreLook('cat-idol', perfect), 100, '주제에 정확히 맞는 조합은 100점');
assert.strictEqual(game.scoreLook('cat-idol', perfect), game.scoreLook('cat-idol', perfect), '점수는 같은 조합에서 항상 동일');

const payload = game.createChallenge('동용', 'cat-idol', perfect);
const token = game.encodeChallenge(payload);
const restored = game.decodeChallenge(token);
assert.strictEqual(restored.name, '동용');
assert.strictEqual(restored.score, 100);
assert.deepStrictEqual(restored.look, perfect);
assert.ok(!token.includes('data:image'), '도전 링크에는 사진 원본을 넣지 않는다');

assert.strictEqual(game.decodeChallenge('broken-token'), null, '손상된 도전장은 거부');
console.log('PASS: makeup battle scoring and challenge links');
