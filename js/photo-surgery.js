/* photo-surgery.js — 내 사진으로 해 보는 성형 시뮬레이션
 *
 *   PS.analyze(file)            사진 → { canvas, pts(468점), warn }
 *   PS.render(canvas, res, plan)  계획대로 얼굴을 변형해 그린다
 *   PS.metrics(pts)             얼굴 비율 재기 (고개 기울기 보정)
 *   PS.compare(myPts, tgtPts)   목표 얼굴과 비교 → 필요한 시술 목록
 *   PS.defaultPlan()            전부 0 인 계획
 *
 * ── 어떻게 변형하나 ────────────────────────────────────────────
 * 성형외과 상담에서 쓰는 '모핑'과 같은 방식이다. 얼굴 위에 **손잡이(handle)**
 * 를 몇 개 놓고, 그 주변 픽셀만 부드럽게 끌어당긴다(리퀴파이).
 * 손잡이는 두 종류뿐이다.
 *   move  : 그 점을 d 만큼 민다            (트임·입꼬리·턱끝 등)
 *   scale : 그 점을 중심으로 s 배 키운다   (눈 크기·입술 볼륨 등)
 * 멀어질수록 힘이 0 이 되게(falloff) 섞으므로 얼굴이 찢어지지 않는다.
 *
 * ⚠ 정면 사진 한 장으로는 **앞뒤(깊이)** 를 바꿀 수 없다.
 *   콧대 높이·돌출입·무턱 같은 것은 원래 옆모습에서 보이는 변화다.
 *   여기서는 정면에서 실제로 보이는 몫(그림자·폭·길이)만 흉내 내고,
 *   설명에 그 한계를 적어 둔다. 과장해서 보여 주면 거짓말이 된다.
 *
 * ⚠ 사진은 기기 밖으로 나가지 않는다. 전부 브라우저 안에서 처리한다.
 */
(function (global) {
  'use strict';

  var PS = {};
  var FM = global.FM;

  /* ══════════ 1) 쓰는 랜드마크 ══════════ */
  var L = {
    eyeL: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    eyeR: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267,
           0, 37, 39, 40, 185],
    eyeOuterL: 33, eyeInnerL: 133,
    eyeOuterR: 263, eyeInnerR: 362,
    eyeTopL: 159, eyeBotL: 145,
    eyeTopR: 386, eyeBotR: 374,
    browL: 105, browR: 334,
    noseRoot: 168, noseTip: 1, noseBase: 2,
    alaL: 48, alaR: 278,
    mouthL: 61, mouthR: 291,
    lipTop: 0, lipBot: 17,
    chin: 152, chinL: 148, chinR: 377,
    jawL: 172, jawR: 397,
    wideL: 234, wideR: 454,
    cheekL: 50, cheekR: 280,
    foreheadTop: 10
  };

  function P(pts, i) { return pts[i]; }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mean(pts, idx) {
    var sx = 0, sy = 0;
    idx.forEach(function (i) { sx += pts[i].x; sy += pts[i].y; });
    return { x: sx / idx.length, y: sy / idx.length };
  }
  /* 눈 사이 거리 — 모든 크기의 기준자(尺) */
  function unit(pts) {
    return dist(mean(pts, L.eyeL), mean(pts, L.eyeR)) || 1;
  }

  /* ══════════ 2) 시술 목록 ══════════
   *
   * 성형외과 상담에서 부위별로 실제 나누는 항목을 따랐다.
   *   dir: 'both' = -100~100 (작게↔크게),  'one' = 0~100 (한 방향)
   *   handles(pts, v, u) : v 는 -1~1 로 정규화된 값, u 는 눈사이거리
   */
  var CATALOG = [
    {
      key: 'eye', label: '👁️ 눈', intro: '눈은 인상을 가장 크게 바꾸는 부위예요.',
      items: [
        {
          id: 'eyeSize', label: '눈 크기', dir: 'both',
          op: '쌍꺼풀 · 눈매교정(안검하수)',
          desc: '눈을 위아래로 더 뜨게 만들어 또렷해 보이게 해요.',
          handles: function (pts, v, u) {
            var s = 1 + v * 0.22;
            return [
              { type: 'scale', c: mean(pts, L.eyeL), r: u * 0.62, s: s },
              { type: 'scale', c: mean(pts, L.eyeR), r: u * 0.62, s: s }
            ];
          }
        },
        {
          id: 'eyeFront', label: '앞트임 (눈 사이)', dir: 'both',
          op: '앞트임 · 앞트임 복원',
          desc: '눈 안쪽을 터서 눈이 길어 보이고 사이가 좁아 보여요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.09;
            return [
              { type: 'move', c: P(pts, L.eyeInnerL), r: u * 0.34, d: { x: d, y: 0 } },
              { type: 'move', c: P(pts, L.eyeInnerR), r: u * 0.34, d: { x: -d, y: 0 } }
            ];
          }
        },
        {
          id: 'eyeBack', label: '뒤트임 (눈 길이)', dir: 'both',
          op: '뒤트임 · 밑트임',
          desc: '눈 바깥을 터서 눈이 옆으로 길어 보이게 해요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.10;
            return [
              { type: 'move', c: P(pts, L.eyeOuterL), r: u * 0.38, d: { x: -d, y: 0 } },
              { type: 'move', c: P(pts, L.eyeOuterR), r: u * 0.38, d: { x: d, y: 0 } }
            ];
          }
        },
        {
          id: 'eyeTail', label: '눈꼬리 각도', dir: 'both',
          op: '눈꼬리 올림(캔토펙시) · 내림',
          desc: '올리면 고양이상, 내리면 강아지상에 가까워져요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.085;
            return [
              { type: 'move', c: P(pts, L.eyeOuterL), r: u * 0.42, d: { x: 0, y: -d } },
              { type: 'move', c: P(pts, L.eyeOuterR), r: u * 0.42, d: { x: 0, y: -d } }
            ];
          }
        },
        {
          id: 'aegyo', label: '애교살', dir: 'one',
          op: '애교살 필러 · 지방이식',
          desc: '눈 밑을 도톰하게 해 웃는 인상을 만들어요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.05;
            return [
              { type: 'move', c: P(pts, L.eyeBotL), r: u * 0.30, d: { x: 0, y: d } },
              { type: 'move', c: P(pts, L.eyeBotR), r: u * 0.30, d: { x: 0, y: d } }
            ];
          }
        }
      ]
    },
    {
      key: 'nose', label: '👃 코', intro: '코는 얼굴 한가운데라 조금만 바꿔도 티가 나요.',
      items: [
        {
          id: 'noseAla', label: '콧볼 폭', dir: 'both',
          op: '콧볼(비익) 축소술',
          desc: '콧방울을 안쪽으로 모아 코가 좁아 보이게 해요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.07;
            return [
              { type: 'move', c: P(pts, L.alaL), r: u * 0.34, d: { x: d, y: 0 } },
              { type: 'move', c: P(pts, L.alaR), r: u * 0.34, d: { x: -d, y: 0 } }
            ];
          }
        },
        {
          id: 'noseTipUp', label: '코끝 높이', dir: 'both',
          op: '코끝 성형(비첨성형) · 연골이식',
          desc: '코끝을 들어 올려 코가 짧고 오뚝해 보이게 해요.',
          handles: function (pts, v, u) {
            return [{ type: 'move', c: P(pts, L.noseTip), r: u * 0.45,
                      d: { x: 0, y: -v * u * 0.07 } }];
          }
        },
        {
          id: 'noseBridge', label: '콧대 폭', dir: 'both',
          op: '융비술(콧대 높이기) · 콧대 축소',
          desc: '콧대를 좁히면 정면에서 더 높아 보여요. ' +
                '⚠ 실제 높이는 옆모습 변화라 정면 사진으론 다 못 보여줘요.',
          handles: function (pts, v, u) {
            var c = mid(P(pts, L.noseRoot), P(pts, L.noseTip));
            return [{ type: 'scaleX', c: c, r: u * 0.55, s: 1 - v * 0.16 }];
          }
        },
        {
          id: 'noseLen', label: '코 길이', dir: 'both',
          op: '코 길이 연장 · 단축',
          desc: '코 전체 길이를 조절해요.',
          handles: function (pts, v, u) {
            var c = P(pts, L.noseRoot);
            return [{ type: 'scaleY', c: c, r: u * 0.95, s: 1 + v * 0.12 }];
          }
        }
      ]
    },
    {
      key: 'lip', label: '👄 입', intro: '입은 나이와 분위기를 좌우해요.',
      items: [
        {
          id: 'lipVolume', label: '입술 두께', dir: 'both',
          op: '입술 필러 · 입술 축소술',
          desc: '입술을 도톰하게 하거나 얇게 만들어요.',
          handles: function (pts, v, u) {
            return [{ type: 'scaleY', c: mean(pts, L.lips), r: u * 0.55,
                      s: 1 + v * 0.30 }];
          }
        },
        {
          id: 'mouthWidth', label: '입 크기', dir: 'both',
          op: '입꼬리 성형 · 입 축소',
          desc: '입의 가로 폭을 조절해요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.06;
            return [
              { type: 'move', c: P(pts, L.mouthL), r: u * 0.40, d: { x: -d, y: 0 } },
              { type: 'move', c: P(pts, L.mouthR), r: u * 0.40, d: { x: d, y: 0 } }
            ];
          }
        },
        {
          id: 'lipCorner', label: '입꼬리 올림', dir: 'both',
          op: '입꼬리 올림술',
          desc: '입꼬리를 올리면 기분 좋아 보이는 인상이 돼요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.055;
            return [
              { type: 'move', c: P(pts, L.mouthL), r: u * 0.34, d: { x: 0, y: -d } },
              { type: 'move', c: P(pts, L.mouthR), r: u * 0.34, d: { x: 0, y: -d } }
            ];
          }
        },
        {
          id: 'philtrum', label: '인중 길이', dir: 'both',
          op: '인중 단축술',
          desc: '코와 입 사이를 줄이면 어려 보여요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.06;
            return [{ type: 'move', c: mean(pts, L.lips), r: u * 0.75,
                      d: { x: 0, y: -d } }];
          }
        }
      ]
    },
    {
      key: 'cheek', label: '😊 볼 · 광대', intro: '얼굴 폭과 살집을 정리하는 부위예요.',
      items: [
        {
          id: 'zygoma', label: '광대 폭', dir: 'both',
          op: '광대뼈 축소술(관골 축소)',
          desc: '옆으로 튀어나온 광대를 넣어 얼굴이 좁아 보이게 해요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.11;
            return [
              { type: 'move', c: P(pts, L.wideL), r: u * 0.95, d: { x: d, y: 0 } },
              { type: 'move', c: P(pts, L.wideR), r: u * 0.95, d: { x: -d, y: 0 } }
            ];
          }
        },
        {
          id: 'buccal', label: '볼살', dir: 'both',
          op: '볼지방 제거(버컬팻) · 볼 지방이식',
          desc: '볼의 도톰한 정도를 조절해요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.07;
            return [
              { type: 'move', c: P(pts, L.cheekL), r: u * 0.80, d: { x: d, y: 0 } },
              { type: 'move', c: P(pts, L.cheekR), r: u * 0.80, d: { x: -d, y: 0 } }
            ];
          }
        }
      ]
    },
    {
      key: 'forehead', label: '🧠 이마', intro: '이마는 얼굴 위쪽 비율을 잡아 줘요.',
      items: [
        {
          id: 'foreheadH', label: '이마 높이', dir: 'both',
          op: '헤어라인 교정 · 이마 축소',
          desc: '이마가 넓으면 헤어라인을 내려 얼굴을 짧아 보이게 해요.',
          handles: function (pts, v, u) {
            return [{ type: 'move', c: P(pts, L.foreheadTop), r: u * 1.25,
                      d: { x: 0, y: v * u * 0.10 } }];
          }
        },
        {
          id: 'foreheadVol', label: '이마 볼륨', dir: 'one',
          op: '이마 지방이식 · 보형물',
          desc: '이마를 둥글게 채워 어려 보이게 해요. ' +
                '⚠ 앞뒤 볼륨이라 정면에선 변화가 작아요.',
          handles: function (pts, v, u) {
            var c = P(pts, L.foreheadTop);
            return [{ type: 'scale', c: { x: c.x, y: c.y + u * 0.30 }, r: u * 1.1,
                      s: 1 + v * 0.05 }];
          }
        }
      ]
    },
    {
      key: 'jaw', label: '🦷 턱 · 윤곽', intro: '턱선은 얼굴형을 결정해요.',
      items: [
        {
          id: 'jawAngle', label: '사각턱', dir: 'both',
          op: '사각턱 축소술(하악각 절제)',
          desc: '턱 모서리를 깎아 각진 인상을 부드럽게 해요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.11;
            return [
              { type: 'move', c: P(pts, L.jawL), r: u * 0.85, d: { x: d, y: 0 } },
              { type: 'move', c: P(pts, L.jawR), r: u * 0.85, d: { x: -d, y: 0 } }
            ];
          }
        },
        {
          id: 'chinLen', label: '턱끝 길이', dir: 'both',
          op: '턱끝 성형(제니오플라스티) · 무턱 교정',
          desc: '턱끝을 늘리거나 줄여 얼굴 길이를 맞춰요.',
          handles: function (pts, v, u) {
            return [{ type: 'move', c: P(pts, L.chin), r: u * 0.90,
                      d: { x: 0, y: v * u * 0.09 } }];
          }
        },
        {
          id: 'chinWidth', label: '턱끝 폭 (V라인)', dir: 'both',
          op: 'V라인 턱성형(턱끝 절골)',
          desc: '턱끝을 좁혀 갸름한 V라인을 만들어요.',
          handles: function (pts, v, u) {
            var d = v * u * 0.06;
            return [
              { type: 'move', c: P(pts, L.chinL), r: u * 0.55, d: { x: d, y: 0 } },
              { type: 'move', c: P(pts, L.chinR), r: u * 0.55, d: { x: -d, y: 0 } }
            ];
          }
        }
      ]
    }
  ];

  PS.CATALOG = CATALOG;

  /* 모든 시술을 한 줄로 편 목록 */
  PS.ALL = [];
  CATALOG.forEach(function (g) {
    g.items.forEach(function (it) {
      it.group = g.key; it.groupLabel = g.label;
      PS.ALL.push(it);
    });
  });

  PS.find = function (id) {
    for (var i = 0; i < PS.ALL.length; i++) if (PS.ALL[i].id === id) return PS.ALL[i];
    return null;
  };

  PS.defaultPlan = function () {
    var p = {};
    PS.ALL.forEach(function (it) { p[it.id] = 0; });
    return p;
  };

  /* ══════════ 3) 수술 묶음(패키지) ══════════
   * 상담에서 '윤곽 3종', '양악' 처럼 묶어 부르는 것들. */
  PS.PACKAGES = [
    {
      id: 'contour3', label: '윤곽 3종',
      note: '광대 + 사각턱 + 턱끝을 한 번에 정리하는 조합이에요.',
      plan: { zygoma: 55, jawAngle: 55, chinWidth: 45, chinLen: -15 }
    },
    {
      id: 'eyeSet', label: '눈 성형 세트',
      note: '쌍꺼풀 + 앞트임 + 뒤트임을 함께 하는 가장 흔한 조합이에요.',
      plan: { eyeSize: 45, eyeFront: 35, eyeBack: 35 }
    },
    {
      id: 'bimax', label: '양악수술',
      note: '위턱·아래턱 뼈를 함께 옮기는 큰 수술이에요. 돌출입과 주걱턱, ' +
            '얼굴 길이를 함께 바꿔요. ⚠ 실제 변화의 대부분은 옆모습이라 ' +
            '정면 사진으로는 일부만 보여요.',
      plan: { chinLen: -35, jawAngle: 35, philtrum: 25, mouthWidth: -12, chinWidth: 30 }
    },
    {
      id: 'babyface', label: '동안 패키지',
      note: '인중 단축 + 애교살 + 이마 볼륨으로 어려 보이게 하는 조합이에요.',
      plan: { philtrum: 45, aegyo: 55, foreheadVol: 50, lipVolume: 25, chinLen: -20 }
    }
  ];

  /* ══════════ 4) 사진 읽기 ══════════ */
  PS.analyze = function (file) {
    if (!FM) return Promise.reject(new Error('얼굴 인식 모듈이 없습니다'));
    return FM.fileToCanvas(file).then(function (canvas) {
      return FM.detect(canvas).then(function (pts) {
        var out = { canvas: canvas, pts: pts, warn: '' };
        if (!pts) { out.warn = '얼굴을 찾지 못했어요. 정면으로 크게 나온 사진을 넣어 주세요.'; return out; }
        if (FM.check) {
          var c = FM.check(pts, canvas);
          if (c && c.warn) out.warn = c.warn;
        }
        return out;
      });
    });
  };

  /* ══════════ 5) 변형해서 그리기 ══════════ */

  /* 손잡이 모으기 — 값이 0 인 시술은 건너뛴다(빠르게) */
  function collect(pts, plan) {
    var u = unit(pts), hs = [];
    PS.ALL.forEach(function (it) {
      var raw = Number(plan[it.id] || 0);
      if (!raw) return;
      var v = raw / 100;                       // -1 ~ 1
      var got = it.handles(pts, v, u) || [];
      got.forEach(function (h) { hs.push(h); });
    });
    return hs;
  }

  /* 부드러운 감쇠 — 가까울수록 1, 반지름 밖은 0 */
  function falloff(d2, r2) {
    if (d2 >= r2) return 0;
    var t = 1 - d2 / r2;
    return t * t;                              // 가장자리에서 기울기 0 → 경계가 안 보인다
  }

  PS.render = function (outCanvas, res, plan) {
    var src = res.canvas;
    var w = src.width, h = src.height;
    outCanvas.width = w; outCanvas.height = h;
    var octx = outCanvas.getContext('2d');

    if (!res.pts) { octx.drawImage(src, 0, 0); return; }

    var hs = collect(res.pts, plan);
    if (!hs.length) { octx.drawImage(src, 0, 0); return; }

    var sctx = src.getContext('2d');
    var sdat = sctx.getImageData(0, 0, w, h);
    var sd = sdat.data;
    var odat = octx.createImageData(w, h);
    var od = odat.data;
    od.set(sd);                                 // 기본은 원본 그대로

    /* 얼굴 주변만 계산한다 — 전체를 돌면 느리다 */
    var u = unit(res.pts);
    var pad = u * 2.2;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    res.pts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    var x0 = Math.max(0, Math.floor(minX - pad)), x1 = Math.min(w, Math.ceil(maxX + pad));
    var y0 = Math.max(0, Math.floor(minY - pad)), y1 = Math.min(h, Math.ceil(maxY + pad));

    /* 손잡이 미리 풀어 두기 (루프 안에서 객체 접근을 줄인다) */
    var n = hs.length;
    var hx = new Float64Array(n), hy = new Float64Array(n), hr2 = new Float64Array(n);
    var hkind = new Uint8Array(n);              // 0 move, 1 scale, 2 scaleX, 3 scaleY
    var hdx = new Float64Array(n), hdy = new Float64Array(n), hs_ = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var hh = hs[i];
      hx[i] = hh.c.x; hy[i] = hh.c.y;
      hr2[i] = (hh.r || 1) * (hh.r || 1);
      if (hh.type === 'scale') { hkind[i] = 1; hs_[i] = hh.s || 1; }
      else if (hh.type === 'scaleX') { hkind[i] = 2; hs_[i] = hh.s || 1; }
      else if (hh.type === 'scaleY') { hkind[i] = 3; hs_[i] = hh.s || 1; }
      else { hkind[i] = 0; hdx[i] = (hh.d && hh.d.x) || 0; hdy[i] = (hh.d && hh.d.y) || 0; }
    }

    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var sx = x, sy = y;
        for (var k = 0; k < n; k++) {
          var ddx = x - hx[k], ddy = y - hy[k];
          var d2 = ddx * ddx + ddy * ddy;
          var wgt = falloff(d2, hr2[k]);
          if (wgt <= 0) continue;
          if (hkind[k] === 0) {                 // 민다 → 되짚으려면 반대로
            sx -= hdx[k] * wgt; sy -= hdy[k] * wgt;
          } else {
            var inv = 1 / hs_[k];
            var f = 1 + (inv - 1) * wgt;
            if (hkind[k] === 1) { sx = hx[k] + ddx * f; sy = hy[k] + ddy * f; }
            else if (hkind[k] === 2) { sx = hx[k] + ddx * f; }
            else { sy = hy[k] + ddy * f; }
          }
        }
        /* 원본에서 그 자리 색을 가져온다 (이중선형 보간 — 계단 안 생기게) */
        if (sx < 0) sx = 0; if (sx > w - 1.001) sx = w - 1.001;
        if (sy < 0) sy = 0; if (sy > h - 1.001) sy = h - 1.001;
        var ix = sx | 0, iy = sy | 0;
        var fx = sx - ix, fy = sy - iy;
        var i00 = (iy * w + ix) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
        var o = (y * w + x) * 4;
        for (var c2 = 0; c2 < 4; c2++) {
          var a = sd[i00 + c2] + (sd[i10 + c2] - sd[i00 + c2]) * fx;
          var b = sd[i01 + c2] + (sd[i11 + c2] - sd[i01 + c2]) * fx;
          od[o + c2] = a + (b - a) * fy;
        }
      }
    }
    octx.putImageData(odat, 0, 0);
  };

  /* ══════════ 6) 얼굴 비율 재기 ══════════
   * 고개가 기울어도 같은 값이 나오도록 두 눈을 수평으로 되돌려 잰다. */
  PS.metrics = function (pts) {
    if (!pts) return null;
    var eL = mean(pts, L.eyeL), eR = mean(pts, L.eyeR);
    var ox = (eL.x + eR.x) / 2, oy = (eL.y + eR.y) / 2;
    var vx = eR.x - eL.x, vy = eR.y - eL.y;
    var u = Math.hypot(vx, vy) || 1;
    var cos = vx / u, sin = vy / u;
    var Q = pts.map(function (p) {
      var dx = p.x - ox, dy = p.y - oy;
      return { x: (dx * cos + dy * sin) / u, y: (-dx * sin + dy * cos) / u };
    });
    function d(a, b) { return Math.hypot(Q[a].x - Q[b].x, Q[a].y - Q[b].y); }

    var faceW = d(L.wideL, L.wideR);
    var faceH = Q[L.chin].y - Q[L.foreheadTop].y;
    var eyeW = (d(L.eyeOuterL, L.eyeInnerL) + d(L.eyeOuterR, L.eyeInnerR)) / 2;
    var eyeH = (Math.abs(Q[L.eyeTopL].y - Q[L.eyeBotL].y) +
                Math.abs(Q[L.eyeTopR].y - Q[L.eyeBotR].y)) / 2;
    var browY = (Q[L.browL].y + Q[L.browR].y) / 2;

    return {
      faceRatio: faceW / faceH,                              // 얼굴 폭/길이 (클수록 넓적)
      eyeSize:   eyeH / eyeW,                                // 눈 세로/가로 (클수록 큰 눈)
      eyeLen:    eyeW / faceW,                               // 눈 길이
      eyeGap:    d(L.eyeInnerL, L.eyeInnerR) / faceW,        // 눈 사이
      eyeTilt:   ((Q[L.eyeOuterL].y - Q[L.eyeInnerL].y) +
                  (Q[L.eyeOuterR].y - Q[L.eyeInnerR].y)) / 2 / eyeW, // +면 처진 눈
      noseW:     d(L.alaL, L.alaR) / faceW,
      noseLen:   (Q[L.noseTip].y - Q[L.noseRoot].y) / faceH,
      lipW:      d(L.mouthL, L.mouthR) / faceW,
      lipH:      Math.abs(Q[L.lipTop].y - Q[L.lipBot].y) / faceW,
      philtrum:  (Q[L.lipTop].y - Q[L.noseBase].y) / faceH,
      zygoma:    faceW / faceH,
      jawW:      d(L.jawL, L.jawR) / faceW,
      chinW:     d(L.chinL, L.chinR) / faceW,
      chinLen:   (Q[L.chin].y - Q[L.lipBot].y) / faceH,
      foreheadH: (browY - Q[L.foreheadTop].y) / faceH
    };
  };

  /* ══════════ 7) 목표 얼굴과 비교 ══════════
   *
   * ⚠ 연예인 사진을 앱에 넣어 두지 않는다 — 초상권 문제도 있고,
   *   무엇보다 "이 사람처럼 되세요" 라고 앱이 먼저 권하는 꼴이 된다.
   *   목표 얼굴은 **사용자가 직접 고른 사진**으로만 받는다.
   */
  var RULES = [
    { m: 'eyeSize',   id: 'eyeSize',    gain: 300, why: '눈 세로 길이' },
    { m: 'eyeLen',    id: 'eyeBack',    gain: 900, why: '눈 가로 길이' },
    { m: 'eyeGap',    id: 'eyeFront',   gain: -900, why: '눈 사이 거리' },
    { m: 'eyeTilt',   id: 'eyeTail',    gain: -450, why: '눈꼬리 각도' },
    { m: 'noseW',     id: 'noseAla',    gain: -1100, why: '콧볼 폭' },
    { m: 'noseLen',   id: 'noseTipUp',  gain: -900, why: '코 길이' },
    { m: 'lipH',      id: 'lipVolume',  gain: 1100, why: '입술 두께' },
    { m: 'lipW',      id: 'mouthWidth', gain: 900, why: '입 크기' },
    { m: 'philtrum',  id: 'philtrum',   gain: -1400, why: '인중 길이' },
    { m: 'faceRatio', id: 'zygoma',     gain: -700, why: '얼굴 폭' },
    { m: 'jawW',      id: 'jawAngle',   gain: -900, why: '턱 폭' },
    { m: 'chinW',     id: 'chinWidth',  gain: -900, why: '턱끝 폭' },
    { m: 'chinLen',   id: 'chinLen',    gain: 900, why: '턱끝 길이' },
    { m: 'foreheadH', id: 'foreheadH',  gain: -700, why: '이마 높이' }
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  PS.compare = function (myPts, tgtPts) {
    var a = PS.metrics(myPts), b = PS.metrics(tgtPts);
    if (!a || !b) return null;
    var plan = PS.defaultPlan();
    var list = [];

    RULES.forEach(function (r) {
      var it = PS.find(r.id);
      if (!it) return;
      var diff = b[r.m] - a[r.m];
      var v = clamp(diff * r.gain, -100, 100);
      if (it.dir === 'one' && v < 0) v = 0;
      if (Math.abs(v) < 8) return;                 // 차이가 미미하면 권하지 않는다
      plan[r.id] = Math.round(v);
      list.push({
        id: r.id, label: it.label, op: it.op, group: it.groupLabel,
        amount: Math.round(Math.abs(v)),
        dirWord: v > 0 ? '늘리는' : '줄이는',
        text: r.why + '이(가) 목표 얼굴보다 ' +
              (diff > 0 ? '작아요' : '커요') + ' → ' + it.op
      });
    });

    list.sort(function (p, q) { return q.amount - p.amount; });

    /* 얼마나 닮았나 — 지표 차이의 평균으로 대충 점수를 낸다 */
    var sum = 0, cnt = 0;
    RULES.forEach(function (r) {
      var rel = Math.abs(b[r.m] - a[r.m]) * Math.abs(r.gain) / 100;
      sum += clamp(rel, 0, 1); cnt++;
    });
    var score = Math.round(clamp(100 - (sum / (cnt || 1)) * 100, 0, 100));

    return { plan: plan, list: list, score: score, mine: a, target: b };
  };

  global.PhotoSurgery = PS;
})(typeof window !== 'undefined' ? window : globalThis);
