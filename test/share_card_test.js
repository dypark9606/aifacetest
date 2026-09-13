const assert = require('assert');
const card = require('../js/share-card.js');

// 인스타 캡션: 해시태그가 붙고, 링크는 프로필 안내로 대체된다(인스타 본문 링크는 눌리지 않는다).
const cap = card.instaCaption({ theme: '고양이상 아이돌', score: 92, verdict: '감각이 빛나는 스타일리스트' });
assert.ok(cap.includes('고양이상 아이돌'));
assert.ok(cap.includes('92'));
assert.ok(cap.includes('#얼굴상테스트'), '해시태그가 있어야 한다: ' + cap);
assert.ok(cap.length <= 2200, '인스타 캡션 길이 제한');

const battleCap = card.instaCaption({ theme: '로맨틱 웨딩', score: 88, verdict: '매력적인 스타일 완성', opponent: { name: '친구', score: 95 } });
assert.ok(battleCap.includes('친구') && battleCap.includes('95'), '대결 캡션에는 상대 점수가 들어간다');

// 스토리 카드 규격: 인스타 스토리 9:16
assert.deepStrictEqual(card.CARD.story, { w: 1080, h: 1920 });
assert.deepStrictEqual(card.CARD.feed, { w: 1080, h: 1350 });

// 파일 이름은 안전한 문자만 남긴다
assert.strictEqual(card.fileName('고양이상 아이돌/../x'), 'makeup-battle.png');
console.log('PASS: instagram share card helpers');
