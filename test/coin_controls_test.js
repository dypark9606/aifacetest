const assert = require('assert');
const fs = require('fs');
const read = p => fs.readFileSync(p, 'utf8');

const arcade = read('Sec14_arcade.html');
assert.ok(arcade.includes('js/coin-wallet.js'), '오락실에 공용 지갑 로드');
assert.ok(arcade.includes('A.spendGame()'), '게임 시작 때 코인 차감');
assert.ok(arcade.includes('id="ask-coins"') && arcade.includes('id="send-coins"'), '친구 요청·보내기 UI');
assert.ok(arcade.includes('?coinRequest=') && arcade.includes('?coinGift='), '친구 코인 왕복 링크');
assert.ok(arcade.includes('매일 첫 접속 +100'), '일일 지급과 보상표 안내');

const index = read('index.html');
assert.ok(index.includes('js/coin-wallet.js') && index.includes('global-coin-count'), '메인 화면 코인 잔액');

['Sec1_appea.html','Sec2_man_ent.html','Sec3_ani.html','Sec4_rich.html','Sec5_good_bad.html',
 'Sec5_couple.html','Sec6_saju.html','Sec7_fortune.html','Sec11_faceSaju.html','Sec12_mbti.html','Sec13_makeup.html']
.forEach(p => assert.ok(read(p).includes('js/coin-wallet.js'), p + ' 분석 보상 지갑 로드'));
assert.ok(read('js/roast.js').includes('rewardAnalysis'), '기존 얼굴 분석 완료 보상');
assert.ok(read('js/readui.js').includes('rewardAnalysis'), '얼굴사주 완료 보상');
assert.ok(read('js/mbti_quiz.js').includes('rewardAnalysis'), 'MBTI 완료 보상');
assert.ok(read('Sec13_makeup.html').includes("rewardAnalysis('makeup')"), '메이크업 완료 보상');

console.log('PASS: coin economy wired into games and every analysis tab');
