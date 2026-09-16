const fs = require('fs');
const assert = require('assert');

/* 사용자 요청: "리셋 버튼이 모두 있으면 좋겠다".
   결과를 본 뒤 다시 하는 길이 화면마다 반드시 있어야 한다. */

const SHARE_BOX_SCREENS = [
  'Sec1_appea.html', 'Sec2_man_ent.html', 'Sec3_ani.html', 'Sec4_rich.html',
  'Sec5_good_bad.html', 'Sec5_couple.html', 'Sec6_saju.html', 'Sec7_fortune.html'
];

// 공유 박스가 있는 화면은 roast.js 가 리셋 버튼을 함께 그려준다.
const roast = fs.readFileSync('js/roast.js', 'utf8');
assert.match(roast, /class="reset-btn"/, 'roast.js 가 리셋 버튼을 그려야 한다');
assert.match(roast, /다시 하기/, '버튼 이름은 "다시 하기"');
assert.match(roast, /resetPage/, '리셋 동작 함수가 있어야 한다');

for (const f of SHARE_BOX_SCREENS) {
  const html = fs.readFileSync(f, 'utf8');
  assert.ok(html.includes('addthis_inline_share_toolbox_czma'), f + ' 에 공유/리셋 박스가 필요');
  assert.ok(html.includes('js/roast.js'), f + ' 는 roast.js 를 읽어야 리셋 버튼이 생긴다');
}

// 자체 UI 를 가진 화면은 각자 다시 하기 버튼을 갖는다.
const readui = fs.readFileSync('js/readui.js', 'utf8');
assert.match(readui, /다른 사진으로 다시 하기/, '얼굴사주 화면의 다시 하기');
const mbti = fs.readFileSync('js/mbti_quiz.js', 'utf8');
assert.match(mbti, /처음부터 다시 하기/, 'MBTI 화면의 다시 하기');
/* ⚠ 메이크업 배틀(Sec13)은 삭제됐다. 내 얼굴 메이크업이 그 자리를 잇는다. */
const myface = fs.readFileSync('Sec15_myface.html', 'utf8');
assert.match(myface, /id="reset"/, '내 얼굴 메이크업에도 되돌리기 버튼');

console.log('PASS: every screen offers a reset path');
