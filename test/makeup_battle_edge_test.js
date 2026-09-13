const assert = require('assert');
const game = require('../js/makeup-battle.js');

const perfect = game.THEMES['rich-ceo'].target;
assert.strictEqual(game.scoreLook('rich-ceo', perfect), 100);

// 완전히 어긋난 조합도 0점이 아니라 기본점을 받는다 — 아이들이 좌절하지 않게.
const worst = { eye: 'pearl', lip: 'coral', blush: 'none', hair: 'pink', accessory: 'cat', outfit: 'idol', bg: 'stage' };
const low = game.scoreLook('rich-ceo', worst);
assert.ok(low >= 35 && low < 60, '최저점은 35점 이상 60점 미만: ' + low);

// 잘못된 값은 기본값으로 교체되어 점수 계산이 깨지지 않는다.
const dirty = game.normalizeLook({ eye: '<script>', lip: 'red', nothing: 1 });
assert.strictEqual(dirty.eye, game.DEFAULT_LOOK.eye);
assert.strictEqual(dirty.lip, 'red');
assert.strictEqual(Object.keys(dirty).length, Object.keys(game.OPTIONS).length);

// 이름은 태그와 과도한 길이를 걸러낸다.
const named = game.createChallenge('<b>동용동용동용동용동용동용동용</b>', 'wedding', perfect);
assert.ok(!named.name.includes('<'), '이름에 태그가 남으면 안 된다');
assert.ok(named.name.length <= 12);

// 점수는 링크의 값이 아니라 look 에서 다시 계산한다 — 점수만 고친 링크는 통하지 않는다.
const token = game.encodeChallenge(Object.assign(game.createChallenge('친구', 'wedding', worst), { score: 100 }));
const decoded = game.decodeChallenge(token);
assert.strictEqual(decoded.score, game.scoreLook('wedding', worst), '조작된 점수는 무시하고 재계산');

// 승패 판정
assert.strictEqual(game.compare(80, 90).result, 'win');
assert.strictEqual(game.compare(90, 80).result, 'lose');
assert.strictEqual(game.compare(85, 85).result, 'draw');

// 알 수 없는 주제나 깨진 토큰은 거부
assert.strictEqual(game.decodeChallenge(''), null);
assert.strictEqual(game.decodeChallenge('!!!'), null);
assert.strictEqual(game.decodeChallenge(game.encodeChallenge({ v: 1, theme: 'nope', look: perfect })), null);

console.log('PASS: makeup battle edge cases');
