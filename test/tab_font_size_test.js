const assert = require('assert');
const fs = require('fs');

/* 사용자가 같은 지적을 네 번 했다: "탭 글자 여전히 작다".
   원인이 매번 달랐다:
     1) li 에만 크기를 줘서 <a> 가 상속을 못 받음
     2) viewport initial-scale=0.65 라 화면에서는 0.65배로 축소됨
     3) 한 줄에 탭 5개라 칸이 120px 뿐이라 글자를 키울 수 없었음
   그래서 이 테스트는 **화면에 보이는 크기**와 **칸에 들어가는지**를 함께 본다.
   기준선은 배포된 v13(2.1.2) 앱이다. 그보다 작으면 실패다. */

const css = fs.readFileSync('style_AI_main.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const ROOT_PX = 10;               // 이 문서의 root font-size

// viewport 축소 배율
const vp = /initial-scale=([0-9.]+)/.exec(html);
assert.ok(vp, 'viewport initial-scale 을 찾지 못함');
const scale = parseFloat(vp[1]);
const layoutW = 390 / scale;      // 390px 폰에서의 레이아웃 폭

// 모바일 규칙에서 실제 글자를 그리는 a 의 크기
const mobile = /@media \(max-width: 700px\) \{([\s\S]*?)\n\}/.exec(css);
assert.ok(mobile, '모바일 미디어 쿼리를 찾지 못함');
const anchorRule = /\.tabs > ul li a \{([\s\S]*?)\}/.exec(mobile[1]);
assert.ok(anchorRule, '.tabs > ul li a 규칙이 없으면 글자는 li 를 상속하지 않아 작게 남는다');
const sizeMatch = /font-size:\s*([0-9.]+)rem/.exec(anchorRule[1]);
assert.ok(sizeMatch, 'a 에 font-size 가 직접 지정돼야 한다');

const cssPx = parseFloat(sizeMatch[1]) * ROOT_PX;
const onScreenPx = cssPx * scale;

/* 기준: 배포된 v13(2.1.2) 앱은 li 2rem(20px) 을 a 가 상속했다. */
const V13_CSS_PX = 20;
const v13OnScreen = V13_CSS_PX * scale;

assert.ok(cssPx > V13_CSS_PX,
  `탭 글자가 v13(${V13_CSS_PX}px)보다 작거나 같다: ${cssPx}px`);
assert.ok(onScreenPx >= v13OnScreen * 1.5,
  `화면 기준으로 v13(${v13OnScreen.toFixed(1)}px)보다 충분히 크지 않다: ${onScreenPx.toFixed(1)}px`);

// 칸 폭: 한 줄에 몇 개인지가 글자 크기의 상한이다
// ⚠ li 규칙이 여러 개로 나뉘어 있을 수 있다. width 를 지정한 블록을 찾아야 한다.
let perRow = 5;
const liRules = [...mobile[1].matchAll(/\.tabs > ul li \{([\s\S]*?)\}/g)];
for (const r of liRules) {
  const wMatch = /width:\s*([0-9.]+)%/.exec(r[1]);
  if (wMatch) perRow = Math.round(100 / parseFloat(wMatch[1]));
}
const cellW = layoutW / perRow;

// 가장 긴 라벨의 글자 수를 index.html 에서 직접 센다
const labels = [...html.matchAll(/<a href="#section\d+">([^<]*)<br \/>([^<]*)<\/a>/g)]
  .flatMap(m => [m[1].trim(), m[2].trim()]);
assert.ok(labels.length > 0, '탭 라벨을 찾지 못함');
const longest = Math.max(...labels.map(s => s.length));

assert.ok(cssPx * longest <= cellW,
  `가장 긴 라벨(${longest}자)이 칸을 넘친다: ${(cssPx * longest).toFixed(0)}px > ${cellW.toFixed(0)}px ` +
  `(한 줄 ${perRow}개)`);

console.log(`PASS: tab text ${cssPx}px -> ${onScreenPx.toFixed(1)}px on screen ` +
  `(v13: ${v13OnScreen.toFixed(1)}px), ${longest}자 라벨이 ${cellW.toFixed(0)}px 칸에 들어감`);
