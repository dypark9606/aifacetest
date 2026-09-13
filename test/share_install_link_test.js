const assert = require('assert');
const card = require('../js/share-card.js');
const A = require('../js/arcade-core.js');

const PLAY = 'https://play.google.com/store/apps/details?id=com.dypark9606.aifacetest';

/* 사용자 요청: 공유를 받은 친구가 앱이 없어도 바로 설치할 수 있어야 한다.
   → 모든 공유 경로(메시지·도전장·인스타 캡션)에 설치 링크가 들어간다. */

// 1) 설치 링크 상수가 공개돼 있다
assert.strictEqual(card.PLAY_URL, PLAY);
assert.ok(card.WEB_URL.indexOf('dypark9606.github.io/aifacetest') >= 0);

// 2) 메시지 공유 문구에 설치 링크가 들어간다
const msg = card.shareMessage({ title: '두꺼비 잡기', body: '55마리 · S급', challenge: false });
assert.ok(msg.includes(PLAY), '공유 메시지에 Play 설치 링크: ' + msg);
assert.ok(msg.includes('앱 설치'), '설치라는 말이 보여야 누른다');

// 3) 도전장 문구에는 도전 링크와 설치 링크가 둘 다 들어간다
const ch = card.shareMessage({ title: '두꺼비 잡기', body: '내 기록 55마리', url: 'https://x.test/?arcade=abc', challenge: true });
assert.ok(ch.includes('https://x.test/?arcade=abc'), '도전 링크 유지');
assert.ok(ch.includes(PLAY), '도전장에도 설치 링크');

// 4) 인스타 캡션에도 설치 안내가 들어간다 (인스타는 링크가 안 눌리므로 검색어도 함께)
const cap = card.instaCaption({ theme: '고양이상 아이돌', score: 92, verdict: '좋아요' });
assert.ok(cap.includes('플레이스토어') || cap.includes('Play'), '인스타 캡션에 스토어 안내: ' + cap);
assert.ok(cap.length <= 2200);

// 5) 카드 이미지에 QR 을 넣을 수 있어야 한다
assert.strictEqual(typeof card.QR_PATH, 'string');
assert.ok(card.QR_PATH.length > 0, 'QR 이미지 경로가 있어야 카드에 그린다');

console.log('PASS: install link rides along with every share');
