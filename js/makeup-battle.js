(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MakeupBattle = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPTIONS = {
    eye: ['pink', 'brown', 'coral', 'pearl'],
    lip: ['berry', 'red', 'coral', 'rose'],
    blush: ['rose', 'peach', 'none'],
    hair: ['black', 'brown', 'pink', 'blonde'],
    accessory: ['cat', 'glasses', 'earrings', 'tiara'],
    outfit: ['idol', 'suit', 'dress', 'wedding'],
    bg: ['stage', 'office', 'cafe', 'garden']
  };

  var THEMES = {
    'cat-idol': {
      label: '고양이상 아이돌', emoji: '🐱',
      prompt: '반짝이는 무대의 고양이상 아이돌을 완성해 주세요.',
      target: { eye: 'pink', lip: 'berry', blush: 'rose', hair: 'black', accessory: 'cat', outfit: 'idol', bg: 'stage' }
    },
    'rich-ceo': {
      label: '부자상 CEO', emoji: '💎',
      prompt: '신뢰감과 카리스마가 느껴지는 부자상 CEO 스타일을 완성해 주세요.',
      target: { eye: 'brown', lip: 'red', blush: 'peach', hair: 'brown', accessory: 'glasses', outfit: 'suit', bg: 'office' }
    },
    'first-date': {
      label: '설레는 첫 데이트', emoji: '💗',
      prompt: '따뜻하고 사랑스러운 첫 데이트 메이크업을 완성해 주세요.',
      target: { eye: 'coral', lip: 'coral', blush: 'peach', hair: 'brown', accessory: 'earrings', outfit: 'dress', bg: 'cafe' }
    },
    'wedding': {
      label: '로맨틱 웨딩', emoji: '👰',
      prompt: '맑고 우아한 로맨틱 웨딩 스타일을 완성해 주세요.',
      target: { eye: 'pearl', lip: 'rose', blush: 'rose', hair: 'black', accessory: 'tiara', outfit: 'wedding', bg: 'garden' }
    }
  };

  var WEIGHTS = { eye: 15, lip: 15, blush: 10, hair: 10, accessory: 15, outfit: 20, bg: 15 };
  var DEFAULT_LOOK = { eye: 'coral', lip: 'rose', blush: 'peach', hair: 'brown', accessory: 'earrings', outfit: 'dress', bg: 'cafe' };

  function validChoice(key, value) {
    return OPTIONS[key] && OPTIONS[key].indexOf(value) >= 0;
  }

  function normalizeLook(look) {
    var src = look || {};
    var out = {};
    Object.keys(OPTIONS).forEach(function (key) {
      out[key] = validChoice(key, src[key]) ? src[key] : DEFAULT_LOOK[key];
    });
    return out;
  }

  function scoreBreakdown(themeId, look) {
    var theme = THEMES[themeId] || THEMES['cat-idol'];
    var clean = normalizeLook(look);
    var raw = 0;
    var parts = {};
    Object.keys(WEIGHTS).forEach(function (key) {
      var hit = clean[key] === theme.target[key];
      parts[key] = hit ? WEIGHTS[key] : 0;
      raw += parts[key];
    });
    return { score: 35 + Math.round(raw * 0.65), raw: raw, parts: parts };
  }

  function scoreLook(themeId, look) {
    return scoreBreakdown(themeId, look).score;
  }

  function verdict(score) {
    if (score >= 95) return '오늘의 메이크업 달인';
    if (score >= 85) return '감각이 빛나는 스타일리스트';
    if (score >= 70) return '매력적인 스타일 완성';
    if (score >= 55) return '한 끗 차이의 도전자';
    return '다시 도전하면 역전 가능';
  }

  function safeName(name) {
    var value = String(name || '나').replace(/[<>\u0000-\u001f]/g, '').trim();
    return (value || '나').slice(0, 12);
  }

  function createChallenge(name, themeId, look) {
    var theme = THEMES[themeId] ? themeId : 'cat-idol';
    var clean = normalizeLook(look);
    return {
      v: 1,
      name: safeName(name),
      theme: theme,
      look: clean,
      score: scoreLook(theme, clean),
      created: Date.now()
    };
  }

  function utf8ToB64(text) {
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(text)));
  }

  function b64ToUtf8(text) {
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(text)));
  }

  function encodeChallenge(payload) {
    return utf8ToB64(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeChallenge(token) {
    try {
      if (!token || token.length > 1800 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
      var b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var obj = JSON.parse(b64ToUtf8(b64));
      if (!obj || obj.v !== 1 || !THEMES[obj.theme] || typeof obj.look !== 'object') return null;
      var clean = normalizeLook(obj.look);
      return {
        v: 1,
        name: safeName(obj.name),
        theme: obj.theme,
        look: clean,
        score: scoreLook(obj.theme, clean),
        created: Number(obj.created) || 0
      };
    } catch (e) {
      return null;
    }
  }

  function compare(challengerScore, myScore) {
    if (myScore > challengerScore) return { result: 'win', label: '내 승리!', emoji: '🏆' };
    if (myScore < challengerScore) return { result: 'lose', label: '친구 승리!', emoji: '🔥' };
    return { result: 'draw', label: '완벽한 무승부!', emoji: '🤝' };
  }

  return {
    OPTIONS: OPTIONS,
    THEMES: THEMES,
    WEIGHTS: WEIGHTS,
    DEFAULT_LOOK: DEFAULT_LOOK,
    normalizeLook: normalizeLook,
    scoreBreakdown: scoreBreakdown,
    scoreLook: scoreLook,
    verdict: verdict,
    createChallenge: createChallenge,
    encodeChallenge: encodeChallenge,
    decodeChallenge: decodeChallenge,
    compare: compare
  };
});
