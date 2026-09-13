/* ------------------------------------------------------------------
 * makeup-battle.js — 얼굴상 메이크업 배틀
 *
 * 2026-09-13 개편: 캐릭터 그림이 아니라 **사용자가 방금 찍은 얼굴 사진** 위에
 * 메이크업을 올린다. 그리고 색만 고르는 게 아니라 부위마다 **진하기 게이지**를
 * 둔다. 색/진하기를 따로 채점하므로 점수가 촘촘하게 갈린다.
 *
 * 각 부위 상태: { value: '색 이름', level: 0~100 }
 *  - value 가 틀리면 그 부위는 0점 (진하기는 보지 않는다)
 *  - value 가 맞으면 목표 진하기와의 차이만큼 감점
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MakeupBattle = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPTIONS = {
    eye:    ['pink', 'brown', 'coral', 'purple'],
    lip:    ['berry', 'red', 'coral', 'rose'],
    blush:  ['rose', 'peach', 'coral'],
    brow:   ['soft', 'bold', 'arch'],
    shade:  ['warm', 'cool', 'neutral'],
    gloss:  ['matte', 'dewy', 'glitter']
  };

  var LABELS = {
    eye:   ['아이섀도', { pink: '핑크', brown: '브라운', coral: '코랄', purple: '퍼플' }],
    lip:   ['립',       { berry: '베리', red: '레드', coral: '코랄', rose: '로즈' }],
    blush: ['블러셔',   { rose: '로즈', peach: '피치', coral: '코랄' }],
    brow:  ['눈썹',     { soft: '자연', bold: '진한', arch: '아치' }],
    shade: ['피부톤',   { warm: '웜톤', cool: '쿨톤', neutral: '뉴트럴' }],
    gloss: ['마무리',   { matte: '매트', dewy: '촉촉', glitter: '글리터' }]
  };

  /* 화면에 그릴 색 — 사진 위에 곱하기/오버레이로 얇게 올린다 */
  var COLORS = {
    eye:   { pink: '#ff6fa8', brown: '#a4633d', coral: '#ff8559', purple: '#9b6bd6' },
    lip:   { berry: '#a3184a', red: '#e02020', coral: '#ff6a45', rose: '#e2687f' },
    blush: { rose: '#ff9ab4', peach: '#ffb184', coral: '#ff8a6a' },
    brow:  { soft: '#8a6247', bold: '#3f2a1d', arch: '#5c3a26' },
    shade: { warm: '#ffd9a8', cool: '#d9e2ff', neutral: '#f0e6dc' },
    gloss: { matte: '#ffffff', dewy: '#ffffff', glitter: '#fff3b0' }
  };

  /* 사진 위에서 각 부위를 그릴 위치 — 얼굴 박스(0~1 비율) 기준.
     MediaPipe 없이도 동작해야 하므로 일반적인 정면 얼굴 비율을 쓴다.
     [cx, cy, rx, ry] = 중심 x/y, 반지름 x/y (모두 0~1 비율) */
  var FACE_ZONES = {
    eye:   [[0.34, 0.42, 0.125, 0.050], [0.66, 0.42, 0.125, 0.050]],
    brow:  [[0.34, 0.355, 0.130, 0.024], [0.66, 0.355, 0.130, 0.024]],
    blush: [[0.26, 0.565, 0.115, 0.075], [0.74, 0.565, 0.115, 0.075]],
    lip:   [[0.50, 0.735, 0.110, 0.052]],
    shade: [[0.50, 0.520, 0.360, 0.430]],
    /* 마무리(하이라이트)는 이마 한 곳에 덩어리로 찍으면 흰 반점처럼 보인다.
       이마·콧등·광대에 작게 나눠 얹어야 '광'처럼 읽힌다. */
    gloss: [[0.50, 0.315, 0.115, 0.045],
            [0.50, 0.560, 0.040, 0.090],
            [0.28, 0.505, 0.070, 0.040], [0.72, 0.505, 0.070, 0.040]]
  };

  /* 부위별 배점 — 합 100 */
  var WEIGHTS = { eye: 22, lip: 22, blush: 16, brow: 14, shade: 14, gloss: 12 };

  var THEMES = {
    'cat-idol': {
      label: '고양이상 아이돌', emoji: '🐱',
      prompt: '무대 조명에서 빛나는 고양이상 아이돌 메이크업을 완성해 주세요.',
      target: {
        eye:   { value: 'pink',  level: 75 },
        lip:   { value: 'berry', level: 70 },
        blush: { value: 'rose',  level: 55 },
        brow:  { value: 'arch',  level: 60 },
        shade: { value: 'cool',  level: 40 },
        gloss: { value: 'glitter', level: 80 }
      }
    },
    'rich-ceo': {
      label: '부자상 CEO', emoji: '💎',
      prompt: '신뢰감 있는 부자상 CEO 메이크업을 완성해 주세요. 과하지 않게.',
      target: {
        eye:   { value: 'brown', level: 35 },
        lip:   { value: 'red',   level: 55 },
        blush: { value: 'peach', level: 25 },
        brow:  { value: 'bold',  level: 70 },
        shade: { value: 'neutral', level: 35 },
        gloss: { value: 'matte', level: 60 }
      }
    },
    'first-date': {
      label: '설레는 첫 데이트', emoji: '💗',
      prompt: '사랑스럽고 은은한 첫 데이트 메이크업을 완성해 주세요.',
      target: {
        eye:   { value: 'coral', level: 45 },
        lip:   { value: 'coral', level: 50 },
        blush: { value: 'coral', level: 60 },
        brow:  { value: 'soft',  level: 40 },
        shade: { value: 'warm',  level: 45 },
        gloss: { value: 'dewy',  level: 70 }
      }
    },
    'wedding': {
      label: '로맨틱 웨딩', emoji: '👰',
      prompt: '맑고 우아한 웨딩 메이크업을 완성해 주세요.',
      target: {
        eye:   { value: 'purple', level: 30 },
        lip:   { value: 'rose',   level: 45 },
        blush: { value: 'rose',   level: 40 },
        brow:  { value: 'soft',   level: 45 },
        shade: { value: 'cool',   level: 30 },
        gloss: { value: 'dewy',   level: 85 }
      }
    }
  };

  function clampLevel(n) {
    n = Number(n);
    if (!isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function validChoice(key, value) {
    return !!(OPTIONS[key] && OPTIONS[key].indexOf(value) >= 0);
  }

  function defaultLook() {
    return {
      eye:   { value: 'coral', level: 40 },
      lip:   { value: 'rose',  level: 40 },
      blush: { value: 'peach', level: 35 },
      brow:  { value: 'soft',  level: 40 },
      shade: { value: 'neutral', level: 30 },
      gloss: { value: 'dewy',  level: 50 }
    };
  }

  function normalizeLook(look) {
    var src = look || {}, base = defaultLook(), out = {};
    Object.keys(OPTIONS).forEach(function (key) {
      var part = src[key] || {};
      out[key] = {
        value: validChoice(key, part.value) ? part.value : base[key].value,
        level: clampLevel(part.level === undefined ? base[key].level : part.level)
      };
    });
    return out;
  }

  function scoreBreakdown(themeId, look) {
    var theme = THEMES[themeId] || THEMES['cat-idol'];
    var clean = normalizeLook(look);
    var raw = 0, parts = {};
    Object.keys(WEIGHTS).forEach(function (key) {
      var want = theme.target[key], got = clean[key], w = WEIGHTS[key];
      if (got.value !== want.value) { parts[key] = 0; return; }
      /* 색이 맞으면 진하기 차이만큼 깎는다. 40 이상 벗어나면 그 부위 절반만. */
      var diff = Math.abs(got.level - want.level);
      var keep = Math.max(0.5, 1 - diff / 80);
      parts[key] = Math.round(w * keep);
      raw += parts[key];
    });
    Object.keys(parts).forEach(function (k) { if (!parts[k]) parts[k] = 0; });
    return { score: 35 + Math.round(raw * 0.65), raw: raw, parts: parts };
  }

  function scoreLook(themeId, look) { return scoreBreakdown(themeId, look).score; }

  function verdict(score) {
    if (score >= 95) return '오늘의 메이크업 달인';
    if (score >= 85) return '감각이 빛나는 스타일리스트';
    if (score >= 70) return '매력적인 스타일 완성';
    if (score >= 55) return '한 끗 차이의 도전자';
    return '다시 도전하면 역전 가능';
  }

  function safeName(name) {
    var v = String(name || '나').replace(/[<>\u0000-\u001f]/g, '').trim();
    return (v || '나').slice(0, 12);
  }

  function createChallenge(name, themeId, look) {
    var theme = THEMES[themeId] ? themeId : 'cat-idol';
    var clean = normalizeLook(look);
    return { v: 2, name: safeName(name), theme: theme, look: clean,
             score: scoreLook(theme, clean), created: Date.now() };
  }

  function b64e(t) {
    if (typeof Buffer !== 'undefined') return Buffer.from(t, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(t)));
  }
  function b64d(t) {
    if (typeof Buffer !== 'undefined') return Buffer.from(t, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(t)));
  }

  /* 링크를 짧게 유지하려고 부위를 짧은 배열로 접는다: [색인덱스, 진하기] */
  function packLook(look) {
    var clean = normalizeLook(look), out = {};
    Object.keys(OPTIONS).forEach(function (k) {
      out[k] = [OPTIONS[k].indexOf(clean[k].value), clean[k].level];
    });
    return out;
  }
  function unpackLook(packed) {
    var out = {};
    Object.keys(OPTIONS).forEach(function (k) {
      var p = (packed && packed[k]) || [];
      out[k] = { value: OPTIONS[k][p[0]], level: p[1] };
    });
    return normalizeLook(out);
  }

  function encodeChallenge(payload) {
    var slim = { v: 2, n: safeName(payload.name), t: payload.theme,
                 l: packLook(payload.look), c: payload.created || Date.now() };
    return b64e(JSON.stringify(slim)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeChallenge(token) {
    try {
      if (!token || token.length > 1800 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
      var b = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var o = JSON.parse(b64d(b));
      if (!o || o.v !== 2 || !THEMES[o.t] || typeof o.l !== 'object') return null;
      var look = unpackLook(o.l);
      /* 점수는 링크를 믿지 않고 look 으로 다시 계산한다. */
      return { v: 2, name: safeName(o.n), theme: o.t, look: look,
               score: scoreLook(o.t, look), created: Number(o.c) || 0 };
    } catch (e) { return null; }
  }

  function compare(challengerScore, myScore) {
    if (myScore > challengerScore) return { result: 'win', label: '내 승리!', emoji: '🏆' };
    if (myScore < challengerScore) return { result: 'lose', label: '친구 승리!', emoji: '🔥' };
    return { result: 'draw', label: '완벽한 무승부!', emoji: '🤝' };
  }

  return {
    OPTIONS: OPTIONS, LABELS: LABELS, COLORS: COLORS,
    FACE_ZONES: FACE_ZONES, WEIGHTS: WEIGHTS, THEMES: THEMES,
    defaultLook: defaultLook, normalizeLook: normalizeLook,
    scoreBreakdown: scoreBreakdown, scoreLook: scoreLook, verdict: verdict,
    createChallenge: createChallenge, encodeChallenge: encodeChallenge,
    decodeChallenge: decodeChallenge, compare: compare
  };
});
