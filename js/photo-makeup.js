/* photo-makeup.js — 내 사진에 실제로 화장을 얹는다.
 *
 * 그린 캐릭터에 화장하던 옛 방식(메이크업 배틀)은 2026-09-16 삭제됐다.
 * 아무리 다듬어도 "사람 같다"가 안 나와서, 내 사진에 직접 바르는 쪽으로 갈아탔다.
 * 여기서는 MediaPipe FaceMesh 468점을 받아 **내 얼굴의 진짜 좌표**에
 * 립틴트·눈썹·볼터치·아이섀도를 칠한다. 그래서 "나한테 발라보는" 느낌이 난다.
 *
 * ⚠ 사진은 어디로도 전송되지 않는다. 전부 브라우저 안 canvas 에서 끝난다.
 *   (이 규칙은 앱 전체 약속이다. fetch/XHR 로 이미지를 보내는 코드를 넣지 말 것.)
 *
 *   var res = await PhotoMakeup.analyze(file);   // {canvas, pts, warn}
 *   PhotoMakeup.render(res, look);               // look = {lip:{value,level}, ...}
 *
 * 설계 원칙 — 그림이 아니라 **사진 보정**이다:
 *   1) 선을 긋지 않는다. 사람 얼굴엔 검은 윤곽선이 없다.
 *   2) 색은 곱셈/소프트라이트로 얹는다. 덮어 칠하면 스티커가 된다.
 *   3) 경계는 반드시 흐린다(feather). 또렷한 경계 = 색종이 오린 자국.
 *   4) 피부 질감(모공·명암)이 비쳐야 한다 → 알파는 낮게, 블렌드로 승부.
 */
(function (global) {
  'use strict';

  var PM = {};

  /* ══════════ 1) 부위별 랜드마크 ══════════
     FaceMesh 표준 번호다. 바꾸지 말 것 — 모델이 정한 번호다. */
  var L = {
    /* 윗입술 바깥 → 아랫입술 바깥 (닫힌 고리) */
    lipOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
               375, 321, 405, 314, 17, 84, 181, 91, 146],
    /* 입 안쪽 — 치아·입안은 칠하면 안 된다 */
    lipInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
               324, 318, 402, 317, 14, 87, 178, 88, 95],
    browL: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    browR: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    eyeL: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    eyeR: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    /* 눈두덩(아이섀도가 올라가는 자리) — 눈 위 눈꺼풀 */
    lidL: [226, 247, 30, 29, 27, 28, 56, 190, 133, 173, 157, 158, 159, 160, 161, 246, 33],
    lidR: [446, 467, 260, 259, 257, 258, 286, 414, 362, 398, 384, 385, 386, 387, 388, 466, 263],
    cheekL: 50, cheekR: 280,
    eyeOuterL: 33, eyeOuterR: 263,
    noseTip: 1, chin: 152, foreheadTop: 10
  };

  function pt(pts, i) { return pts[i]; }

  function polyPath(ctx, pts, idx) {
    ctx.beginPath();
    idx.forEach(function (k, n) {
      var p = pts[k];
      if (n === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  }

  function centroid(pts, idx) {
    var x = 0, y = 0;
    idx.forEach(function (k) { x += pts[k].x; y += pts[k].y; });
    return { x: x / idx.length, y: y / idx.length };
  }

  function faceWidth(pts) {
    return Math.abs(pts[454].x - pts[234].x);
  }

  /* ══════════ 2) 색 ══════════
     화장품처럼 **제품명**으로 고른다. 실제 틴트/섀도 색에 맞춘 값이다. */
  var PRODUCTS = {
    lip: [
      { id: 'coral',  label: '코랄 틴트',   hex: '#f2624f' },
      { id: 'rose',   label: '로즈 틴트',   hex: '#d9506b' },
      { id: 'berry',  label: '베리 틴트',   hex: '#a83254' },
      { id: 'red',    label: '클래식 레드', hex: '#cf2233' },
      { id: 'peach',  label: '피치 틴트',   hex: '#f0836b' },
      { id: 'mlbb',   label: '입술빛 누드', hex: '#c0705f' }
    ],
    blush: [
      { id: 'peach',   label: '피치 블러셔', hex: '#f59274' },
      { id: 'pink',    label: '핑크 블러셔', hex: '#f2809c' },
      { id: 'coral',   label: '코랄 블러셔', hex: '#f4735f' },
      { id: 'lavender',label: '라벤더',      hex: '#c39ad6' }
    ],
    eye: [
      { id: 'brown',  label: '브라운 섀도',  hex: '#8a5a3c' },
      { id: 'peach',  label: '피치 섀도',    hex: '#e0997c' },
      { id: 'pink',   label: '핑크 섀도',    hex: '#d97f96' },
      { id: 'purple', label: '퍼플 섀도',    hex: '#8f6aa8' },
      { id: 'gold',   label: '골드 글리터',  hex: '#c9a14e' }
    ],
    brow: [
      { id: 'soft',   label: '소프트 브라운', hex: '#7a5238' },
      { id: 'dark',   label: '다크 브라운',   hex: '#4e3323' },
      { id: 'gray',   label: '그레이 브라운', hex: '#6a5a50' },
      { id: 'black',  label: '블랙',          hex: '#332821' }
    ]
  };
  PM.PRODUCTS = PRODUCTS;

  /* 눈 크기(확대) 는 색이 아니라 강도만 있다 */
  PM.PARTS = [
    { key: 'lip',     label: '립 틴트',   kind: 'color' },
    { key: 'blush',   label: '볼터치',    kind: 'color' },
    { key: 'eye',     label: '아이섀도',  kind: 'color' },
    { key: 'brow',    label: '눈썹',      kind: 'color' },
    { key: 'eyesize', label: '눈 크게',   kind: 'amount' },
    { key: 'glow',    label: '피부 광',   kind: 'amount' }
  ];

  /* ⚠ 기본값은 낮게 둔다. 처음 열었을 때 진하면 "가짜 같다"가 첫인상이 된다.
     사용자가 올리는 건 쉽지만, 과한 걸 보고 나면 안 돌아온다. */
  PM.defaultLook = function () {
    return {
      lip:     { value: 'coral',  level: 38 },
      blush:   { value: 'peach',  level: 22 },
      eye:     { value: 'brown',  level: 18 },
      brow:    { value: 'soft',   level: 25 },
      eyesize: { level: 0 },
      glow:    { level: 15 }
    };
  };

  function hexOf(part, id) {
    var list = PRODUCTS[part] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].hex;
    return list.length ? list[0].hex : '#000000';
  }
  PM.hexOf = hexOf;

  /* ══════════ 3) 사진 읽기 + 랜드마크 ══════════ */
  PM.analyze = function (file) {
    if (!global.FM) return Promise.reject(new Error('facemesh.js 가 필요합니다'));
    var FM = global.FM;
    return FM.fileToCanvas(file, 900).then(function (cv) {
      return FM.detect(cv).then(function (pts) {
        if (!pts) return { canvas: cv, pts: null, warn: '얼굴을 찾지 못했어요. 정면 사진을 써 주세요.' };
        return { canvas: cv, pts: pts, warn: FM.check(pts, cv) };
      });
    });
  };

  /* ══════════ 4) 화장 그리기 ══════════
     핵심: 하나하나가 **사진 보정**이라 blend mode 와 흐림이 전부다. */

  /* 임시 레이어를 만들어 흐린 뒤 원본에 합성한다.
     canvas 의 filter:blur 는 경계를 자연스럽게 만드는 유일한 수단이다. */
  function layer(base, blurPx, blend, alpha, drawFn) {
    var t = document.createElement('canvas');
    t.width = base.width; t.height = base.height;
    var g = t.getContext('2d');
    drawFn(g);
    var out = base.getContext('2d');
    out.save();
    out.globalCompositeOperation = blend;
    out.globalAlpha = alpha;
    if (blurPx > 0 && 'filter' in out) out.filter = 'blur(' + blurPx + 'px)';
    out.drawImage(t, 0, 0);
    out.restore();
  }

  /* --- 립틴트 ---
     ⚠ 입술만 정확히, 그리고 입 안(치아)은 빼야 한다.
     틴트는 'multiply' 라야 입술 주름과 명암이 살아 남는다. */
  function drawLip(base, pts, color, level) {
    if (level <= 0) return;
    var w = faceWidth(pts);
    layer(base, w * 0.012, 'multiply', Math.min(0.85, level / 100 * 0.85), function (g) {
      g.fillStyle = color;
      polyPath(g, pts, L.lipOuter);
      g.fill();
      /* 입 안쪽은 지운다 — 치아에 색이 묻으면 즉시 가짜로 보인다 */
      g.globalCompositeOperation = 'destination-out';
      polyPath(g, pts, L.lipInner);
      g.fill();
    });
    /* 촉촉한 윤기 — 아랫입술 가운데만 아주 약하게 */
    if (level > 40) {
      var c = centroid(pts, L.lipOuter);
      layer(base, w * 0.02, 'screen', (level - 40) / 60 * 0.22, function (g) {
        var r = w * 0.045;
        var grd = g.createRadialGradient(c.x, c.y + r * 0.5, 0, c.x, c.y + r * 0.5, r);
        grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(c.x - r, c.y - r * 0.5, r * 2, r * 2);
      });
    }
  }

  /* --- 볼터치 ---
     광대 바깥쪽에 크고 흐리게. 작고 진하면 볼에 스티커를 붙인 꼴이 된다. */
  function drawBlush(base, pts, color, level) {
    if (level <= 0) return;
    var w = faceWidth(pts);
    var r = w * 0.17;
    [L.cheekL, L.cheekR].forEach(function (k) {
      var p = pts[k];
      layer(base, w * 0.05, 'multiply', level / 100 * 0.42, function (g) {
        var grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grd.addColorStop(0, color);
        grd.addColorStop(0.55, color);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
      });
    });
  }

  /* --- 아이섀도 ---
     눈두덩(눈 위 눈꺼풀)에만. 눈동자를 덮으면 멍든 것처럼 보인다.
     ⚠ FaceMesh 의 '눈꺼풀' 점들(226,247,30...)은 눈 바로 가장자리라
       눈 폴리곤과 면적이 거의 같다(실측 눈두덩 75 vs 눈 77 → 빼면 0).
       그래서 랜드마크를 그대로 쓰면 섀도가 **한 픽셀도 안 보인다**.
       실제 아이섀도는 눈 위 눈두덩까지 올라가므로, 눈 윗라인을 위로
       밀어 올려 직접 영역을 만든다. */
  function drawEyeShadow(base, pts, color, level) {
    if (level <= 0) return;
    var w = faceWidth(pts);
    /* 눈 윗라인(안쪽→바깥쪽)과 아랫라인을 나눠 쓴다 */
    var lids = [
      { top: [133, 173, 157, 158, 159, 160, 161, 246, 33], eye: L.eyeL },
      { top: [362, 398, 384, 385, 386, 387, 388, 466, 263], eye: L.eyeR }
    ];
    var lift = w * 0.055;   /* 눈두덩 높이 — 얼굴 폭의 5.5% */

    lids.forEach(function (o) {
      layer(base, w * 0.028, 'multiply', level / 100 * 0.55, function (g) {
        g.fillStyle = color;
        g.beginPath();
        /* 아래: 눈 윗라인 그대로 */
        o.top.forEach(function (k, n) {
          var p = pts[k];
          if (n === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        });
        /* 위: 같은 라인을 위로 밀어 올려 되돌아온다 → 눈두덩 띠가 생긴다.
           ⚠ 가운데를 가장 높게(sin) 만들면 아이홀 전체가 고르게 덮여
           눈이 움푹 꺼진 그림자처럼 보인다. 실제 아이섀도는 **눈꼬리 쪽이
           두껍고 눈머리 쪽은 거의 없다**. 그래서 바깥으로 갈수록 두껍게 한다.
           (o.top 은 안쪽 133 → 바깥 33 순서라 t 가 커질수록 눈꼬리다) */
        for (var i = o.top.length - 1; i >= 0; i--) {
          var p2 = pts[o.top[i]];
          var t = i / (o.top.length - 1);
          var taper = 0.18 + 0.82 * Math.pow(t, 1.3);
          g.lineTo(p2.x, p2.y - lift * taper);
        }
        g.closePath();
        g.fill();
        /* 눈알은 빼낸다 — 흰자·홍채에 색이 묻으면 멍처럼 보인다 */
        g.globalCompositeOperation = 'destination-out';
        polyPath(g, pts, o.eye);
        g.fill();
      });
    });
  }

  /* --- 눈썹 ---
     빈 곳을 메우는 정도. 진하게 칠하면 그려 붙인 눈썹이 된다. */
  function drawBrow(base, pts, color, level) {
    if (level <= 0) return;
    var w = faceWidth(pts);
    [L.browL, L.browR].forEach(function (idx) {
      layer(base, w * 0.012, 'multiply', level / 100 * 0.5, function (g) {
        g.fillStyle = color;
        polyPath(g, pts, idx);
        g.fill();
      });
    });
  }

  /* --- 피부 광 (글로우) ---
     T존과 광대에 부드러운 빛. 과하면 기름진 얼굴이 된다. */
  function drawGlow(base, pts, level) {
    if (level <= 0) return;
    var w = faceWidth(pts);
    var spots = [
      { p: pts[L.foreheadTop], r: w * 0.20, y: w * 0.10 },
      { p: pts[L.noseTip],     r: w * 0.08, y: -w * 0.02 },
      { p: pts[L.cheekL],      r: w * 0.13, y: -w * 0.02 },
      { p: pts[L.cheekR],      r: w * 0.13, y: -w * 0.02 },
      { p: pts[L.chin],        r: w * 0.08, y: -w * 0.03 }
    ];
    layer(base, w * 0.05, 'screen', level / 100 * 0.30, function (g) {
      spots.forEach(function (s) {
        var cx = s.p.x, cy = s.p.y + s.y;
        var grd = g.createRadialGradient(cx, cy, 0, cx, cy, s.r);
        grd.addColorStop(0, 'rgba(255,248,240,0.9)');
        grd.addColorStop(1, 'rgba(255,248,240,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(cx, cy, s.r, 0, Math.PI * 2); g.fill();
      });
    });
  }

  /* --- 눈 크게 ---
     눈 주변 픽셀을 바깥으로 살짝 밀어 확대한다.
     ⚠ 이건 색이 아니라 **기하 변형**이라 원본 픽셀을 다시 그려야 한다.
     과하면 얼굴이 일그러지므로 최대 12%까지만. */
  function enlargeEyes(base, pts, level) {
    if (level <= 0) return;
    var scale = 1 + (level / 100) * 0.12;
    var w = faceWidth(pts);
    var src = document.createElement('canvas');
    src.width = base.width; src.height = base.height;
    src.getContext('2d').drawImage(base, 0, 0);
    var out = base.getContext('2d');

    [[L.eyeL, L.lidL], [L.eyeR, L.lidR]].forEach(function (pair) {
      var c = centroid(pts, pair[0]);
      var r = w * 0.13;
      out.save();
      /* 눈 주변 원형만 확대해 덮어 그린다. 경계는 흐려 티가 안 나게. */
      out.beginPath();
      out.arc(c.x, c.y, r, 0, Math.PI * 2);
      out.clip();
      if ('filter' in out) out.filter = 'none';
      out.translate(c.x, c.y);
      out.scale(scale, scale);
      out.translate(-c.x, -c.y);
      out.drawImage(src, 0, 0);
      out.restore();
    });
  }

  /* ══════════ 5) 전체 렌더 ══════════ */
  PM.render = function (target, res, look) {
    var g = target.getContext('2d');
    target.width = res.canvas.width;
    target.height = res.canvas.height;
    g.clearRect(0, 0, target.width, target.height);
    g.drawImage(res.canvas, 0, 0);
    if (!res.pts) return false;
    var pts = res.pts;

    /* ⚠ 순서가 중요하다.
       1) 눈 확대는 기하 변형이라 **색보다 먼저** 해야 한다.
          나중에 하면 이미 칠한 화장까지 같이 늘어나 뭉갠다.
       2) 피부 광 → 볼터치 → 섀도 → 눈썹 → 립 순.
          피부 위에 색조가 얹히는 실제 화장 순서와 같다. */
    enlargeEyes(target, pts, (look.eyesize || {}).level || 0);
    drawGlow(target, pts, (look.glow || {}).level || 0);
    drawBlush(target, pts, hexOf('blush', look.blush.value), look.blush.level);
    drawEyeShadow(target, pts, hexOf('eye', look.eye.value), look.eye.level);
    drawBrow(target, pts, hexOf('brow', look.brow.value), look.brow.level);
    drawLip(target, pts, hexOf('lip', look.lip.value), look.lip.level);
    return true;
  };

  /* ══════════ 6) 추천 — 얼굴 비율로 어울리는 조합 고르기 ══════════
     "나한테 뭐가 어울리나"에 답하려면 측정값이 있어야 한다.
     FM.features() 가 이미 얼굴형·눈 크기 등을 재 준다.
     ⚠ 필드 이름은 facemesh.js 의 실제 반환값을 쓴다.
       ratio(세로/가로), eyeOpen(눈 세로/가로), eyeSize, lipThick, browThick, mouthW.
       (faceRatio·eyeRatio·lipRatio 같은 이름은 없다 — 지어내면 전부 undefined 가 되어
        추천이 늘 같은 기본값만 내놓는다.) */
  PM.suggest = function (pts) {
    if (!pts || !global.FM) return null;
    var f = global.FM.features(pts);
    var look = PM.defaultLook();
    var why = [];

    /* 얼굴이 길면(ratio 큼) 볼터치를 가로로 넓게, 둥글면 광대 바깥쪽에 옅게 */
    if (f.ratio > 1.42) {
      look.blush.value = 'peach'; look.blush.level = 38;
      why.push('얼굴선이 갸름해서 볼터치를 가로로 넓게 펴면 균형이 좋아져요.');
    } else {
      look.blush.value = 'coral'; look.blush.level = 26;
      why.push('얼굴선이 부드러워서 볼터치는 광대 바깥쪽에 옅게 두는 게 예뻐요.');
    }

    /* 눈 크기 — eyeOpen 은 눈 세로/가로. 0.30 아래면 작은 편 */
    if (f.eyeOpen < 0.30) {
      look.eye.value = 'brown'; look.eye.level = 32; look.eyesize.level = 28;
      why.push('브라운 섀도를 옅게 펴 바르고 눈을 살짝 키우면 눈매가 또렷해져요.');
    } else {
      look.eye.value = 'peach'; look.eye.level = 18; look.eyesize.level = 0;
      why.push('눈매가 이미 또렷해서 섀도는 아주 옅게만 얹어도 충분해요.');
    }

    /* 입술 두께 — lipThick 은 얼굴 높이 대비. 0.055 아래면 얇은 편 */
    if (f.lipThick < 0.055) {
      look.lip.value = 'coral'; look.lip.level = 52;
      why.push('밝은 코랄 틴트가 입술을 도톰해 보이게 해 줘요.');
    } else {
      look.lip.value = 'rose'; look.lip.level = 44;
      why.push('로즈 틴트가 입술 본래 모양을 차분하게 살려 줘요.');
    }

    /* 눈썹 — browThick 이 얇으면 조금 더 채운다 */
    if (f.browThick < 0.035) {
      look.brow.value = 'soft'; look.brow.level = 42;
      why.push('눈썹이 연한 편이라 소프트 브라운으로 빈 곳만 채우면 인상이 또렷해져요.');
    } else {
      look.brow.value = 'gray'; look.brow.level = 24;
      why.push('눈썹이 또렷해서 그레이 브라운으로 결만 정리하면 돼요.');
    }

    look.glow.level = 22;
    return { look: look, why: why };
  };

  if (typeof module === 'object' && module.exports) module.exports = PM;
  global.PhotoMakeup = PM;
/* ⚠ node 의 모듈 스코프에서 `this` 는 globalThis 가 아니라 module.exports 다.
   `this` 를 넘기면 global.FM 을 못 찾아 PM.suggest 가 늘 null 을 반환한다
   (브라우저에서는 멀쩡해서 테스트를 돌리기 전엔 안 보이는 버그다). */
})(typeof window !== 'undefined' ? window : globalThis);
