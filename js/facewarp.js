/* facewarp.js — 얼굴 랜드마크 기반 변형 엔진 (노화 / 체지방 / 2세 공용)
 *
 * 원칙 하나: **사진은 어디로도 전송되지 않는다.** 전부 이 브라우저 안에서 끝난다.
 *   얼굴은 생체정보라 "서버로 안 보낸다"는 약속이 이 앱의 가장 큰 자산이다.
 *   그래서 GAN(StyleGAN·SDXL)을 쓰지 않는다. 그건 GPU 서버로 사진을 보내야 한다.
 *
 * 대신 하는 일: MediaPipe FaceMesh 로 얼굴 468점을 찾고,
 *   ① 제어점을 옮긴 뒤 그 이동량을 주변으로 부드럽게 퍼뜨려 픽셀을 다시 샘플링(워프)하고
 *   ② 피부색·주름·그늘 같은 색 보정을 얹는다.
 *   즉 **기하 변형 + 색 보정** — 사진급 생성이 아니라 "그럴듯한 필터" 수준이다.
 *
 * 쓰는 쪽 순서:
 *   await FW.load();                       // 모델 준비 (처음 한 번, 몇 초)
 *   const cv  = await FW.fileToCanvas(f);  // 파일 → 캔버스 (EXIF 회전 보정)
 *   const pts = await FW.detect(cv);       // 468점 (픽셀 좌표), 못 찾으면 null
 *   const out = FW.warp(cv, pts, movedPts);
 */
(function (global) {
	'use strict';

	var FW = {};

	/* ══════════ 1) 랜드마크 인덱스 ══════════
	 * MediaPipe FaceMesh 의 표준 번호다. 바꾸지 말 것 — 모델이 정한 번호다. */
	FW.IDX = {
		// 얼굴 윤곽 36점 (이마 한가운데에서 시계방향으로 한 바퀴)
		oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
			379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
			234, 127, 162, 21, 54, 103, 67, 109],
		eyeL: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
		eyeR: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
		browL: [70, 63, 105, 66, 107],
		browR: [300, 293, 334, 296, 336],
		lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267,
			0, 37, 39, 40, 185],
		noseRoot: 168,
		noseTip: 1,
		noseBase: 2,
		alaL: 48,          // 콧방울 왼쪽(화면 기준)
		alaR: 278,
		chin: 152,
		foreheadTop: 10,
		mouthL: 61,
		mouthR: 291,
		eyeOuterL: 33,
		eyeOuterR: 263,
		cheekL: 50,
		cheekR: 280,
		wideL: 234,        // 광대 바깥(귀 앞)
		wideR: 454
	};

	/* ══════════ 2) 모델 로딩 ══════════ */
	var MP_VER = '0.4.1633559619';
	var MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@' + MP_VER + '/';
	var _mesh = null, _loading = null;

	function loadScript(src) {
		return new Promise(function (ok, no) {
			var s = document.createElement('script');
			s.src = src; s.crossOrigin = 'anonymous';
			s.onload = ok;
			s.onerror = function () { no(new Error('스크립트를 못 불러왔습니다: ' + src)); };
			document.head.appendChild(s);
		});
	}

	FW.load = function () {
		if (_mesh) return Promise.resolve(_mesh);
		if (_loading) return _loading;
		_loading = (global.FaceMesh ? Promise.resolve() : loadScript(MP_BASE + 'face_mesh.js'))
			.then(function () {
				var m = new global.FaceMesh({ locateFile: function (f) { return MP_BASE + f; } });
				m.setOptions({
					maxNumFaces: 1,
					refineLandmarks: false,
					minDetectionConfidence: 0.4,
					minTrackingConfidence: 0.4
				});
				return m.initialize().then(function () { _mesh = m; return m; });
			});
		return _loading;
	};

	/* ══════════ 3) 사진 읽기 ══════════ */
	// 세로로 찍은 사진이 눕는 걸 막으려고 EXIF 방향을 반영한다.
	FW.fileToCanvas = function (file, maxSide) {
		maxSide = maxSide || 560;
		return new Promise(function (ok, no) {
			var done = function (src, w, h) {
				var r = Math.min(1, maxSide / Math.max(w, h));
				var cv = document.createElement('canvas');
				cv.width = Math.round(w * r); cv.height = Math.round(h * r);
				cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
				ok(cv);
			};
			if (global.createImageBitmap) {
				global.createImageBitmap(file, { imageOrientation: 'from-image' })
					.then(function (b) { done(b, b.width, b.height); })
					.catch(function () { viaImg(); });
			} else { viaImg(); }

			function viaImg() {
				var url = URL.createObjectURL(file);
				var im = new Image();
				im.onload = function () { done(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(url); };
				im.onerror = function () { no(new Error('사진을 읽지 못했습니다.')); URL.revokeObjectURL(url); };
				im.src = url;
			}
		});
	};

	/* ══════════ 4) 얼굴 찾기 ══════════ */
	// 결과는 픽셀 좌표 배열 468개. 얼굴이 없으면 null.
	//
	// ⚠ FaceMesh 는 원래 **영상용**이라 앞 프레임을 따라가려 든다. 그래서 큰 얼굴을
	//   본 직후 전혀 다른 작은 사진을 넣으면 멀쩡한 얼굴도 놓친다(2026-09-07 실측:
	//   첫 장은 찾고 둘째 장에서 실패). 한 번 더 넣어 보고, 그래도 안 되면 엔진을
	//   새로 만들어서 다시 시도한다.
	function once(m, canvas) {
		return new Promise(function (ok) {
			var done = false;
			m.onResults(function (res) {
				if (done) return;
				done = true;
				var L = res.multiFaceLandmarks;
				if (!L || !L.length) return ok(null);
				ok(L[0].map(function (p) {
					return { x: p.x * canvas.width, y: p.y * canvas.height };
				}));
			});
			try { m.send({ image: canvas }); }
			catch (e) { if (!done) { done = true; ok(null); } }
		});
	}

	FW.reset = function () {
		try { if (_mesh) _mesh.close(); } catch (e) { }
		_mesh = null; _loading = null;
		return FW.load();
	};

	FW.detect = function (canvas) {
		return FW.load()
			.then(function (m) { return once(m, canvas); })
			.then(function (r) {
				if (r) return r;
				return FW.load().then(function (m) { return once(m, canvas); });
			})
			.then(function (r) {
				if (r) return r;
				return FW.reset().then(function (m) { return once(m, canvas); });
			});
	};

	/* 사진이 쓸 만한지 본다.
	 * MediaPipe 는 **얼굴이 잘린 확대 사진에도 억지로 메시를 씌운다.** 그러면 결과가
	 * 엉망이 되는데 사용자는 이유를 모른다(2026-09-07 실측: 눈 하나만 나온 셀카에
	 * 468점이 다 찍혔고, 2세 결과가 뭉개졌다). 그래서 미리 걸러 알려 준다. */
	FW.check = function (pts, cv) {
		var M = FW.metrics(pts);
		var xs = FW.IDX.oval.map(function (k) { return pts[k].x; });
		var ys = FW.IDX.oval.map(function (k) { return pts[k].y; });
		var out = Math.min.apply(null, xs) < -2 || Math.max.apply(null, xs) > cv.width + 2 ||
			Math.min.apply(null, ys) < -2 || Math.max.apply(null, ys) > cv.height + 2;
		var ratio = M.h / M.w;
		if (out) return '얼굴이 사진 밖으로 잘려 있어요. 얼굴 전체가 나온 사진을 써 주세요.';
		if (M.w / cv.width > 0.85) return '너무 가까이 찍힌 사진이에요. 얼굴 전체가 나오게 찍어 주세요.';
		if (M.w / cv.width < 0.12) return '얼굴이 너무 작아요. 얼굴이 크게 나온 사진을 써 주세요.';
		if (ratio > 1.6 || ratio < 0.80) return '고개가 많이 젖혀졌어요. 정면 사진이 잘 나옵니다.';
		// 옆으로 돌아간 얼굴 — 코끝이 얼굴 한가운데에서 얼마나 벗어났는지로 본다.
		// (2026-09-07 실측: 3/4 로 돌아간 사진 한 장이 섞이면 2세 결과가 통째로 뭉개졌다)
		if (Math.abs(pts[FW.IDX.noseTip].x - M.cx) / M.w > 0.07)
			return '고개가 옆으로 돌아갔어요. 정면을 보고 찍은 사진을 써 주세요.';
		return null;
	};

	/* ══════════ 5) 기하 도우미 ══════════ */
	FW.mean = function (pts, idx) {
		var x = 0, y = 0, n = idx.length;
		for (var i = 0; i < n; i++) { x += pts[idx[i]].x; y += pts[idx[i]].y; }
		return { x: x / n, y: y / n };
	};

	// 얼굴 크기(양 광대 사이 거리)와 세로 길이. 이동량을 여기에 비례시킨다.
	FW.metrics = function (pts) {
		var I = FW.IDX;
		var w = Math.hypot(pts[I.wideR].x - pts[I.wideL].x, pts[I.wideR].y - pts[I.wideL].y);
		var h = Math.hypot(pts[I.chin].x - pts[I.foreheadTop].x, pts[I.chin].y - pts[I.foreheadTop].y);
		return {
			w: w, h: h,
			cx: (pts[I.wideL].x + pts[I.wideR].x) / 2,
			eyeL: FW.mean(pts, I.eyeL),
			eyeR: FW.mean(pts, I.eyeR),
			chin: pts[I.chin],
			top: pts[I.foreheadTop]
		};
	};

	/* ══════════ 6) 워프 ══════════
	 * from[i] 에 있던 것이 to[i] 로 간다. 그 사이를 얇은판 스플라인(TPS)으로 메운다.
	 *
	 * ⚠ 처음에는 역거리 가중(IDW)으로 만들었다가 갈아엎었다. IDW 는 **제어점에서조차
	 *   지정한 만큼 움직이지 않는다** — 이웃 제어점과 테두리 못이 서로 상쇄해 변형이
	 *   절반쯤 먹히고, 두 얼굴을 겹치면 눈이 둘로 보이는 유령이 남았다.
	 *   TPS 는 제어점에서 정확히 맞고 그 사이는 가장 부드럽게 휜다. 얼굴 모프의 정석이다.
	 *
	 * 결과 픽셀 p 에서 "원본의 어디를 볼지"(역방향)를 구한다. 즉 to → from 매핑이다.
	 * 픽셀마다 계산하면 느려서 성긴 격자에서만 풀고 사이는 선형 보간한다.
	 */
	function tpsSolve(ctrl, val, lambda) {
		// ctrl: 제어점, val: 그 점에서의 목표값 → f(ctrl_i) = val_i 를 만족하는 TPS
		var n = ctrl.length, N = n + 3, i, j;
		var A = new Float64Array(N * N), bx = new Float64Array(N), by = new Float64Array(N);
		for (i = 0; i < n; i++) {
			for (j = 0; j < n; j++) {
				var dx = ctrl[i].x - ctrl[j].x, dy = ctrl[i].y - ctrl[j].y;
				var r2 = dx * dx + dy * dy;
				A[i * N + j] = r2 < 1e-12 ? lambda : r2 * Math.log(r2) * 0.5;
			}
			A[i * N + n] = 1; A[i * N + n + 1] = ctrl[i].x; A[i * N + n + 2] = ctrl[i].y;
			A[n * N + i] = 1; A[(n + 1) * N + i] = ctrl[i].x; A[(n + 2) * N + i] = ctrl[i].y;
			bx[i] = val[i].x; by[i] = val[i].y;
		}
		// 가우스 소거 (부분 피벗). 우변 두 개를 한 번에 푼다.
		for (i = 0; i < N; i++) {
			var piv = i, best = Math.abs(A[i * N + i]);
			for (j = i + 1; j < N; j++) {
				var v = Math.abs(A[j * N + i]);
				if (v > best) { best = v; piv = j; }
			}
			if (best < 1e-12) return null;              // 못 풀면 부르는 쪽에서 되돌린다
			if (piv !== i) {
				for (j = 0; j < N; j++) {
					var t = A[i * N + j]; A[i * N + j] = A[piv * N + j]; A[piv * N + j] = t;
				}
				var tb = bx[i]; bx[i] = bx[piv]; bx[piv] = tb;
				tb = by[i]; by[i] = by[piv]; by[piv] = tb;
			}
			var d = A[i * N + i];
			for (j = i; j < N; j++) A[i * N + j] /= d;
			bx[i] /= d; by[i] /= d;
			for (var k = 0; k < N; k++) {
				if (k === i) continue;
				var f = A[k * N + i];
				if (!f) continue;
				for (j = i; j < N; j++) A[k * N + j] -= f * A[i * N + j];
				bx[k] -= f * bx[i]; by[k] -= f * by[i];
			}
		}
		return { ctrl: ctrl, wx: bx, wy: by, n: n };
	}

	function tpsEval(S, x, y, out) {
		var n = S.n, sx = S.wx[n] + S.wx[n + 1] * x + S.wx[n + 2] * y;
		var sy = S.wy[n] + S.wy[n + 1] * x + S.wy[n + 2] * y;
		for (var i = 0; i < n; i++) {
			var dx = x - S.ctrl[i].x, dy = y - S.ctrl[i].y, r2 = dx * dx + dy * dy;
			if (r2 < 1e-12) continue;
			var u = r2 * Math.log(r2) * 0.5;
			sx += S.wx[i] * u; sy += S.wy[i] * u;
		}
		out[0] = sx; out[1] = sy;
	}

	FW.warp = function (src, from, to, opt) {
		opt = opt || {};
		var W = src.width, H = src.height;
		var step = opt.step || 6;
		var D = Math.max(W, H);
		var i;

		// 좌표를 0~1 로 줄여서 푼다 (픽셀 단위로 풀면 r²logr 가 커져 수치가 불안하다)
		var ctrl = [], val = [], seen = {};
		function add(c, v) {
			var key = (c.x * 1000 | 0) + ',' + (c.y * 1000 | 0);
			if (seen[key]) return;                       // 겹친 제어점은 행렬을 못 풀게 만든다
			seen[key] = 1;
			ctrl.push({ x: c.x / D, y: c.y / D });
			val.push({ x: v.x / D, y: v.y / D });
		}
		for (i = 0; i < from.length; i++) add(to[i], from[i]);

		// 사진 테두리에는 "움직이지 않는" 못을 박는다. 안 그러면 배경까지 딸려 온다.
		var m = 5;
		for (i = 0; i <= m; i++) {
			var t = i / m;
			add({ x: t * W, y: 0 }, { x: t * W, y: 0 });
			add({ x: t * W, y: H }, { x: t * W, y: H });
			add({ x: 0, y: t * H }, { x: 0, y: t * H });
			add({ x: W, y: t * H }, { x: W, y: t * H });
		}

		var S = tpsSolve(ctrl, val, opt.lambda == null ? 1.5e-4 : opt.lambda);

		/* ⚠ 안전장치 — TPS 는 제어점에서는 정확하지만 **제어점이 없는 곳(머리카락·배경)에서는
		 *   크게 출렁일 수 있다.** 2026-09-07 에 두 얼굴을 섞다가 머리 위에 눈이 하나 떠 있는
		 *   결과가 나왔다. 그래서 ① 규제(lambda)를 조금 주고 ② 이동량 자체에 상한을 건다.
		 *   상한은 "제어점에서 실제로 요구한 최대 이동량"의 1.8배 — 이보다 큰 건 출렁임이다. */
		var maxd = 0;
		for (i = 0; i < from.length; i++) {
			var e = Math.hypot(from[i].x - to[i].x, from[i].y - to[i].y);
			if (e > maxd) maxd = e;
		}
		var lim = Math.max(6, maxd * 1.8);

		var gw = Math.ceil(W / step) + 1, gh = Math.ceil(H / step) + 1;
		var gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
		var o = [0, 0];
		for (var b = 0; b < gh; b++) {
			for (var a = 0; a < gw; a++) {
				var X = a * step, Y = b * step, k = b * gw + a;
				if (!S) { gx[k] = 0; gy[k] = 0; continue; }
				tpsEval(S, X / D, Y / D, o);
				var dx = o[0] * D - X, dy = o[1] * D - Y;
				var mag = Math.hypot(dx, dy);
				if (mag > lim) { dx *= lim / mag; dy *= lim / mag; }
				gx[k] = dx; gy[k] = dy;
			}
		}

		var sctx = src.getContext('2d');
		var sd = sctx.getImageData(0, 0, W, H).data;
		var out = document.createElement('canvas'); out.width = W; out.height = H;
		var octx = out.getContext('2d');
		var od = octx.createImageData(W, H), dd = od.data;

		for (var y = 0; y < H; y++) {
			var by = y / step, b0 = Math.min(gh - 2, by | 0), ty = by - b0;
			for (var x = 0; x < W; x++) {
				var bx = x / step, a0 = Math.min(gw - 2, bx | 0), tx = bx - a0;
				var k00 = b0 * gw + a0, k10 = k00 + 1, k01 = k00 + gw, k11 = k01 + 1;
				var ddx = (gx[k00] * (1 - tx) + gx[k10] * tx) * (1 - ty) + (gx[k01] * (1 - tx) + gx[k11] * tx) * ty;
				var ddy = (gy[k00] * (1 - tx) + gy[k10] * tx) * (1 - ty) + (gy[k01] * (1 - tx) + gy[k11] * tx) * ty;
				sample(sd, W, H, x + ddx, y + ddy, dd, (y * W + x) * 4);
			}
		}
		octx.putImageData(od, 0, 0);
		return out;
	};

	function sample(sd, W, H, fxp, fyp, dst, o) {
		if (fxp < 0) fxp = 0; if (fyp < 0) fyp = 0;
		if (fxp > W - 1.001) fxp = W - 1.001; if (fyp > H - 1.001) fyp = H - 1.001;
		var x0 = fxp | 0, y0 = fyp | 0, tx = fxp - x0, ty = fyp - y0;
		var i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
		for (var c = 0; c < 4; c++) {
			dst[o + c] =
				(sd[i00 + c] * (1 - tx) + sd[i10 + c] * tx) * (1 - ty) +
				(sd[i01 + c] * (1 - tx) + sd[i11 + c] * tx) * ty;
		}
	}

	/* ══════════ 7) 색 보정 ══════════ */
	// sat: 채도(1=그대로), bright: 밝기 더하기(-255~255), warm: 노란기, contrast: 대비
	FW.adjust = function (cv, o) {
		var ctx = cv.getContext('2d'), im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
		var sat = o.sat == null ? 1 : o.sat, br = o.bright || 0,
			warm = o.warm || 0, ct = o.contrast == null ? 1 : o.contrast;
		for (var i = 0; i < d.length; i += 4) {
			var r = d[i], g = d[i + 1], b = d[i + 2];
			var l = 0.299 * r + 0.587 * g + 0.114 * b;
			r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
			r = (r - 128) * ct + 128 + br + warm;
			g = (g - 128) * ct + 128 + br + warm * 0.55;
			b = (b - 128) * ct + 128 + br - warm * 0.35;
			d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
		}
		ctx.putImageData(im, 0, 0);
		return cv;
	};
	function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

	// 피부 매끈하게 — 박스 블러를 원본과 섞는다. amount 0~1
	FW.smooth = function (cv, radius, amount) {
		var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
		var im = ctx.getImageData(0, 0, W, H), src = im.data;
		var tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length);
		blur1d(src, tmp, W, H, radius, true);
		blur1d(tmp, out, W, H, radius, false);
		for (var i = 0; i < src.length; i += 4) {
			for (var c = 0; c < 3; c++) src[i + c] = src[i + c] * (1 - amount) + out[i + c] * amount;
		}
		ctx.putImageData(im, 0, 0);
		return cv;
	};
	function blur1d(src, dst, W, H, r, horiz) {
		var outer = horiz ? H : W, inner = horiz ? W : H;
		var stepIn = horiz ? 4 : W * 4, stepOut = horiz ? W * 4 : 4;
		for (var o = 0; o < outer; o++) {
			var base = o * stepOut;
			for (var c = 0; c < 4; c++) {
				var sum = 0, cnt = 0, i;
				for (i = 0; i <= r && i < inner; i++) { sum += src[base + i * stepIn + c]; cnt++; }
				for (i = 0; i < inner; i++) {
					dst[base + i * stepIn + c] = sum / cnt;
					var add = i + r + 1, sub = i - r;
					if (add < inner) { sum += src[base + add * stepIn + c]; cnt++; }
					if (sub >= 0) { sum -= src[base + sub * stepIn + c]; cnt--; }
				}
			}
		}
	}

	/* ══════════ 8) 선 그리기 (주름·그늘) ══════════
	 * canvas 의 filter:blur 는 사파리에서 되고 안 되고가 갈린다.
	 * 그래서 굵기·투명도를 달리해 세 번 겹쳐 그어 번짐을 흉내 낸다. */
	FW.softStroke = function (ctx, path, color, width, alpha) {
		ctx.save();
		ctx.globalCompositeOperation = 'multiply';
		ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
		var layers = [[2.6, 0.22], [1.6, 0.35], [1.0, 0.55]];
		for (var k = 0; k < layers.length; k++) {
			ctx.lineWidth = width * layers[k][0];
			ctx.globalAlpha = alpha * layers[k][1];
			ctx.beginPath();
			ctx.moveTo(path[0].x, path[0].y);
			for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
			ctx.stroke();
		}
		ctx.restore();
	};

	// 부드러운 타원 그늘 (눈밑·볼 그림자)
	FW.softShade = function (ctx, cx, cy, rx, ry, color, alpha) {
		var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
		g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.save();
		ctx.globalCompositeOperation = 'multiply';
		ctx.globalAlpha = alpha;
		ctx.translate(cx, cy); ctx.scale(1, ry / Math.max(rx, ry)); ctx.translate(-cx, -cy);
		ctx.fillStyle = g;
		ctx.beginPath(); ctx.arc(cx, cy, Math.max(rx, ry), 0, 6.2832); ctx.fill();
		ctx.restore();
	};

	/* ══════════ 9) 잡다 ══════════ */
	FW.clone = function (cv) {
		var c = document.createElement('canvas');
		c.width = cv.width; c.height = cv.height;
		c.getContext('2d').drawImage(cv, 0, 0);
		return c;
	};

	FW.blend = function (a, b, t) {
		var out = FW.clone(a), ctx = out.getContext('2d');
		ctx.globalAlpha = t; ctx.drawImage(b, 0, 0); ctx.globalAlpha = 1;
		return out;
	};

	// 두 얼굴을 눈 위치로 겹친다 (b 를 a 의 좌표계로 끌어온다)
	// size 를 주면 그 크기의 캔버스로 뽑는다 — 두 사진 크기가 다를 때 잘리는 걸 막는다.
	FW.alignTo = function (bCv, bPts, aPts, size) {
		var A = FW.metrics(aPts), B = FW.metrics(bPts);
		var av = { x: A.eyeR.x - A.eyeL.x, y: A.eyeR.y - A.eyeL.y };
		var bv = { x: B.eyeR.x - B.eyeL.x, y: B.eyeR.y - B.eyeL.y };
		var s = Math.hypot(av.x, av.y) / Math.hypot(bv.x, bv.y);
		var th = Math.atan2(av.y, av.x) - Math.atan2(bv.y, bv.x);
		var cos = Math.cos(th) * s, sin = Math.sin(th) * s;
		var bc = { x: (B.eyeL.x + B.eyeR.x) / 2, y: (B.eyeL.y + B.eyeR.y) / 2 };
		var ac = { x: (A.eyeL.x + A.eyeR.x) / 2, y: (A.eyeL.y + A.eyeR.y) / 2 };
		var out = document.createElement('canvas');
		out.width = (size && size.w) || bCv.width;
		out.height = (size && size.h) || bCv.height;
		var ctx = out.getContext('2d');
		ctx.setTransform(cos, sin, -sin, cos, ac.x - (cos * bc.x - sin * bc.y), ac.y - (sin * bc.x + cos * bc.y));
		ctx.drawImage(bCv, 0, 0);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		var np = bPts.map(function (p) {
			return {
				x: cos * p.x - sin * p.y + (ac.x - (cos * bc.x - sin * bc.y)),
				y: sin * p.x + cos * p.y + (ac.y - (sin * bc.x + cos * bc.y))
			};
		});
		return { canvas: out, pts: np };
	};

	/* 얼굴을 정해진 틀에 맞춰 다시 그린다.
	 * 두 사람을 섞으려면 먼저 **같은 자리에 같은 크기로** 놓아야 한다.
	 * 눈 두 개를 기준으로 회전·크기·위치를 맞춘다. (사진 밖은 배경색으로 채운다) */
	FW.canonical = function (cv, pts, size) {
		var W = size.w, H = size.h;
		var A = FW.metrics(pts);
		var sc = { x: (A.eyeL.x + A.eyeR.x) / 2, y: (A.eyeL.y + A.eyeR.y) / 2 };
		var v = { x: A.eyeR.x - A.eyeL.x, y: A.eyeR.y - A.eyeL.y };
		var s = (W * (size.eyeGap || 0.30)) / Math.hypot(v.x, v.y);
		var th = -Math.atan2(v.y, v.x);
		var cos = Math.cos(th) * s, sin = Math.sin(th) * s;
		var e = W * 0.5 - (cos * sc.x - sin * sc.y);
		var f = H * (size.eyeY || 0.42) - (sin * sc.x + cos * sc.y);

		var out = document.createElement('canvas');
		out.width = W; out.height = H;
		var ctx = out.getContext('2d');
		ctx.fillStyle = size.bg || '#efe7de';
		ctx.fillRect(0, 0, W, H);
		ctx.setTransform(cos, sin, -sin, cos, e, f);
		ctx.drawImage(cv, 0, 0);
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		return {
			canvas: out,
			pts: pts.map(function (p) {
				return { x: cos * p.x - sin * p.y + e, y: sin * p.x + cos * p.y + f };
			})
		};
	};

	// 타원 밖을 부드럽게 지운다 (배경이 서로 다른 두 사진을 합칠 때 이음매를 감춘다)
	FW.ovalMask = function (cv, cx, cy, rx, ry, feather) {
		var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
		var im = ctx.getImageData(0, 0, W, H), d = im.data;
		feather = feather || 0.22;
		for (var y = 0; y < H; y++) {
			for (var x = 0; x < W; x++) {
				var t = Math.hypot((x - cx) / rx, (y - cy) / ry);
				var a = t <= 1 - feather ? 1 : (t >= 1 ? 0 : (1 - t) / feather);
				d[(y * W + x) * 4 + 3] *= a;
			}
		}
		ctx.putImageData(im, 0, 0);
		return cv;
	};

	// 부드러운 배경 위에 올린다
	FW.onBackdrop = function (cv, c1, c2) {
		var out = document.createElement('canvas');
		out.width = cv.width; out.height = cv.height;
		var ctx = out.getContext('2d');
		var g = ctx.createLinearGradient(0, 0, 0, cv.height);
		g.addColorStop(0, c1); g.addColorStop(1, c2);
		ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
		ctx.drawImage(cv, 0, 0);
		return out;
	};

	// 결과 저장 / 공유
	FW.save = function (cv, name) {
		cv.toBlob(function (blob) {
			var a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = name || 'result.png';
			document.body.appendChild(a); a.click();
			setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
		}, 'image/png');
	};

	FW.share = function (cv, name, text) {
		return new Promise(function (ok) {
			cv.toBlob(function (blob) {
				var file = new File([blob], name || 'result.png', { type: 'image/png' });
				if (navigator.canShare && navigator.canShare({ files: [file] })) {
					navigator.share({ files: [file], text: text || '' }).then(function () { ok(true); },
						function () { ok(false); });
				} else { FW.save(cv, name); ok(true); }
			}, 'image/png');
		});
	};

	global.FW = FW;
})(window);
