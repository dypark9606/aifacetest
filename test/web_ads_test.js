const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const appRoot = path.resolve(root, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style_AI_main.css'), 'utf8');
const build = path.join(appRoot, '13.mobile_app', 'build_www.py');

assert.ok(html.includes('ca-pub-3673364925373886'), 'AdSense must remain enabled on the web');
assert.ok(html.includes('DAN-YLLMo8Ph65fsmH37'), 'AdFit 320x100 unit must be installed');
assert.ok(/class="web-adfit-banner"[^>]*data-web-only/.test(html), 'AdFit wrapper must be web-only');
assert.ok(/kakao_ad_area/.test(html) && /ba\.min\.js/.test(html), 'AdFit SDK markup is incomplete');
assert.ok(/\.web-adfit-banner\s*\{[^}]*justify-content:\s*center/s.test(css), 'AdFit banner must be centered');

if (fs.existsSync(build)) {
  const py = `
import importlib.util
p = ${JSON.stringify(build)}
s = importlib.util.spec_from_file_location('build_www', p)
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
sample = '<div class="keep">ok</div><div data-web-only><ins data-ad-unit="DAN-X"></ins><script src="//t1.kakaocdn.net/kas/static/ba.min.js"></script></div><script data-web-only src="ads.js"></script>'
out = m.strip_web_only(sample)
assert 'class="keep"' in out
assert 'DAN-X' not in out and 'ba.min.js' not in out and 'ads.js' not in out
print('PASS')
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, (r.stderr || r.stdout || 'mobile stripping failed').trim());
  assert.ok(r.stdout.includes('PASS'));
}
console.log('PASS web ads: AdSense kept, AdFit installed, native bundle stays clean');
