const assert = require('assert');
const G = require('../js/makeup-battle.js');

/* 사용자 요청 #4: 내가 찍은 실제 얼굴 사진에 메이크업이 올라가야 하고,
   버튼만 누르는 방식이 아니라 **진하기 게이지**로 디테일하게 조절돼야 한다.
   그래야 점수가 촘촘하게 갈린다. */

// 1) 각 부위는 색(choice)과 진하기(0~100)를 함께 가진다
const look = G.defaultLook();
Object.keys(G.OPTIONS).forEach(function (k) {
  assert.ok('value' in look[k], k + ' 에 색 선택이 있어야 한다');
  assert.ok('level' in look[k], k + ' 에 진하기가 있어야 한다');
  assert.ok(look[k].level >= 0 && look[k].level <= 100);
});

// 2) 주제는 색뿐 아니라 '알맞은 진하기'도 정해둔다
Object.keys(G.THEMES).forEach(function (id) {
  const t = G.THEMES[id].target;
  Object.keys(G.OPTIONS).forEach(function (k) {
    assert.ok(t[k] && 'value' in t[k] && 'level' in t[k],
      id + '/' + k + ' 목표에 색과 진하기가 필요');
  });
});

// 3) 진하기가 목표에 가까울수록 점수가 높다 — 색만 맞으면 만점이 아니다
const perfect = G.THEMES['cat-idol'].target;
assert.strictEqual(G.scoreLook('cat-idol', perfect), 100, '색+진하기 모두 정확 = 100');

const rightColorWrongLevel = JSON.parse(JSON.stringify(perfect));
Object.keys(rightColorWrongLevel).forEach(function (k) {
  rightColorWrongLevel[k].level = Math.abs(rightColorWrongLevel[k].level - 100);
});
const partial = G.scoreLook('cat-idol', rightColorWrongLevel);
assert.ok(partial < 100, '색은 맞고 진하기가 틀리면 만점이 아니다: ' + partial);
assert.ok(partial > 35, '색이 맞으므로 최저점보다는 높다: ' + partial);

// 4) 점수가 촘촘하게 갈린다 — 진하기를 조금 바꾸면 점수도 조금 바뀐다
const near = JSON.parse(JSON.stringify(perfect));
near.eye.level = Math.max(0, near.eye.level - 12);
const nearScore = G.scoreLook('cat-idol', near);
assert.ok(nearScore < 100 && nearScore >= 95,
  '살짝 어긋나면 살짝 깎인다 (95~99 기대): ' + nearScore);

// 5) 잘못된 입력은 안전하게 보정된다
const dirty = G.normalizeLook({ eye: { value: '<script>', level: 999 }, lip: { value: 'red', level: -5 } });
assert.strictEqual(dirty.eye.value, G.defaultLook().eye.value);
assert.ok(dirty.eye.level <= 100 && dirty.lip.level >= 0);
assert.strictEqual(dirty.lip.value, 'red');

// 6) 도전장은 진하기까지 실어 보내고, 점수는 다시 계산한다
const tok = G.encodeChallenge(Object.assign(G.createChallenge('동용', 'cat-idol', perfect), { score: 7 }));
const back = G.decodeChallenge(tok);
assert.strictEqual(back.score, 100, '조작된 점수는 무시하고 재계산');
assert.strictEqual(back.look.eye.level, perfect.eye.level, '진하기가 링크에 보존');

// 7) 실제 사진 위에 그릴 좌표 규격이 정의돼 있다
assert.ok(G.FACE_ZONES && G.FACE_ZONES.eye && G.FACE_ZONES.lip,
  '사진에 메이크업을 올릴 부위 좌표가 필요');
Object.keys(G.FACE_ZONES).forEach(function (k) {
  const z = G.FACE_ZONES[k];
  assert.ok(Array.isArray(z) || typeof z === 'object', k + ' 좌표 형식');
});

console.log('PASS: photo makeup with intensity gauges');
