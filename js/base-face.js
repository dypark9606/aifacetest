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

  /* 얼굴형별 특징 — 눈 간격, 입 크기, 광대 위치 */
  var SHAPE = {
    round: { eyeGap: 92, chin: 575, cheek: 432, mouthW: 52 },
    oval:  { eyeGap: 90, chin: 588, cheek: 438, mouthW: 50 },
    heart: { eyeGap: 94, chin: 556, cheek: 424, mouthW: 54 },
    long:  { eyeGap: 88, chin: 602, cheek: 448, mouthW: 48 }
  };

  var EYE_Y = 330, BROW_Y = 282, NOSE_Y = 430, MOUTH_Y = 492;

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

  var HAIR_STYLES = [
    { id: 'bob',      label: '단발' },
    { id: 'long',     label: '긴생머리' },
    { id: 'wave',     label: '웨이브' },
    { id: 'short',    label: '숏컷' },
    { id: 'ponytail', label: '포니테일' },
    { id: 'twintail', label: '양갈래' },
    { id: 'bun',      label: '올림머리' },
    { id: 'curly',    label: '곱슬' }
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
  var OUTFITS = [
    { id: 'tee',     label: '티셔츠',   kind: 'tee',    main: '#f2a7c3', trim: '#ffffff' },
    { id: 'dress',   label: '원피스',   kind: 'dress',  main: '#8f7ad6', trim: '#f6e7ff' },
    { id: 'hoodie',  label: '후드티',   kind: 'hoodie', main: '#5f7f9e', trim: '#dfe9f3' },
    { id: 'hanbok',  label: '한복',     kind: 'hanbok', main: '#d94f5c', trim: '#f3e3b8' },
    { id: 'uniform', label: '교복',     kind: 'uniform',main: '#33405e', trim: '#f0f2f7' },
    { id: 'idol',    label: '무대의상', kind: 'idol',   main: '#1f1b33', trim: '#ffd166' },
    { id: 'sporty',  label: '운동복',   kind: 'sporty', main: '#2f9e6e', trim: '#ffffff' },
    { id: 'coat',    label: '코트',     kind: 'coat',   main: '#b3805a', trim: '#e8d7c4' }
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
  function drawHairBack(ctx, m) {
    var fill = hairGradient(ctx)(m);
    ctx.fillStyle = fill;

    /* 묶은 머리는 머리 덩어리를 먼저 그린다(머리통 뒤로 깔린다) */
    if (m.hairStyle === 'ponytail') {
      ctx.beginPath();                                   /* 뒤로 넘긴 꼬리 */
      ctx.moveTo(408, 250);
      ctx.bezierCurveTo(486, 268, 508, 380, 486, 486);
      ctx.bezierCurveTo(474, 552, 452, 590, 430, 612);
      ctx.quadraticCurveTo(414, 566, 420, 512);
      ctx.bezierCurveTo(428, 430, 430, 330, 396, 288);
      ctx.closePath(); ctx.fill();
    } else if (m.hairStyle === 'twintail') {
      [[126, -1], [434, 1]].forEach(function (p) {       /* 양쪽 갈래 */
        var x = p[0], d = p[1];
        ctx.beginPath();
        ctx.moveTo(x, 246);
        ctx.bezierCurveTo(x + d * 62, 268, x + d * 74, 380, x + d * 54, 474);
        ctx.bezierCurveTo(x + d * 44, 524, x + d * 24, 552, x, 566);
        ctx.bezierCurveTo(x - d * 18, 520, x - d * 10, 400, x - d * 22, 300);
        ctx.closePath(); ctx.fill();
      });
    } else if (m.hairStyle === 'curly') {
      for (var c = 0; c < 16; c++) {                     /* 곱슬 뭉치 */
        var ang = Math.PI * (0.06 + 0.92 * (c / 15));
        var cx = 280 - Math.cos(ang) * 196, cy = 330 - Math.sin(ang) * 250;
        ctx.beginPath(); ctx.arc(cx, cy, 56 + (c % 3) * 9, 0, Math.PI * 2); ctx.fill();
      }
      for (var c2 = 0; c2 < 8; c2++) {
        ctx.beginPath();
        ctx.arc(150 + c2 * 37, 470 + ((c2 % 3) - 1) * 26, 50, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.beginPath();
    if (m.hairStyle === 'short') {
      ctx.moveTo(280, 74);
      ctx.bezierCurveTo(148, 74, 106, 196, 118, 312);
      ctx.bezierCurveTo(124, 372, 146, 404, 160, 420);
      ctx.lineTo(400, 420);
      ctx.bezierCurveTo(414, 404, 436, 372, 442, 312);
      ctx.bezierCurveTo(454, 196, 412, 74, 280, 74);
    } else if (m.hairStyle === 'bob') {
      ctx.moveTo(280, 70);
      ctx.bezierCurveTo(140, 70, 96, 200, 106, 330);
      ctx.bezierCurveTo(112, 418, 130, 470, 148, 508);
      ctx.quadraticCurveTo(196, 496, 214, 470);
      ctx.lineTo(346, 470);
      ctx.quadraticCurveTo(364, 496, 412, 508);
      ctx.bezierCurveTo(430, 470, 448, 418, 454, 330);
      ctx.bezierCurveTo(464, 200, 420, 70, 280, 70);
    } else if (m.hairStyle === 'wave') {
      ctx.moveTo(280, 66);
      ctx.bezierCurveTo(128, 66, 86, 210, 96, 348);
      ctx.bezierCurveTo(102, 446, 82, 528, 104, 640);
      ctx.quadraticCurveTo(150, 610, 168, 540);
      ctx.quadraticCurveTo(186, 470, 196, 430);
      ctx.lineTo(364, 430);
      ctx.quadraticCurveTo(374, 470, 392, 540);
      ctx.quadraticCurveTo(410, 610, 456, 640);
      ctx.bezierCurveTo(478, 528, 458, 446, 464, 348);
      ctx.bezierCurveTo(474, 210, 432, 66, 280, 66);
    } else if (m.hairStyle === 'ponytail' || m.hairStyle === 'bun') {
      /* 묶은 머리는 옆으로 흐르는 머리가 없어 머리통에 붙는다 */
      ctx.moveTo(280, 72);
      ctx.bezierCurveTo(158, 72, 116, 194, 122, 306);
      ctx.bezierCurveTo(126, 368, 146, 402, 162, 424);
      ctx.lineTo(398, 424);
      ctx.bezierCurveTo(414, 402, 434, 368, 438, 306);
      ctx.bezierCurveTo(444, 194, 402, 72, 280, 72);
    } else if (m.hairStyle === 'twintail') {
      ctx.moveTo(280, 70);
      ctx.bezierCurveTo(150, 70, 110, 196, 118, 316);
      ctx.bezierCurveTo(122, 378, 142, 416, 158, 442);
      ctx.lineTo(402, 442);
      ctx.bezierCurveTo(418, 416, 438, 378, 442, 316);
      ctx.bezierCurveTo(450, 196, 410, 70, 280, 70);
    } else if (m.hairStyle === 'curly') {
      ctx.moveTo(280, 78);
      ctx.bezierCurveTo(152, 78, 112, 200, 120, 320);
      ctx.bezierCurveTo(126, 396, 148, 440, 166, 468);
      ctx.lineTo(394, 468);
      ctx.bezierCurveTo(412, 440, 434, 396, 440, 320);
      ctx.bezierCurveTo(448, 200, 408, 78, 280, 78);
    } else {
      ctx.moveTo(280, 66);
      ctx.bezierCurveTo(126, 66, 88, 206, 98, 344);
      ctx.bezierCurveTo(104, 452, 96, 552, 112, 648);
      ctx.quadraticCurveTo(158, 626, 178, 552);
      ctx.lineTo(382, 552);
      ctx.quadraticCurveTo(402, 626, 448, 648);
      ctx.bezierCurveTo(464, 552, 456, 452, 462, 344);
      ctx.bezierCurveTo(472, 206, 434, 66, 280, 66);
    }
    ctx.closePath(); ctx.fill();

    /* 올림머리 덩어리와 묶음 머리끈은 머리통 위에 얹는다 */
    if (m.hairStyle === 'bun') {
      ctx.beginPath(); ctx.ellipse(280, 68, 78, 58, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = mix(m.hair, '#ffffff', 0.5);
      ctx.lineWidth = 3;
      for (var b = 0; b < 5; b++) {
        ctx.beginPath(); ctx.ellipse(280, 68, 22 + b * 13, 16 + b * 10, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    if (m.hairStyle === 'ponytail') {
      ctx.fillStyle = mix(m.hair, '#000000', 0.35);
      ctx.beginPath(); ctx.ellipse(404, 262, 20, 15, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    if (m.hairStyle === 'twintail') {
      ctx.fillStyle = mix(m.hair, '#000000', 0.35);
      ctx.beginPath();
      ctx.ellipse(140, 258, 17, 13, 0.4, 0, Math.PI * 2);
      ctx.ellipse(420, 258, 17, 13, -0.4, 0, Math.PI * 2);
      ctx.fill();
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
       넓고 아주 옅게 깔고, 코끝 주변에서만 형태를 잡는다. */
    soft(ctx, 264, NOSE_Y - 28, 20, 62, m.skinShadow, 0.16);       /* 콧대 왼쪽 음영 */
    soft(ctx, 297, NOSE_Y - 28, 20, 62, m.skinShadow, 0.10);       /* 콧대 오른쪽(광원쪽) */
    soft(ctx, 281, NOSE_Y - 30, 12, 54, '#ffffff', 0.13);          /* 콧대 하이라이트 */
    soft(ctx, 280, NOSE_Y + 6, 26, 14, m.skinShadow, 0.22);        /* 코끝 아래 */
    soft(ctx, 280, NOSE_Y - 6, 13, 9, '#ffffff', 0.22);            /* 코끝 광 */
    ctx.strokeStyle = 'rgba(140,88,66,.55)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();                                               /* 콧방울 */
    ctx.moveTo(262, NOSE_Y + 2); ctx.quadraticCurveTo(270, NOSE_Y + 12, 280, NOSE_Y + 9);
    ctx.quadraticCurveTo(290, NOSE_Y + 12, 298, NOSE_Y + 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,74,56,.5)';
    ctx.beginPath(); ctx.ellipse(268, NOSE_Y + 6, 4, 2.6, -0.3, 0, Math.PI * 2);
    ctx.ellipse(292, NOSE_Y + 6, 4, 2.6, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------- 눈 ---------- */
  function eyeShape(ctx, cx, cy, dir, style) {
    var w = 52, inner = cx - dir * w, outer = cx + dir * w;
    var topLift = style === 'cat' ? 30 : style === 'doe' ? 36 : style === 'cool' ? 22 : 33;
    var tail = style === 'cat' ? -12 : style === 'doe' ? 2 : style === 'cool' ? -6 : 0;
    var bottom = style === 'doe' ? 26 : style === 'cool' ? 17 : 22;
    ctx.beginPath();
    ctx.moveTo(inner, cy + 2);
    ctx.bezierCurveTo(cx - dir * 26, cy - topLift, cx + dir * 24, cy - topLift + 4, outer, cy + tail);
    ctx.bezierCurveTo(cx + dir * 22, cy + bottom, cx - dir * 26, cy + bottom - 4, inner, cy + 2);
    ctx.closePath();
  }

  function drawEye(ctx, m, cx, dir) {
    var cy = EYE_Y, style = m.eye;
    /* 눈두덩 음영 */
    soft(ctx, cx, cy - 24, 52, 24, mix(m.skinShadow, '#9c6248', 0.25), 0.30);
    /* 흰자 */
    ctx.save(); eyeShape(ctx, cx, cy, dir, style); ctx.clip();
    var wg = ctx.createLinearGradient(0, cy - 30, 0, cy + 26);
    wg.addColorStop(0, '#ddd2cf'); wg.addColorStop(0.4, '#fdfbfa'); wg.addColorStop(1, '#f0e7e4');
    ctx.fillStyle = wg; ctx.fillRect(cx - 60, cy - 40, 120, 80);

    /* 홍채 */
    var ix = cx + dir * 2, iy = cy + 1, ir = style === 'doe' ? 22 : style === 'cool' ? 18 : 20;
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
    ctx.strokeStyle = '#2a1c16'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    eyeShape(ctx, cx, cy, dir, style); ctx.stroke();
    var lashes = [[0.62, 20], [0.8, 24], [0.95, 22], [1.06, 16]];
    lashes.forEach(function (l) {
      var t = l[0], len = l[1];
      var bx = cx + dir * (t * 44), by = cy - (style === 'cool' ? 16 : 21) + Math.abs(t - 0.8) * 12;
      ctx.lineWidth = 3.4;
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
    /* 형태 */
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx - dir * 46, y + 8);
    ctx.quadraticCurveTo(cx + dir * 2, y - 13, cx + dir * 48, y + 2);
    ctx.stroke();
    /* 결 */
    ctx.lineWidth = 1.6; ctx.globalAlpha = 0.65;
    for (var i = 0; i < 12; i++) {
      var t = i / 11, bx = cx + dir * (-46 + 94 * t);
      var by = y + 8 - 20 * Math.sin(Math.PI * t) + 3 * t;
      ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(bx + dir * 5, by - 5); ctx.stroke();
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

    function lipPath() {
      ctx.beginPath();
      ctx.moveTo(280 - w, y);
      ctx.quadraticCurveTo(280 - w * 0.6, y - 15, 280 - w * 0.22, y - 7);   /* 큐피드 활 왼쪽 */
      ctx.quadraticCurveTo(280, y - 14, 280 + w * 0.22, y - 7);
      ctx.quadraticCurveTo(280 + w * 0.6, y - 15, 280 + w, y);
      ctx.quadraticCurveTo(280 + w * 0.55, y + 28, 280, y + 31);
      ctx.quadraticCurveTo(280 - w * 0.55, y + 28, 280 - w, y);
      ctx.closePath();
    }
    lipPath();
    var lg = ctx.createLinearGradient(0, y - 16, 0, y + 32);
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
  function hairFrontPath(ctx, m) {
    ctx.fillStyle = hairGradient(ctx)(m);
    ctx.beginPath();
    if (m.hairStyle === 'short') {
      ctx.moveTo(118, 286);
      ctx.bezierCurveTo(122, 150, 196, 74, 286, 74);
      ctx.bezierCurveTo(392, 74, 444, 158, 442, 288);
      ctx.quadraticCurveTo(414, 196, 340, 170);
      ctx.quadraticCurveTo(300, 232, 256, 196);
      ctx.quadraticCurveTo(196, 210, 160, 262);
      ctx.quadraticCurveTo(140, 276, 118, 286);
    } else if (m.hairStyle === 'bob') {
      ctx.moveTo(106, 300);
      ctx.bezierCurveTo(108, 146, 186, 70, 280, 70);
      ctx.bezierCurveTo(378, 70, 452, 150, 454, 300);
      ctx.quadraticCurveTo(432, 206, 372, 168);
      ctx.quadraticCurveTo(322, 228, 268, 206);
      ctx.quadraticCurveTo(188, 214, 140, 268);
      ctx.quadraticCurveTo(122, 284, 106, 300);
    } else if (m.hairStyle === 'wave') {
      ctx.moveTo(96, 310);
      ctx.bezierCurveTo(100, 150, 180, 66, 280, 66);
      ctx.bezierCurveTo(384, 66, 460, 152, 464, 310);
      ctx.quadraticCurveTo(440, 200, 386, 160);
      ctx.quadraticCurveTo(332, 226, 262, 190);
      ctx.quadraticCurveTo(178, 200, 132, 272);
      ctx.quadraticCurveTo(112, 292, 96, 310);
    } else if (m.hairStyle === 'ponytail' || m.hairStyle === 'bun') {
      /* 이마를 드러내고 옆으로 빗어 넘긴 앞머리 */
      ctx.moveTo(122, 300);
      ctx.bezierCurveTo(124, 152, 190, 72, 280, 72);
      ctx.bezierCurveTo(376, 72, 440, 156, 438, 300);
      ctx.quadraticCurveTo(424, 206, 372, 168);
      ctx.quadraticCurveTo(300, 130, 206, 176);
      ctx.quadraticCurveTo(152, 212, 122, 300);
    } else if (m.hairStyle === 'twintail') {
      ctx.moveTo(118, 306);
      ctx.bezierCurveTo(120, 150, 190, 70, 280, 70);
      ctx.bezierCurveTo(378, 70, 442, 154, 442, 306);
      ctx.quadraticCurveTo(420, 198, 356, 166);
      ctx.quadraticCurveTo(306, 226, 248, 190);
      ctx.quadraticCurveTo(174, 200, 138, 268);
      ctx.quadraticCurveTo(126, 288, 118, 306);
    } else if (m.hairStyle === 'curly') {
      /* 곱슬은 직선 대신 둥근 뭉치가 이어지는 실루엣 */
      ctx.moveTo(120, 312);
      ctx.bezierCurveTo(122, 156, 192, 78, 280, 78);
      ctx.bezierCurveTo(374, 78, 440, 158, 440, 312);
      ctx.quadraticCurveTo(414, 232, 380, 214);
      ctx.quadraticCurveTo(350, 254, 316, 220);
      ctx.quadraticCurveTo(286, 258, 250, 216);
      ctx.quadraticCurveTo(214, 254, 184, 216);
      ctx.quadraticCurveTo(146, 240, 120, 312);
    } else {
      ctx.moveTo(98, 306);
      ctx.bezierCurveTo(102, 148, 180, 66, 280, 66);
      ctx.bezierCurveTo(382, 66, 458, 150, 462, 306);
      ctx.quadraticCurveTo(436, 198, 368, 162);
      ctx.quadraticCurveTo(318, 214, 250, 188);
      ctx.quadraticCurveTo(176, 198, 134, 268);
      ctx.quadraticCurveTo(114, 288, 98, 306);
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

    if (kind === 'dress') {
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
