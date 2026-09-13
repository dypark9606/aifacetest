const assert = require('assert');
const fs = require('fs');
const G = require('../js/makeup-battle.js');

/* 실사진 방식 폐기: 저작권 없는 자체 베이스 모델을 고르고 메이크업한다. */
assert.ok(G.BASE_MODELS && Object.keys(G.BASE_MODELS).length >= 4, '베이스 모델 4종 이상');
Object.keys(G.BASE_MODELS).forEach(function (id) {
  const m = G.BASE_MODELS[id];
  assert.ok(m.label && m.skin && m.hair && m.face, id + ' 모델 정보 누락');
  assert.ok(['round','oval','heart','long'].includes(m.face), id + ' 얼굴형 오류');
});

const html = fs.readFileSync('Sec13_makeup.html', 'utf8');
assert.ok(!html.includes('type="file"'), '실제 사진 업로드는 제거');
assert.ok(html.includes('id="base-models"'), '베이스 모델 선택 UI');
assert.ok(html.includes('drawBaseFace'), '자체 모델을 캔버스에 그리는 함수');
assert.ok(html.includes('input type="range"') || html.includes("rng.type = 'range'"), '진하기 게이지 유지');

const token = G.encodeChallenge(G.createChallenge('테스트', 'cat-idol', G.defaultLook(), 'chic'));
assert.strictEqual(G.decodeChallenge(token).base, 'chic', '도전장에 베이스 모델 보존');

console.log('PASS: original base models replace user photos');
