/* 별점 요청 — 검사
 *
 * 이 앱의 평점은 2.9다. 1점 20개 / 5점 18개인데, 1점 대부분이 **앱이 안 켜지던
 * 시절**의 리뷰다. 버그는 고쳤지만 점수는 남았고, 지금도 재밌게 쓴 사람이
 * 별점을 남길 통로가 없어서 불만인 사람만 스토어로 간다.
 *
 * 그래서 확인하는 것:
 *  1. 좋은 순간에만 묻는다 (실패·패배 때 물으면 낮은 별점이 온다)
 *  2. 처음 쓰는 사람에게 묻지 않는다
 *  3. 거절하면 오래 쉰다 / 다시 안 보기가 있다
 *  4. **앱 안에서 별점을 받아 거르지 않는다** — 구글 정책 위반(리뷰 게이팅)
 *  5. 실제로 화면들에 연결돼 있다
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'js', 'rate-prompt.js');
assert.ok(fs.existsSync(JS), 'rate-prompt.js 가 없다');
const src = fs.readFileSync(JS, 'utf8');

/* ── 정책: 리뷰 게이팅 금지 ──
   "별점 몇 점 주실래요?" 를 앱에서 먼저 묻고 높은 점수만 스토어로 보내는 것은
   구글 정책 위반이다. 그냥 스토어로 보내야 한다. */
assert.ok(!/(몇\s*점|별점을?\s*선택|rating.*선택|1~5점|별 \d개)/.test(src),
  '앱 안에서 별점을 먼저 받으면 안 된다 (리뷰 게이팅 = 정책 위반)');
assert.ok(/play\.google\.com\/store\/apps\/details\?id=com\.dypark9606\.aifacetest/.test(src),
  '스토어 주소가 없거나 틀렸다');

/* ── 모듈 읽기 ── */
function load(store) {
  const g = {
    localStorage: store,
    setTimeout: (fn) => { g._pending = fn; },
    document: null,
    top: null
  };
  new Function('module', 'exports', 'globalThis',
    src + ';return globalThis.RatePrompt;')({ exports: {} }, {}, g);
  return { RP: g.RatePrompt, g };
}
function memStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    _dump: () => m
  };
}

let st = memStore();
let { RP } = load(st);
assert.ok(RP, 'RatePrompt 가 만들어지지 않았다');

/* ── 1. 처음 쓰는 사람에게 묻지 않는다 ── */
assert.strictEqual(RP.canAsk(), false, '아무것도 안 했는데 별점을 묻는다');

/* ── 2. 좋은 일이 쌓여야 묻는다 ── */
RP.good('analysis');
assert.strictEqual(RP.canAsk(), false, '한 번 쓰고 바로 묻는다 — 너무 이르다');

/* 무게가 큰 행동이면 더 빨리 도달한다 */
st = memStore(); ({ RP } = load(st));
RP.good('makeup');            // 2점
assert.strictEqual(RP.canAsk(), false, '2점인데 묻는다');
RP.good('analysis');          // +1 = 3점
assert.strictEqual(RP.canAsk(), true, '충분히 즐겼는데도 안 묻는다');

/* ── 3. 하루에 한 번만 ── */
st = memStore(); ({ RP } = load(st));
RP.good('share'); RP.good('makeup');      // 3+2 = 5점
assert.ok(RP.canAsk(), '점수가 찼는데 못 묻는다');
RP.later();                                // 거절
assert.strictEqual(RP.canAsk(), false, '거절했는데 또 묻는다');

/* 거절하면 한참 쉰다 */
const s1 = RP.state();
assert.ok(s1.snoozeUntil > Date.now() + 20 * 24 * 60 * 60 * 1000,
  '거절 후 쉬는 기간이 너무 짧다 — 매번 뜨면 그게 1점 사유가 된다');

/* ── 4. 다시 보지 않기 ── */
st = memStore(); ({ RP } = load(st));
RP.good('share'); RP.good('makeup');
RP.never();
assert.strictEqual(RP.canAsk(), false, '"다시 보지 않기" 를 눌렀는데 또 묻는다');
RP.good('bestScore');
assert.strictEqual(RP.canAsk(), false, '거절한 사람에게 점수가 다시 쌓인다');

/* ── 5. 별점을 남긴 사람에겐 두 번 묻지 않는다 ── */
st = memStore(); ({ RP } = load(st));
RP.good('share'); RP.good('makeup');
const before = RP.state().score;
RP.openStore();                            // 스토어로 갔다 = 남겼다고 본다
assert.strictEqual(RP.state().done, true, '스토어로 보냈는데 done 처리가 안 된다');
assert.strictEqual(RP.canAsk(), false, '이미 별점을 남긴 사람에게 또 묻는다');
RP.good('makeup');
assert.strictEqual(RP.state().score, before, '이미 남긴 사람에게 점수가 계속 쌓인다');

/* ── 6. 무게 설정이 말이 되나 ── */
assert.ok(RP.WEIGHT.share >= RP.WEIGHT.analysis,
  '공유는 분석 한 번보다 강한 만족 신호다');
assert.ok(RP.WEIGHT.bestScore >= RP.WEIGHT.analysis,
  '신기록은 평범한 분석보다 기분 좋은 일이다');
assert.ok(RP.NEED_SCORE >= 2,
  '한 번 쓰고 바로 묻게 되어 있다 — 최소 두 번은 즐긴 뒤에 물어야 한다');

/* ── 7. 실제 화면에 연결됐나 ── */
const wired = [
  ['Sec15_myface.html', 'makeup'],
  ['Sec16_surgery.html', 'surgery'],
  ['Sec14_arcade.html', 'bestScore']
];
wired.forEach(function ([file, reason]) {
  const p = path.join(ROOT, file);
  assert.ok(fs.existsSync(p), file + ' 이 없다');
  const h = fs.readFileSync(p, 'utf8');
  assert.ok(/rate-prompt\.js/.test(h), file + ' 이 rate-prompt.js 를 안 부른다');
  assert.ok(new RegExp("RatePrompt[\\s\\S]{0,120}'" + reason + "'").test(h),
    file + ' 에서 ' + reason + ' 순간이 연결되지 않았다');
});

/* 얼굴 분석 계열은 readui.js 가 담당 */
const ru = fs.readFileSync(path.join(ROOT, 'js', 'readui.js'), 'utf8');
assert.ok(/RatePrompt/.test(ru), 'readui.js(얼굴 분석 결과)에 연결되지 않았다');

/* 최상위 문서에도 있어야 iframe 안에서 window.top 으로 찾는다 */
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(/rate-prompt\.js/.test(idx),
  'index.html 에 없으면 iframe 안 화면이 window.top.RatePrompt 를 못 찾는다');

/* ── 8. 진 판에는 묻지 않는다 ── */
const arc = fs.readFileSync(path.join(ROOT, 'Sec14_arcade.html'), 'utf8');
assert.ok(/celebrate[\s\S]{0,200}goodAndMaybeAsk\('bestScore'/.test(arc),
  '신기록(celebrate)일 때만 물어야 한다 — 진 판에 물으면 낮은 별점이 온다');

/* ── 9. 카드에 거절 수단이 있나 ── */
assert.ok(/나중에/.test(src), '"나중에" 버튼이 없다');
assert.ok(/다시 보지 않기/.test(src), '"다시 보지 않기" 가 없다');

console.log('PASS: 별점 요청 — 좋은 순간에만, 하루 한 번, 거절 존중, 리뷰 게이팅 없음, 화면 ' +
  (wired.length + 2) + '곳 연결');
