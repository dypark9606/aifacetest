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

  /* ---------- 뒷머리 ---------- */
  function drawHairBack(ctx, m) {
    ctx.fillStyle = hairGradient(ctx)(m);
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

  /* ---------- 전체 ---------- */
  function draw(ctx, m, W, H) {
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
    ctx.scale((W || BW) / BW, (H || BH) / BH);
    facePath(ctx, m);
    ctx.scale(BW / (W || BW), BH / (H || BH));
  }

  return { draw: draw, drawFeatures: drawFeatures, clip: clip,
           BASE_W: BW, BASE_H: BH, SHAPE: SHAPE,
           EYE_Y: EYE_Y, BROW_Y: BROW_Y, NOSE_Y: NOSE_Y, MOUTH_Y: MOUTH_Y };
});
