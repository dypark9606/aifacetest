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

  /* ---------- 1) 두꺼비 잡기 ---------- */
  function mole(o) {
    var f = make(o.field), score = 0, dead = false;
    var holes = [], timers = [];
    for (var i = 0; i < 9; i++) {
      var h = document.createElement('div');
      h.className = 'hole';
      h.style.left = (8 + (i % 3) * 33) + '%';
      h.style.top = (10 + Math.floor(i / 3) * 30) + '%';
      h.dataset.up = '0';
      (function (el) {
        el.addEventListener('click', function () {
          if (dead || el.dataset.up !== '1') return;
          el.dataset.up = '0'; el.className = 'hole'; el.textContent = '';
          score++; o.onScore(score);
        });
      })(h);
      f.appendChild(h); holes.push(h);
    }
    var pop = setInterval(function () {
      if (dead) return;
      var h = holes[Math.floor(Math.random() * holes.length)];
      if (h.dataset.up === '1') return;
      h.dataset.up = '1'; h.className = 'hole up'; h.textContent = '🐸';
      var t = setTimeout(function () {
        if (h.dataset.up === '1') { h.dataset.up = '0'; h.className = 'hole'; h.textContent = ''; }
      }, 800);
      timers.push(t);
    }, 520);

    function cleanup() {
      dead = true; clearInterval(pop);
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
      }, 900 + Math.random() * 2200);
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

  /* ---------- 3) 화살 판자 뚫기 (누르고 있다 떼는 힘) ---------- */
  function arrow(o) {
    var f = make(o.field), dead = false, shots = 0, total = 0, TOTAL = 3;
    var boards = document.createElement('div');
    boards.className = 'boards';
    f.appendChild(boards);
    var bar = document.createElement('div');
    bar.className = 'bar'; bar.innerHTML = '<i></i>';
    f.appendChild(bar);
    var fill = bar.querySelector('i');
    var msg = document.createElement('div');
    msg.className = 'reflex-pad';
    msg.textContent = '화면을 누르고 있다가 떼세요';
    f.appendChild(msg);
    f.classList.add('tap');

    /* ⚠ 게이지를 타이머 누적으로 계산하면 안 된다. 탭이 가려지거나 iframe 이
       화면 밖이면 브라우저가 타이머를 늦춰(throttle) 게이지가 거의 0 인 채로
       발사된다(실측: 0.45초 눌렀는데 4%). 그래서 **힘은 누른 시각과 뗀 시각의
       차이로 계산**하고, 타이머는 막대를 그리는 데만 쓴다. */
    var CYCLE = 1200;            /* 0 → 100 → 0 한 바퀴에 걸리는 시간(ms) */
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
      boards.textContent = new Array(pierced + 1).join('🎯') || '💨';
      msg.textContent = pierced ? pierced + '장 관통!' : '빗나감!';
      o.onScore(total);
      o.onTime((TOTAL - shots) + '발 남음');
      if (shots >= TOTAL) { dead = true; setTimeout(function () { o.onEnd(total); }, 500); }
      else setTimeout(function () { if (!dead) { fill.style.width = '0'; msg.textContent = '누르고 있다가 떼세요'; } }, 700);
    }

    f.addEventListener('mousedown', down); f.addEventListener('mouseup', up);
    f.addEventListener('touchstart', function (e) { e.preventDefault(); down(); }, { passive: false });
    f.addEventListener('touchend', function (e) { e.preventDefault(); up(); }, { passive: false });
    o.onTime(TOTAL + '발 남음');

    return { stop: function () { dead = true; clearInterval(anim); },
             _shoot: function (ms) { startAt = Date.now() - ms; holding = true; up(); } };
  }

  /* ---------- 공용: 날아가는 표적 맞히기 (비행기 / 까마귀) ---------- */
  function flyer(o, emoji, seconds, speedBase) {
    var f = make(o.field), score = 0, dead = false, items = [];
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
      el.addEventListener('click', function () {
        if (dead || el.dataset.hit === '1') return;
        el.dataset.hit = '1';
        el.textContent = '💥';
        score++; o.onScore(score);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160);
      });
      f.appendChild(el);
      var item = { el: el, x: x, dir: dir, speed: speed };
      items.push(item);
    }, 620);

    var last = Date.now();
    var move = setInterval(function () {
      if (dead) return;
      var now = Date.now(), dt = (now - last) / 1000; last = now;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
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

  function plane(o) { return flyer(o, '✈️', 30, 130); }
  function crow(o) { return flyer(o, '🐦', 30, 170); }

  root.ArcadeGames = { mole: mole, reflex: reflex, arrow: arrow, plane: plane, crow: crow };
})(typeof self !== 'undefined' ? self : this);
