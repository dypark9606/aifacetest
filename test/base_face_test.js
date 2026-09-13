const assert = require('assert');
const fs = require('fs');
const BF = require('../js/base-face.js');
const G = require('../js/makeup-battle.js');

/* 베이스 모델은 "도형 몇 개"가 아니라 인형에 가까운 얼굴이어야 한다. */
assert.strictEqual(typeof BF.draw, 'function', '피부·머리 베이스 렌더러');
assert.strictEqual(typeof BF.drawFeatures, 'function', '이목구비 렌더러');
assert.strictEqual(typeof BF.clip, 'function', '화장 클리핑 경로');

// 모델마다 인형 얼굴에 필요한 색이 모두 정의돼야 한다.
Object.keys(G.BASE_MODELS).forEach(function (id) {
  const m = G.BASE_MODELS[id];
  ['skin','skinShadow','hair','iris','lip','outfit','bg'].forEach(function (k) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(m[k]), id + '.' + k + ' 색상 형식 오류: ' + m[k]);
  });
  assert.ok(BF.SHAPE[m.face], id + ' 얼굴형에 대응하는 비율 정의 필요');
});

// 화장 좌표는 실제 이목구비 위치와 맞아야 한다 (아이섀도가 이마에 칠해지면 안 됨).
const H = BF.BASE_H;
const eyeY = G.FACE_ZONES.eye[0][1] * H;
/* 아이섀도는 눈꺼풀에 얹히므로 눈 중심보다 살짝 위가 정상이다.
   눈 아래로 내려가거나 눈썹 위로 올라가면 잘못된 것이다. */
assert.ok(eyeY < BF.EYE_Y, '아이섀도는 눈 중심보다 위(눈꺼풀): ' + eyeY + ' vs ' + BF.EYE_Y);
assert.ok(BF.EYE_Y - eyeY < 30, '아이섀도가 눈에서 너무 멀다: ' + eyeY + ' vs ' + BF.EYE_Y);
assert.ok(eyeY > BF.BROW_Y, '아이섀도가 눈썹보다 위로 가면 안 된다: ' + eyeY + ' vs ' + BF.BROW_Y);
const browY = G.FACE_ZONES.brow[0][1] * H;
assert.ok(Math.abs(browY - BF.BROW_Y) < 24, '눈썹 영역 위치: ' + browY + ' vs ' + BF.BROW_Y);
const lipY = G.FACE_ZONES.lip[0][1] * H;
assert.ok(Math.abs(lipY - BF.MOUTH_Y) < 24, '립 영역 위치: ' + lipY + ' vs ' + BF.MOUTH_Y);
assert.ok(G.FACE_ZONES.brow[0][1] < G.FACE_ZONES.eye[0][1], '눈썹은 눈보다 위');
assert.ok(G.FACE_ZONES.eye[0][1] < G.FACE_ZONES.blush[0][1], '눈은 볼보다 위');
assert.ok(G.FACE_ZONES.blush[0][1] < G.FACE_ZONES.lip[0][1], '볼은 입술보다 위');

// 눈 좌우 좌표는 실제로 그려지는 눈 간격과 일치해야 한다.
const shape = BF.SHAPE[G.BASE_MODELS.soft.face];
const leftEyeX = G.FACE_ZONES.eye[0][0] * BF.BASE_W;
assert.ok(Math.abs(leftEyeX - (280 - shape.eyeGap)) < 26,
  '왼쪽 아이섀도 x 좌표: ' + leftEyeX + ' vs ' + (280 - shape.eyeGap));

// 화면이 새 렌더러를 실제로 쓰는지 확인한다.
const html = fs.readFileSync('Sec13_makeup.html', 'utf8');
assert.ok(html.includes('js/base-face.js'), '새 렌더러 로드');
assert.ok(html.includes('BF.draw(') && html.includes('BF.drawFeatures('), '베이스와 이목구비를 분리해 그린다');
assert.ok(html.includes('modelThumb'), '모델 선택은 실제 얼굴 썸네일로 보여 준다');
assert.ok(!html.includes('drawBaseFace'), '옛 저품질 렌더러 제거');

console.log('PASS: realistic doll-like base face renderer');
