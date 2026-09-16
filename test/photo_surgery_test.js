/* 내 얼굴 성형하기 — 검사
 *
 * 실제로 확인하는 것:
 *  1. 시술 목록이 부위별로 갖춰져 있다
 *  2. 손잡이(handle)가 실제 좌표를 만들어 낸다 — 0 을 넣으면 아무 일도 없어야 한다
 *  3. 변형이 진짜로 픽셀을 바꾼다 (가짜 캔버스로 확인)
 *  4. 목표 얼굴 비교가 방향을 옳게 잡는다
 *  5. 화면에 필요한 요소가 다 있다 (카메라 포함)
 *  6. 사진을 밖으로 보내지 않는다
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'js', 'photo-surgery.js');
const HTML = path.join(ROOT, 'Sec16_surgery.html');

assert.ok(fs.existsSync(JS), 'photo-surgery.js 가 없다');
assert.ok(fs.existsSync(HTML), 'Sec16_surgery.html 이 없다');

const src = fs.readFileSync(JS, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

/* --- 사진을 밖으로 보내지 않는다 (가장 중요) --- */
[/fetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /new\s+WebSocket/]
  .forEach(function (re) {
    assert.ok(!re.test(src), '사진 처리 코드가 바깥으로 통신한다: ' + re);
  });

/* --- 모듈 읽기 --- */
global.window = undefined;
const PS = (function () {
  const mod = { exports: {} };
  const g = {};
  const fn = new Function('module', 'exports', 'globalThis', src +
    '\n;return (typeof globalThis!=="undefined" && globalThis.PhotoSurgery) || null;');
  return fn(mod, mod.exports, g) || g.PhotoSurgery;
})();

assert.ok(PS, 'PhotoSurgery 가 만들어지지 않았다');

/* --- 1. 부위와 시술 --- */
const need = ['eye', 'nose', 'lip', 'cheek', 'forehead', 'jaw'];
const keys = PS.CATALOG.map(g => g.key);
need.forEach(k => assert.ok(keys.includes(k), '부위가 빠졌다: ' + k));
assert.ok(PS.ALL.length >= 18, '시술 수가 너무 적다: ' + PS.ALL.length);

PS.ALL.forEach(function (it) {
  assert.ok(it.id && it.label, '시술에 id/label 이 없다');
  assert.ok(it.op && it.op.length > 1, it.label + ' 에 수술 이름(op)이 없다');
  assert.ok(it.desc && it.desc.length > 5, it.label + ' 에 설명이 없다');
  assert.ok(it.dir === 'both' || it.dir === 'one', it.label + ' 의 dir 이 이상하다');
  assert.ok(typeof it.handles === 'function', it.label + ' 에 handles 가 없다');
});

/* 수술 이름이 실제 성형외과 용어를 담고 있는지 (대충이라도) */
const ops = PS.ALL.map(x => x.op).join(' ');
['쌍꺼풀', '트임', '광대', '사각턱', '턱끝', '콧볼', '인중', '필러']
  .forEach(w => assert.ok(ops.includes(w), '수술 용어가 빠졌다: ' + w));

/* --- 2. 손잡이 --- */
function fakePts() {
  /* 실제 얼굴과 비슷한 배치로 468 점을 만든다 */
  const pts = [];
  for (let i = 0; i < 468; i++) pts.push({ x: 150, y: 150 });
  const put = (i, x, y) => { pts[i] = { x: x, y: y }; };
  put(33, 110, 130); put(133, 140, 130); put(159, 125, 122); put(145, 125, 138);
  put(263, 190, 130); put(362, 160, 130); put(386, 175, 122); put(374, 175, 138);
  put(105, 120, 112); put(334, 180, 112);
  put(168, 150, 128); put(1, 150, 160); put(2, 150, 168);
  put(48, 138, 165); put(278, 162, 165);
  put(61, 130, 185); put(291, 170, 185); put(0, 150, 180); put(17, 150, 192);
  put(152, 150, 225); put(148, 138, 218); put(377, 162, 218);
  put(172, 112, 200); put(397, 188, 200);
  put(234, 100, 155); put(454, 200, 155);
  put(50, 120, 160); put(280, 180, 160);
  put(10, 150, 80);
  return pts;
}
const pts = fakePts();

/* 0 을 넣으면 손잡이가 없어야 한다 (= 아무 변화 없음) */
PS.ALL.forEach(function (it) {
  const hs = it.handles(pts, 0, 40);
  hs.forEach(function (h) {
    if (h.type === 'move') {
      assert.ok(Math.abs(h.d.x) < 1e-9 && Math.abs(h.d.y) < 1e-9,
        it.label + ': 0 인데 움직인다');
    } else {
      assert.ok(Math.abs(h.s - 1) < 1e-9, it.label + ': 0 인데 확대/축소한다');
    }
  });
});

/* 1 을 넣으면 실제로 움직여야 한다 */
PS.ALL.forEach(function (it) {
  const hs = it.handles(pts, 1, 40);
  assert.ok(hs.length > 0, it.label + ': 손잡이를 안 만든다');
  let moved = false;
  hs.forEach(function (h) {
    assert.ok(h.c && isFinite(h.c.x) && isFinite(h.c.y), it.label + ': 중심 좌표가 이상하다');
    assert.ok(h.r > 0, it.label + ': 반지름이 0 이하다');
    if (h.type === 'move') { if (Math.hypot(h.d.x, h.d.y) > 0.01) moved = true; }
    else if (Math.abs(h.s - 1) > 0.001) moved = true;
  });
  assert.ok(moved, it.label + ': 100 으로 올려도 아무 변화가 없다');
});

/* 반대 방향도 되는지 (both 인 것만) */
PS.ALL.filter(x => x.dir === 'both').forEach(function (it) {
  const a = it.handles(pts, 1, 40), b = it.handles(pts, -1, 40);
  let differ = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type === 'move') {
      if (Math.abs(a[i].d.x - b[i].d.x) > 0.01 || Math.abs(a[i].d.y - b[i].d.y) > 0.01) differ = true;
    } else if (Math.abs(a[i].s - b[i].s) > 0.001) differ = true;
  }
  assert.ok(differ, it.label + ': +100 과 -100 이 같다 — 양방향이 아니다');
});

/* --- 3. 실제 변형 (가짜 캔버스) --- */
function fakeCanvas(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    /* 세로 줄무늬 — 좌우로 밀리면 값이 확 바뀐다 */
    const x = i % w;
    const v = (x % 8 < 4) ? 20 : 235;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const ctx = {
    getImageData: () => ({ data: data, width: w, height: h }),
    createImageData: (a, b) => ({
      data: new Uint8ClampedArray((a || w) * (b || h) * 4), width: a || w, height: b || h
    }),
    putImageData: function (img) { ctx._out = img; },
    drawImage: function () { ctx._drew = true; }
  };
  return { width: w, height: h, getContext: () => ctx, _ctx: ctx };
}

const W = 300, H = 300;
const srcCv = fakeCanvas(W, H);
const outCv = fakeCanvas(W, H);
const res = { canvas: srcCv, pts: pts };

/* 계획이 비면 원본 그대로 */
PS.render(outCv, res, PS.defaultPlan());
assert.ok(outCv._ctx._drew, '계획이 비었는데 원본을 안 그렸다');

/* 계획이 있으면 픽셀이 바뀐다 */
const plan = PS.defaultPlan();
plan.eyeSize = 100;
plan.zygoma = 80;
PS.render(outCv, res, plan);
const out = outCv._ctx._out;
assert.ok(out, '변형 결과를 안 내놨다');
const before = srcCv._ctx.getImageData().data;
let changed = 0;
for (let i = 0; i < out.data.length; i += 4) {
  if (Math.abs(out.data[i] - before[i]) > 5) changed++;
}
assert.ok(changed > 200, '변형했는데 바뀐 픽셀이 너무 적다: ' + changed);

/* --- 4. 목표 얼굴 비교 --- */
const m = PS.metrics(pts);
assert.ok(m && isFinite(m.faceRatio) && isFinite(m.eyeSize), '얼굴 재기가 실패한다');

/* 눈이 더 큰 목표 얼굴을 만들면 → 눈 키우라고 해야 한다 */
const big = fakePts();
big[159] = { x: 125, y: 116 };   // 왼눈 위를 올려 크게
big[145] = { x: 125, y: 144 };   // 왼눈 아래를 내려 크게
big[386] = { x: 175, y: 116 };
big[374] = { x: 175, y: 144 };
const cmp = PS.compare(pts, big);
assert.ok(cmp, '비교가 실패한다');
assert.ok(cmp.list.length > 0, '다른데도 시술을 하나도 안 권한다');
assert.ok(cmp.plan.eyeSize > 0,
  '목표 눈이 더 큰데 눈을 키우라고 하지 않는다: ' + cmp.plan.eyeSize);
assert.ok(cmp.score >= 0 && cmp.score <= 100, '닮은 정도가 0~100 이 아니다');

/* 같은 얼굴끼리는 거의 100% 여야 한다 */
const same = PS.compare(pts, fakePts());
assert.ok(same.score >= 95, '같은 얼굴인데 닮은 정도가 낮다: ' + same.score);
assert.strictEqual(same.list.length, 0, '같은 얼굴인데 시술을 권한다');

/* 권하는 목록에 수술 이름이 붙어 있어야 한다 */
cmp.list.forEach(function (s) {
  assert.ok(s.op && s.label && s.group, '권장 항목에 수술 이름이 없다');
});

/* --- 5. 수술 묶음 --- */
assert.ok(PS.PACKAGES.length >= 3, '수술 묶음이 너무 적다');
PS.PACKAGES.forEach(function (p) {
  assert.ok(p.label && p.note, p.id + ' 에 설명이 없다');
  const ids = Object.keys(p.plan);
  assert.ok(ids.length >= 2, p.label + ' 은 묶음인데 시술이 1개뿐이다');
  ids.forEach(function (id) {
    assert.ok(PS.find(id), p.label + ' 이 없는 시술을 가리킨다: ' + id);
    const it = PS.find(id);
    if (it.dir === 'one') {
      assert.ok(p.plan[id] >= 0, p.label + ': ' + id + ' 은 음수가 될 수 없다');
    }
    assert.ok(Math.abs(p.plan[id]) <= 100, p.label + ': ' + id + ' 값이 범위를 넘는다');
  });
});
/* 양악은 설명에 한계를 적어 둬야 한다 */
const bimax = PS.PACKAGES.filter(p => p.id === 'bimax')[0];
assert.ok(bimax && /옆모습|정면/.test(bimax.note),
  '양악 설명에 정면 사진의 한계를 적지 않았다');

/* --- 6. 화면 --- */
assert.ok(/id="file-cam"/.test(html), '카메라 입력칸이 없다');
assert.ok(/capture=/.test(html), 'capture 속성이 없어 카메라가 바로 안 열린다');
assert.ok(/data-pick/.test(html), '앱에서 카메라/앨범을 여는 경로가 없다');
assert.ok(/class="drop"/.test(html), 'native.js 가 가로챌 .drop 영역이 없다');
assert.ok(/id="file-target"/.test(html), '닮고 싶은 얼굴 입력칸이 없다');
assert.ok(/id="parts"/.test(html) && /id="ops"/.test(html), '부위/시술 영역이 없다');
assert.ok(/id="packs"/.test(html), '수술 묶음 영역이 없다');
assert.ok(/coin-wallet\.js/.test(html), '코인 지갑을 안 불러온다');
assert.ok(/rewardAnalysis/.test(html), '코인을 안 준다');
assert.ok(/photo-surgery\.js/.test(html), '성형 엔진을 안 불러온다');

/* 슬라이더로 그리는데 rAF 를 쓰면 안 된다 — 탭이 뒤에 있으면 안 그려진다.
   (설명 주석에는 이 단어가 나오므로, 실제 '호출'만 잡는다) */
assert.ok(!/requestAnimationFrame\s*\(/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')),
  'requestAnimationFrame 을 쓰면 탭이 화면 뒤에 있을 때 얼굴이 안 바뀐다');

/* 안전 문구 */
assert.ok(/의학적 조언|전문의/.test(html), '의료 면책 문구가 없다');
assert.ok(/기기 밖으로 나가지 않아요|서버로 보내지 않/.test(html), '사진 보관 안내가 없다');

/* 연예인 사진을 앱이 들고 있으면 안 된다 (초상권).
   주석에는 이 말이 나오므로, 실제 이미지 경로/자산만 잡는다. */
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.ok(!/(celebs?|stars?)\/[\w-]+\.(jpg|png|webp)/i.test(codeOnly),
  '연예인 사진을 앱에 넣어 두면 안 된다 — 목표 얼굴은 사용자가 고른다');

/* --- 7. index 등록 --- */
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(/#section16/.test(idx), 'index.html 에 탭이 등록되지 않았다');
assert.ok(/Sec16_surgery\.html/.test(idx), 'index.html 에 iframe 이 없다');
const sec16 = idx.match(/<section id="section16"[\s\S]{0,400}?<\/section>/);
assert.ok(sec16 && /camera/.test(sec16[0]),
  'section16 iframe 의 allow 에 camera 가 없다 — 앱에서 사진 찍기가 막힌다');

const css = fs.readFileSync(path.join(ROOT, 'style_AI_main.css'), 'utf8');
assert.ok(/section16/.test(css),
  'CSS 에 section16 배경 규칙이 없다 — 그 탭만 허옇게 뜬다');

console.log('PASS: 내 얼굴 성형하기 — 시술 ' + PS.ALL.length + '종, 부위 ' +
  PS.CATALOG.length + '개, 묶음 ' + PS.PACKAGES.length + '종, 변형·비교·안전문구');
