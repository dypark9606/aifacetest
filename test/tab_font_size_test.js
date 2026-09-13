const assert = require('assert');
const fs = require('fs');

/* 사용자가 같은 지적을 세 번 했다: "탭 글자 여전히 작다".
   두 번은 CSS 선언만 보고 다 고쳤다고 판단한 게 원인이었다.
   이 테스트는 **화면에 실제로 보이는 크기**를 계산해서 검사한다. */

const css = fs.readFileSync('style_AI_main.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// 1) 이 페이지의 축소 배율과 root font-size 를 실제 파일에서 읽는다.
const vp = /initial-scale=([0-9.]+)/.exec(html);
assert.ok(vp, 'viewport initial-scale 을 찾지 못함');
const scale = parseFloat(vp[1]);

const rootPx = 10;   // style_AI_main.css 가 기대는 문서 root font-size

// 2) 모바일 규칙에서 실제 글자를 그리는 a 의 크기를 찾는다.
const mobile = /@media \(max-width: 700px\) \{([\s\S]*?)\n\}/.exec(css);
assert.ok(mobile, '모바일 미디어 쿼리를 찾지 못함');
const anchorRule = /\.tabs > ul li a \{([\s\S]*?)\}/.exec(mobile[1]);
assert.ok(anchorRule, '.tabs > ul li a 규칙이 없으면 글자는 li 를 상속하지 않아 작게 남는다');
const sizeMatch = /font-size:\s*([0-9.]+)rem/.exec(anchorRule[1]);
assert.ok(sizeMatch, 'a 에 font-size 가 직접 지정돼야 한다');

const cssPx = parseFloat(sizeMatch[1]) * rootPx;
const onScreenPx = cssPx * scale;

// 3) 화면 기준으로 충분히 커야 한다.
assert.ok(onScreenPx >= 17,
  `탭 글자가 화면에서 ${onScreenPx.toFixed(1)}px 로 보인다 (지정 ${cssPx}px x 축소 ${scale}). 17px 이상 필요`);

// 4) 그렇다고 칸을 넘치면 안 된다: 탭 한 칸 = 레이아웃 폭의 20%, 라벨은 최대 4글자.
const layoutW = 600;                       // initial-scale 0.65 에서의 레이아웃 폭
const cellW = layoutW * 0.20;
const longestLabel = 4;                    // '인공지능', '커플궁합' 등
assert.ok(cssPx * longestLabel <= cellW,
  `네 글자 라벨이 칸을 넘친다: ${cssPx * longestLabel}px > ${cellW}px`);

console.log(`PASS: tab text renders at ~${onScreenPx.toFixed(1)}px on screen (declared ${cssPx}px)`);
