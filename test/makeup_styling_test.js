const assert = require('assert');
const fs = require('fs');
const BF = require('../js/base-face.js');
const G = require('../js/makeup-battle.js');

/* 딸의 요청 3가지:
   1) 머리 스타일을 바꿀 수 있어야 한다
   2) 전신으로 보고 옷을 바꿀 수 있어야 한다
   3) 얼굴형을 바꿀 수 있어야 한다 */

// 1) 머리 — 스타일과 색을 따로 고른다
assert.ok(Array.isArray(BF.HAIR_STYLES) && BF.HAIR_STYLES.length >= 6,
  '머리 스타일 6종 이상: ' + (BF.HAIR_STYLES || []).length);
BF.HAIR_STYLES.forEach(function (h) {
  assert.ok(h.id && h.label, '머리 스타일 메타 누락: ' + JSON.stringify(h));
});
assert.ok(Array.isArray(BF.HAIR_COLORS) && BF.HAIR_COLORS.length >= 6, '머리 색 6종 이상');
BF.HAIR_COLORS.forEach(function (c) {
  assert.ok(c.id && /^#[0-9a-f]{6}$/i.test(c.hex), '머리 색 형식 오류: ' + JSON.stringify(c));
});

// 2) 옷 — 전신 모드가 있고 옷을 고를 수 있다
assert.ok(Array.isArray(BF.OUTFITS) && BF.OUTFITS.length >= 6,
  '옷 6종 이상: ' + (BF.OUTFITS || []).length);
BF.OUTFITS.forEach(function (o) {
  assert.ok(o.id && o.label, '옷 메타 누락: ' + JSON.stringify(o));
  assert.ok(/^#[0-9a-f]{6}$/i.test(o.main), '옷 기본색 형식 오류: ' + o.id);
});
assert.ok(BF.MODES.indexOf('full') >= 0 && BF.MODES.indexOf('portrait') >= 0,
  '전신/얼굴 보기 모드 둘 다 필요');

// 3) 얼굴형 — 고를 수 있고 실제로 윤곽이 다르다
assert.ok(Array.isArray(BF.FACE_SHAPES) && BF.FACE_SHAPES.length >= 4,
  '얼굴형 4종 이상: ' + (BF.FACE_SHAPES || []).length);
BF.FACE_SHAPES.forEach(function (f) {
  assert.ok(f.id && f.label, '얼굴형 메타 누락: ' + JSON.stringify(f));
  assert.ok(BF.SHAPE[f.id], '얼굴형 비율 정의 필요: ' + f.id);
});

// 스타일 상태: 기본값과 보정
const st = G.defaultStyle();
['face', 'hairStyle', 'hairColor', 'outfit'].forEach(function (k) {
  assert.ok(st[k], '기본 스타일에 ' + k + ' 필요');
});
const dirty = G.normalizeStyle({ face: '<script>', hairStyle: 'nope', hairColor: 'zzz', outfit: 'bad' });
assert.deepStrictEqual(dirty, G.defaultStyle(), '잘못된 값은 기본값으로 보정');

// 머리 스타일을 바꾸면 실제 모델에 반영된다
const model = G.resolveModel('soft', { face: 'heart', hairStyle: 'ponytail', hairColor: 'blonde', outfit: 'hanbok' });
assert.strictEqual(model.face, 'heart', '얼굴형 반영');
assert.strictEqual(model.hairStyle, 'ponytail', '머리 스타일 반영');
assert.ok(/^#[0-9a-f]{6}$/i.test(model.hair), '머리 색이 실제 색으로 변환');
assert.strictEqual(model.outfitId, 'hanbok', '옷 반영');

// 얼굴형마다 턱 위치가 실제로 달라야 한다 (그냥 라벨만 바뀌면 의미 없다)
const chins = BF.FACE_SHAPES.map(function (f) { return BF.SHAPE[f.id].chin; });
assert.ok(new Set(chins).size >= 3, '얼굴형별로 턱 위치가 달라야 한다: ' + chins.join(','));

// 도전장은 스타일까지 실어 보낸다
const payload = G.createChallenge('딸', 'cat-idol', G.defaultLook(), 'soft',
  { face: 'long', hairStyle: 'twintail', hairColor: 'pink', outfit: 'dress' });
const back = G.decodeChallenge(G.encodeChallenge(payload));
assert.strictEqual(back.style.hairStyle, 'twintail', '도전장에 머리 스타일 보존');
assert.strictEqual(back.style.outfit, 'dress', '도전장에 옷 보존');
assert.strictEqual(back.style.face, 'long', '도전장에 얼굴형 보존');

// 전신 모드에서도 화장이 얼굴에 정확히 얹히려면 머리 위치를 알 수 있어야 한다
const full = BF.headRect({ mode: 'full' }, 560, 980);
const port = BF.headRect({ mode: 'portrait' }, 560, 700);
assert.ok(full.w > 0 && full.h > 0 && full.y >= 0, '전신 모드 머리 영역');
assert.ok(full.w < 560, '전신에서는 얼굴이 화면 폭보다 작아야 한다');
assert.ok(Math.abs(port.w - 560) < 1 && Math.abs(port.h - 700) < 1, '얼굴 모드는 꽉 채운다');

/* ⚠ 전신에서 머리가 공중에 뜨는 결함이 실제로 있었다.
   모든 얼굴형에 대해 턱이 어깨 위에 있고, 목이 닿을 만큼 가까워야 한다. */
BF.FACE_SHAPES.forEach(function (f) {
  const m = { mode: 'full', face: f.id };
  const r = BF.headRect(m, BF.FULL_W, BF.FULL_H);
  const chin = r.y + (BF.SHAPE[f.id].chin / BF.BASE_H) * r.h;
  assert.ok(chin < BF.BODY.shoulderY,
    f.id + ': 턱(' + Math.round(chin) + ')이 어깨(' + BF.BODY.shoulderY + ')보다 아래면 머리가 몸에 파묻힌다');
  assert.ok(BF.BODY.shoulderY - chin < 110,
    f.id + ': 턱과 어깨 간격이 너무 멀어 머리가 뜬다 (' + Math.round(BF.BODY.shoulderY - chin) + 'px)');
  /* 목 길이는 얼굴형과 무관하게 일정해야 한다 (하트형에서 78px 로 늘어난 적 있음) */
  const headW = r.w * 0.52;
  const neck = BF.NECK_LEN;
  assert.ok(neck < headW * 0.45,
    f.id + ': 목이 너무 길다 (' + neck + 'px, 얼굴폭 ' + Math.round(headW) + 'px)');
});

/* 팔은 어깨 안쪽에 있어야 몸에 붙는다 */
assert.ok(BF.BODY.armX < BF.BODY.shoulderHalf,
  '팔 중심이 어깨 밖으로 나가면 팔이 공중에 뜬다');
/* 팔이 몸통 밖으로 크게 벗어나면 떠 보인다 */
assert.ok((BF.BODY.armX + BF.BODY.armHalf) - BF.BODY.chestHalf <= 8,
  '팔이 가슴폭 밖으로 ' + ((BF.BODY.armX + BF.BODY.armHalf) - BF.BODY.chestHalf) + 'px 벗어났다');
/* 몸 비율: 어깨는 얼굴 폭의 1.3~2.0배 */
const headWidth = BF.headRect({ mode: 'full' }, BF.FULL_W, BF.FULL_H).w * 0.52;
const ratio = (BF.BODY.shoulderHalf * 2) / headWidth;
assert.ok(ratio > 1.25 && ratio < 2.05, '어깨/얼굴 비율이 부자연스럽다: ' + ratio.toFixed(2));

// 화면에 실제 UI가 있어야 한다
const html = fs.readFileSync('Sec13_makeup.html', 'utf8');
['hair-styles', 'hair-colors', 'outfits', 'face-shapes', 'view-mode'].forEach(function (id) {
  assert.ok(html.includes('id="' + id + '"'), id + ' 선택 UI가 필요');
});

console.log('PASS: hair styles, full-body outfits and face shapes are selectable');
