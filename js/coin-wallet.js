/* coin-wallet.js — 얼굴상 앱 공용 코인 지갑
 * 매일 100코인, 게임 1판 10코인, 분석 +5코인, 친구 선물 30코인.
 * 서버·로그인 없이 같은 출처의 localStorage를 모든 탭/iframe이 함께 쓴다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoinWallet = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* GAME_COST: 한 판 값. 10 이면 하루 지급 100 으로 10판뿐이라 아이가 금방
     소진했다 → 5 로 내려 하루 20판. 바꿀 땐 coin_economy_test.js 도 같이 본다. */
  var DAILY_COINS = 100, GAME_COST = 5, ANALYSIS_REWARD = 5, GIFT_AMOUNT = 30;
  var STORE = null;

  function store() {
    if (STORE) return STORE;
    try { if (typeof localStorage !== 'undefined') { STORE = localStorage; return STORE; } } catch (e) {}
    return null;
  }
  function _setStore(s) { STORE = s; }
  function number(key) {
    var s = store(); if (!s) return 0;
    var n = Number(s.getItem(key) || 0); return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  function emit(balance, reason, amount) {
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aiface:coins', {
        detail: { balance: balance, reason: reason || '', amount: amount || 0 }
      }));
    } catch (e) {}
    return balance;
  }
  function getCoins() { return number('aiface.coins'); }
  function _setCoins(n) {
    var s=store(); if(!s) return 0;
    var next=Math.max(0,Math.floor(Number(n)||0)); s.setItem('aiface.coins',String(next));
    return emit(next,'set',0);
  }
  function addCoins(n, reason) {
    n=Math.max(0,Math.floor(Number(n)||0));
    var next=_setCoins(getCoins()+n); emit(next,reason || 'reward',n); return next;
  }
  function spend(n, reason) {
    n=Math.max(0,Math.floor(Number(n)||0)); var cur=getCoins();
    if (!n || cur<n) return false;
    var next=_setCoins(cur-n); emit(next,reason || 'spend',-n); return next;
  }
  function today() {
    var d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function ensureDaily(day) {
    var s=store(), stamp=String(day || today());
    if (!s) return { granted:0, balance:0 };
    if (s.getItem('aiface.daily.date')===stamp) return { granted:0, balance:getCoins() };
    s.setItem('aiface.daily.date',stamp);
    return { granted:DAILY_COINS, balance:addCoins(DAILY_COINS,'daily') };
  }
  function gameReward(tier, isNewBest) {
    var table={ C:2, B:6, A:12, S:20 };
    return (table[tier] || 2) + (isNewBest ? 5 : 0);
  }
  function rewardAnalysis(kind) { return addCoins(ANALYSIS_REWARD,'analysis:'+String(kind||'test')); }

  function safeName(v) {
    v=String(v||'친구').replace(/[<>\u0000-\u001f]/g,'').trim(); return (v||'친구').slice(0,12);
  }
  function safeId(v) {
    v=String(v||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
    if (v) return v;
    return Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  }
  function b64e(t) {
    if(typeof Buffer!=='undefined') return Buffer.from(t,'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(t)));
  }
  function b64d(t) {
    if(typeof Buffer!=='undefined') return Buffer.from(t,'base64').toString('utf8');
    return decodeURIComponent(escape(atob(t)));
  }
  function encode(o) { return b64e(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
  function decodeRaw(token) {
    try {
      if(!token || token.length>600 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
      var b=token.replace(/-/g,'+').replace(/_/g,'/'); while(b.length%4)b+='=';
      return JSON.parse(b64d(b));
    } catch(e){return null;}
  }
  function createRequest(name,id) {
    return encode({v:1,k:'request',n:safeName(name),id:safeId(id),c:Date.now()});
  }
  function decodeToken(token) {
    var o=decodeRaw(token); if(!o || o.v!==1 || !/^[A-Za-z0-9_-]{3,48}$/.test(String(o.id||''))) return null;
    if(o.k==='request') return {kind:'request',name:safeName(o.n),id:o.id,created:Number(o.c)||0};
    if(o.k==='gift' && Number(o.a)===GIFT_AMOUNT) return {kind:'gift',name:safeName(o.n),id:o.id,requestId:safeId(o.r),amount:GIFT_AMOUNT,created:Number(o.c)||0};
    return null;
  }
  function createGift(request,giftId) {
    if(!request || request.kind!=='request') return null;
    if(spend(GIFT_AMOUNT,'gift-send')===false) return null;
    return encode({v:1,k:'gift',n:request.name,id:safeId(giftId),r:request.id,a:GIFT_AMOUNT,c:Date.now()});
  }
  function claimGift(token) {
    var g=typeof token==='string'?decodeToken(token):token, s=store();
    if(!g || g.kind!=='gift' || !s) return {ok:false,reason:'invalid',balance:getCoins()};
    var key='aiface.gift.claimed.'+g.id;
    if(s.getItem(key)) return {ok:false,reason:'claimed',balance:getCoins()};
    s.setItem(key,'1');
    return {ok:true,amount:GIFT_AMOUNT,balance:addCoins(GIFT_AMOUNT,'gift-receive')};
  }

  return {
    DAILY_COINS:DAILY_COINS,GAME_COST:GAME_COST,ANALYSIS_REWARD:ANALYSIS_REWARD,GIFT_AMOUNT:GIFT_AMOUNT,
    getCoins:getCoins,addCoins:addCoins,spend:spend,ensureDaily:ensureDaily,
    gameReward:gameReward,rewardAnalysis:rewardAnalysis,
    createRequest:createRequest,createGift:createGift,decodeToken:decodeToken,claimGift:claimGift,
    _setStore:_setStore,_setCoins:_setCoins
  };
});
