/* rate-prompt.js — 좋은 순간에만 별점을 부탁한다
 *
 *   RatePrompt.good(reason)   기분 좋은 일이 생겼다고 알린다 (점수 누적)
 *   RatePrompt.maybeAsk()     조건이 맞으면 카드를 띄운다
 *   RatePrompt.reset()        (테스트용)
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────
 * 이 앱은 별점 1점이 20개, 5점이 18개다. 1점은 대부분 **앱이 아예 안 켜지던
 * 시절**의 리뷰다(흰 화면 / not found). 그 버그는 고쳐졌지만 점수는 남았다.
 * 문제는 지금도 **재밌게 쓴 사람이 별점을 남길 통로가 없다**는 것이다.
 * 불만인 사람만 스스로 스토어로 가므로, 남는 리뷰는 계속 낮은 쪽에 쏠린다.
 *
 * ── 규칙 (지키지 않으면 오히려 역효과) ────────────────────────
 *  1. **좋은 순간에만** 묻는다. 얼굴을 못 찾았거나 게임에서 졌을 때 물으면
 *     그 별점은 낮게 온다. 점수를 쌓아 두고 기쁜 일 뒤에만 띄운다.
 *  2. **처음 쓰는 사람에게 묻지 않는다.** 최소 두 번은 즐긴 뒤에.
 *  3. **하루에 한 번, 거절하면 오래 쉰다.** 매번 뜨면 그 자체가 1점 사유다.
 *  4. **'아니요'를 크게 둔다.** 억지로 누르게 하면 스토어에 화풀이가 온다.
 *  5. 별점은 **스토어에서** 남긴다 — 앱 안에서 별을 받아 걸러내는 건
 *     구글 정책 위반이다(리뷰 게이팅). 그냥 스토어로 보낸다.
 */
(function (global) {
  'use strict';

  var KEY = 'aifacetest_rate_v1';
  var PLAY = 'https://play.google.com/store/apps/details?id=com.dypark9606.aifacetest';

  /* 이 정도는 즐겼다고 볼 수 있는 점수 */
  var NEED_SCORE = 3;
  /* 거절하면 이만큼 쉬고 다시 묻는다 */
  var SNOOZE_DAYS = 30;
  /* 같은 날 두 번 묻지 않는다 */
  var ONE_A_DAY = true;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return { score: 0, asked: '', done: false, snoozeUntil: 0 };
      var o = JSON.parse(raw);
      return {
        score: Number(o.score) || 0,
        asked: String(o.asked || ''),
        done: !!o.done,
        snoozeUntil: Number(o.snoozeUntil) || 0
      };
    } catch (e) {
      return { score: 0, asked: '', done: false, snoozeUntil: 0 };
    }
  }

  function save(s) {
    try {
      global.localStorage && global.localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { }
  }

  /* 기분 좋은 일이 생겼다 — 무게가 다르다 */
  var WEIGHT = {
    analysis: 1,      // 얼굴 테스트를 한 번 끝냈다
    makeup: 2,        // 화장을 해 봤다 (반응이 제일 좋은 기능)
    surgery: 2,       // 성형을 해 봤다
    bestScore: 3,     // 게임 최고기록을 깼다
    share: 3,         // 결과를 친구에게 공유했다 (가장 강한 만족 신호)
    saved: 2          // 결과 사진을 저장했다
  };

  var RP = {};

  RP.PLAY_URL = PLAY;
  RP.NEED_SCORE = NEED_SCORE;
  RP.WEIGHT = WEIGHT;

  RP.good = function (reason) {
    var s = load();
    if (s.done) return s.score;              // 이미 별점을 남긴 사람은 그만
    s.score += (WEIGHT[reason] || 1);
    save(s);
    return s.score;
  };

  RP.state = function () { return load(); };

  RP.canAsk = function () {
    var s = load();
    if (s.done) return false;                        // 이미 남겼다
    if (s.score < NEED_SCORE) return false;          // 아직 덜 즐겼다
    if (Date.now() < s.snoozeUntil) return false;    // 거절 후 쉬는 중
    if (ONE_A_DAY && s.asked === today()) return false;
    return true;
  };

  /* 스토어로 보낸다. 앱에서는 native.js 의 browse 로 바깥 브라우저를 연다. */
  RP.openStore = function () {
    var s = load();
    s.done = true;
    save(s);
    try {
      var N = global.AppNative || (global.top && global.top.AppNative);
      if (N && N.browse) { N.browse({ url: PLAY }); return true; }
    } catch (e) { }
    try {
      (global.top || global).open(PLAY, '_blank', 'noopener');
      return true;
    } catch (e) { }
    return false;
  };

  RP.later = function () {
    var s = load();
    s.asked = today();
    s.snoozeUntil = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    save(s);
  };

  RP.never = function () {
    var s = load();
    s.done = true;                  // 다시 묻지 않는다
    save(s);
  };

  RP.reset = function () {
    try { global.localStorage && global.localStorage.removeItem(KEY); } catch (e) { }
  };

  /* ── 카드 ──
     iframe 안에서 떠도 부모 화면을 덮도록 최상위 문서에 붙인다. */
  function doc() {
    try {
      if (global.top && global.top.document) return global.top.document;
    } catch (e) { }
    return global.document;
  }

  RP.maybeAsk = function (opts) {
    if (!RP.canAsk()) return false;
    var d = doc();
    if (!d || d.getElementById('rate-prompt')) return false;

    var s = load();
    s.asked = today();
    save(s);

    var wrap = d.createElement('div');
    wrap.id = 'rate-prompt';
    wrap.setAttribute('style',
      'position:fixed;inset:0;z-index:99999;background:rgba(20,10,30,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:18px;' +
      'font-family:Jua,-apple-system,"Malgun Gothic",sans-serif');

    var card = d.createElement('div');
    card.setAttribute('style',
      'background:#fff;border-radius:22px;max-width:360px;width:100%;padding:24px 20px;' +
      'text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.3)');

    var title = d.createElement('p');
    title.textContent = '⭐ 재미있게 보셨나요?';
    title.setAttribute('style', 'margin:0 0 10px;font-size:23px;color:#c2185b;font-weight:bold');

    var body = d.createElement('p');
    body.textContent = (opts && opts.message) ||
      '별점을 남겨 주시면 더 많은 친구들이 이 앱을 찾을 수 있어요. 30초면 됩니다!';
    body.setAttribute('style', 'margin:0 0 18px;font-size:17px;line-height:1.6;color:#3a2b33');

    var go = d.createElement('button');
    go.type = 'button';
    go.textContent = '⭐ 별점 남기기';
    go.setAttribute('style',
      'width:100%;font-family:inherit;font-size:19px;padding:14px;border:0;border-radius:999px;' +
      'background:#ff6b9d;color:#fff;cursor:pointer;margin-bottom:9px');

    var later = d.createElement('button');
    later.type = 'button';
    later.textContent = '나중에';
    later.setAttribute('style',
      'width:100%;font-family:inherit;font-size:17px;padding:12px;border:2px solid #f3c6da;' +
      'border-radius:999px;background:#fff;color:#7a5a68;cursor:pointer;margin-bottom:6px');

    var never = d.createElement('button');
    never.type = 'button';
    never.textContent = '다시 보지 않기';
    never.setAttribute('style',
      'width:100%;font-family:inherit;font-size:15px;padding:8px;border:0;' +
      'background:transparent;color:#9b8f96;cursor:pointer');

    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
    go.onclick = function () { RP.openStore(); close(); };
    later.onclick = function () { RP.later(); close(); };
    never.onclick = function () { RP.never(); close(); };
    wrap.onclick = function (e) { if (e.target === wrap) { RP.later(); close(); } };

    card.appendChild(title); card.appendChild(body);
    card.appendChild(go); card.appendChild(later); card.appendChild(never);
    wrap.appendChild(card);
    d.body.appendChild(wrap);
    return true;
  };

  /* 좋은 일 + 조건이 되면 바로 묻는 지름길 */
  RP.goodAndMaybeAsk = function (reason, opts) {
    RP.good(reason);
    /* 결과를 눈으로 본 다음에 떠야 자연스럽다 */
    var delay = (opts && opts.delay) || 1500;
    setTimeout(function () { RP.maybeAsk(opts); }, delay);
  };

  global.RatePrompt = RP;
})(typeof window !== 'undefined' ? window : globalThis);
