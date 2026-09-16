const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'Sec13_makeup.html'), 'utf8');
const mb = fs.readFileSync(path.join(ROOT, 'js/makeup-battle.js'), 'utf8');

/* 실제 브라우저 픽셀 측정으로 찾은 결함들을 코드 수준에서 고정한다.
   증상: 립스틱을 100% 로 올려도 입술 색이 1도 안 변했다(픽셀 변화 0).
   원인: 화장을 전부 drawFeatures() **앞**에 칠해서,
         나중에 그려지는 눈·눈썹·입술이 화장을 덮어 버렸다. */

/* --- 1. 레이어 순서 --- */
const paintFn = /function paint\(\)[\s\S]*?\n  \}/.exec(html);
assert.ok(paintFn, 'paint() 를 찾을 수 없다');
const body = paintFn[0];

const iSkin = body.indexOf("layer(['shade', 'blush'])");
const iFeat = body.indexOf('BF.drawFeatures');
const iFace = body.indexOf("layer(['brow', 'eye', 'lip', 'gloss'])");
assert.ok(iSkin > 0, '피부 화장 레이어(shade/blush)가 분리되지 않았다');
assert.ok(iFeat > 0, 'drawFeatures 호출이 없다');
assert.ok(iFace > 0, '이목구비 화장 레이어(brow/eye/lip/gloss)가 분리되지 않았다');
assert.ok(iSkin < iFeat,
  '피부 화장(쉐이딩·볼터치)은 이목구비보다 먼저 칠해야 자연스럽다');
assert.ok(iFeat < iFace,
  '눈·눈썹·입술 화장이 drawFeatures 보다 먼저 칠해지면 이목구비가 색을 덮어 버린다 ' +
  '(실측: 립 100% 에서도 픽셀 변화 0 이었다)');

/* --- 2. 부위별 불투명도가 체감 가능해야 한다 --- */
const alphaLine = /var alpha = \(st\.level \/ 100\) \*[\s\S]{0,200}?;/.exec(body);
assert.ok(alphaLine, '불투명도 계산식을 찾을 수 없다');
const a = alphaLine[0];
const shadeA = /shade' \? ([0-9.]+)/.exec(a);
const browA = /brow' \? ([0-9.]+)/.exec(a);
assert.ok(shadeA && Number(shadeA[1]) >= 0.35,
  `쉐이딩이 너무 옅다(${shadeA ? shadeA[1] : '?'}) — 100% 로 올려도 변화를 못 느낀다`);
assert.ok(browA && Number(browA[1]) >= 0.6,
  `눈썹 화장이 너무 옅다(${browA ? browA[1] : '?'}) — 눈썹은 원래 어두워서 묻힌다`);

/* --- 3. 화장 존이 실제 이목구비 위치와 맞아야 한다 ---
   ⚠ 상수(MOUTH_Y 등)로 계산하지 말 것. 렌더된 캔버스 실측값 기준이다.
   2026-09-15 실측: 입술 460~520(중심 490), 눈 284~310(중심 297), 눈썹 247~253 */
const BF = require(path.join(ROOT, 'js/base-face.js'));
const MB = require(path.join(ROOT, 'js/makeup-battle.js'));
const H = 700, W = 560;
const Z = MB.FACE_ZONES;

function centerY(zone) { return zone[0][1] * H; }
function centerX(zone) { return zone[0][0] * W; }

const lipY = centerY(Z.lip);
assert.ok(lipY > 470 && lipY < 510,
  `립 존이 입술(460~520)을 벗어났다: y=${lipY.toFixed(0)}`);

const eyeY = centerY(Z.eye);
assert.ok(eyeY > 275 && eyeY < 305,
  `아이섀도 존이 눈(284~310)을 벗어났다: y=${eyeY.toFixed(0)}`);
/* 아이섀도는 눈 중심(297)보다 위여야 홍채에 안 덮인다 */
assert.ok(eyeY < 297, `아이섀도가 눈 중심보다 아래다: ${eyeY.toFixed(0)} >= 297`);

const browY = centerY(Z.brow);
assert.ok(browY > 238 && browY < 262,
  `눈썹 존이 눈썹(247~253)을 벗어났다: y=${browY.toFixed(0)}`);
assert.ok(browY < eyeY, '눈썹 존이 아이섀도보다 아래에 있다');

/* 눈 존의 x 는 실제 눈 중심(280 ± eyeGap)과 맞아야 한다 */
const gap = BF.SHAPE.oval.eyeGap;
const eyeX = centerX(Z.eye);
assert.ok(Math.abs(eyeX - (280 - gap)) < 12,
  `아이섀도 x 가 눈 중심에서 벗어났다: ${eyeX.toFixed(0)} vs ${280 - gap}`);

/* --- 4. 좌우 대칭 부위는 존이 2개여야 한다 --- */
['eye', 'brow', 'blush'].forEach(k => {
  assert.strictEqual(Z[k].length, 2, `${k} 존은 좌우 2개여야 한다 (현재 ${Z[k].length}개)`);
  const [l, r] = Z[k];
  assert.ok(Math.abs((l[0] + r[0]) - 1) < 0.01,
    `${k} 존이 좌우 대칭이 아니다: ${l[0]} / ${r[0]}`);
});

console.log('PASS: 화장 레이어 순서·농도·존 위치가 실제 이목구비와 일치');

/* --- 5. 랜덤은 꾸미기까지 돌려야 한다 ---
   머리 18종·옷 20종을 넣어도 랜덤이 화장만 바꾸면 늘 같은 단발·티셔츠가 나온다
   (실측: 랜덤 6회 연타에도 스타일이 1가지였다). */
const randomFn = /\$\('random'\)\.addEventListener\([\s\S]*?\n  \}\);/.exec(html);
assert.ok(randomFn, '랜덤 버튼 핸들러를 찾을 수 없다');
assert.ok(/G\.OPTIONS/.test(randomFn[0]), '랜덤이 화장을 바꾸지 않는다');
assert.ok(/styleOptions\(\)/.test(randomFn[0]),
  '랜덤이 꾸미기(머리·옷·얼굴형)를 바꾸지 않는다 — 스타일이 늘 고정된다');
assert.ok(/state\.style\[/.test(randomFn[0]), '랜덤이 state.style 을 갱신하지 않는다');

/* --- 6. 채점은 목표와 일치하면 만점이어야 한다 --- */
const theme = Object.keys(MB.THEMES)[0];
const target = MB.THEMES[theme].target;
const perfect = {};
Object.keys(target).forEach(k => { perfect[k] = { value: target[k].value, level: target[k].level }; });
const full = MB.scoreBreakdown(theme, perfect);
assert.strictEqual(full.score, 100,
  `목표와 똑같이 꾸몄는데 만점이 아니다: ${full.score}점`);
/* 아무것도 안 하면 기본점만 */
const none = MB.scoreBreakdown(theme, MB.defaultLook());
assert.ok(none.score < full.score, '화장을 해도 점수가 오르지 않는다');

console.log('PASS: 랜덤이 꾸미기까지 변경, 채점 만점 동작');
