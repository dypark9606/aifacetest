const assert = require('assert');
const A = require('../js/arcade-core.js');

/* 아케이드 공용 엔진: 점수 등급, 최고기록, 도전장 링크, 코인 보상 */

// 1) 게임 목록 — 5종이 등록돼 있어야 한다
/* 비행기 격추는 까마귀 사냥과 flyer() 를 공유하는 완전 중복이라 삭제했다.
   숫자를 늘리려고 같은 게임을 이모지만 바꿔 넣지 않는다. */
assert.ok(Array.isArray(A.GAMES) && A.GAMES.length >= 4, '미니게임 4종 이상: ' + A.GAMES.length);
A.GAMES.forEach(function (g) {
  assert.ok(g.id && g.name && g.emoji, '게임 메타 누락: ' + JSON.stringify(g));
  assert.ok(typeof g.unit === 'string', '점수 단위 표기 필요: ' + g.id);
  assert.ok(['high', 'low'].indexOf(g.better) >= 0, 'high/low 중 하나: ' + g.id);
});

// 2) 등급 — 높을수록 좋은 게임과 낮을수록 좋은 게임을 모두 다룬다
assert.strictEqual(A.rank('mole', 40).tier, 'S', '두꺼비 40점이면 S');
assert.strictEqual(A.rank('mole', 0).tier, 'C');
assert.ok(A.rank('reflex', 180).tier === 'S', '반응속도 180ms 는 S: ' + A.rank('reflex', 180).tier);
assert.ok(A.rank('reflex', 600).tier !== 'S', '반응속도 600ms 는 S 가 아니다');

// 3) 최고기록 — 더 좋은 기록만 갱신된다
var store = {};
var fake = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); } };
A._setStore(fake);
assert.strictEqual(A.saveBest('mole', 10), true, '첫 기록은 저장');
assert.strictEqual(A.saveBest('mole', 5), false, '낮은 점수는 갱신 안 함');
assert.strictEqual(A.saveBest('mole', 22), true, '높은 점수는 갱신');
assert.strictEqual(A.getBest('mole'), 22);
assert.strictEqual(A.saveBest('reflex', 400), true);
assert.strictEqual(A.saveBest('reflex', 500), false, '반응속도는 느려지면 갱신 안 함');
assert.strictEqual(A.saveBest('reflex', 250), true, '반응속도는 빨라지면 갱신');
assert.strictEqual(A.getBest('reflex'), 250);

// 4) 도전장 — 점수는 링크가 아니라 게임 규칙으로 검증된다
var tok = A.encode(A.challenge('동용', 'mole', 33));
var back = A.decode(tok);
assert.strictEqual(back.name, '동용');
assert.strictEqual(back.game, 'mole');
assert.strictEqual(back.score, 33);
assert.strictEqual(A.decode('!!bad!!'), null);
assert.strictEqual(A.decode(A.encode({ v: 1, game: 'nope', score: 1, name: 'x' })), null, '없는 게임은 거부');
assert.strictEqual(A.decode(A.encode({ v: 1, game: 'mole', score: 99999, name: 'x' })), null, '규칙상 불가능한 점수는 거부');

// 5) 승패 — 게임마다 방향이 다르다
assert.strictEqual(A.judge('mole', 30, 20).result, 'win', '두더지는 높을수록 승');
assert.strictEqual(A.judge('reflex', 200, 300).result, 'win', '반응속도는 낮을수록 승');
assert.strictEqual(A.judge('mole', 20, 20).result, 'draw');

// 6) 코인 — 플레이마다 보상, 신기록이면 보너스
assert.ok(A.coins('mole', 30, true) > A.coins('mole', 30, false), '신기록 보너스');
assert.ok(A.coins('mole', 0, false) >= 1, '최소 보상은 있어야 계속 하게 된다');

// 7) 이름 정제
assert.ok(!A.challenge('<b>x</b>', 'mole', 5).name.includes('<'));

console.log('PASS: arcade core');
