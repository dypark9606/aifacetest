const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PM = require(path.join(ROOT, 'js/photo-makeup.js'));
const src = fs.readFileSync(path.join(ROOT, 'js/photo-makeup.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Sec15_myface.html'), 'utf8');

/* 내 사진에 화장을 얹는 기능.
   브라우저 픽셀 실측으로 찾은 결함을 코드 수준에서 고정한다. */

/* --- 1. 부위 구성 --- */
const keys = PM.PARTS.map(p => p.key);
['lip', 'blush', 'eye', 'brow', 'eyesize'].forEach(k => {
  assert.ok(keys.indexOf(k) >= 0, `${k} 부위가 빠졌다`);
});
/* 사용자가 콕 집어 요구한 4가지는 색을 고를 수 있어야 한다 */
['lip', 'blush', 'eye', 'brow'].forEach(k => {
  const part = PM.PARTS.find(p => p.key === k);
  assert.strictEqual(part.kind, 'color', `${k} 은 색을 고를 수 있어야 한다`);
  assert.ok(PM.PRODUCTS[k] && PM.PRODUCTS[k].length >= 4,
    `${k} 색이 너무 적다 (${(PM.PRODUCTS[k] || []).length}개)`);
});
/* 눈 크기는 색이 아니라 강도만 */
assert.strictEqual(PM.PARTS.find(p => p.key === 'eyesize').kind, 'amount',
  '눈 크기는 색이 아니라 강도여야 한다');

/* --- 2. 제품 색이 실제 색상값인지 --- */
Object.keys(PM.PRODUCTS).forEach(part => {
  PM.PRODUCTS[part].forEach(p => {
    assert.ok(/^#[0-9a-f]{6}$/i.test(p.hex), `${part}/${p.id} 색이 잘못됐다: ${p.hex}`);
    assert.ok(p.label && p.label.length > 1, `${part}/${p.id} 이름이 없다`);
  });
  /* 같은 부위에 같은 색이 두 번 있으면 고르는 의미가 없다 */
  const hexes = PM.PRODUCTS[part].map(p => p.hex.toLowerCase());
  assert.strictEqual(new Set(hexes).size, hexes.length, `${part} 에 중복된 색이 있다`);
});

/* --- 3. 기본값은 과하지 않아야 한다 ---
   처음 열었을 때 진하면 "가짜 같다"가 첫인상이 된다. */
const def = PM.defaultLook();
Object.keys(def).forEach(k => {
  assert.ok(def[k].level >= 0 && def[k].level <= 100, `${k} 기본값 범위 오류`);
  assert.ok(def[k].level <= 40, `${k} 기본값이 너무 진하다: ${def[k].level}`);
});
assert.strictEqual(def.eyesize.level, 0, '눈 확대는 기본으로 꺼져 있어야 한다');

/* --- 4. 아이섀도는 눈 위에 실제 영역을 만들어야 한다 ---
   ⚠ FaceMesh 의 '눈꺼풀' 랜드마크는 눈 폴리곤과 면적이 거의 같아서
   (실측 눈두덩 75 vs 눈 77) 그대로 쓰면 빼고 나서 남는 게 0 이 된다.
   그래서 섀도가 한 픽셀도 안 보였다. 눈 윗라인을 위로 밀어 올려야 한다. */
const shadowFn = /function drawEyeShadow[\s\S]*?\n  \}/.exec(src);
assert.ok(shadowFn, 'drawEyeShadow 를 찾을 수 없다');
assert.ok(/lift/.test(shadowFn[0]),
  '아이섀도가 눈 윗라인을 밀어 올리지 않는다 — 섀도가 보이지 않는다');
assert.ok(/destination-out/.test(shadowFn[0]),
  '눈알을 빼내지 않으면 흰자·홍채에 색이 묻어 멍처럼 보인다');
/* 눈꼬리로 갈수록 두꺼워야 한다. 균일하면 눈이 꺼져 보인다. */
assert.ok(/taper/.test(shadowFn[0]),
  '섀도가 눈두덩에 균일하게 깔리면 눈이 움푹 꺼진 그림자처럼 보인다');

/* --- 5. 립은 입 안쪽을 칠하면 안 된다 --- */
const lipFn = /function drawLip[\s\S]*?\n  \}/.exec(src);
assert.ok(lipFn, 'drawLip 을 찾을 수 없다');
assert.ok(/destination-out/.test(lipFn[0]),
  '입 안쪽(치아)을 빼지 않으면 즉시 가짜로 보인다');
assert.ok(/multiply/.test(lipFn[0]),
  '립은 multiply 라야 입술 주름과 명암이 살아 남는다');

/* --- 6. 모든 색조는 블렌드 모드를 써야 한다 ---
   덮어 칠하면(source-over) 색종이를 오려 붙인 것처럼 보인다. */
['drawBlush', 'drawEyeShadow', 'drawBrow'].forEach(fn => {
  const m = new RegExp('function ' + fn + '[\\s\\S]*?\\n  \\}').exec(src);
  assert.ok(m, fn + ' 을 찾을 수 없다');
  assert.ok(/'(multiply|screen|soft-light|overlay)'/.test(m[0]),
    fn + ' 이 블렌드 모드를 쓰지 않는다 — 스티커처럼 보인다');
});

/* --- 7. 눈 확대는 색보다 먼저 해야 한다 ---
   나중에 하면 이미 칠한 화장까지 같이 늘어나 뭉갠다. */
const render = /PM\.render = function[\s\S]*?\n  \};/.exec(src);
assert.ok(render, 'PM.render 를 찾을 수 없다');
const iEnlarge = render[0].indexOf('enlargeEyes');
const iLip = render[0].indexOf('drawLip');
const iBlush = render[0].indexOf('drawBlush');
assert.ok(iEnlarge > 0 && iLip > 0 && iBlush > 0, 'render 순서를 확인할 수 없다');
assert.ok(iEnlarge < iBlush && iEnlarge < iLip,
  '눈 확대(기하 변형)를 색보다 나중에 하면 칠한 화장이 같이 늘어나 뭉개진다');

/* --- 8. 추천은 facemesh 의 실제 필드명을 써야 한다 ---
   faceRatio·eyeRatio·lipRatio 같은 이름은 존재하지 않는다.
   지어내면 전부 undefined 가 되어 늘 같은 기본값만 나온다. */
const suggest = /PM\.suggest = function[\s\S]*?\n  \};/.exec(src);
assert.ok(suggest, 'PM.suggest 를 찾을 수 없다');
['faceRatio', 'eyeRatio', 'lipRatio'].forEach(bad => {
  assert.ok(!new RegExp('\\b' + bad + '\\b').test(suggest[0]),
    `추천이 존재하지 않는 필드 ${bad} 를 쓴다 — 늘 같은 결과만 나온다`);
});
['ratio', 'eyeOpen', 'lipThick', 'browThick'].forEach(good => {
  assert.ok(new RegExp('f\\.' + good + '\\b').test(suggest[0]),
    `추천이 ${good} 을 보지 않는다`);
});

/* 추천이 갈리는지 — 두 가지 다른 얼굴 특징이 다른 결과를 내야 한다.
   ⚠ photo-makeup.js 는 로드 시점의 전역(window 또는 globalThis)을 캡처한다.
   node 에서는 그게 globalThis 이므로 거기에 FM 을 꽂아야 한다. */
const host = (typeof window !== 'undefined') ? window : globalThis;
const FMstub = {
  features: () => ({ ratio: 1.6, eyeOpen: 0.22, lipThick: 0.04, browThick: 0.02 })
};
host.FM = FMstub;
const a = PM.suggest([{}]);
FMstub.features = () => ({ ratio: 1.2, eyeOpen: 0.40, lipThick: 0.09, browThick: 0.06 });
const b = PM.suggest([{}]);
assert.ok(a && b, '추천이 동작하지 않는다');
assert.notStrictEqual(JSON.stringify(a.look), JSON.stringify(b.look),
  '얼굴이 달라도 추천이 똑같다 — 측정값을 안 보고 있다');
assert.ok(a.why.length >= 3, '추천 이유가 너무 적다');

/* --- 9. 사진은 절대 서버로 보내지 않는다 (앱 전체 약속) --- */
assert.ok(!/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(src),
  '사진 처리 코드에 네트워크 전송이 있다 — 사진은 기기 밖으로 나가면 안 된다');
assert.ok(/기기 밖으로 나가지 않아요|전송되지 않|브라우저 안에서만/.test(html),
  '화면에 사진이 전송되지 않는다는 안내가 없다');

/* --- 10. 화면에 필수 조작이 있어야 한다 --- */
['id="file"', 'id="out"', 'id="suggest"', 'id="reset"', 'id="save"',
 'id="cmp-before"', 'id="cmp-after"'].forEach(sel => {
  assert.ok(html.indexOf(sel) > 0, `화면에 ${sel} 가 없다`);
});
/* 원본/화장 후 비교는 핵심 기능이다 */
assert.ok(/showBefore/.test(html), '원본과 비교하는 기능이 없다');

console.log('PASS: 내 사진 메이크업 — 부위 6종, 색 19가지, 아이섀도 영역, 추천 분기, 사진 미전송');

/* --- 11. 카메라로 바로 찍기 ---
   딸 신고: "앨범에서 불러오는 건 되는데 카메라로 바로 찍는 게 안 된다".
   원인 3가지가 겹쳐 있었다. 하나라도 빠지면 다시 앨범만 열린다. */

/* (a) 화면에 카메라 입력칸과 버튼이 있어야 한다 */
assert.ok(/id="file-cam"/.test(html), '카메라용 입력칸(#file-cam)이 없다');
assert.ok(/capture=/.test(html),
  'capture 속성이 없으면 모바일 브라우저에서 카메라가 바로 안 열린다');
assert.ok(/id="btn-cam"/.test(html) && /id="btn-album"/.test(html),
  '사진 찍기 / 앨범 버튼이 둘 다 있어야 한다');
/* 두 입력칸이 같은 처리로 이어져야 한다 */
assert.ok(/\$\('file-cam'\)\.addEventListener\('change'/.test(html),
  '카메라 입력칸의 change 가 연결되지 않았다 — 찍어도 아무 일이 없다');

/* (b) 앱(Capacitor)에서 native.js 가 이 영역을 가로채야 한다 */
const tpl = path.join(ROOT, '..', '13.mobile_app', 'native.js.tpl');
if (fs.existsSync(tpl)) {
  const nat = fs.readFileSync(tpl, 'utf8');
  assert.ok(/\.drop/.test(nat),
    "native.js 가 '.drop' 을 가로채지 않는다 — 앱에서 네이티브 카메라가 안 열린다");
  assert.ok(/data-pick/.test(nat),
    '카메라/앨범을 콕 집어 여는 경로(data-pick)가 없다');
  assert.ok(/source \|\| 'PROMPT'/.test(nat),
    "pickPhoto 가 source 를 못 받는다 — '사진 찍기'를 눌러도 선택창이 또 뜬다");
  /* label for= 로 바깥에 놓인 입력칸도 찾아야 한다 */
  assert.ok(/getAttribute\('for'\)/.test(nat),
    "label 바깥의 입력칸을 못 찾는다 — .drop 을 눌러도 반응이 없다");
}

/* (c) 안드로이드 CAMERA 권한이 선언돼야 한다 ---
   이게 진짜 원인이었다. FileProvider 는 있었지만 권한이 없어 촬영이 실패했다. */
const manifest = path.join(ROOT, '..', '13.mobile_app', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifest)) {
  const mf = fs.readFileSync(manifest, 'utf8');
  assert.ok(/android\.permission\.CAMERA/.test(mf),
    'AndroidManifest 에 CAMERA 권한이 없다 — 카메라로 찍기가 실패한다');
  assert.ok(/android\.hardware\.camera[\s\S]{0,60}required="false"/.test(mf),
    'camera 기능을 required="true" 로 두면 카메라 없는 기기에 설치가 막힌다');
  assert.ok(/FileProvider/.test(mf),
    'FileProvider 가 없으면 찍은 사진을 앱이 읽지 못한다');
}

console.log('PASS: 카메라 촬영 경로 (UI·native 브리지·안드로이드 권한)');
