const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function loadRoast(resultText) {
  const result = { innerText: resultText, textContent: resultText, offsetParent: {} };
  const document = {
    title: '커플 궁합',
    readyState: 'complete',
    referrer: '',
    querySelectorAll(sel) {
      if (sel === '.addthis_inline_share_toolbox_czma') return [];
      return [];
    },
    querySelector(sel) {
      if (sel === '#compatibility-result') return result;
      return null;
    }
  };
  const window = { document, location: { href: 'https://example.test/Sec5_couple.html' } };
  window.window = window;
  window.top = window;
  window.self = window;
  const ctx = { window, document, location: window.location, console, setTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/roast.js'), 'utf8'), ctx);
  return window;
}

const w = loadRoast('커플 궁합 점수: 87 / 100\n아주 잘 어울리는 커플!');
assert.strictEqual(typeof w.__shareResultText, 'function', '결과 공유 텍스트 함수가 있어야 한다');
const text = w.__shareResultText();
assert.match(text, /커플 궁합 점수: 87 \/ 100/);
assert.match(text, /아주 잘 어울리는 커플/);
assert.match(text, /https:\/\/example\.test\/Sec5_couple\.html/);
console.log('PASS: visible result is included in share text');
