/* ------------------------------------------------------------------
 * arcade-core.js — 미니게임 공용 엔진
 *
 * 게임마다 따로 만들면 점수·기록·도전장·공유가 제각각이 된다. 규칙만 여기
 * 한 곳에 모으고, 각 게임은 "점수 하나"만 넘긴다.
 *
 * 설계 원칙
 *  - 서버 없음: 최고기록은 기기에 저장하고, 대결은 링크에 점수를 실어 보낸다.
 *  - 점수는 믿지 않는다: 링크로 들어온 점수도 게임별 상한으로 다시 검증한다.
 *  - 최소 보상: 못해도 코인을 준다. 초등학생이 첫 판에 0을 받고 나가면 끝이다.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var wallet = typeof module === 'object' && module.exports ? require('./coin-wallet.js') : root.CoinWallet;
  var api = factory(wallet);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arcade = api;
})(typeof self !== 'undefined' ? self : this, function (Wallet) {
  'use strict';

  /* better:'high' 점수가 높을수록 좋음 / 'low' 낮을수록 좋음(반응속도)
     max: 규칙상 도달 가능한 상한 — 조작된 도전장을 걸러내는 기준 */
  var GAMES = [
    { id: 'mole',   name: '두꺼비 잡기',   emoji: '🐸', unit: '마리', better: 'high', max: 120,
      desc: '30초 동안 튀어나온 두꺼비를 잡아라!',
      tiers: [[35,'S'],[25,'A'],[15,'B'],[0,'C']] },
    { id: 'reflex', name: '순발력 테스트', emoji: '⚡', unit: 'ms',   better: 'low',  max: 5000,
      desc: '초록으로 바뀌는 순간 누르기. 5회 평균.',
      tiers: [[200,'S'],[260,'A'],[350,'B'],[99999,'C']] },
    { id: 'arrow',  name: '화살 판자 뚫기', emoji: '🏹', unit: '장',   better: 'high', max: 12,
      desc: '누르고 있다가 떼면 힘이 실린다. 판자를 몇 장 뚫을까?',
      tiers: [[9,'S'],[7,'A'],[4,'B'],[0,'C']] },
    { id: 'plane',  name: '비행기 격추',   emoji: '✈️', unit: '대',   better: 'high', max: 150,
      desc: '지나가는 비행기를 조준해서 맞춰라.',
      tiers: [[30,'S'],[20,'A'],[10,'B'],[0,'C']] },
    { id: 'crow',   name: '까마귀 사냥',   emoji: '🐦', unit: '마리', better: 'high', max: 150,
      desc: '날아가는 까마귀를 화살로 맞춘다. 빗나가면 화살이 준다.',
      tiers: [[25,'S'],[16,'A'],[8,'B'],[0,'C']] }
  ];

  var BY_ID = {};
  GAMES.forEach(function (g) { BY_ID[g.id] = g; });

  var TIER_TEXT = {
    S: '전설의 손가락', A: '동네 최강', B: '평균 이상', C: '연습이 필요해'
  };

  function game(id) { return BY_ID[id] || null; }

  function rank(id, score) {
    var g = game(id);
    if (!g) return { tier: 'C', text: TIER_TEXT.C };
    var tier = 'C';
    for (var i = 0; i < g.tiers.length; i++) {
      var cut = g.tiers[i][0], t = g.tiers[i][1];
      if (g.better === 'high' ? score >= cut : score <= cut) { tier = t; break; }
    }
    return { tier: tier, text: TIER_TEXT[tier] };
  }

  function validScore(id, score) {
    var g = game(id);
    if (!g) return false;
    if (typeof score !== 'number' || !isFinite(score) || score < 0) return false;
    return score <= g.max;
  }

  /* ---------- 최고기록 (기기 저장) ---------- */
  var STORE = null;
  function store() {
    if (STORE) return STORE;
    try { if (typeof localStorage !== 'undefined') { STORE = localStorage; return STORE; } } catch (e) { }
    return null;
  }
  function _setStore(s) { STORE = s; if (Wallet && Wallet._setStore) Wallet._setStore(s); }

  function key(id) { return 'aiface.best.' + id; }

  function getBest(id) {
    var s = store();
    if (!s) return null;
    var v = s.getItem(key(id));
    if (v === null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function saveBest(id, score) {
    if (!validScore(id, score)) return false;
    var s = store();
    if (!s) return false;
    var g = game(id), cur = getBest(id);
    var better = cur === null || (g.better === 'high' ? score > cur : score < cur);
    if (!better) return false;
    s.setItem(key(id), String(score));
    return true;
  }

  /* ---------- 코인 ---------- */
  function coins(id, score, isNewBest) {
    return Wallet ? Wallet.gameReward(rank(id, score).tier, isNewBest) : 2;
  }

  function addCoins(n) {
    if (Wallet) return Wallet.addCoins(n, 'game-reward');
    var s = store();
    if (!s) return 0;
    var cur = Number(s.getItem('aiface.coins') || 0);
    if (!isFinite(cur)) cur = 0;
    var next = cur + Math.max(0, n | 0);
    s.setItem('aiface.coins', String(next));
    return next;
  }
  function getCoins() {
    if (Wallet) return Wallet.getCoins();
    var s = store();
    if (!s) return 0;
    var n = Number(s.getItem('aiface.coins') || 0);
    return isFinite(n) ? n : 0;
  }

  function ensureDaily(day) { return Wallet ? Wallet.ensureDaily(day) : { granted:0, balance:getCoins() }; }
  function spendGame() { return Wallet ? Wallet.spend(Wallet.GAME_COST, 'game-start') : false; }
  function createCoinRequest(name,id) { return Wallet ? Wallet.createRequest(name,id) : null; }
  function decodeCoinToken(token) { return Wallet ? Wallet.decodeToken(token) : null; }
  function createCoinGift(request,id) { return Wallet ? Wallet.createGift(request,id) : null; }
  function claimCoinGift(token) { return Wallet ? Wallet.claimGift(token) : {ok:false,reason:'invalid',balance:getCoins()}; }

  /* ---------- 도전장 ---------- */
  function safeName(name) {
    var v = String(name || '나').replace(/[<>\u0000-\u001f]/g, '').trim();
    return (v || '나').slice(0, 12);
  }

  function challenge(name, id, score) {
    return { v: 1, name: safeName(name), game: game(id) ? id : 'mole',
             score: validScore(id, score) ? score : 0, created: Date.now() };
  }

  function b64e(t) {
    if (typeof Buffer !== 'undefined') return Buffer.from(t, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(t)));
  }
  function b64d(t) {
    if (typeof Buffer !== 'undefined') return Buffer.from(t, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(t)));
  }

  function encode(payload) {
    return b64e(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decode(token) {
    try {
      if (!token || token.length > 900 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
      var b = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var o = JSON.parse(b64d(b));
      if (!o || o.v !== 1 || !game(o.game)) return null;
      if (!validScore(o.game, o.score)) return null;
      return { v: 1, name: safeName(o.name), game: o.game, score: o.score, created: Number(o.created) || 0 };
    } catch (e) { return null; }
  }

  function judge(id, mine, theirs) {
    var g = game(id);
    if (!g || mine === theirs) return { result: 'draw', label: '무승부!', emoji: '🤝' };
    var iWin = g.better === 'high' ? mine > theirs : mine < theirs;
    return iWin ? { result: 'win', label: '내 승리!', emoji: '🏆' }
                : { result: 'lose', label: '친구 승리!', emoji: '🔥' };
  }

  function scoreText(id, score) {
    var g = game(id);
    if (!g) return String(score);
    return score + g.unit;
  }

  return {
    GAMES: GAMES, TIER_TEXT: TIER_TEXT,
    game: game, rank: rank, validScore: validScore, scoreText: scoreText,
    getBest: getBest, saveBest: saveBest,
    coins: coins, addCoins: addCoins, getCoins: getCoins,
    GAME_COST: Wallet ? Wallet.GAME_COST : 10, DAILY_COINS: Wallet ? Wallet.DAILY_COINS : 100,
    GIFT_AMOUNT: Wallet ? Wallet.GIFT_AMOUNT : 30,
    ensureDaily: ensureDaily, spendGame: spendGame,
    createCoinRequest:createCoinRequest, decodeCoinToken:decodeCoinToken,
    createCoinGift:createCoinGift, claimCoinGift:claimCoinGift,
    challenge: challenge, encode: encode, decode: decode, judge: judge,
    _setStore: _setStore
  };
});
