/* ------------------------------------------------------------------
 * makeup-battle.js — 얼굴상 메이크업 배틀
 *
 * 실사진 업로드 대신 저작권·개인정보 문제가 없는 자체 벡터 베이스 모델을 쓴다.
 * 색상과 0~100 진하기 게이지는 유지해 점수가 촘촘하게 갈린다.
 *
 * 각 부위 상태: { value: '색 이름', level: 0~100 }
 *  - value 가 틀리면 그 부위는 0점 (진하기는 보지 않는다)
 *  - value 가 맞으면 목표 진하기와의 차이만큼 감점
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var bf = typeof module === 'object' && module.exports ? require('./base-face.js') : root.BaseFace;
  var api = factory(bf);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MakeupBattle = api;
})(typeof self !== 'undefined' ? self : this, function (BF) {
  'use strict';

  /* ---------- 꾸미기(얼굴형·머리·옷) ----------
     화장과 달리 점수에는 들어가지 않는다. 아이가 원하는 모습을 만드는 부분이다. */
  var STYLE_DEFAULT = { face: 'round', hairStyle: 'bob', hairColor: 'brown', outfit: 'tee' };

  function styleOptions() {
    return BF ? { face: BF.FACE_SHAPES, hairStyle: BF.HAIR_STYLES,
                  hairColor: BF.HAIR_COLORS, outfit: BF.OUTFITS } : null;
  }
  function validStyle(kind, id) {
    var o = styleOptions();
    if (!o || !o[kind]) return false;
    for (var i = 0; i < o[kind].length; i++) if (o[kind][i].id === id) return true;
    return false;
  }
  function defaultStyle() {
    return { face: STYLE_DEFAULT.face, hairStyle: STYLE_DEFAULT.hairStyle,
             hairColor: STYLE_DEFAULT.hairColor, outfit: STYLE_DEFAULT.outfit };
  }
  function normalizeStyle(style) {
    var src = style || {}, out = defaultStyle();
    Object.keys(out).forEach(function (k) {
      if (validStyle(k, src[k])) out[k] = src[k];
    });
    return out;
  }

  /* 베이스 모델 + 사용자가 고른 스타일 => 렌더러가 쓰는 최종 모델 */
  function resolveModel(baseId, style, mode) {
    var base = BASE_MODELS[baseId] || BASE_MODELS.soft;
    var s = normalizeStyle(style);
    var hairColor = BF && BF.option('hairColor', s.hairColor);
    var outfit = BF && BF.option('outfit', s.outfit);
    var m = {};
    Object.keys(base).forEach(function (k) { m[k] = base[k]; });
    m.face = s.face;
    m.hairStyle = s.hairStyle;
    m.hair = hairColor ? hairColor.hex : base.hair;
    m.hairColorId = s.hairColor;
    m.outfitId = s.outfit;
    m.outfitKind = outfit ? outfit.kind : 'tee';
    m.outfitMain = outfit ? outfit.main : base.outfit;
    m.outfitTrim = outfit ? outfit.trim : '#ffffff';
    m.outfit = m.outfitMain;
    m.mode = mode === 'full' ? 'full' : 'portrait';
    return m;
  }

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

  /* 외부 사진·에셋을 가져오지 않는 자체 제작 베이스 모델.
     실제 인형 얼굴처럼 보이도록 피부·머리·눈동자·기본 입술·의상 색을 함께 정의한다.
     실제 드로잉은 js/base-face.js 가 담당한다. */
  var BASE_MODELS = {
    soft: {
      label: '순한 강아지상', emoji: '🐶', face: 'round', eye: 'puppy', hairStyle: 'bob',
      skin: '#f6cdb2', skinShadow: '#d59a7c', hair: '#4a2b20', iris: '#6b4430',
      lip: '#d98a90', outfit: '#f2a7c3', bg: '#ffe8f1'
    },
    chic: {
      label: '시크 고양이상', emoji: '🐱', face: 'oval', eye: 'cat', hairStyle: 'long',
      skin: '#f2c3a4', skinShadow: '#cf8f71', hair: '#241b19', iris: '#4a3527',
      lip: '#c9707c', outfit: '#8f7ad6', bg: '#eadfff'
    },
    clear: {
      label: '청량 사슴상', emoji: '🦌', face: 'heart', eye: 'doe', hairStyle: 'wave',
      skin: '#fad6bd', skinShadow: '#e0a88a', hair: '#8b5a3c', iris: '#7d5a3a',
      lip: '#e08f8c', outfit: '#79c7a8', bg: '#e4f8ee'
    },
    cool: {
      label: '세련 중성상', emoji: '✨', face: 'long', eye: 'cool', hairStyle: 'short',
      skin: '#ce9470', skinShadow: '#a26a4e', hair: '#25282d', iris: '#3a2d25',
      lip: '#b4676b', outfit: '#5f7f9e', bg: '#dfecf7'
    }
  };

  /* 사진 위에서 각 부위를 그릴 위치 — 얼굴 박스(0~1 비율) 기준.
     MediaPipe 없이도 동작해야 하므로 일반적인 정면 얼굴 비율을 쓴다.
     [cx, cy, rx, ry] = 중심 x/y, 반지름 x/y (모두 0~1 비율) */
  /* base-face.js 가 그리는 이목구비 위치에 맞춘 화장 영역.
     좌표가 어긋나면 아이섀도가 눈이 아닌 이마에 칠해지므로 같이 움직여야 한다. */
  /* ⚠ 이 좌표는 base-face.js 의 EYE_Y/BROW_Y/NOSE_Y/MOUTH_Y 와 eyeGap 에
     직접 묶여 있다. 렌더러에서 이목구비를 옮기면 **여기도 같이 옮겨야** 한다.
     ⚠⚠ 상수에서 계산하지 말고 **렌더된 캔버스를 픽셀로 실측**해서 맞춘다.
     입술은 MOUTH_Y(482)가 아니라 실측 중심 490 이었고, 계산값을 쓰면
     립스틱이 입술 아래 턱에 칠해진다(실제로 100% 로 올려도 색이 안 변했다).
     2026-09-15 실측: 입술 460~520(중심490), 눈 284~310(중심297), 눈썹 247~253. */
  var FACE_ZONES = {
    /* 아이섀도는 눈동자 중심이 아니라 **눈꺼풀**에 얹혀야 보인다.
       ⚠ 존이 둥글면(rx 0.061 x ry 0.022) 눈 위에 보라색 공이 뜬 것처럼 보인다.
       실제 아이섀도는 눈두덩을 따라 가로로 넓고 세로로 얇게 발린다.
       눈 위 경계(cy-21=279)와 눈 중심(297) 사이인 286 에 둔다. */
    eye:   [[0.379, 0.409, 0.075, 0.013], [0.621, 0.409, 0.075, 0.013]],
    brow:  [[0.379, 0.357, 0.068, 0.014], [0.621, 0.357, 0.068, 0.014]],
    blush: [[0.330, 0.560, 0.100, 0.050], [0.670, 0.560, 0.100, 0.050]],
    lip:   [[0.500, 0.700, 0.089, 0.040]],
    shade: [[0.500, 0.520, 0.300, 0.340]],
    /* 마무리(하이라이트)는 이마 한 곳에 덩어리로 찍으면 흰 반점처럼 보인다.
       이마·콧등·광대에 작게 나눠 얹어야 '광'처럼 읽힌다.
       ⚠ 콧등 존을 세로로 길게(rx 0.016 x ry 0.05) 주면 콧등에 흰 줄이 그어진다.
       가로로 눕혀 코끝 쪽에만 짧게 얹는다. */
    gloss: [[0.500, 0.268, 0.115, 0.030],
            [0.500, 0.565, 0.030, 0.016],
            [0.352, 0.520, 0.058, 0.024], [0.648, 0.520, 0.058, 0.024]]
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

  function createChallenge(name, themeId, look, baseId, style) {
    var theme = THEMES[themeId] ? themeId : 'cat-idol';
    var clean = normalizeLook(look);
    var base = BASE_MODELS[baseId] ? baseId : 'soft';
    return { v: 2, name: safeName(name), theme: theme, base: base,
             style: normalizeStyle(style), look: clean,
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
                 b: BASE_MODELS[payload.base] ? payload.base : 'soft',
                 s: normalizeStyle(payload.style),
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
      return { v: 2, name: safeName(o.n), theme: o.t,
               base: BASE_MODELS[o.b] ? o.b : 'soft',
               style: normalizeStyle(o.s), look: look,
               score: scoreLook(o.t, look), created: Number(o.c) || 0 };
    } catch (e) { return null; }
  }

  function compare(challengerScore, myScore) {
    if (myScore > challengerScore) return { result: 'win', label: '내 승리!', emoji: '🏆' };
    if (myScore < challengerScore) return { result: 'lose', label: '친구 승리!', emoji: '🔥' };
    return { result: 'draw', label: '완벽한 무승부!', emoji: '🤝' };
  }

  return {
    OPTIONS: OPTIONS, LABELS: LABELS, COLORS: COLORS, BASE_MODELS: BASE_MODELS,
    FACE_ZONES: FACE_ZONES, WEIGHTS: WEIGHTS, THEMES: THEMES,
    defaultLook: defaultLook, normalizeLook: normalizeLook,
    defaultStyle: defaultStyle, normalizeStyle: normalizeStyle,
    styleOptions: styleOptions, resolveModel: resolveModel,
    scoreBreakdown: scoreBreakdown, scoreLook: scoreLook, verdict: verdict,
    createChallenge: createChallenge, encodeChallenge: encodeChallenge,
    decodeChallenge: decodeChallenge, compare: compare
  };
});
