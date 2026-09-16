/* ------------------------------------------------------------------
 * arcade-games.js — 미니게임 5종의 실제 플레이 로직
 *
 * 각 게임은 같은 계약을 지킨다:
 *   시작:  ArcadeGames[id]({field, onScore, onTime, onEnd}) -> {stop()}
 *   끝날 때 onEnd(점수) 를 딱 한 번 부른다.
 *
 * ⚠ 타이머와 이벤트는 stop() 에서 반드시 모두 해제한다. 게임을 바꾸거나
 *   리셋을 눌렀는데 이전 판의 타이머가 살아 있으면 점수가 겹쳐 들어온다.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  function make(field) {
    field.innerHTML = '';
    field.className = 'field';
    return field;
  }

  /* 공용: 제한시간 카운트다운 */
  function countdown(seconds, onTime, onDone) {
    var left = seconds;
    onTime(left);
    var t = setInterval(function () {
      left--;
      onTime(left);
      if (left <= 0) { clearInterval(t); onDone(); }
    }, 1000);
    return function () { clearInterval(t); };
  }

  /* ══════════ 난이도 1~10 ══════════
     ⚠ 딸 피드백: "속도 레벨을 1~10 으로 고르게 해줘. 그래야 성공 욕구가 생긴다."
     시간에 따라 저절로 빨라지는 방식(두꺼비 MOLE_LEVELS)은 남기되,
     **시작 난이도**를 사용자가 직접 고른다.

     설계 규칙:
     - 1 은 아이가 확실히 성공하는 속도, 10 은 어른도 버거운 속도.
     - 1→10 이 선형이어야 "한 단계 올렸다"는 감각이 일정하다.
     - 게임마다 '어려움'의 축이 다르다:
         두꺼비 = 등장간격·노출시간(짧을수록 어려움)
         까마귀 = 이동속도·등장간격
         순발력 = 초록 대기시간(짧고 예측 어려울수록 어려움)
         판자   = 게이지 왕복속도(빠를수록 100% 맞추기 어려움)
     - 값은 반드시 이 함수 한 곳에서만 만든다. 게임 안에 숫자를 박으면
       난이도를 바꿔도 안 먹는다. */
  var MAX_LEVEL = 10;

  function clampLevel(n) {
    n = Math.round(Number(n) || 1);
    return n < 1 ? 1 : (n > MAX_LEVEL ? MAX_LEVEL : n);
  }

  /* 1..10 -> 0..1 */
  function levelT(n) { return (clampLevel(n) - 1) / (MAX_LEVEL - 1); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function diffFor(game, level) {
    var t = levelT(level);
    if (game === 'mole') {
      return { spawn: Math.round(lerp(1100, 380, t)),
               up:    Math.round(lerp(1700, 620, t)) };
    }
    if (game === 'crow') {
      return { speed: Math.round(lerp(70, 260, t)),
               spawn: Math.round(lerp(900, 420, t)) };
    }
    if (game === 'reflex') {
      return { min: Math.round(lerp(1400, 700, t)),
               span: Math.round(lerp(2200, 900, t)) };
    }
    if (game === 'arrow') {
      return { cycle: Math.round(lerp(1800, 650, t)) };
    }
    return {};
  }

  /* ---------- 두꺼비 잡기 ----------
     ⚠ 딸 피드백: "너무 빠르다, 레벨이 있어야 한다".
     기존엔 등장 520ms / 노출 800ms 고정이라 처음부터 최고 난이도였다.
     이제 **고른 난이도에서 시작해** 시간이 지나며 조금씩 더 빨라진다.
     잡으면 진동 + "꽥" 이 뜬다. */
  var MOLE_STEPS = [
    { at: 0,  mul: 1.00, label: '1단계' },   /* 고른 난이도 그대로 */
    { at: 10, mul: 0.86, label: '2단계' },
    { at: 20, mul: 0.74, label: '3단계' }
  ];
  var MOLE_CRIES = ['꽥!', '으악!', '꾸엑!', '깨굴!', '아야!'];

  /* 경과 초 -> 단계 인덱스. 순수 함수라 테스트에서 직접 검증한다.
     ⚠ 예전엔 역순 루프로 훑어서 9초에 4단계가 걸리는 버그가 있었다. */
  function moleLevelAt(sec) {
    var want = 0;
    for (var k = 0; k < MOLE_STEPS.length; k++) {
      if (sec >= MOLE_STEPS[k].at) want = k;
    }
    return want;
  }

  function mole(o) {
    var f = make(o.field), score = 0, dead = false;
    var holes = [], timers = [];
    var elapsed = 0, level = 0;
    /* 고른 난이도가 기준값이 된다. 단계가 오르면 여기에 배수를 곱한다. */
    var base = diffFor('mole', o.level);

    function buzz(ms) {
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    }
    function cry(hole) {
      var c = document.createElement('div');
      c.className = 'hit-pop';
      c.textContent = MOLE_CRIES[Math.floor(Math.random() * MOLE_CRIES.length)];
      c.style.left = hole.style.left;
      c.style.top = hole.style.top;
      f.appendChild(c);
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 620);
    }

    for (var i = 0; i < 9; i++) {
      var h = document.createElement('div');
      h.className = 'hole';
      h.style.left = (8 + (i % 3) * 33) + '%';
      h.style.top = (10 + Math.floor(i / 3) * 30) + '%';
      h.dataset.up = '0';
      (function (el) {
        /* click 이 아니라 pointerdown — 두꺼비는 800ms 만에 숨는다. */
        el.addEventListener('pointerdown', function (ev) {
          if (dead || el.dataset.up !== '1') return;
          ev.preventDefault();
          el.dataset.up = '0';
          el.className = 'hole squish';        /* 납작해지는 연출 */
          el.textContent = '😖';               /* 잡힌 얼굴 */
          buzz(30);
          cry(el);
          score++; o.onScore(score);
          setTimeout(function () {
            if (el.dataset.up !== '1') { el.className = 'hole'; el.textContent = ''; }
          }, 380);
        });
      })(h);
      f.appendChild(h); holes.push(h);
    }

    var pop = null;
    function schedule() {
      if (pop) clearInterval(pop);
      pop = setInterval(function () {
        if (dead) return;
        var h = holes[Math.floor(Math.random() * holes.length)];
        if (h.dataset.up === '1' || h.className.indexOf('squish') >= 0) return;
        h.dataset.up = '1'; h.className = 'hole up'; h.textContent = '🐸';
        var t = setTimeout(function () {
          if (h.dataset.up === '1') { h.dataset.up = '0'; h.className = 'hole'; h.textContent = ''; }
        }, Math.round(base.up * MOLE_STEPS[level].mul));
        timers.push(t);
      }, Math.round(base.spawn * MOLE_STEPS[level].mul));
    }
    schedule();

    /* 시간이 지나면 단계가 올라간다.
       ⚠ 역순 루프 + `elapsed >= at` 은 처음부터 최고 단계가 걸린다
         (9초에 4단계로 점프하는 버그였다). 조건을 만족하는 **가장 높은**
         단계를 고르되, 현재 단계보다 높을 때만 올린다. */
    var lvlTimer = setInterval(function () {
      if (dead) return;
      elapsed++;
      var want = moleLevelAt(elapsed);
      if (want !== level) {
        level = want;
        schedule();
        if (o.onLevel) o.onLevel(MOLE_STEPS[level].label);
      }
    }, 1000);

    function cleanup() {
      dead = true;
      if (pop) clearInterval(pop);
      clearInterval(lvlTimer);
      timers.forEach(clearTimeout); timers = [];
      /* 판이 끝났는데 두꺼비가 남아 있으면 아직 잡을 수 있는 것처럼 보인다. */
      holes.forEach(function (h) { h.dataset.up = '0'; h.className = 'hole'; h.textContent = ''; });
    }
    var stopTime = countdown(30, o.onTime, function () { cleanup(); o.onEnd(score); });
    return { stop: function () { cleanup(); stopTime(); },
             _hit: function () { score++; o.onScore(score); } };
  }

  /* ---------- 2) 순발력 테스트 (5회 평균 반응속도) ---------- */
  function reflex(o) {
    var f = make(o.field), dead = false;
    var d = diffFor('reflex', o.level);
    var pad = document.createElement('div');
    pad.className = 'reflex-pad wait';
    pad.textContent = '초록으로 바뀌면 누르세요!';
    f.appendChild(pad);

    var times = [], green = 0, waitT = null, round = 0, TOTAL = 5;

    function nextRound() {
      if (dead) return;
      round++;
      o.onTime(round + '/' + TOTAL);
      pad.className = 'reflex-pad wait';
      pad.textContent = '기다리세요…';
      green = 0;
      waitT = setTimeout(function () {
        if (dead) return;
        green = Date.now();
        pad.className = 'reflex-pad go';
        pad.textContent = '지금!';
      }, d.min + Math.random() * d.span);
    }

    pad.addEventListener('click', function () {
      if (dead) return;
      if (!green) {   /* 너무 빨리 누름 — 벌칙 */
        pad.textContent = '너무 빨라요! 다시…';
        clearTimeout(waitT); round--; setTimeout(nextRound, 700);
        return;
      }
      var ms = Date.now() - green;
      times.push(ms); green = 0;
      o.onScore(ms + 'ms');
      if (times.length >= TOTAL) {
        dead = true;
        var avg = Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length);
        o.onEnd(avg);
        return;
      }
      pad.className = 'reflex-pad wait';
      pad.textContent = ms + 'ms! 다음…';
      setTimeout(nextRound, 700);
    });

    nextRound();
    return { stop: function () { dead = true; clearTimeout(waitT); } };
  }

  /* ---------- 화살 판자 뚫기 ----------
     기존엔 🎯 이모지를 관통 수만큼 늘어놓을 뿐이라 "뚫었다"는 맛이 없었다.
     이제 판자 4장을 실제로 세워두고, 화살이 왼쪽에서 날아와
     뚫린 장수만큼만 판자가 쪼개지도록 한다. */
  var PLANKS = 4;                    /* 한 발에 최대 4장 */

  function arrow(o) {
    var f = make(o.field), dead = false, shots = 0, total = 0, TOTAL = 3;

    /* 판자 4장을 세운다 */
    var stage = document.createElement('div');
    stage.className = 'boards';
    var planks = [];
    for (var i = 0; i < PLANKS; i++) {
      var p = document.createElement('div');
      p.className = 'plank';
      p.innerHTML = '<span class="plank-top"></span><span class="plank-bot"></span>';
      stage.appendChild(p);
      planks.push(p);
    }
    f.appendChild(stage);

    var bar = document.createElement('div');
    bar.className = 'bar'; bar.innerHTML = '<i></i>';
    f.appendChild(bar);
    var fill = bar.querySelector('i');
    var msg = document.createElement('div');
    msg.className = 'reflex-pad';
    msg.textContent = '화면을 누르고 있다가 떼세요';
    f.appendChild(msg);
    f.classList.add('tap');

    function resetPlanks() {
      planks.forEach(function (p) { p.className = 'plank'; });
    }

    function buzz(ms) {
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    }

    /* 화살이 날아가 n 장을 차례로 뚫는다 */
    function flyArrow(n, done) {
      var a = document.createElement('div');
      a.className = 'arrow-fly';
      a.textContent = '🏹';
      f.appendChild(a);
      /* 관통 장수에 따라 날아가는 거리가 달라진다 */
      var dist = n > 0 ? (18 + n * 19) : 30;
      a.style.setProperty('--dist', dist + '%');
      a.style.animation = 'arrowfly .5s cubic-bezier(.2,.7,.3,1) forwards';

      /* 판자를 하나씩 차례로 깬다 — 동시에 깨면 관통이 아니라 폭발로 보인다 */
      for (var k = 0; k < n; k++) {
        (function (idx) {
          setTimeout(function () {
            if (!planks[idx]) return;
            planks[idx].className = 'plank broken';
            buzz(18);
          }, 120 + idx * 95);
        })(k);
      }
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        if (done) done();
      }, 140 + n * 95 + 320);
    }

    /* ⚠ 게이지를 타이머 누적으로 계산하면 안 된다. 탭이 가려지거나 iframe 이
       화면 밖이면 브라우저가 타이머를 늦춰(throttle) 게이지가 거의 0 인 채로
       발사된다(실측: 0.45초 눌렀는데 4%). 그래서 **힘은 누른 시각과 뗀 시각의
       차이로 계산**하고, 타이머는 막대를 그리는 데만 쓴다. */
    var CYCLE = diffFor('arrow', o.level).cycle;   /* 0 → 100 → 0 한 바퀴(ms). 난이도가 높을수록 짧다 */
    var startAt = 0, anim = null, holding = false;

    function powerAt(t) {
      var phase = (t % CYCLE) / CYCLE;              /* 0..1 */
      return Math.round((phase <= 0.5 ? phase * 2 : (1 - phase) * 2) * 100);
    }

    function loop() {
      anim = setInterval(function () {
        fill.style.width = powerAt(Date.now() - startAt) + '%';
      }, 30);
    }

    function down() {
      if (dead || holding) return;
      holding = true; startAt = Date.now(); loop();
      msg.textContent = '힘을 모으는 중…';
    }
    function up() {
      if (dead || !holding) return;
      holding = false; clearInterval(anim);
      var power = powerAt(Date.now() - startAt);
      fill.style.width = power + '%';
      /* 100%에 가까울수록 많이 뚫린다 — 최대 4장/발 */
      var pierced = Math.max(0, Math.round(power / 25));
      total += pierced; shots++;
      msg.textContent = '슝—';

      flyArrow(pierced, function () {
        msg.textContent = pierced ? pierced + '장 관통! 💥' : '빗나감! 💨';
        o.onScore(total);
        o.onTime((TOTAL - shots) + '발 남음');
        if (shots >= TOTAL) {
          dead = true;
          setTimeout(function () { o.onEnd(total); }, 600);
        } else {
          setTimeout(function () {
            if (!dead) {
              fill.style.width = '0';
              resetPlanks();
              msg.textContent = '누르고 있다가 떼세요';
            }
          }, 800);
        }
      });
    }

    f.addEventListener('mousedown', down); f.addEventListener('mouseup', up);
    f.addEventListener('touchstart', function (e) { e.preventDefault(); down(); }, { passive: false });
    f.addEventListener('touchend', function (e) { e.preventDefault(); up(); }, { passive: false });
    o.onTime(TOTAL + '발 남음');

    return { stop: function () { dead = true; clearInterval(anim); },
             _shoot: function (ms) { startAt = Date.now() - ms; holding = true; up(); } };
  }

  /* ---------- 까마귀 사냥 ----------
     ⚠ 딸이 폰으로 해보니 "잡히지도 않고 잡혔는지도 모르겠다"고 했다. 원인 3가지:
       1) click 을 썼다. click 은 손을 **뗄 때** 발생하는데 표적은 33ms 마다
          움직이므로, 탭하는 사이 표적이 손가락 밑에서 빠져나가 click 이 안 꽂힌다.
          → pointerdown 으로 바꾼다 (손이 닿는 즉시).
       2) .target 에 크기가 없어 이모지 글리프(30px 미만)가 곧 히트 영역이었다.
          손가락 터치는 최소 56~64px 가 필요하다. → CSS 에서 min-width/height 확보.
       3) 맞아도 💥 를 160ms 만 보여주고 지워 인지가 안 됐다.
          → 진동 + 죽는 연출 + 점수 팝업을 준다. */
  function flyer(o, emoji, seconds, speedBase, spawnMs) {
    var f = make(o.field), score = 0, dead = false, items = [];

    function buzz(ms) {
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    }
    function popScore(x, y) {
      var p = document.createElement('div');
      p.className = 'hit-pop';
      p.textContent = '+1';
      p.style.left = x + 'px'; p.style.top = y + 'px';
      f.appendChild(p);
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
    }

    var spawn = setInterval(function () {
      if (dead) return;
      var el = document.createElement('div');
      el.className = 'target';
      el.textContent = emoji;
      var y = 20 + Math.random() * 240;
      var dir = Math.random() < 0.5 ? 1 : -1;
      var x = dir > 0 ? -40 : f.clientWidth + 40;
      var speed = speedBase + Math.random() * speedBase;
      el.style.top = y + 'px'; el.style.left = x + 'px';
      if (dir < 0) el.style.transform = 'scaleX(-1)';

      var item = { el: el, x: x, dir: dir, speed: speed, hit: false };

      /* pointerdown = 손이 닿는 즉시. click 이면 폰에서 거의 안 맞는다. */
      el.addEventListener('pointerdown', function (ev) {
        if (dead || item.hit) return;
        ev.preventDefault();
        item.hit = true;
        item.speed = 0;                    /* 맞으면 그 자리에서 떨어진다 */
        el.textContent = '💥';
        el.classList.add('dead');          /* 회전하며 추락 + 페이드 */
        buzz(35);
        popScore(item.x, parseFloat(el.style.top));
        score++; o.onScore(score);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 520);
      });

      f.appendChild(el);
      items.push(item);
    }, spawnMs);

    var last = Date.now();
    var move = setInterval(function () {
      if (dead) return;
      var now = Date.now(), dt = (now - last) / 1000; last = now;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        if (it.hit) continue;              /* 맞은 놈은 CSS 애니메이션에 맡긴다 */
        it.x += it.dir * it.speed * dt;
        it.el.style.left = it.x + 'px';
        if (it.x < -80 || it.x > f.clientWidth + 80) {
          if (it.el.parentNode) it.el.parentNode.removeChild(it.el);
          items.splice(i, 1);
        }
      }
    }, 33);

    function cleanup() {
      dead = true; clearInterval(spawn); clearInterval(move);
      /* 끝난 뒤 표적이 남아 날아다니면 계속 누를 수 있는 줄 안다. */
      items.forEach(function (it) { if (it.el.parentNode) it.el.parentNode.removeChild(it.el); });
      items = [];
    }
    var stopTime = countdown(seconds, o.onTime, function () { cleanup(); o.onEnd(score); });
    return { stop: function () { cleanup(); stopTime(); } };
  }

  function crow(o) {
    var d = diffFor('crow', o.level);
    return flyer(o, '🐦', 30, d.speed, d.spawn);
  }

  root.ArcadeGames = { mole: mole, reflex: reflex, arrow: arrow, crow: crow,
                       MAX_LEVEL: MAX_LEVEL, diffFor: diffFor, clampLevel: clampLevel,
                       _moleLevelAt: moleLevelAt, _MOLE_STEPS: MOLE_STEPS };
})(typeof self !== 'undefined' ? self : this);
