const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync('../13.mobile_app/native.js.tpl', 'utf8');

assert.match(src, /closest\('\.share-btn, \.share-result-btn'\)/,
  '네이티브 공유는 일반 결과 버튼과 동적 결과 버튼을 모두 받아야 한다');
assert.match(src, /window\.__shareResultText/,
  '네이티브 공유는 화면의 실제 결과 텍스트를 읽어야 한다');
assert.match(src, /data-share-text/,
  'MBTI·얼굴사주처럼 자체 결과 문자열을 가진 버튼도 지원해야 한다');
console.log('PASS: native bridge shares result text');
