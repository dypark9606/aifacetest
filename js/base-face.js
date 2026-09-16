/* ------------------------------------------------------------------
 * base-face.js — 메이크업 배틀용 고품질 베이스 모델 렌더러
 *
 * 이전 버전은 원·베지어 몇 개를 겹쳐 그려서 "인형 얼굴"이라기엔 조악했다.
 * 여기서는 실제 인형 사진에 가깝게 보이도록 레이어를 나눠 그린다:
 *   목·쇄골 → 뒷머리 → 귀 → 얼굴 → 음영(광대·턱·이마) → 코 → 눈 →
 *   속눈썹 → 눈썹 → 입술 → 앞머리 → 하이라이트
 *
 * 설계 규칙
 *  - 외부 이미지·폰트를 쓰지 않는다(저작권·오프라인 문제).
 *  - 모든 좌표는 560x700 기준으로 잡고 draw()에서 스케일한다.
 *  - 메이크업은 이 위에 덧칠되므로 피부는 너무 진하게 칠하지 않는다.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BaseFace = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BW = 560, BH = 700;          /* 기준 캔버스 */

  /* 얼굴형별 윤곽 — 인형 비율(작은 턱, 넓은 이마, 부드러운 광대) */
  var OUTLINES = {
    round: [[280,128],[168,133,131,243,140,330],[149,420,171,486,213,534],
            [246,575,314,575,347,534],[389,486,411,420,420,330],
            [429,243,392,133,280,128]],
    oval:  [[280,124],[171,129,136,240,144,332],[152,424,170,494,210,545],
            [244,588,316,588,350,545],[390,494,408,424,416,332],
            [424,240,389,129,280,124]],
    heart: [[280,126],[159,130,124,236,138,330],[150,410,176,472,214,520],
            [243,556,317,556,346,520],[384,472,410,410,422,330],
            [436,236,401,130,280,126]],
    long:  [[280,120],[176,126,143,238,148,338],[154,436,170,512,209,562],
            [243,602,317,602,351,562],[390,512,406,436,412,338],
            [417,238,384,126,280,120]]
  };

  /* 얼굴형별 특징 — 눈 간격, 입 크기, 광대 위치
     ⚠ 실제 얼굴은 **두 눈 사이 간격 == 눈 하나 폭** 이다.
     눈폭 68 이므로 eyeGap ≈ 68 이어야 한다. 예전 값(88~94)은
     눈 사이가 눈폭의 1.7배로 벌어져 얼굴이 기괴해 보였다.
     mouthW 는 눈동자 사이보다 좁아야 한다(사람 얼굴 규칙). */
  var SHAPE = {
    round: { eyeGap: 69, chin: 575, cheek: 432, mouthW: 52 },
    oval:  { eyeGap: 68, chin: 588, cheek: 438, mouthW: 50 },
    heart: { eyeGap: 70, chin: 556, cheek: 424, mouthW: 54 },
    long:  { eyeGap: 67, chin: 602, cheek: 448, mouthW: 48 }
  };

  /* 세로 배치 — 고전 삼정(이마:중안:하안 = 1:1:1) 기준.
     얼굴 상단 60, 턱 약 575~600 이므로 얼굴 높이 ≈ 515.
     ⚠ 예전 값(BROW 282, EYE 330)은 이상 위치보다 50px 아래라
     이마가 과도하게 넓고 이목구비가 몰려 보였다. */
  var EYE_Y = 300, BROW_Y = 252, NOSE_Y = 412, MOUTH_Y = 482;
  var MOUTH_W = 1.0;        /* SHAPE.mouthW 에 곱하는 배율 */

  /* ------------------------------------------------------------------
   * 꾸미기 선택지 — 머리 스타일 / 머리 색 / 옷 / 얼굴형
   * 화면(Sec13_makeup.html)은 이 목록만 보고 버튼을 만든다.
   * ------------------------------------------------------------------ */
  var FACE_SHAPES = [
    { id: 'round', label: '동그란형' },
    { id: 'oval',  label: '갸름한형' },
    { id: 'heart', label: '하트형' },
    { id: 'long',  label: '긴형' }
  ];

  /* 머리 스타일 — 딸 요청으로 8종 → 18종.
     length: 길이대. outX/botY 를 잡아 뒷머리 실루엣이 결정된다.
     ⚠ length 만 같으면 앞머리만 달라 실루엣이 똑같아 보인다(실측으로 4쌍 중복 발견).
     그래서 vol(볼륨: 옆폭 보정)과 wavy 로 같은 길이대 안에서도 형태를 갈라 놓는다.
     tied: 묶은 머리는 뒷머리 실루엣 자체가 달라진다. */
  var HAIR_STYLES = [
    /* 짧은 머리 */
    { id: 'pixie',     label: '픽시컷',     length: 'shortest', vol: -10 },
    { id: 'short',     label: '숏컷',       length: 'shortest', vol: 0 },
    { id: 'shorthime', label: '시스루뱅',   length: 'short', bang: 'seethru', vol: -6 },
    { id: 'bob',       label: '단발',       length: 'short', vol: 0 },
    { id: 'bobcurl',   label: '웨이브단발', length: 'short', wavy: 1, vol: 8 },
    { id: 'hime',      label: '히메컷',     length: 'mid',   bang: 'hime', vol: -8 },
    /* 중간 길이 */
    { id: 'medium',    label: '중단발',     length: 'mid',   vol: 0 },
    { id: 'layered',   label: '레이어드',   length: 'mid',   wavy: 0.6, vol: 6 },
    { id: 'wave',      label: '웨이브',     length: 'mid',   wavy: 1, vol: 12 },
    /* 긴 머리 */
    { id: 'long',      label: '긴생머리',   length: 'long',  vol: 0 },
    { id: 'longwave',  label: '긴웨이브',   length: 'long',  wavy: 1, vol: 10 },
    { id: 'curly',     label: '곱슬',       length: 'long',  wavy: 1.4, vol: 16 },
    /* 묶은 머리 */
    { id: 'ponytail',  label: '포니테일',   length: 'long',  tied: 'pony' },
    { id: 'highpony',  label: '높은포니',   length: 'long',  tied: 'highpony' },
    { id: 'twintail',  label: '양갈래',     length: 'long',  tied: 'twin' },
    { id: 'braid',     label: '땋은머리',   length: 'long',  tied: 'braid' },
    { id: 'twinbraid', label: '양갈래땋기', length: 'long',  tied: 'twinbraid' },
    { id: 'bun',       label: '올림머리',   length: 'short', tied: 'bun' }
  ];

  var HAIR_COLORS = [
    { id: 'black',  label: '흑발',   hex: '#241b19' },
    { id: 'brown',  label: '갈색',   hex: '#6b4229' },
    { id: 'blonde', label: '금발',   hex: '#d6a75a' },
    { id: 'red',    label: '빨강',   hex: '#a8382c' },
    { id: 'pink',   label: '분홍',   hex: '#e089ac' },
    { id: 'blue',   label: '파랑',   hex: '#4a6fa8' },
    { id: 'purple', label: '보라',   hex: '#7a5798' },
    { id: 'silver', label: '은발',   hex: '#b9bcc4' }
  ];

  /* 옷: main = 기본 천, trim = 장식·소매, kind = 실루엣 */
  /* 옷 — 딸 요청으로 8종 → 20종, 카테고리별로 묶는다.
     kind: 실제 그리기 방식(몇 가지를 공유). cat: UI 에서 묶는 이름. */
  var OUTFITS = [
    /* 캐주얼 */
    { id: 'tee',      label: '티셔츠',     cat: '캐주얼', kind: 'tee',    main: '#f2a7c3', trim: '#ffffff' },
    { id: 'stripetee',label: '줄무늬티',   cat: '캐주얼', kind: 'stripe', main: '#4a6fa5', trim: '#ffffff' },
    { id: 'hoodie',   label: '후드티',     cat: '캐주얼', kind: 'hoodie', main: '#5f7f9e', trim: '#dfe9f3' },
    { id: 'denim',    label: '청자켓',     cat: '캐주얼', kind: 'jacket', main: '#4f6d97', trim: '#9fb8d6' },
    { id: 'cardigan', label: '가디건',     cat: '캐주얼', kind: 'jacket', main: '#e0b088', trim: '#fff3e2' },
    { id: 'overall',  label: '멜빵바지',   cat: '캐주얼', kind: 'overall',main: '#6b8fc2', trim: '#ffd9e6' },
    /* 정장 */
    { id: 'suit',     label: '정장',       cat: '정장',   kind: 'suit',   main: '#2d3247', trim: '#ffffff' },
    { id: 'blazer',   label: '블레이저',   cat: '정장',   kind: 'suit',   main: '#5b4a6b', trim: '#f2ecf7' },
    { id: 'shirt',    label: '셔츠',       cat: '정장',   kind: 'shirt',  main: '#f4f6fa', trim: '#c9d3e2' },
    { id: 'vest',     label: '조끼정장',   cat: '정장',   kind: 'vest',   main: '#3d4b3a', trim: '#e8e2d2' },
    { id: 'trench',   label: '트렌치코트', cat: '정장',   kind: 'coat',   main: '#c0a17c', trim: '#ece0cd' },
    { id: 'coat',     label: '코트',       cat: '정장',   kind: 'coat',   main: '#b3805a', trim: '#e8d7c4' },
    /* 드레스 */
    { id: 'dress',    label: '원피스',     cat: '드레스', kind: 'dress',  main: '#8f7ad6', trim: '#f6e7ff' },
    { id: 'gown',     label: '드레스',     cat: '드레스', kind: 'dress',  main: '#d96a94', trim: '#ffe3ef' },
    { id: 'wedding',  label: '웨딩드레스', cat: '드레스', kind: 'dress',  main: '#f7f4f0', trim: '#e6dccf' },
    /* 특별의상 */
    { id: 'hanbok',   label: '한복',       cat: '특별',   kind: 'hanbok', main: '#d94f5c', trim: '#f3e3b8' },
    { id: 'uniform',  label: '교복',       cat: '특별',   kind: 'uniform',main: '#33405e', trim: '#f0f2f7' },
    { id: 'idol',     label: '무대의상',   cat: '특별',   kind: 'idol',   main: '#1f1b33', trim: '#ffd166' },
    { id: 'sporty',   label: '운동복',     cat: '스포츠', kind: 'sporty', main: '#2f9e6e', trim: '#ffffff' },
    { id: 'tracksuit',label: '트레이닝',   cat: '스포츠', kind: 'sporty', main: '#26304a', trim: '#ff6b6b' }
  ];

  var MODES = ['portrait', 'full'];

  var BY = {};
  [['face', FACE_SHAPES], ['hairStyle', HAIR_STYLES], ['hairColor', HAIR_COLORS], ['outfit', OUTFITS]]
    .forEach(function (p) { BY[p[0]] = {}; p[1].forEach(function (x) { BY[p[0]][x.id] = x; }); });

  function option(kind, id) { return (BY[kind] || {})[id] || null; }

  /* 전신 모드에서 머리가 차지하는 영역.
     화장은 얼굴 좌표계로 그려지므로, 전신일 때 어디에 축소해 넣을지 알아야 한다. */
  /* 머리를 조금 키우고 아래로 내려 목 길이를 줄인다(실측 74px → 약 40px). */
  var FULL_HEAD = { x: 0.214, y: 0.012, w: 0.572, h: 0.424 };

  function headRect(m, W, H) {
    W = W || BW; H = H || BH;
    if (!m || m.mode !== 'full') return { x: 0, y: 0, w: W, h: H };
    return { x: FULL_HEAD.x * W, y: FULL_HEAD.y * H,
             w: FULL_HEAD.w * W, h: FULL_HEAD.h * H };
  }

  function shape(m) { return SHAPE[m.face] || SHAPE.round; }

  function facePath(ctx, m) {
    var pts = OUTLINES[m.face] || OUTLINES.round;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i];
      ctx.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    ctx.closePath();
  }

  function mix(hex, target, t) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var m = parseInt(target.slice(1), 16), r2 = m >> 16, g2 = (m >> 8) & 255, b2 = m & 255;
    return 'rgb(' + Math.round(r + (r2 - r) * t) + ',' +
                    Math.round(g + (g2 - g) * t) + ',' +
                    Math.round(b + (b2 - b) * t) + ')';
  }
  function soft(ctx, cx, cy, rx, ry, color, alpha) {
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, color); g.addColorStop(0.55, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  /* ---------- 배경 ---------- */
  function drawBackdrop(ctx, m) {
    var g = ctx.createRadialGradient(280, 250, 40, 280, 400, 520);
    g.addColorStop(0, mix(m.bg, '#ffffff', 0.45));
    g.addColorStop(1, m.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, BW, BH);
    soft(ctx, 280, 660, 250, 120, 'rgba(255,255,255,.55)', 0.5);
  }

  /* ---------- 목·어깨 ---------- */
  function drawBody(ctx, m) {
    var s = shape(m), neckTop = s.chin - 62;
    /* 어깨 */
    var sg = ctx.createLinearGradient(0, 620, 0, BH);
    sg.addColorStop(0, mix(m.outfit, '#ffffff', 0.22)); sg.addColorStop(1, m.outfit);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(40, BH); ctx.quadraticCurveTo(80, 650, 205, 625);
    ctx.quadraticCurveTo(280, 612, 355, 625);
    ctx.quadraticCurveTo(480, 650, 520, BH);
    ctx.closePath(); ctx.fill();
    /* 목 — ⚠ 직선 두 개로 그리면 상자처럼 보인다. 턱 쪽은 넓고 어깨로 가며
       살짝 좁아졌다 다시 퍼지는 곡선이어야 사람 목으로 읽힌다. */
    ctx.fillStyle = mix(m.skin, m.skinShadow, 0.42);
    ctx.beginPath();
    ctx.moveTo(238, neckTop);
    ctx.bezierCurveTo(232, neckTop + 46, 228, 600, 214, 642);
    ctx.quadraticCurveTo(280, 664, 346, 642);
    ctx.bezierCurveTo(332, 600, 328, neckTop + 46, 322, neckTop);
    ctx.closePath(); ctx.fill();
    /* 목 옆면 음영으로 원통감 */
    soft(ctx, 232, 600, 34, 78, m.skinShadow, 0.34);
    soft(ctx, 330, 600, 30, 78, m.skinShadow, 0.24);
    /* 턱이 목에 드리우는 그림자 */
    soft(ctx, 280, neckTop + 26, 62, 30, mix(m.skinShadow, '#6b3f2f', 0.35), 0.5);
    /* 쇄골 */
    ctx.strokeStyle = 'rgba(150,95,72,.30)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(232, 648); ctx.quadraticCurveTo(268, 662, 286, 650);
    ctx.moveTo(328, 648); ctx.quadraticCurveTo(292, 662, 286, 650);
    ctx.stroke();
  }

  /* 앞뒤 머리가 같은 광원을 쓰도록 그라데이션을 공유한다.
     ⚠ 앞머리와 뒷머리에 서로 다른 그라데이션을 주면 두 모양이 겹치는
     정수리 부근에 가로 경계선이 생겨 가발을 덮어쓴 것처럼 보인다. */
  function hairGradient(ctx) {
    return function (m) {
      var g = ctx.createLinearGradient(110, 60, 450, 520);
      g.addColorStop(0, mix(m.hair, '#ffffff', 0.26));
      g.addColorStop(0.5, m.hair);
      g.addColorStop(1, mix(m.hair, '#000000', 0.3));
      return g;
    };
  }

  /* ---------- 뒷머리 ----------
     ⚠ 묶은 머리(포니테일·양갈래·올림머리)는 **뒷머리 실루엣 자체가 달라야** 한다.
     앞머리만 바꾸고 뒤를 그대로 두면 어떤 스타일을 골라도 똑같아 보인다. */
  /* ---------- 뒷머리 ----------
     ⚠ 예전엔 스타일 id 를 하나씩 if 로 분기했다. 스타일을 8종에서 18종으로
     늘리자 새 스타일 10종이 전부 "기본" 실루엣으로 떨어져 똑같아 보였다.
     그래서 **속성(length / tied / wavy)** 으로 그리도록 바꿨다.
     새 스타일을 추가할 때 HAIR_STYLES 에 속성만 주면 자동으로 그려진다. */
  function hairStyleDef(m) {
    for (var i = 0; i < HAIR_STYLES.length; i++) {
      if (HAIR_STYLES[i].id === m.hairStyle) return HAIR_STYLES[i];
    }
    return HAIR_STYLES[0];
  }

  /* 길이대별 뒷머리 외곽선 (바깥폭, 아래끝, 안쪽 어깨선) */
  var HAIR_LEN = {
    shortest: { outX: 118, botY: 420, inY: 420 },
    short:    { outX: 106, botY: 508, inY: 470 },
    mid:      { outX:  98, botY: 580, inY: 500 },
    long:     { outX:  92, botY: 648, inY: 552 }
  };

  function drawHairBack(ctx, m) {
    var def = hairStyleDef(m);
    var L = HAIR_LEN[def.length] || HAIR_LEN.long;
    var fill = hairGradient(ctx)(m);
    ctx.fillStyle = fill;

    /* --- 1. 묶은 머리 덩어리는 머리통 뒤에 먼저 깔린다 --- */
    if (def.tied === 'pony' || def.tied === 'highpony') {
      var ty = def.tied === 'highpony' ? 196 : 250;      /* 묶는 높이 */
      ctx.beginPath();
      ctx.moveTo(408, ty);
      ctx.bezierCurveTo(486, ty + 18, 508, ty + 130, 486, ty + 236);
      ctx.bezierCurveTo(474, ty + 302, 452, ty + 340, 430, ty + 362);
      ctx.quadraticCurveTo(414, ty + 316, 420, ty + 262);
      ctx.bezierCurveTo(428, ty + 180, 430, ty + 80, 396, ty + 38);
      ctx.closePath(); ctx.fill();
    } else if (def.tied === 'twin' || def.tied === 'twinbraid') {
      [[126, -1], [434, 1]].forEach(function (p) {
        var x = p[0], d = p[1];
        ctx.beginPath();
        ctx.moveTo(x, 246);
        ctx.bezierCurveTo(x + d * 62, 268, x + d * 74, 380, x + d * 54, 474);
        ctx.bezierCurveTo(x + d * 44, 524, x + d * 24, 552, x, 566);
        ctx.bezierCurveTo(x - d * 18, 520, x - d * 10, 400, x - d * 22, 300);
        ctx.closePath(); ctx.fill();
      });
      if (def.tied === 'twinbraid') {          /* 땋은 마디 */
        ctx.save(); ctx.globalAlpha = 0.30;
        ctx.strokeStyle = mix(m.hair, '#000000', 0.45); ctx.lineWidth = 3;
        [[150, -1], [410, 1]].forEach(function (p) {
          for (var k = 0; k < 5; k++) {
            var yy = 320 + k * 52;
            ctx.beginPath();
            ctx.ellipse(p[0] + p[1] * 14, yy, 26, 15, p[1] * 0.25, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        ctx.restore();
      }
    } else if (def.tied === 'braid') {
      ctx.beginPath();                          /* 한 갈래로 앞으로 넘긴 땋기 */
      ctx.moveTo(392, 268);
      ctx.bezierCurveTo(446, 300, 452, 420, 436, 540);
      ctx.bezierCurveTo(430, 588, 418, 616, 402, 634);
      ctx.quadraticCurveTo(378, 604, 380, 548);
      ctx.bezierCurveTo(384, 440, 382, 330, 360, 296);
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.32;
      ctx.strokeStyle = mix(m.hair, '#000000', 0.45); ctx.lineWidth = 3.4;
      for (var bk = 0; bk < 6; bk++) {
        ctx.beginPath();
        ctx.ellipse(406, 330 + bk * 50, 30, 17, -0.2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    } else if (def.wavy >= 1.3) {
      for (var c = 0; c < 16; c++) {            /* 곱슬 뭉치 */
        var ang = Math.PI * (0.06 + 0.92 * (c / 15));
        var cx = 280 - Math.cos(ang) * 196, cy = 330 - Math.sin(ang) * 250;
        ctx.beginPath(); ctx.arc(cx, cy, 56 + (c % 3) * 9, 0, Math.PI * 2); ctx.fill();
      }
      for (var c2 = 0; c2 < 8; c2++) {
        ctx.beginPath();
        ctx.arc(150 + c2 * 37, 470 + ((c2 % 3) - 1) * 26, 50, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* --- 2. 머리통을 감싸는 본체 --- */
    /* vol 로 같은 길이대 안에서도 옆폭을 갈라 놓는다(중복 실루엣 방지) */
    var outX = L.outX - (def.vol || 0), botY = L.botY, inY = L.inY;
    /* 묶은 머리는 옆머리가 없어 머리통에 딱 붙는다 */
    if (def.tied) { outX = 122; botY = 424; inY = 424; }

    ctx.beginPath();
    ctx.moveTo(280, 68);
    ctx.bezierCurveTo(280 - (280 - outX) * 0.86, 68, outX - 12, 200, outX, 330);
    if (def.wavy && !def.tied) {
      /* 웨이브: 옆선을 물결지게 내린다 */
      ctx.bezierCurveTo(outX + 6, 446, outX - 14, 528, outX + 8, botY);
      ctx.quadraticCurveTo(outX + 52, botY - 30, outX + 70, botY - 100);
      ctx.quadraticCurveTo(outX + 88, botY - 170, outX + 98, inY - 122);
      ctx.lineTo(560 - outX - 98, inY - 122);
      ctx.quadraticCurveTo(560 - outX - 88, botY - 170, 560 - outX - 70, botY - 100);
      ctx.quadraticCurveTo(560 - outX - 52, botY - 30, 560 - outX - 8, botY);
      ctx.bezierCurveTo(560 - outX - 6, 528, 560 - outX + 14, 446, 560 - outX, 330);
    } else {
      ctx.bezierCurveTo(outX + 6, 418, outX + 24, 470, outX + 42, botY);
      ctx.quadraticCurveTo(outX + 90, botY - 12, outX + 108, inY);
      ctx.lineTo(560 - outX - 108, inY);
      ctx.quadraticCurveTo(560 - outX - 90, botY - 12, 560 - outX - 42, botY);
      ctx.bezierCurveTo(560 - outX - 24, 470, 560 - outX - 6, 418, 560 - outX, 330);
    }
    ctx.bezierCurveTo(560 - outX + 12, 200, 280 + (280 - outX) * 0.86, 68, 280, 68);
    ctx.closePath(); ctx.fill();

    /* --- 3. 머리통 위에 얹는 장식 --- */
    if (def.tied === 'bun') {
      ctx.beginPath(); ctx.ellipse(280, 68, 78, 58, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = mix(m.hair, '#ffffff', 0.5);
      ctx.lineWidth = 3;
      for (var b = 0; b < 5; b++) {
        ctx.beginPath(); ctx.ellipse(280, 68, 22 + b * 13, 16 + b * 10, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    if (def.tied === 'pony' || def.tied === 'highpony') {
      ctx.fillStyle = mix(m.hair, '#000000', 0.35);
      ctx.beginPath();
      ctx.ellipse(404, def.tied === 'highpony' ? 208 : 262, 20, 15, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (def.tied === 'twin' || def.tied === 'twinbraid') {
      ctx.fillStyle = mix(m.hair, '#000000', 0.35);
      ctx.beginPath();
      ctx.ellipse(140, 258, 17, 13, 0.4, 0, Math.PI * 2);
      ctx.ellipse(420, 258, 17, 13, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (def.tied === 'braid') {
      ctx.fillStyle = mix(m.hair, '#000000', 0.35);
      ctx.beginPath(); ctx.ellipse(392, 276, 18, 13, -0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- 귀 ---------- */
  function drawEars(ctx, m) {
    [[142, 1], [418, -1]].forEach(function (e) {
      var x = e[0], dir = e[1];
      ctx.fillStyle = mix(m.skin, m.skinShadow, 0.25);
      ctx.beginPath(); ctx.ellipse(x, 356, 22, 42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(150,95,72,.45)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + dir * 6, 338);
      ctx.quadraticCurveTo(x - dir * 5, 356, x + dir * 5, 375);
      ctx.stroke();
    });
  }

  /* ---------- 얼굴 바탕과 음영 ---------- */
  function drawSkin(ctx, m) {
    var s = shape(m);
    ctx.save(); facePath(ctx, m); ctx.clip();

    var g = ctx.createLinearGradient(0, 120, 0, s.chin);
    g.addColorStop(0, mix(m.skin, '#ffffff', 0.16));
    g.addColorStop(0.45, m.skin);
    g.addColorStop(1, mix(m.skin, m.skinShadow, 0.55));
    ctx.fillStyle = g; ctx.fillRect(0, 0, BW, BH);

    /* 관자놀이·턱선 음영 — ⚠ 좁고 진한 세로 타원은 뺨에 줄무늬로 보인다.
       얼굴 폭의 1/3 가까이 넓게, 알파는 낮게 깔아야 굴곡으로 읽힌다. */
    soft(ctx, 132, 340, 110, 185, m.skinShadow, 0.20);
    soft(ctx, 428, 340, 110, 185, m.skinShadow, 0.20);
    soft(ctx, 280, s.chin - 18, 110, 62, m.skinShadow, 0.18);
    /* 광대 아래 쉐이딩 — 넓고 옅게. 좁고 진하면 볼에 얼룩처럼 보인다. */
    soft(ctx, 178, s.cheek + 6, 78, 44, mix(m.skinShadow, '#a4614a', 0.3), 0.18);
    soft(ctx, 382, s.cheek + 6, 78, 44, mix(m.skinShadow, '#a4614a', 0.3), 0.18);
    /* 이마·광대 하이라이트 — 경계가 보이지 않게 아주 크고 옅게 */
    soft(ctx, 280, 214, 140, 88, '#ffffff', 0.10);
    soft(ctx, 200, 398, 66, 44, '#ffffff', 0.08);
    soft(ctx, 360, 398, 66, 44, '#ffffff', 0.08);
    ctx.restore();

    /* 얼굴 외곽선 */
    ctx.save(); facePath(ctx, m);
    ctx.strokeStyle = 'rgba(138,86,64,.35)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }

  /* ---------- 코 ---------- */
  function drawNose(ctx, m) {
    ctx.save();
    /* ⚠ 콧대는 좁고 진한 타원을 쓰면 얼굴에 막대 두 개가 선 것처럼 보인다.
       넓고 아주 옅게 깔고, 코끝 주변에서만 형태를 잡는다.
       ⚠⚠ 하이라이트도 세로로 길게 넣으면 콧등에 흰 줄이 그어진 것처럼 보인다.
       짧고 옅게, 코끝 쪽에만 둔다. */
    soft(ctx, 266, NOSE_Y - 24, 18, 52, m.skinShadow, 0.13);       /* 콧대 왼쪽 음영 */
    soft(ctx, 295, NOSE_Y - 24, 18, 52, m.skinShadow, 0.08);       /* 콧대 오른쪽(광원쪽) */
    /* ⚠ 콧대 하이라이트는 넣지 않는다. 세로로 밝은 영역을 주면 아무리 옅어도
       콧등에 흰 줄이 그어진 것처럼 보인다(딸 지적). 코끝 광만으로 충분하다. */
    soft(ctx, 280, NOSE_Y + 6, 24, 13, m.skinShadow, 0.20);        /* 코끝 아래 */
    soft(ctx, 280, NOSE_Y - 5, 11, 8, '#ffffff', 0.15);            /* 코끝 광 */
    ctx.strokeStyle = 'rgba(140,88,66,.42)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();                                               /* 콧방울 */
    ctx.moveTo(265, NOSE_Y + 2); ctx.quadraticCurveTo(272, NOSE_Y + 11, 280, NOSE_Y + 8);
    ctx.quadraticCurveTo(288, NOSE_Y + 11, 295, NOSE_Y + 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,74,56,.42)';
    ctx.beginPath(); ctx.ellipse(270, NOSE_Y + 6, 3.4, 2.2, -0.3, 0, Math.PI * 2);
    ctx.ellipse(290, NOSE_Y + 6, 3.4, 2.2, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------- 눈 ---------- */
  /* ⚠ 눈 크기는 "귀엽게" 키우면 즉시 애니메이션 캐릭터가 된다.
     고전 인체비례: 얼굴 폭 = 눈 5개 폭. 머리 폭 약 297px 이므로
     눈 하나 ≈ 59px, 즉 **반폭 30px** 이 사람 비율이다.
     예전엔 반폭 52px(눈폭 104px)로 실제의 1.75배였고,
     딸이 "괴상한 애니메이션 같다"고 한 가장 큰 원인이었다.
     인형 느낌을 조금 남기려 34px(=1.15배)까지만 허용한다. */
  function eyeShape(ctx, cx, cy, dir, style) {
    var w = 34, inner = cx - dir * w, outer = cx + dir * w;
    var topLift = style === 'cat' ? 19 : style === 'doe' ? 23 : style === 'cool' ? 14 : 21;
    var tail = style === 'cat' ? -8 : style === 'doe' ? 1 : style === 'cool' ? -4 : 0;
    var bottom = style === 'doe' ? 17 : style === 'cool' ? 11 : 14;
    ctx.beginPath();
    ctx.moveTo(inner, cy + 1);
    ctx.bezierCurveTo(cx - dir * 17, cy - topLift, cx + dir * 16, cy - topLift + 3, outer, cy + tail);
    ctx.bezierCurveTo(cx + dir * 14, cy + bottom, cx - dir * 17, cy + bottom - 3, inner, cy + 1);
    ctx.closePath();
  }

  function drawEye(ctx, m, cx, dir) {
    var cy = EYE_Y, style = m.eye;
    /* 눈두덩 음영 */
    soft(ctx, cx, cy - 16, 34, 16, mix(m.skinShadow, '#9c6248', 0.25), 0.26);
    /* 흰자 */
    ctx.save(); eyeShape(ctx, cx, cy, dir, style); ctx.clip();
    var wg = ctx.createLinearGradient(0, cy - 30, 0, cy + 26);
    wg.addColorStop(0, '#ddd2cf'); wg.addColorStop(0.4, '#fdfbfa'); wg.addColorStop(1, '#f0e7e4');
    ctx.fillStyle = wg; ctx.fillRect(cx - 60, cy - 40, 120, 80);

    /* 홍채 */
    /* ⚠ 홍채 반지름은 눈 반폭(34)의 40% 안쪽이어야 눈 밖으로 새지 않는다.
       눈을 줄일 때 홍채를 같이 줄이지 않으면 눈알이 튀어나온 것처럼 보인다. */
    var ix = cx + dir * 1, iy = cy + 1, ir = style === 'doe' ? 14 : style === 'cool' ? 11.5 : 13;
    var ig = ctx.createRadialGradient(ix - 4, iy - 5, 2, ix, iy, ir);
    ig.addColorStop(0, mix(m.iris, '#ffffff', 0.45));
    ig.addColorStop(0.55, m.iris);
    ig.addColorStop(1, mix(m.iris, '#000000', 0.55));
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
    /* 홍채 결 */
    ctx.strokeStyle = mix(m.iris, '#ffffff', 0.4); ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    for (var a = 0; a < 18; a++) {
      var ang = (Math.PI * 2 / 18) * a;
      ctx.beginPath();
      ctx.moveTo(ix + Math.cos(ang) * ir * 0.42, iy + Math.sin(ang) * ir * 0.42);
      ctx.lineTo(ix + Math.cos(ang) * ir * 0.92, iy + Math.sin(ang) * ir * 0.92);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    /* 림발링 */
    ctx.strokeStyle = 'rgba(30,18,12,.7)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.stroke();
    /* 동공 */
    ctx.fillStyle = '#140f0d';
    ctx.beginPath(); ctx.arc(ix, iy, ir * 0.44, 0, Math.PI * 2); ctx.fill();
    /* 눈동자 반사광 — 인형 눈의 핵심 */
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.arc(ix - ir * 0.34, iy - ir * 0.38, ir * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.arc(ix + ir * 0.32, iy + ir * 0.3, ir * 0.13, 0, Math.PI * 2); ctx.fill();
    /* 윗눈꺼풀 그림자 */
    var sg = ctx.createLinearGradient(0, cy - 30, 0, cy);
    sg.addColorStop(0, 'rgba(60,35,25,.5)'); sg.addColorStop(1, 'rgba(60,35,25,0)');
    ctx.fillStyle = sg; ctx.fillRect(cx - 60, cy - 40, 120, 44);
    ctx.restore();

    /* 아이라인 + 속눈썹 */
    ctx.save();
    /* 아이라인이 굵으면 만화 선이 된다. 눈이 작아진 만큼 선도 얇게. */
    ctx.strokeStyle = '#3a291f'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    eyeShape(ctx, cx, cy, dir, style); ctx.stroke();
    /* 속눈썹도 눈 크기에 비례해 줄인다 (예전 길이 20~24 는 눈보다 길었다) */
    var lashes = [[0.62, 9], [0.82, 11], [0.98, 10], [1.08, 7]];
    lashes.forEach(function (l) {
      var t = l[0], len = l[1];
      var bx = cx + dir * (t * 29), by = cy - (style === 'cool' ? 10 : 13) + Math.abs(t - 0.8) * 8;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dir * len * 0.6, by - len * 0.7, bx + dir * len, by - len * 0.85);
      ctx.stroke();
    });
    /* 아랫속눈썹 */
    ctx.lineWidth = 1.8; ctx.globalAlpha = 0.75;
    [-0.5, 0, 0.5].forEach(function (t) {
      var bx = cx + dir * (t * 34), by = cy + (style === 'doe' ? 24 : 20);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dir * 3, by + 8); ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- 눈썹 ---------- */
  function drawBrow(ctx, m, cx, dir) {
    var y = BROW_Y, color = mix(m.hair, '#6a4433', 0.35);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    /* 형태 — ⚠ 눈썹은 눈보다 조금만 길어야 한다(눈폭 68 -> 눈썹 76 정도).
       예전엔 폭 94 / 굵기 9 로, 눈이 작아진 뒤 얼굴에 검은 막대를 붙인 꼴이 됐다. */
    ctx.lineWidth = 5.5;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - dir * 37, y + 6);
    ctx.quadraticCurveTo(cx + dir * 2, y - 10, cx + dir * 39, y + 2);
    ctx.stroke();
    /* 결 */
    ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5;
    for (var i = 0; i < 12; i++) {
      var t = i / 11, bx = cx + dir * (-37 + 76 * t);
      var by = y + 6 - 15 * Math.sin(Math.PI * t) + 3 * t;
      ctx.beginPath(); ctx.moveTo(bx, by + 3); ctx.lineTo(bx + dir * 4, by - 4); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 입술 ---------- */
  function drawLips(ctx, m) {
    var s = shape(m), y = MOUTH_Y, w = s.mouthW;
    ctx.save();
    /* 인중 */
    ctx.strokeStyle = 'rgba(150,96,74,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(274, y - 34); ctx.lineTo(274, y - 14);
    ctx.moveTo(286, y - 34); ctx.lineTo(286, y - 14); ctx.stroke();

    /* ⚠ 입술 두께. 예전엔 위 15 + 아래 31 = 46px 로 입폭(100)의 절반이라
       입만 도드라져 보였다. 실제 입술 높이는 입폭의 1/3 안쪽이다.
       윗입술:아랫입술 = 1:1.4 비율을 지킨다. */
    function lipPath() {
      ctx.beginPath();
      ctx.moveTo(280 - w, y);
      ctx.quadraticCurveTo(280 - w * 0.6, y - 10, 280 - w * 0.22, y - 5);   /* 큐피드 활 왼쪽 */
      ctx.quadraticCurveTo(280, y - 9.5, 280 + w * 0.22, y - 5);
      ctx.quadraticCurveTo(280 + w * 0.6, y - 10, 280 + w, y);
      ctx.quadraticCurveTo(280 + w * 0.55, y + 18, 280, y + 20);
      ctx.quadraticCurveTo(280 - w * 0.55, y + 18, 280 - w, y);
      ctx.closePath();
    }
    lipPath();
    var lg = ctx.createLinearGradient(0, y - 11, 0, y + 21);
    lg.addColorStop(0, mix(m.lip, '#000000', 0.25));
    lg.addColorStop(0.42, m.lip);
    lg.addColorStop(0.62, mix(m.lip, '#ffffff', 0.18));
    lg.addColorStop(1, mix(m.lip, '#000000', 0.2));
    ctx.fillStyle = lg; ctx.fill();
    ctx.strokeStyle = mix(m.lip, '#000000', 0.4); ctx.lineWidth = 1.6; ctx.stroke();

    ctx.save(); lipPath(); ctx.clip();
    /* 입술 경계선 */
    ctx.strokeStyle = 'rgba(80,26,34,.5)'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(280 - w, y); ctx.quadraticCurveTo(280, y + 7, 280 + w, y); ctx.stroke();
    /* 윤기 */
    soft(ctx, 268, y + 16, 20, 8, '#ffffff', 0.55);
    soft(ctx, 280, y - 4, 16, 5, '#ffffff', 0.30);
    ctx.restore();
    ctx.restore();
  }

  /* ---------- 앞머리 ---------- */
  /* ---------- 앞머리 ----------
     ⚠ 뒷머리와 같은 이유로 id 분기를 버리고 속성(bang / tied / length)으로 그린다.
     bang: 'seethru'(시스루뱅) / 'hime'(일자 히메컷) / 없으면 기본 가름머리. */
  function hairFrontPath(ctx, m) {
    var def = hairStyleDef(m);
    var L = HAIR_LEN[def.length] || HAIR_LEN.long;
    var outX = def.tied ? 122 : (L.outX - (def.vol || 0));
    var topY = 68;
    ctx.fillStyle = hairGradient(ctx)(m);
    ctx.beginPath();

    if (def.bang === 'hime') {
      /* 히메컷: 이마를 가로로 덮는 일자 뱅 */
      ctx.moveTo(outX, 300);
      ctx.bezierCurveTo(outX + 4, 150, 190, topY, 280, topY);
      ctx.bezierCurveTo(370, topY, 560 - outX - 4, 150, 560 - outX, 300);
      ctx.lineTo(560 - outX - 16, 252);
      ctx.lineTo(outX + 16, 252);
      ctx.closePath();
    } else if (def.bang === 'seethru') {
      /* 시스루뱅: 얇게 내려 이마가 비친다 */
      ctx.moveTo(outX, 296);
      ctx.bezierCurveTo(outX + 4, 150, 190, topY, 280, topY);
      ctx.bezierCurveTo(370, topY, 560 - outX - 4, 150, 560 - outX, 296);
      ctx.quadraticCurveTo(470, 210, 392, 188);
      ctx.quadraticCurveTo(336, 236, 280, 214);
      ctx.quadraticCurveTo(224, 236, 168, 188);
      ctx.quadraticCurveTo(90, 210, outX, 296);
      ctx.closePath();
    } else if (def.tied) {
      /* 묶은 머리: 이마를 드러내고 옆으로 빗어 넘긴다 */
      ctx.moveTo(outX, 300);
      ctx.bezierCurveTo(outX + 2, 152, 190, 72, 280, 72);
      ctx.bezierCurveTo(376, 72, 560 - outX - 2, 156, 560 - outX, 300);
      ctx.quadraticCurveTo(424, 206, 372, 168);
      ctx.quadraticCurveTo(300, 130, 206, 176);
      ctx.quadraticCurveTo(152, 212, outX, 300);
      ctx.closePath();
    } else {
      /* 기본: 한쪽으로 자연스럽게 가른 앞머리.
         길이대에 따라 옆폭만 달라진다. */
      ctx.moveTo(outX, 300);
      ctx.bezierCurveTo(outX + 4, 148, 186, topY, 280, topY);
      ctx.bezierCurveTo(378, topY, 560 - outX - 4, 150, 560 - outX, 300);
      ctx.quadraticCurveTo(560 - outX - 24, 206, 372, 168);
      ctx.quadraticCurveTo(322, 228, 268, 206);
      ctx.quadraticCurveTo(188, 214, 140, 268);
      ctx.quadraticCurveTo(outX + 16, 284, outX, 300);
      ctx.closePath();
    }
    ctx.closePath(); ctx.fill();

    /* 머릿결과 광 — ⚠ 반드시 앞머리 안쪽으로 클리핑한다.
       클리핑하지 않으면 결 선이 이마를 가로질러 얼굴에 줄이 그어진 것처럼 보인다.
       ⚠ 결을 같은 길이·같은 굵기로 촘촘히 그으면 획이 닿는 구간의 경계가
       머리 위에 가로 띠처럼 드러난다. 길이를 제각각으로 흩어 놓는다. */
    ctx.save();
    ctx.clip();
    ctx.lineCap = 'round';
    for (var i = 0; i < 22; i++) {
      var t = i / 21;
      var x0 = 104 + 352 * t;
      var jitter = ((i * 37) % 11) / 11;            /* 결마다 다른 길이 */
      var y0 = 20 + jitter * 26;                    /* 클립 위쪽 밖에서 시작 */
      var y1 = 470 + jitter * 190;                  /* 클립 아래쪽 밖에서 끝 */
      ctx.strokeStyle = mix(m.hair, '#ffffff', 0.2 + jitter * 0.3);
      ctx.globalAlpha = 0.10 + jitter * 0.12;
      ctx.lineWidth = 1.6 + jitter * 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 - 28 + 56 * t, (y0 + y1) / 2, 100 + 360 * t, y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    /* 머리 광은 가로로 길고 아주 옅게. 넓게 깔면 이마 위에 밝은 띠가 생긴다. */
    soft(ctx, 262, 158, 88, 34, 'rgba(255,255,255,.38)', 0.16);
    ctx.restore();
  }

  /* ------------------------------------------------------------------
   * 전신 모드 (560 x 980)
   * 얼굴 좌표계(560x700)와 별개다. 머리는 headRect() 자리에 축소해 끼워 넣고,
   * 몸·팔·다리·옷은 전신 좌표계로 그린다.
   * ------------------------------------------------------------------ */
  var FULL_W = 560, FULL_H = 980;

  var BODY = {
    /* ⚠ 이 값들은 서로 맞물린다. 목 아래끝(neckBot)이 어깨선(shoulderY)보다
       위에 있으면 머리가 공중에 떠 보인다. 반드시 어깨가 목을 덮어야 한다.
       또 팔 중심(armX)은 어깨 반폭(shoulderHalf)보다 안쪽이어야 몸에 붙는다. */
    neckTop: 352, neckBot: 418,
    shoulderY: 420, shoulderHalf: 122,
    chestY: 486, chestHalf: 104,
    waistY: 578, waistHalf: 82,
    hipY: 648, hipHalf: 100,
    kneeY: 796, ankleY: 932, footY: 966,
    /* ⚠ 팔 바깥끝(armX+armHalf)이 가슴 반폭(chestHalf)을 크게 넘으면
       팔이 몸통 밖에 붕 뜬 것처럼 보인다. 8px 이내로 유지한다. */
    armX: 88, armHalf: 23, handY: 652
  };

  function skinFill(ctx, m, y0, y1) {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, mix(m.skin, '#ffffff', 0.10));
    g.addColorStop(0.5, m.skin);
    g.addColorStop(1, mix(m.skin, m.skinShadow, 0.5));
    return g;
  }

  function drawFullBackdrop(ctx, m) {
    var g = ctx.createLinearGradient(0, 0, 0, FULL_H);
    g.addColorStop(0, mix(m.bg, '#ffffff', 0.55));
    g.addColorStop(1, m.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, FULL_W, FULL_H);
    soft(ctx, 280, 956, 158, 24, 'rgba(96,62,84,.32)', 0.55);   /* 바닥 그림자 */
  }

  function drawLegs(ctx, m) {
    ctx.fillStyle = skinFill(ctx, m, BODY.hipY, BODY.footY);
    [-1, 1].forEach(function (d) {
      var hx = 280 + d * 44;
      ctx.beginPath();
      ctx.moveTo(hx - 42, BODY.hipY - 10);
      ctx.bezierCurveTo(hx - 46, BODY.kneeY - 70, hx - 32, BODY.kneeY, hx - 27, BODY.kneeY + 14);
      ctx.bezierCurveTo(hx - 24, BODY.ankleY - 60, hx - 20, BODY.ankleY - 10, hx - 19, BODY.ankleY);
      ctx.lineTo(hx + 17, BODY.ankleY);
      ctx.bezierCurveTo(hx + 18, BODY.ankleY - 10, hx + 22, BODY.ankleY - 60, hx + 25, BODY.kneeY + 14);
      ctx.bezierCurveTo(hx + 30, BODY.kneeY, hx + 40, BODY.kneeY - 70, hx + 38, BODY.hipY - 10);
      ctx.closePath(); ctx.fill();
      soft(ctx, hx + d * 8, BODY.kneeY + 6, 26, 40, m.skinShadow, 0.16);
      soft(ctx, hx - d * 16, BODY.kneeY - 60, 14, 90, m.skinShadow, 0.12);
    });
  }

  function drawShoes(ctx, m) {
    var c = m.outfitTrim || '#ffffff';
    [-1, 1].forEach(function (d) {
      var x = 280 + d * 44;
      ctx.fillStyle = mix(c, '#000000', 0.3);
      ctx.beginPath();
      ctx.moveTo(x - 21, BODY.ankleY - 10);
      ctx.lineTo(x + 19, BODY.ankleY - 10);
      ctx.quadraticCurveTo(x + 29, BODY.footY - 8, x + 22, BODY.footY);
      ctx.lineTo(x - 26, BODY.footY);
      ctx.quadraticCurveTo(x - 32, BODY.footY - 12, x - 21, BODY.ankleY - 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = mix(c, '#ffffff', 0.35);
      ctx.fillRect(x - 25, BODY.footY - 9, 48, 9);
    });
  }

  function drawTorso(ctx, m, shoulderY) {
    ctx.fillStyle = skinFill(ctx, m, shoulderY, BODY.hipY);
    ctx.beginPath();
    ctx.moveTo(280 - BODY.shoulderHalf, shoulderY);
    ctx.quadraticCurveTo(280 - BODY.chestHalf, BODY.chestY, 280 - BODY.waistHalf, BODY.waistY);
    ctx.quadraticCurveTo(280 - BODY.hipHalf, BODY.hipY - 24, 280 - BODY.hipHalf + 8, BODY.hipY + 18);
    ctx.lineTo(280 + BODY.hipHalf - 8, BODY.hipY + 18);
    ctx.quadraticCurveTo(280 + BODY.hipHalf, BODY.hipY - 24, 280 + BODY.waistHalf, BODY.waistY);
    ctx.quadraticCurveTo(280 + BODY.chestHalf, BODY.chestY, 280 + BODY.shoulderHalf, shoulderY);
    ctx.quadraticCurveTo(280, shoulderY - 24, 280 - BODY.shoulderHalf, shoulderY);
    ctx.closePath(); ctx.fill();
    soft(ctx, 280, BODY.chestY + 10, 60, 46, '#ffffff', 0.10);
  }

  function drawArms(ctx, m, shoulderY) {
    ctx.fillStyle = skinFill(ctx, m, shoulderY, BODY.handY);
    [-1, 1].forEach(function (d) {
      var ax = 280 + d * BODY.armX, w = BODY.armHalf;
      ctx.beginPath();
      ctx.moveTo(ax - w, shoulderY);
      ctx.bezierCurveTo(ax - w - 3, BODY.chestY, ax - w + 2, BODY.handY - 60, ax - w + 5, BODY.handY);
      ctx.quadraticCurveTo(ax, BODY.handY + 22, ax + w - 4, BODY.handY);
      ctx.bezierCurveTo(ax + w - 1, BODY.handY - 60, ax + w + 4, BODY.chestY, ax + w, shoulderY);
      ctx.closePath(); ctx.fill();
      soft(ctx, ax + d * 12, BODY.chestY + 60, 10, 110, m.skinShadow, 0.16);
    });
  }

  /* 목은 **실제 턱 위치에서** 시작해야 한다.
     ⚠ neckTop 을 상수로 두면 얼굴형(chin 이 556~602 로 다름)이나 headRect 를
     건드릴 때마다 머리와 목 사이에 틈이 생긴다. 측정값에서 계산한다. */
  function chinInFull(m, W, H) {
    var r = headRect(m, W || FULL_W, H || FULL_H);
    var s = shape(m);
    var scaleY = (H || FULL_H) / FULL_H;
    return (r.y + (s.chin / BH) * r.h) / scaleY;
  }

  /* 어깨 높이는 얼굴형에 따라 움직여야 한다.
     ⚠ 상수로 고정하면 턱이 짧은 하트형에서 목이 78px까지 늘어나 기린이 된다.
     턱에서 일정 거리 아래를 어깨로 잡는다. */
  var NECK_LEN = 46;
  function shoulderFor(m, W, H) {
    return chinInFull(m, W, H) + NECK_LEN;
  }

  function drawFullNeck(ctx, m, W, H) {
    var top = chinInFull(m, W, H) - 30;      /* 턱 살짝 위에서 시작해 겹친다 */
    var shoulderY = shoulderFor(m, W, H);
    ctx.fillStyle = mix(m.skin, m.skinShadow, 0.36);
    ctx.beginPath();
    ctx.moveTo(256, top);
    ctx.bezierCurveTo(254, top + 28, 250, shoulderY - 12, 246, shoulderY + 18);
    ctx.quadraticCurveTo(280, shoulderY + 34, 314, shoulderY + 18);
    ctx.bezierCurveTo(310, shoulderY - 12, 306, top + 28, 304, top);
    ctx.closePath(); ctx.fill();
    soft(ctx, 280, top + 20, 44, 22, mix(m.skinShadow, '#6b3f2f', 0.35), 0.45);
  }

  /* ---------- 옷 ---------- */
  function bodicePath(ctx, hemY, halfHem, neckDrop, shoulderY) {
    ctx.beginPath();
    ctx.moveTo(280 - BODY.shoulderHalf - 6, shoulderY - 2);
    ctx.quadraticCurveTo(280 - BODY.chestHalf - 7, BODY.chestY, 280 - BODY.waistHalf - 7, BODY.waistY);
    ctx.quadraticCurveTo(280 - halfHem, hemY - 36, 280 - halfHem, hemY);
    ctx.quadraticCurveTo(280, hemY + 16, 280 + halfHem, hemY);
    ctx.quadraticCurveTo(280 + halfHem, hemY - 36, 280 + BODY.waistHalf + 7, BODY.waistY);
    ctx.quadraticCurveTo(280 + BODY.chestHalf + 7, BODY.chestY, 280 + BODY.shoulderHalf + 6, shoulderY - 2);
    ctx.quadraticCurveTo(280, shoulderY + (neckDrop || 18), 280 - BODY.shoulderHalf - 6, shoulderY - 2);
    ctx.closePath();
  }

  /* 소매 — ⚠ 소매를 팔 위치에만 그리면 몸통 옷과 사이에 살색 틈이 남고,
     어깨선보다 위에서 시작하면 뿔처럼 솟아 보인다.
     어깨선에서 시작해 몸통 안쪽까지 한 덩어리로 이어 그린다. */
  function drawSleeves(ctx, toY, halfW, shoulderY) {
    [-1, 1].forEach(function (d) {
      var ax = 280 + d * BODY.armX;
      var outer = ax + d * halfW;
      var inner = 280 + d * (BODY.chestHalf - 20);   /* 몸통 안쪽까지 파고든다 */
      ctx.beginPath();
      ctx.moveTo(inner, shoulderY - 2);
      ctx.quadraticCurveTo(ax, shoulderY - 6, outer, shoulderY + 12);
      ctx.quadraticCurveTo(outer + d * 5, toY - 14, outer - d * 3, toY);
      ctx.lineTo(ax - d * halfW + d * 3, toY);
      ctx.quadraticCurveTo(inner - d * 8, toY - 20, inner, shoulderY - 2);
      ctx.closePath(); ctx.fill();
    });
  }

  function skirtPath(ctx, topY, hemY, halfHem) {
    ctx.beginPath();
    ctx.moveTo(280 - BODY.hipHalf + 2, topY);
    ctx.quadraticCurveTo(280 - halfHem + 12, hemY - 46, 280 - halfHem, hemY);
    ctx.quadraticCurveTo(280, hemY + 26, 280 + halfHem, hemY);
    ctx.quadraticCurveTo(280 + halfHem - 12, hemY - 46, 280 + BODY.hipHalf - 2, topY);
    ctx.closePath();
  }

  function drawPants(ctx, hemY, halfW) {
    [-1, 1].forEach(function (d) {
      var hx = 280 + d * 44;
      ctx.beginPath();
      ctx.moveTo(hx - 50, BODY.hipY - 18);
      ctx.lineTo(hx + 46, BODY.hipY - 18);
      ctx.bezierCurveTo(hx + 42, BODY.kneeY, hx + halfW + 6, hemY - 50, hx + halfW, hemY);
      ctx.lineTo(hx - halfW + 8, hemY);
      ctx.bezierCurveTo(hx - halfW - 4, hemY - 50, hx - 46, BODY.kneeY, hx - 50, BODY.hipY - 18);
      ctx.closePath(); ctx.fill();
    });
  }

  function drawOutfit(ctx, m, shoulderY) {
    var kind = m.outfitKind || 'tee';
    var main = m.outfitMain || '#f2a7c3';
    var trim = m.outfitTrim || '#ffffff';

    var g = ctx.createLinearGradient(0, shoulderY - 20, 0, BODY.hipY + 180);
    g.addColorStop(0, mix(main, '#ffffff', 0.22));
    g.addColorStop(0.5, main);
    g.addColorStop(1, mix(main, '#000000', 0.24));

    if (kind === 'suit') {
      /* 정장: 안에 셔츠, 위에 재킷, V 자 라펠 */
      ctx.fillStyle = mix('#f6f7fa', '#ffffff', 0.3);            /* 셔츠 */
      bodicePath(ctx, BODY.hipY, BODY.waistHalf + 12, 20, shoulderY); ctx.fill();
      ctx.fillStyle = g;                                          /* 재킷 몸통 */
      ctx.beginPath();
      ctx.moveTo(280 - BODY.chestHalf - 6, shoulderY);
      ctx.lineTo(280 - 22, shoulderY + 10);
      ctx.lineTo(280 - 30, BODY.hipY + 26);
      ctx.lineTo(280 - BODY.waistHalf - 16, BODY.hipY + 30);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(280 + BODY.chestHalf + 6, shoulderY);
      ctx.lineTo(280 + 22, shoulderY + 10);
      ctx.lineTo(280 + 30, BODY.hipY + 26);
      ctx.lineTo(280 + BODY.waistHalf + 16, BODY.hipY + 30);
      ctx.closePath(); ctx.fill();
      /* ⚠ 소매 끝을 handY(652) 근처까지 내리면 팔이 통째로 덮여 사라진다.
         긴팔은 손목 살짝 위(handY - 26)에서 끝내 손이 보이게 한다. */
      drawSleeves(ctx, BODY.handY - 26, 30, shoulderY);
      ctx.fillStyle = mix(main, '#ffffff', 0.18);                 /* 라펠 */
      ctx.beginPath();
      ctx.moveTo(280 - 24, shoulderY + 8);
      ctx.lineTo(280 - 4, BODY.chestY + 18);
      ctx.lineTo(280 - 40, BODY.chestY - 4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(280 + 24, shoulderY + 8);
      ctx.lineTo(280 + 4, BODY.chestY + 18);
      ctx.lineTo(280 + 40, BODY.chestY - 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = trim;                                       /* 넥타이 */
      ctx.beginPath();
      ctx.moveTo(280, BODY.chestY + 6); ctx.lineTo(280 - 11, BODY.chestY + 30);
      ctx.lineTo(280, BODY.chestY + 92); ctx.lineTo(280 + 11, BODY.chestY + 30);
      ctx.closePath(); ctx.fill();

    } else if (kind === 'shirt') {
      ctx.fillStyle = g;
      bodicePath(ctx, BODY.hipY + 14, BODY.waistHalf + 12, 20, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.handY - 28, 28, shoulderY);
      ctx.strokeStyle = mix(trim, '#000000', 0.15); ctx.lineWidth = 3;
      ctx.beginPath();                                            /* 단추선 */
      ctx.moveTo(280, shoulderY + 30); ctx.lineTo(280, BODY.hipY + 6); ctx.stroke();
      ctx.fillStyle = mix(trim, '#000000', 0.25);                 /* 깃 */
      ctx.beginPath();
      ctx.moveTo(280 - 30, shoulderY + 6); ctx.lineTo(280, shoulderY + 40);
      ctx.lineTo(280 - 6, shoulderY + 6); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(280 + 30, shoulderY + 6); ctx.lineTo(280, shoulderY + 40);
      ctx.lineTo(280 + 6, shoulderY + 6); ctx.closePath(); ctx.fill();

    } else if (kind === 'vest') {
      ctx.fillStyle = mix('#f6f7fa', '#ffffff', 0.3);             /* 셔츠 */
      bodicePath(ctx, BODY.hipY + 10, BODY.waistHalf + 12, 20, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.handY - 28, 26, shoulderY);
      ctx.fillStyle = g;                                          /* 조끼 */
      ctx.beginPath();
      ctx.moveTo(280 - BODY.chestHalf + 12, shoulderY + 8);
      ctx.lineTo(280 - 18, shoulderY + 16);
      ctx.lineTo(280, BODY.chestY + 26);
      ctx.lineTo(280 + 18, shoulderY + 16);
      ctx.lineTo(280 + BODY.chestHalf - 12, shoulderY + 8);
      ctx.lineTo(280 + BODY.waistHalf + 6, BODY.hipY);
      ctx.lineTo(280 - BODY.waistHalf - 6, BODY.hipY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.moveTo(280, BODY.chestY - 6); ctx.lineTo(280 - 9, BODY.chestY + 14);
      ctx.lineTo(280, BODY.chestY + 60); ctx.lineTo(280 + 9, BODY.chestY + 14);
      ctx.closePath(); ctx.fill();

    } else if (kind === 'jacket') {
      /* 청자켓·가디건: 앞이 열려 안쪽 티가 보인다 */
      ctx.fillStyle = mix('#f3eee9', '#ffffff', 0.2);
      bodicePath(ctx, BODY.hipY + 10, BODY.waistHalf + 10, 20, shoulderY); ctx.fill();
      ctx.fillStyle = g;
      [-1, 1].forEach(function (d) {
        ctx.beginPath();
        ctx.moveTo(280 + d * (BODY.chestHalf + 6), shoulderY);
        ctx.lineTo(280 + d * 26, shoulderY + 12);
        ctx.lineTo(280 + d * 32, BODY.hipY + 16);
        ctx.lineTo(280 + d * (BODY.waistHalf + 14), BODY.hipY + 20);
        ctx.closePath(); ctx.fill();
      });
      drawSleeves(ctx, BODY.handY - 24, 31, shoulderY);
      ctx.strokeStyle = mix(trim, '#000000', 0.1); ctx.lineWidth = 2.6;
      [-1, 1].forEach(function (d) {
        ctx.beginPath();
        ctx.moveTo(280 + d * 28, shoulderY + 16);
        ctx.lineTo(280 + d * 34, BODY.hipY + 14); ctx.stroke();
      });

    } else if (kind === 'stripe') {
      ctx.fillStyle = g;
      bodicePath(ctx, BODY.hipY, BODY.waistHalf + 10, 20, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.chestY + 6, 28, shoulderY);
      ctx.save();                                                 /* 가로 줄무늬 */
      bodicePath(ctx, BODY.hipY, BODY.waistHalf + 10, 20, shoulderY); ctx.clip();
      ctx.fillStyle = trim; ctx.globalAlpha = 0.85;
      for (var sy = shoulderY + 14; sy < BODY.hipY; sy += 26) {
        ctx.fillRect(280 - 120, sy, 240, 11);
      }
      ctx.restore();

    } else if (kind === 'overall') {
      ctx.fillStyle = mix(trim, '#ffffff', 0.25);                 /* 안에 입은 티 */
      bodicePath(ctx, BODY.chestY + 30, BODY.chestHalf, 22, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.chestY - 10, 26, shoulderY);
      ctx.fillStyle = g;                                          /* 멜빵바지 */
      ctx.beginPath();
      ctx.moveTo(280 - BODY.waistHalf - 8, BODY.chestY + 18);
      ctx.lineTo(280 + BODY.waistHalf + 8, BODY.chestY + 18);
      ctx.lineTo(280 + BODY.hipHalf + 6, BODY.kneeY + 40);
      ctx.lineTo(280 - BODY.hipHalf - 6, BODY.kneeY + 40);
      ctx.closePath(); ctx.fill();
      [-1, 1].forEach(function (d) {                              /* 멜빵끈 */
        ctx.fillRect(280 + d * 30 - 9, shoulderY + 6, 18, BODY.chestY - shoulderY + 16);
      });

    } else if (kind === 'dress') {
      ctx.fillStyle = g;
      skirtPath(ctx, BODY.waistY, BODY.kneeY + 20, 150); ctx.fill();
      bodicePath(ctx, BODY.waistY + 8, BODY.waistHalf + 10, 22, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.chestY - 26, 27, shoulderY);
      ctx.fillStyle = trim;                                    /* 허리 리본 */
      ctx.fillRect(280 - BODY.waistHalf - 8, BODY.waistY - 12, (BODY.waistHalf + 8) * 2, 20);
      ctx.beginPath(); ctx.ellipse(280, BODY.waistY - 2, 22, 15, 0, 0, Math.PI * 2); ctx.fill();

    } else if (kind === 'hanbok') {
      ctx.fillStyle = g;                                       /* 치마: 가슴부터 길게 */
      skirtPath(ctx, BODY.chestY + 6, BODY.ankleY - 30, 172); ctx.fill();
      ctx.fillStyle = mix(trim, '#ffffff', 0.25);               /* 저고리 */
      bodicePath(ctx, BODY.chestY + 12, BODY.chestHalf + 4, 24, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.chestY + 10, 32, shoulderY);
      ctx.strokeStyle = mix(main, '#000000', 0.2); ctx.lineWidth = 7;  /* 고름 */
      ctx.beginPath();
      ctx.moveTo(268, shoulderY + 20); ctx.lineTo(292, BODY.chestY + 4);
      ctx.lineTo(276, BODY.chestY + 74); ctx.stroke();

    } else if (kind === 'hoodie') {
      ctx.fillStyle = mix(main, '#000000', 0.12);               /* 바지 */
      drawPants(ctx, BODY.ankleY - 6, 34);
      ctx.fillStyle = g;
      bodicePath(ctx, BODY.hipY + 12, BODY.hipHalf + 4, 16, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.handY - 6, 30, shoulderY);
      ctx.fillStyle = mix(main, '#000000', 0.2);                /* 후드 */
      ctx.beginPath();
      ctx.moveTo(280 - 76, shoulderY + 4);
      ctx.quadraticCurveTo(280, BODY.neckBot - 30, 280 + 76, shoulderY + 4);
      ctx.quadraticCurveTo(280, shoulderY + 44, 280 - 76, shoulderY + 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = trim; ctx.lineWidth = 6; ctx.lineCap = 'round';  /* 끈 */
      ctx.beginPath();
      ctx.moveTo(266, shoulderY + 36); ctx.lineTo(262, BODY.chestY + 30);
      ctx.moveTo(294, shoulderY + 36); ctx.lineTo(298, BODY.chestY + 30);
      ctx.stroke();

    } else if (kind === 'uniform') {
      ctx.fillStyle = mix(main, '#000000', 0.1);                /* 주름치마 */
      skirtPath(ctx, BODY.waistY + 4, BODY.kneeY - 26, 126); ctx.fill();
      ctx.save(); skirtPath(ctx, BODY.waistY + 4, BODY.kneeY - 26, 126); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 3;
      for (var i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(280 + i * 22, BODY.waistY);
        ctx.lineTo(280 + i * 27, BODY.kneeY - 20); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = mix(trim, '#ffffff', 0.4);                /* 블라우스 */
      bodicePath(ctx, BODY.waistY + 10, BODY.waistHalf + 8, 20, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.chestY - 16, 28, shoulderY);
      ctx.fillStyle = mix(main, '#ffffff', 0.1);                /* 세일러 카라 */
      ctx.beginPath();
      ctx.moveTo(280 - 70, shoulderY + 2);
      ctx.lineTo(280 + 70, shoulderY + 2);
      ctx.lineTo(280 + 52, BODY.chestY + 4);
      ctx.lineTo(280, BODY.chestY + 22);
      ctx.lineTo(280 - 52, BODY.chestY + 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d94f5c';                                /* 리본 타이 */
      ctx.beginPath(); ctx.ellipse(280, BODY.chestY + 18, 20, 13, 0, 0, Math.PI * 2); ctx.fill();

    } else if (kind === 'idol') {
      ctx.fillStyle = g;
      skirtPath(ctx, BODY.waistY + 2, BODY.hipY + 96, 128); ctx.fill();
      bodicePath(ctx, BODY.waistY + 6, BODY.waistHalf + 8, 26, shoulderY); ctx.fill();
      drawSleeves(ctx, shoulderY + 44, 28, shoulderY);
      ctx.fillStyle = trim;                                     /* 금색 장식 */
      ctx.fillRect(280 - BODY.waistHalf - 8, BODY.waistY - 10, (BODY.waistHalf + 8) * 2, 14);
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (var s = 0; s < 14; s++) {
        var sx = 200 + ((s * 53) % 160), sy = BODY.chestY - 20 + ((s * 37) % 120);
        ctx.beginPath(); ctx.arc(sx, sy, 3 + (s % 3), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    } else if (kind === 'sporty') {
      ctx.fillStyle = mix(main, '#000000', 0.16);
      drawPants(ctx, BODY.ankleY - 4, 34);
      ctx.fillStyle = g;
      bodicePath(ctx, BODY.hipY + 4, BODY.hipHalf, 16, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.handY - 10, 29, shoulderY);
      ctx.strokeStyle = trim; ctx.lineWidth = 7;                /* 옆라인 */
      [-1, 1].forEach(function (d) {
        ctx.beginPath();
        ctx.moveTo(280 + d * BODY.armX + d * 22, shoulderY + 10);
        ctx.lineTo(280 + d * BODY.armX + d * 19, BODY.handY - 16); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(280 + d * 84, BODY.hipY + 6);
        ctx.lineTo(280 + d * 76, BODY.ankleY - 14); ctx.stroke();
      });

    } else if (kind === 'coat') {
      ctx.fillStyle = mix(main, '#000000', 0.3);
      drawPants(ctx, BODY.ankleY - 6, 32);
      ctx.fillStyle = g;                                        /* 긴 코트 */
      bodicePath(ctx, BODY.kneeY - 30, 118, 16, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.handY - 4, 31, shoulderY);
      ctx.strokeStyle = mix(main, '#000000', 0.35); ctx.lineWidth = 4;
      ctx.beginPath();                                          /* 여밈선 */
      ctx.moveTo(280, shoulderY + 16); ctx.lineTo(280, BODY.kneeY - 34); ctx.stroke();
      ctx.fillStyle = trim;                                     /* 라펠 */
      ctx.beginPath();
      ctx.moveTo(280 - 56, shoulderY + 4); ctx.lineTo(280, BODY.chestY + 30);
      ctx.lineTo(280 + 56, shoulderY + 4);
      ctx.lineTo(280 + 30, shoulderY + 2); ctx.lineTo(280, BODY.chestY - 4);
      ctx.lineTo(280 - 30, shoulderY + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = mix(trim, '#000000', 0.35);               /* 단추 */
      [0, 1, 2].forEach(function (i) {
        ctx.beginPath(); ctx.arc(280, BODY.chestY + 60 + i * 58, 7, 0, Math.PI * 2); ctx.fill();
      });

    } else {                                                    /* tee */
      ctx.fillStyle = mix(main, '#000000', 0.22);               /* 반바지 */
      drawPants(ctx, BODY.kneeY - 40, 40);
      ctx.fillStyle = g;
      bodicePath(ctx, BODY.hipY + 6, BODY.hipHalf, 18, shoulderY); ctx.fill();
      drawSleeves(ctx, BODY.chestY - 18, 29, shoulderY);
      ctx.fillStyle = trim;                                     /* 목단 */
      ctx.beginPath();
      ctx.moveTo(280 - 40, shoulderY + 2);
      ctx.quadraticCurveTo(280, shoulderY + 34, 280 + 40, shoulderY + 2);
      ctx.quadraticCurveTo(280, shoulderY + 18, 280 - 40, shoulderY + 2);
      ctx.closePath(); ctx.fill();
    }
  }

  /* 머리를 전신 캔버스의 제자리에 축소해 그린다 */
  function drawHeadInto(ctx, m, W, H, features) {
    var r = headRect(m, W, H);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(r.w / BW, r.h / BH);
    if (features) {
      var s = shape(m);
      drawNose(ctx, m);
      drawEye(ctx, m, 280 - s.eyeGap, -1);
      drawEye(ctx, m, 280 + s.eyeGap, 1);
      drawBrow(ctx, m, 280 - s.eyeGap, -1);
      drawBrow(ctx, m, 280 + s.eyeGap, 1);
      drawLips(ctx, m);
      hairFrontPath(ctx, m);
    } else {
      drawHairBack(ctx, m);
      drawEars(ctx, m);
      drawSkin(ctx, m);
    }
    ctx.restore();
  }

  function drawFull(ctx, m, W, H) {
    ctx.save();
    ctx.scale((W || FULL_W) / FULL_W, (H || FULL_H) / FULL_H);
    var shoulderY = shoulderFor(m, W || FULL_W, H || FULL_H);
    drawFullBackdrop(ctx, m);
    drawLegs(ctx, m);
    drawShoes(ctx, m);
    /* ⚠ 목 → 몸통 순서. 반대로 그리면 목이 몸통 위에 얹혀 턱과 어깨 사이가
       끊어져 보인다. 몸통이 목 밑동을 덮어야 이어진 것처럼 읽힌다. */
    drawFullNeck(ctx, m, W || FULL_W, H || FULL_H);
    drawTorso(ctx, m, shoulderY);
    drawArms(ctx, m, shoulderY);
    drawOutfit(ctx, m, shoulderY);
    ctx.restore();
    drawHeadInto(ctx, m, W || FULL_W, H || FULL_H, false);
  }

  function drawFullFeatures(ctx, m, W, H) {
    drawHeadInto(ctx, m, W || FULL_W, H || FULL_H, true);
  }

  /* ---------- 전체 ---------- */
  function draw(ctx, m, W, H) {
    if (m && m.mode === 'full') { drawFull(ctx, m, W, H); return; }
    ctx.save();
    ctx.scale((W || BW) / BW, (H || BH) / BH);
    drawBackdrop(ctx, m);
    drawBody(ctx, m);
    drawHairBack(ctx, m);
    drawEars(ctx, m);
    drawSkin(ctx, m);
    ctx.restore();
  }

  /* 메이크업을 올린 뒤 그리는 이목구비 — 색조 위에 선이 살아야 한다 */
  function drawFeatures(ctx, m, W, H) {
    if (m && m.mode === 'full') { drawFullFeatures(ctx, m, W, H); return; }
    ctx.save();
    ctx.scale((W || BW) / BW, (H || BH) / BH);
    var s = shape(m);
    drawNose(ctx, m);
    drawEye(ctx, m, 280 - s.eyeGap, -1);
    drawEye(ctx, m, 280 + s.eyeGap, 1);
    drawBrow(ctx, m, 280 - s.eyeGap, -1);
    drawBrow(ctx, m, 280 + s.eyeGap, 1);
    drawLips(ctx, m);
    hairFrontPath(ctx, m);
    ctx.restore();
  }

  function clip(ctx, m, W, H) {
    if (m && m.mode === 'full') {
      var r = headRect(m, W, H);
      ctx.translate(r.x, r.y);
      ctx.scale(r.w / BW, r.h / BH);
      facePath(ctx, m);
      ctx.scale(BW / r.w, BH / r.h);
      ctx.translate(-r.x, -r.y);
      return;
    }
    ctx.scale((W || BW) / BW, (H || BH) / BH);
    facePath(ctx, m);
    ctx.scale(BW / (W || BW), BH / (H || BH));
  }

  return { draw: draw, drawFeatures: drawFeatures, clip: clip,
           headRect: headRect, option: option,
           FACE_SHAPES: FACE_SHAPES, HAIR_STYLES: HAIR_STYLES,
           HAIR_COLORS: HAIR_COLORS, OUTFITS: OUTFITS, MODES: MODES,
           BASE_W: BW, BASE_H: BH, FULL_W: FULL_W, FULL_H: FULL_H, BODY: BODY,
           NECK_LEN: NECK_LEN, SHAPE: SHAPE,
           EYE_Y: EYE_Y, BROW_Y: BROW_Y, NOSE_Y: NOSE_Y, MOUTH_Y: MOUTH_Y };
});
