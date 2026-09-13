const assert = require('assert');
const W = require('../js/coin-wallet.js');

let data = {};
const fake = {
  getItem: k => Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null,
  setItem: (k, v) => { data[k] = String(v); }
};
W._setStore(fake);

// 하루 첫 접속에 100개, 같은 날에는 중복 지급하지 않는다.
let d = W.ensureDaily('2026-09-13');
assert.deepStrictEqual(d, { granted: 100, balance: 100 });
assert.deepStrictEqual(W.ensureDaily('2026-09-13'), { granted: 0, balance: 100 });
assert.deepStrictEqual(W.ensureDaily('2026-09-14'), { granted: 100, balance: 200 });

// 한 판 10코인. 잔액이 부족하면 시작할 수 없다.
assert.strictEqual(W.GAME_COST, 10);
assert.strictEqual(W.spend(W.GAME_COST), 190);
W._setCoins(9);
assert.strictEqual(W.spend(W.GAME_COST), false);
assert.strictEqual(W.getCoins(), 9);

// 실력 보상: C < B < A < S, 신기록은 추가 보너스.
assert.deepStrictEqual(['C','B','A','S'].map(t => W.gameReward(t, false)), [2,6,12,20]);
assert.strictEqual(W.gameReward('S', true), 25);

// 얼굴 분석 완료 때마다 5코인.
W._setCoins(0);
assert.strictEqual(W.rewardAnalysis('animal'), 5);
assert.strictEqual(W.getCoins(), 5);

// 친구 요청 → 친구가 30코인을 실제로 지불 → 받는 쪽은 같은 선물을 한 번만 수령.
W._setCoins(100);
const request = W.createRequest('동용', 'req-123');
const parsedRequest = W.decodeToken(request);
assert.strictEqual(parsedRequest.kind, 'request');
assert.strictEqual(parsedRequest.name, '동용');
const gift = W.createGift(parsedRequest, 'gift-456');
assert.ok(gift, '친구가 보낼 코인이 충분하면 선물 링크 생성');
assert.strictEqual(W.getCoins(), 70, '보낸 친구 잔액에서 30코인 차감');

// 받는 사람은 별도 기기/저장소라고 가정한다.
data = {}; W._setStore(fake); W.ensureDaily('2026-09-13'); W._setCoins(0);
assert.deepStrictEqual(W.claimGift(gift), { ok: true, amount: 30, balance: 30 });
assert.deepStrictEqual(W.claimGift(gift), { ok: false, reason: 'claimed', balance: 30 });

console.log('PASS: daily coins, game cost/rewards, analysis rewards and friend gifts');
