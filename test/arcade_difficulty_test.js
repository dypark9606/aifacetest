const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AG = {};
new Function('self', fs.readFileSync(path.join(ROOT, 'js/arcade-games.js'), 'utf8'))(AG);
const G = AG.ArcadeGames;
const html = fs.readFileSync(path.join(ROOT, 'Sec14_arcade.html'), 'utf8');

/* 딸 요구: "미니게임 모두 속도 레벨 1~10 을 고를 수 있게. 그래야 성공 욕구가 생긴다." */

/* --- 1. 1~10 단계가 있어야 한다 --- */
assert.strictEqual(G.MAX_LEVEL, 10, '난이도는 1~10 이어야 한다');
assert.strictEqual(typeof G.diffFor, 'function', 'diffFor 가 노출되지 않았다');
assert.strictEqual(typeof G.clampLevel, 'function', 'clampLevel 이 노출되지 않았다');

/* 범위 밖 입력이 들어와도 깨지면 안 된다 */
assert.strictEqual(G.clampLevel(0), 1, '0 은 1 로 보정해야 한다');
assert.strictEqual(G.clampLevel(99), 10, '10 초과는 10 으로 보정해야 한다');
assert.strictEqual(G.clampLevel(null), 1, 'null 은 1 로 보정해야 한다');
assert.strictEqual(G.clampLevel('7'), 7, '문자열 숫자도 받아야 한다');

/* --- 2. 네 게임 모두 난이도가 실제로 달라야 한다 ---
   ⚠ 한 게임이라도 빠지면 "모든 미니게임" 요구를 못 지킨 것이다. */
const GAMES = ['mole', 'crow', 'reflex', 'arrow'];
GAMES.forEach(g => {
  const easy = G.diffFor(g, 1);
  const hard = G.diffFor(g, 10);
  assert.ok(Object.keys(easy).length > 0, `${g} 에 난이도 값이 없다`);
  assert.notDeepStrictEqual(easy, hard, `${g} 는 1 과 10 이 똑같다 — 난이도가 안 먹는다`);
});

/* --- 3. 어려울수록 실제로 어려워야 한다 (방향 검증) ---
   숫자가 달라지기만 하고 방향이 반대면 10단계가 오히려 쉬워진다. */
const m1 = G.diffFor('mole', 1), m10 = G.diffFor('mole', 10);
assert.ok(m10.spawn < m1.spawn, '두꺼비: 난이도가 높은데 등장이 더 느리다');
assert.ok(m10.up < m1.up, '두꺼비: 난이도가 높은데 더 오래 떠 있다');

const c1 = G.diffFor('crow', 1), c10 = G.diffFor('crow', 10);
assert.ok(c10.speed > c1.speed, '까마귀: 난이도가 높은데 더 느리다');
assert.ok(c10.spawn < c1.spawn, '까마귀: 난이도가 높은데 덜 나온다');

const r1 = G.diffFor('reflex', 1), r10 = G.diffFor('reflex', 10);
assert.ok(r10.min < r1.min, '순발력: 난이도가 높은데 대기가 더 길다');

const a1 = G.diffFor('arrow', 1), a10 = G.diffFor('arrow', 10);
assert.ok(a10.cycle < a1.cycle, '판자: 난이도가 높은데 게이지가 더 느리다');

/* --- 4. 단조 증가여야 한다 ---
   중간에 뒤집히면 "5단계가 6단계보다 어렵다" 같은 혼란이 생긴다. */
GAMES.forEach(g => {
  const keys = Object.keys(G.diffFor(g, 1));
  keys.forEach(k => {
    for (let lv = 2; lv <= 10; lv++) {
      const prev = G.diffFor(g, lv - 1)[k];
      const cur = G.diffFor(g, lv)[k];
      const rising = G.diffFor(g, 10)[k] > G.diffFor(g, 1)[k];
      assert.ok(rising ? cur >= prev : cur <= prev,
        `${g}.${k} 이 ${lv - 1}→${lv} 에서 방향이 뒤집혔다 (${prev} → ${cur})`);
    }
  });
});

/* --- 5. 1단계는 정말 쉬워야 한다 ---
   아이가 첫 판에서 성공해야 계속한다. */
assert.ok(m1.up >= 1500, `두꺼비 1단계 노출이 너무 짧다: ${m1.up}ms`);
assert.ok(c1.speed <= 90, `까마귀 1단계가 너무 빠르다: ${c1.speed}px/s`);
assert.ok(a1.cycle >= 1500, `판자 1단계 게이지가 너무 빠르다: ${a1.cycle}ms`);

/* --- 6. 게임이 난이도를 실제로 받아 쓰는지 (하드코딩 금지) --- */
const src = fs.readFileSync(path.join(ROOT, 'js/arcade-games.js'), 'utf8');
[['mole', "diffFor('mole'"], ['crow', "diffFor('crow'"],
 ['reflex', "diffFor('reflex'"], ['arrow', "diffFor('arrow'"]].forEach(([g, needle]) => {
  assert.ok(src.indexOf(needle) > 0, `${g} 이 diffFor 를 쓰지 않는다 — 난이도를 바꿔도 안 먹는다`);
});
/* 예전 하드코딩 값이 남아 있으면 안 된다 */
assert.ok(!/setInterval\([\s\S]{0,400}?\}, 620\);/.test(src),
  '까마귀 등장 간격이 620ms 로 하드코딩돼 있다');
assert.ok(!/var CYCLE = 1200/.test(src), '판자 게이지가 1200ms 로 하드코딩돼 있다');

/* --- 7. 화면에 1~10 버튼과 연결이 있어야 한다 --- */
assert.ok(/id="levels"/.test(html), '난이도 선택 영역이 없다');
assert.ok(/drawLevels/.test(html), '난이도 버튼을 그리는 코드가 없다');
assert.ok(/level: state\.level/.test(html),
  '고른 난이도를 게임에 넘기지 않는다 — 버튼만 있고 안 먹는다');
/* 난이도를 바꿀 때 진행 중인 판을 멈춰야 한다 */
const drawLv = /function drawLevels\(\)[\s\S]*?\n  \}/.exec(html);
assert.ok(drawLv, 'drawLevels 를 찾을 수 없다');
assert.ok(/state\.running\.stop\(\)/.test(drawLv[0]),
  '난이도를 바꿔도 이전 판이 안 멈춘다 — 옛 속도가 계속 돈다');
/* 게임별로 난이도를 기억해야 한다 */
assert.ok(/levelMap\[/.test(html), '게임별 난이도를 기억하지 않는다');

/* 폰에서 누를 수 있는 크기여야 한다.
   ⚠ min-height 만 찾으면 height 로 지정한 경우를 놓친다. 둘 다 본다.
   게임 버튼(114px)의 절반인 57px 이 기준이고, 터치 최소치는 44px. */
const lvCss = /\.lvbtn\{[\s\S]*?\}/.exec(html);
assert.ok(lvCss, '.lvbtn 스타일이 없다');
const hMatch = /(?:min-)?height:\s*(\d+)px/.exec(lvCss[0]);
assert.ok(hMatch, '난이도 버튼 높이가 지정되지 않았다');
const btnH = Number(hMatch[1]);
assert.ok(btnH >= 44,
  `난이도 버튼이 손가락으로 누르기엔 너무 작다: ${btnH}px (최소 44px)`);
assert.ok(btnH <= 70,
  `난이도 버튼이 너무 크다: ${btnH}px (게임 버튼 114px 의 절반인 57px 안팎이어야 한다)`);

/* 게임 고르기가 먼저, 난이도가 그다음이어야 한다 (사용자 지정 순서) */
const iGame = html.indexOf('1. 게임 고르기');
const iLevel = html.indexOf('2. 난이도 고르기');
assert.ok(iGame > 0 && iLevel > 0, '카드 번호(1. 게임 / 2. 난이도)가 없다');
assert.ok(iGame < iLevel, '게임 고르기가 난이도보다 위에 있어야 한다');

/* ⚠ 게임 버튼을 누르면 즉시 시작된다. 난이도가 아래에 있으면 존재를 모른 채 지나친다
   (실제로 그래서 "난이도가 안 보인다"는 신고가 나왔다).
   게임 카드 안에서 현재 난이도를 보여주고 아래로 데려가야 한다. */
assert.ok(/id="cur-level"/.test(html), '게임 카드에 현재 난이도 표시가 없다');
assert.ok(/id="go-level"/.test(html), '난이도로 이동하는 링크가 없다');
assert.ok(/cur\.textContent = state\.level/.test(html),
  '현재 난이도 표시가 갱신되지 않는다');

/* --- 8. 두꺼비의 시간 경과 가속은 유지된다 --- */
assert.strictEqual(typeof G._moleLevelAt, 'function', '두꺼비 단계 함수가 사라졌다');
assert.strictEqual(G._moleLevelAt(0), 0, '시작은 0단계');
assert.ok(G._moleLevelAt(25) > G._moleLevelAt(5), '시간이 지나도 안 빨라진다');
/* 예전 버그: 9초에 최고 단계로 점프 */
assert.ok(G._moleLevelAt(9) <= 1, `9초에 단계가 너무 높다: ${G._moleLevelAt(9)}`);

console.log('PASS: 미니게임 4종 난이도 1~10 (방향·단조성·UI 연결·게임별 기억)');
