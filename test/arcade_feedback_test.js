const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const games = fs.readFileSync(path.join(ROOT, 'js/arcade-games.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'js/arcade-core.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Sec14_arcade.html'), 'utf8');

/* 딸이 실제 폰으로 해보고 알려준 문제들. 전부 원인이 확인된 것만 단언한다. */

/* --- 1. 비행기와 까마귀가 같은 게임이었다 --- */
// flyer() 에 이모지만 바꿔 넣은 복제였다. 하나를 지운다.
assert.ok(!/id: *'plane'/.test(core), '비행기 게임이 아직 목록에 남아 있다 (까마귀와 중복)');
assert.ok(!/\bplane *:/.test(games), '비행기 게임 함수가 아직 export 되어 있다');
assert.ok(/id: *'crow'/.test(core), '까마귀 게임은 남아 있어야 한다');

/* --- 2. 까마귀가 실제로 안 잡히던 원인: click 이벤트 --- */
// 표적은 33ms 마다 움직인다. click 은 손을 뗄 때(touchend) 발생하므로
// 탭하는 동안 표적이 손가락 밑에서 빠져나가 클릭이 표적에 꽂히지 않는다.
// pointerdown 은 손이 닿는 즉시 발생하므로 반드시 이걸 써야 한다.
const flyerBody = /function flyer\(([\s\S]*?)\n  \}/.exec(games);
assert.ok(flyerBody, 'flyer 함수를 찾을 수 없다');
assert.ok(/pointerdown/.test(flyerBody[1]),
  '움직이는 표적에 pointerdown 을 쓰지 않는다 — 폰에서 탭해도 안 잡힌다');

/* --- 3. 잡히는 반경이 너무 좁았다 --- */
// .target 에 width/height 가 없어서 이모지 글리프 크기(실측 30px 미만)가 곧 히트 영역이었다.
const targetCss = /\.target\{([^}]*)\}/.exec(html);
assert.ok(targetCss, '.target CSS 를 찾을 수 없다');
const tw = /min-width: *(\d+)px/.exec(targetCss[1]);
const th = /min-height: *(\d+)px/.exec(targetCss[1]);
assert.ok(tw && Number(tw[1]) >= 56,
  '까마귀 히트 영역 가로가 너무 좁다 (손가락 터치는 최소 56px 필요): ' + (tw ? tw[1] : '없음'));
assert.ok(th && Number(th[1]) >= 56,
  '까마귀 히트 영역 세로가 너무 좁다: ' + (th ? th[1] : '없음'));

/* --- 4. 잡혔는지 알 수 없었다 --- */
// 💥 를 160ms 만 보여주고 지웠다. 진동 + 죽는 모습 + 점수 표시가 있어야 한다.
assert.ok(/navigator\.vibrate/.test(games), '맞았을 때 진동이 없다');
assert.ok(/hit-pop|\.dead|popScore/.test(games), '맞았을 때 시각 피드백(죽는 연출)이 없다');
assert.ok(/@keyframes/.test(html), '피격 애니메이션 CSS 가 없다');

/* --- 5. 두꺼비가 너무 빠르고 레벨이 없었다 --- */
// spawn 520ms / 노출 800ms 고정이었다. 쉬운 속도에서 시작해 점점 빨라져야 한다.
// ⚠ 2026-09-16: 속도값이 MOLE_LEVELS 배열에서 diffFor('mole', level) 로 옮겨졌다.
//    (사용자가 난이도 1~10 을 직접 고르게 되면서 상수 배열이 사라졌다.)
//    그래서 소스 문자열을 grep 하지 않고 실제 함수를 호출해 검사한다.
assert.ok(/level/.test(games), '두꺼비에 레벨 개념이 없다');
const moleBody = /function mole\(([\s\S]*?)\n  \}/.exec(games);
assert.ok(moleBody, 'mole 함수를 찾을 수 없다');

/* arcade-games.js 는 IIFE 로 전역(root)에 붙는다. require 로는 안 잡히므로
   전역 객체를 root 로 넘겨 실행한다. */
const AG = {};
new Function('self', games)(AG);
const G = AG.ArcadeGames;

const lvl1 = G.diffFor('mole', 1);
assert.ok(lvl1.spawn >= 800,
  '1단계 두꺼비 등장 간격이 너무 빠르다 (800ms 이상이어야 한다): ' + lvl1.spawn);
assert.ok(lvl1.up >= 1100,
  '1단계 두꺼비가 너무 빨리 숨는다 (1100ms 이상 떠 있어야 한다): ' + lvl1.up);

/* --- 6. 두꺼비 웃음 포인트 --- */
assert.ok(/꽥/.test(games), '두꺼비를 잡아도 "꽥" 같은 웃음 포인트가 없다');

/* --- 6b. 시간이 지나면 단계가 순서대로 올라가야 한다 --- */
/* 실제로 돌려보니 9초에 4단계로 점프했다. 역순 루프가 원인이었다. */
const lv = G._moleLevelAt, LV = G._MOLE_STEPS;
assert.ok(typeof lv === 'function', '레벨 계산 함수가 노출되지 않았다');
assert.strictEqual(lv(0), 0, '시작은 1단계여야 한다');
assert.strictEqual(lv(5), 0, '5초에도 아직 1단계여야 한다');
assert.ok(lv(9) <= 1, '9초에 단계가 너무 높다 (최고 단계로 점프하면 버그): ' + lv(9));
assert.ok(lv(25) > lv(5), '시간이 지나도 단계가 안 오른다');
// 단계가 올라갈수록 실제로 빨라져야 한다 (배수가 작아진다)
for (let i = 1; i < LV.length; i++) {
  assert.ok(LV[i].mul < LV[i - 1].mul, `${i + 1}단계가 더 빨라지지 않는다`);
}

/* --- 7. 게임 수가 줄었으니 목록도 맞아야 한다 --- */
const ids = [...core.matchAll(/id: *'([a-z]+)'/g)].map(m => m[1]);
assert.strictEqual(ids.length, 4, '게임은 4종이어야 한다 (비행기 삭제): ' + ids.join(','));
assert.ok(!ids.includes('plane'), '비행기가 남아 있다');

console.log('PASS: 게임 4종, 까마귀 pointerdown+넓은 히트영역, 두꺼비 레벨/피드백');

/* --- 8. 판자 뚫기에 실제 관통 연출이 있어야 한다 ---
   기존엔 🎯 이모지를 관통 수만큼 나열할 뿐이라 "뚫렸다"는 느낌이 없었다.
   판자 4장을 세워두고, 화살이 날아가, 뚫린 판자만 부서져야 한다. */
assert.ok(/plank|board-col/.test(games), '판자를 개별 요소로 세우지 않는다');
assert.ok(/arrow-fly|flyArrow/.test(games), '화살이 날아가는 연출이 없다');
assert.ok(/broken|\.hit\b/.test(games), '뚫린 판자 표시가 없다');
assert.ok(/@keyframes\s+arrowfly/.test(html), '화살 비행 애니메이션 CSS 가 없다');
assert.ok(/@keyframes\s+plankbreak/.test(html), '판자 파괴 애니메이션 CSS 가 없다');
assert.ok(/\.plank\b/.test(html), '판자 CSS 가 없다');
/* 뚫린 장수와 화면에 부서지는 판자 수가 같아야 한다 */
assert.ok(/pierced/.test(games), '관통 장수 계산이 사라졌다');
console.log('PASS: 판자 관통 연출 (화살 비행 + 판자 파괴)');
