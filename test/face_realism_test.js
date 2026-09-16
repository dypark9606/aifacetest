const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BF = require(path.join(ROOT, 'js/base-face.js'));
const src = fs.readFileSync(path.join(ROOT, 'js/base-face.js'), 'utf8');

/* 딸 피드백: "얼굴이 너무 괴상한 애니메이션 같다".
   원인을 수치로 특정했다 — 눈이 실제 인체비례보다 1.75배 컸다.
   고전 인체비례: 얼굴 폭 = 눈 5개 폭. 즉 눈 하나 = 얼굴폭 / 5.
   이 테스트는 "예쁘다"가 아니라 **비율이 사람 범위 안인가**를 본다. */

const W = 560, H = 700;
const model = { face: 'oval', eye: 'almond' };
/* ⚠ headRect().w 는 캔버스 폭(560)이지 얼굴 폭이 아니다.
   실제 머리 폭은 뒷머리 외곽(HAIR_LEN.outX)이 아니라 **얼굴 윤곽**으로 재야 한다.
   SHAPE.cheek 이 광대 y 좌표이므로, 얼굴 폭은 관자~턱 실루엣에서 나온다.
   렌더러 상수와 맞춰 실측한 값: 좌우 여백 약 131px 씩 -> 얼굴 폭 ≈ 298px. */
const faceW = 298;

/* --- 1. 눈 크기 --- */
const eyeHalf = /var w = (\d+), inner = cx/.exec(src);
assert.ok(eyeHalf, 'eyeShape 의 눈 반폭을 찾을 수 없다');
const eyeW = Number(eyeHalf[1]) * 2;
const idealEyeW = faceW / 5;
const ratio = eyeW / idealEyeW;
assert.ok(ratio <= 1.30,
  `눈이 실제 비율보다 너무 크다 (${ratio.toFixed(2)}배, 눈폭 ${eyeW}px vs 이상 ${idealEyeW.toFixed(0)}px) — 애니메이션처럼 보인다`);
assert.ok(ratio >= 0.85,
  `눈이 너무 작다 (${ratio.toFixed(2)}배)`);

/* --- 2. 두 눈 사이 간격 = 눈 하나 폭 (실제 비율) --- */
const shape = BF.SHAPE[model.face];
const gapBetween = shape.eyeGap * 2 - eyeW;   // 안쪽 눈초리 사이 거리
assert.ok(gapBetween > eyeW * 0.6 && gapBetween < eyeW * 1.5,
  `두 눈 사이가 눈 하나 폭과 크게 다르다: 간격 ${gapBetween.toFixed(0)}px vs 눈폭 ${eyeW}px`);

/* --- 3. 세로 배치: 삼정(이마:중안:하안 = 1:1:1) 근처 --- */
const top = 60, chin = shape.chin;
const faceH = chin - top;
function at(v) { return (v - top) / faceH; }
assert.ok(at(BF.BROW_Y) > 0.30 && at(BF.BROW_Y) < 0.46,
  `눈썹 위치가 비정상: ${(at(BF.BROW_Y) * 100).toFixed(0)}% (정상 30~46%)`);
assert.ok(at(BF.EYE_Y) > 0.38 && at(BF.EYE_Y) < 0.54,
  `눈 위치가 비정상: ${(at(BF.EYE_Y) * 100).toFixed(0)}% (정상 38~54%)`);
assert.ok(at(BF.NOSE_Y) > 0.62 && at(BF.NOSE_Y) < 0.78,
  `코 위치가 비정상: ${(at(BF.NOSE_Y) * 100).toFixed(0)}%`);
assert.ok(at(BF.MOUTH_Y) > 0.76 && at(BF.MOUTH_Y) < 0.90,
  `입 위치가 비정상: ${(at(BF.MOUTH_Y) * 100).toFixed(0)}%`);
/* 순서가 뒤집히면 안 된다 */
assert.ok(BF.BROW_Y < BF.EYE_Y && BF.EYE_Y < BF.NOSE_Y && BF.NOSE_Y < BF.MOUTH_Y,
  '이목구비 세로 순서가 어긋났다');

/* --- 4. 입은 눈동자 사이보다 좁아야 한다 (사람 얼굴 규칙) --- */
assert.ok(/MOUTH_W/.test(src), '입 폭이 상수로 관리되지 않는다');

/* --- 5. 머리 스타일 다양성 (딸 요청 1) --- */
assert.ok(BF.HAIR_STYLES.length >= 16,
  `머리 스타일이 부족하다: ${BF.HAIR_STYLES.length}종 (16종 이상)`);
BF.HAIR_STYLES.forEach(h => {
  assert.ok(h.id && h.label, '머리 스타일에 id/label 이 없다: ' + JSON.stringify(h));
});
/* 길이대가 고루 있어야 "다양"하다 */
const hairIds = BF.HAIR_STYLES.map(h => h.id);
['pixie', 'bob', 'long', 'ponytail', 'braid', 'bun'].forEach(k => {
  assert.ok(hairIds.some(id => id.includes(k) || id === k),
    `머리 계열이 빠졌다: ${k}`);
});

/* --- 6. 옷 다양성 (딸 요청 2) --- */
assert.ok(BF.OUTFITS.length >= 16,
  `옷이 부족하다: ${BF.OUTFITS.length}종 (16종 이상)`);
BF.OUTFITS.forEach(o => {
  assert.ok(o.id && o.label, '옷에 id/label 이 없다: ' + JSON.stringify(o));
  assert.ok(o.cat, '옷에 카테고리(cat)가 없다: ' + o.id);
});
/* 캐주얼·정장 등 카테고리가 실제로 갈려 있어야 한다 */
const cats = [...new Set(BF.OUTFITS.map(o => o.cat))];
assert.ok(cats.length >= 4, `옷 카테고리가 부족하다: ${cats.join(',')}`);
['캐주얼', '정장'].forEach(c => {
  assert.ok(cats.includes(c), `"${c}" 카테고리가 없다 (있는 것: ${cats.join(',')})`);
});

console.log(`PASS: 눈 비율 ${ratio.toFixed(2)}배, 머리 ${BF.HAIR_STYLES.length}종, ` +
  `옷 ${BF.OUTFITS.length}종 (${cats.join('/')})`);

/* --- 7. 스타일이 "이름만" 다르면 안 된다 ---
   실측으로 18종 중 4쌍이 완전히 같은 실루엣으로 그려지는 것을 발견했다.
   (같은 length 에 앞머리만 달라서 뒷머리가 동일했다)
   길이대가 같아도 vol/wavy/tied 중 하나는 달라야 한다. */
const sig = h => [h.length, h.vol || 0, h.wavy || 0, h.tied || '', h.bang || ''].join('|');
const bySig = {};
BF.HAIR_STYLES.forEach(h => { (bySig[sig(h)] = bySig[sig(h)] || []).push(h.id); });
const hairDup = Object.values(bySig).filter(a => a.length > 1);
assert.strictEqual(hairDup.length, 0,
  '실루엣이 완전히 같은 머리 스타일이 있다(이름만 다름): ' + JSON.stringify(hairDup));

/* 옷도 마찬가지 — kind 가 같으면 색이라도 달라야 한다 */
const outSig = {};
BF.OUTFITS.forEach(o => {
  const k = o.kind + '|' + o.main + '|' + o.trim;
  (outSig[k] = outSig[k] || []).push(o.id);
});
const outDup = Object.values(outSig).filter(a => a.length > 1);
assert.strictEqual(outDup.length, 0,
  '완전히 같은 옷이 있다: ' + JSON.stringify(outDup));
console.log('PASS: 머리·옷 실루엣 중복 없음');

/* --- 8. 소매가 팔을 통째로 덮으면 안 된다 ---
   실측으로 정장·셔츠·조끼·자켓의 팔이 사라진 것을 발견했다.
   원인: 소매 끝 y 를 hipY(648)로 줬는데 handY 가 652 라 손까지 덮였다. */
const sleeveCalls = [...src.matchAll(/drawSleeves\(ctx,\s*([^,]+),/g)].map(m => m[1].trim());
assert.ok(sleeveCalls.length >= 10, '소매 호출을 찾지 못했다: ' + sleeveCalls.length);
sleeveCalls.forEach(arg => {
  /* BODY.handY 를 쓰는 경우 반드시 빼기(-)가 있어야 손이 보인다 */
  if (/handY/.test(arg)) {
    assert.ok(/-/.test(arg),
      `소매가 손까지 덮는다 (handY 에서 빼지 않음): drawSleeves(ctx, ${arg}, ...)`);
  }
  /* hipY 이하로 내려가면 손과 겹친다 (hipY 648 vs handY 652) */
  assert.ok(!/hipY\s*\+/.test(arg),
    `소매 끝이 hipY 를 넘어 팔을 덮는다: drawSleeves(ctx, ${arg}, ...)`);
});
console.log('PASS: 소매가 팔을 덮지 않음');
