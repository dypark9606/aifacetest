const assert = require('assert');
const fs = require('fs');
const read = p => fs.readFileSync(p, 'utf8');

const arcade = read('Sec14_arcade.html');
assert.ok(arcade.includes('js/coin-wallet.js'), '오락실에 공용 지갑 로드');
assert.ok(arcade.includes('A.spendGame()'), '게임 시작 때 코인 차감');
/* ⚠ '친구에게 코인 받기/보내기'는 2026-09-16 삭제됐다(사용자 지시).
   코인은 매일 접속 +100, 얼굴 테스트 +5, 게임 등급 보상으로만 번다.
   되살아나면 안 되므로 **없는 것**을 검사한다. */
assert.ok(!arcade.includes('id="ask-coins"'), '친구에게 코인 받기 버튼이 되살아났다');
assert.ok(!arcade.includes('id="send-coins"'), '코인 보내기 버튼이 되살아났다');
assert.ok(!arcade.includes('id="share-coin-request"'), '코인 요청 버튼이 되살아났다');
assert.ok(!/askCoins|shareCoinMessage/.test(arcade), '코인 요청 함수가 남아 있다');
assert.ok(arcade.includes('매일 첫 접속 +100'), '일일 지급과 보상표 안내');

const index = read('index.html');
assert.ok(index.includes('js/coin-wallet.js') && index.includes('global-coin-count'), '메인 화면 코인 잔액');

['Sec1_appea.html','Sec2_man_ent.html','Sec3_ani.html','Sec4_rich.html','Sec5_good_bad.html',
 'Sec5_couple.html','Sec6_saju.html','Sec7_fortune.html','Sec11_faceSaju.html','Sec12_mbti.html','Sec15_myface.html']
.forEach(p => assert.ok(read(p).includes('js/coin-wallet.js'), p + ' 분석 보상 지갑 로드'));
assert.ok(read('js/roast.js').includes('rewardAnalysis'), '기존 얼굴 분석 완료 보상');
assert.ok(read('js/readui.js').includes('rewardAnalysis'), '얼굴사주 완료 보상');
assert.ok(read('js/mbti_quiz.js').includes('rewardAnalysis'), 'MBTI 완료 보상');
/* ⚠ 메이크업 배틀(Sec13)을 지우면서 코인 획득처가 하나 사라졌다.
   내 얼굴 메이크업(Sec15)이 그 자리를 잇는다. 이게 빠지면 아이가 코인을 벌 곳이 준다. */
assert.ok(read('Sec15_myface.html').includes("rewardAnalysis('myface')"), '내 얼굴 메이크업 완료 보상');

console.log('PASS: coin economy wired into games and every analysis tab');

/* 코인이 부족할 때, 얼굴 테스트를 하면 코인을 받는다는 걸 명시해야 한다.
   "친구에게 요청"만 안내하면 아이는 코인을 스스로 벌 방법을 모른다.
   ⚠ 문구가 '...'+A.GAME_COST+'...' 처럼 끊겨 있어 한 따옴표 덩어리만 보면 안 된다.
      showCoinCard 호출 전체(닫는 괄호까지)를 잡아서 검사한다. */
const lackCall = /showCoinCard\('🪙 코인이 부족해요',([\s\S]*?)\);/.exec(arcade);
assert.ok(lackCall, '코인 부족 안내 문구를 찾을 수 없다');
assert.ok(/얼굴 ?테스트|분석/.test(lackCall[1]),
  '코인 부족 문구가 얼굴 테스트로 코인을 벌 수 있다고 안내하지 않는다');
assert.ok(/ANALYSIS_REWARD/.test(lackCall[1]),
  '분석 보상 액수를 상수로 안내해야 한다 (하드코딩하면 값이 어긋난다)');

/* 한 판 값은 HTML 에 박아두지 말고 상수에서 그려야 한다.
   실제로 10 -> 5 로 내렸을 때 "한 판 10코인" 안내가 그대로 남았다. */
assert.ok(/cost-lead'\)\.textContent\s*=[\s\S]{0,80}GAME_COST/.test(arcade),
  '한 판 값 안내가 A.GAME_COST 로 그려지지 않는다 (하드코딩 위험)');
console.log('PASS: 코인 부족 시 얼굴 테스트 보상 안내');
