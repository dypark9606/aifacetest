const fs = require('fs');
const assert = require('assert');

for (const file of ['Sec5_couple.html', 'Sec6_saju.html', 'Sec7_fortune.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const count = (html.match(/addthis_inline_share_toolbox_czma/g) || []).length;
  assert.strictEqual(count, 1, `${file}에 결과 공유 버튼 자리가 하나 있어야 한다`);
}
console.log('PASS: couple, saju and fortune have share controls');
