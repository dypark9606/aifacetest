/* facemesh.js — 얼굴 468점을 찾아 "관상 지표"를 재는 도구.
 *
 * 얼굴로 보는 사주팔자(오행 관상)와 MBTI 두 탭이 이걸 같이 쓴다.
 * 사진은 어디로도 전송되지 않는다. 전부 이 브라우저 안에서 끝난다.
 *
 *   await FM.load();                       // 모델 준비 (처음 한 번, 몇 초)
 *   var cv  = await FM.fileToCanvas(file);
 *   var pts = await FM.detect(cv);         // 468점, 못 찾으면 null
 *   var f   = FM.features(pts);            // 얼굴형·이목구비 비율 (아래 참고)
 *
 * ※ 2026-09-07 에 이 엔진으로 노화·2세 합성을 만들었다가 품질이 안 나와 지웠다.
 *   그때도 **랜드마크 검출 자체는 정확했다.** 그래서 검출·측정 부분만 남겼다.
 */
(function (global) {
	'use strict';

	var FM = {};

	/* ══════════ 1) 랜드마크 인덱스 ══════════
	 * MediaPipe FaceMesh 의 표준 번호다. 바꾸지 말 것 — 모델이 정한 번호다. */
	FM.IDX = {
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

	FM.load = function () {
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
	FM.fileToCanvas = function (file, maxSide) {
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

	FM.reset = function () {
		try { if (_mesh) _mesh.close(); } catch (e) { }
		_mesh = null; _loading = null;
		return FM.load();
	};

	FM.detect = function (canvas) {
		return FM.load()
			.then(function (m) { return once(m, canvas); })
			.then(function (r) {
				if (r) return r;
				return FM.load().then(function (m) { return once(m, canvas); });
			})
			.then(function (r) {
				if (r) return r;
				return FM.reset().then(function (m) { return once(m, canvas); });
			});
	};

	/* 사진이 쓸 만한지 본다.
	 * MediaPipe 는 **얼굴이 잘린 확대 사진에도 억지로 메시를 씌운다.** 그러면 결과가
	 * 엉망이 되는데 사용자는 이유를 모른다(2026-09-07 실측: 눈 하나만 나온 셀카에
	 * 468점이 다 찍혔고, 2세 결과가 뭉개졌다). 그래서 미리 걸러 알려 준다. */
	FM.check = function (pts, cv) {
		var M = FM.metrics(pts);
		var xs = FM.IDX.oval.map(function (k) { return pts[k].x; });
		var ys = FM.IDX.oval.map(function (k) { return pts[k].y; });
		var out = Math.min.apply(null, xs) < -2 || Math.max.apply(null, xs) > cv.width + 2 ||
			Math.min.apply(null, ys) < -2 || Math.max.apply(null, ys) > cv.height + 2;
		var ratio = M.h / M.w;
		// ⚠ 기준을 빡빡하게 잡았더니 실제 사진 80장 중 56장이 걸렸다(2026-09-08).
		//    경고가 너무 자주 뜨면 아무도 안 읽는다. 정말 못 쓸 사진만 잡는다.
		if (out) return '얼굴이 사진 밖으로 잘려 있어요. 얼굴 전체가 나온 사진이면 더 정확합니다.';
		if (M.w / cv.width > 0.95) return '너무 가까이 찍힌 사진이에요. 얼굴 전체가 나오게 찍어 주세요.';
		if (M.w / cv.width < 0.10) return '얼굴이 너무 작아요. 얼굴이 크게 나온 사진을 써 주세요.';
		if (ratio > 1.6 || ratio < 0.75) return '고개가 많이 젖혀졌어요. 정면 사진이 잘 나옵니다.';
		// 옆으로 돌아간 얼굴 — 코끝이 얼굴 한가운데에서 얼마나 벗어났는지로 본다.
		// (2026-09-07 실측: 3/4 로 돌아간 사진 한 장이 섞이면 2세 결과가 통째로 뭉개졌다)
		if (Math.abs(pts[FM.IDX.noseTip].x - M.cx) / M.w > 0.17)
			return '고개가 옆으로 돌아갔어요. 정면을 보고 찍은 사진이면 더 정확합니다.';
		return null;
	};

	/* ══════════ 5) 기하 도우미 ══════════ */
	FM.mean = function (pts, idx) {
		var x = 0, y = 0, n = idx.length;
		for (var i = 0; i < n; i++) { x += pts[idx[i]].x; y += pts[idx[i]].y; }
		return { x: x / n, y: y / n };
	};

	// 얼굴 크기(양 광대 사이 거리)와 세로 길이. 이동량을 여기에 비례시킨다.
	FM.metrics = function (pts) {
		var I = FM.IDX;
		var w = Math.hypot(pts[I.wideR].x - pts[I.wideL].x, pts[I.wideR].y - pts[I.wideL].y);
		var h = Math.hypot(pts[I.chin].x - pts[I.foreheadTop].x, pts[I.chin].y - pts[I.foreheadTop].y);
		return {
			w: w, h: h,
			cx: (pts[I.wideL].x + pts[I.wideR].x) / 2,
			eyeL: FM.mean(pts, I.eyeL),
			eyeR: FM.mean(pts, I.eyeR),
			chin: pts[I.chin],
			top: pts[I.foreheadTop]
		};
	};

	/* ══════════ 6) 관상 지표 재기 ══════════
	 *
	 * 고개가 조금 기울어도 같은 값이 나오도록, **두 눈을 잇는 선을 가로축으로 삼고
	 * 눈 사이 거리를 자(尺)로 쓰는 좌표계**로 옮겨서 잰다.
	 * 그래야 사진마다 결과가 널뛰지 않는다.
	 *
	 * 삼정(三停)은 관상의 뼈대다 — 이마(상정)·눈썹에서 코끝(중정)·코끝에서 턱(하정)의
	 * 비율. 셋이 고르면 "고른 삶", 어느 하나가 길면 그 시기가 두드러진다고 본다.
	 */
	FM.features = function (pts) {
		var I = FM.IDX;
		var eL = FM.mean(pts, I.eyeL), eR = FM.mean(pts, I.eyeR);
		var ox = (eL.x + eR.x) / 2, oy = (eL.y + eR.y) / 2;
		var vx = eR.x - eL.x, vy = eR.y - eL.y;
		var unit = Math.hypot(vx, vy) || 1;
		var cos = vx / unit, sin = vy / unit;
		// 두 눈이 수평이 되도록 되돌린 좌표
		function T(p) {
			var dx = p.x - ox, dy = p.y - oy;
			return { x: (dx * cos + dy * sin) / unit, y: (-dx * sin + dy * cos) / unit };
		}
		var P = pts.map(T);
		var dist = function (a, b) { return Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y); };

		var faceW = dist(234, 454);                  // 광대(귀 앞) 폭 — 얼굴에서 가장 넓은 곳
		var chinY = P[I.chin].y, topY = P[I.foreheadTop].y;
		var faceH = chinY - topY;

		// 눈썹선 = 양 눈썹에서 가장 높은(=위) 지점
		var browY = Math.min(P[105].y, P[334].y, P[70].y, P[300].y);
		var noseY = P[I.noseBase].y;                 // 코 밑
		// 삼정 — 이마 / 눈썹~코밑 / 코밑~턱
		var up = browY - topY, mid = noseY - browY, low = chinY - noseY;
		var sum = up + mid + low || 1;

		var eyeW = (dist(33, 133) + dist(362, 263)) / 2;
		var eyeH = (Math.abs(P[159].y - P[145].y) + Math.abs(P[386].y - P[374].y)) / 2;
		// 눈꼬리 각도 — 안쪽(133·362)보다 바깥(33·263)이 위에 있으면 '올라간 눈'.
		// 화면 좌표는 아래로 갈수록 y 가 크므로 (안쪽 y - 바깥 y) 가 양수면 올라간 것이다.
		// ⚠ 처음에 여기 부호를 반대로 걸어서 80장 재 보니 전부 '처진 눈'으로 나왔다.
		var tiltL = (P[133].y - P[33].y), tiltR = (P[362].y - P[263].y);
		var eyeTilt = (tiltL + tiltR) / 2;

		var browThick = (Math.abs(P[105].y - P[66].y) + Math.abs(P[334].y - P[296].y)) / 2;
		var browTilt = -((P[107].y - P[70].y) + (P[336].y - P[300].y)) / 2;

		var mouthW = dist(61, 291);
		var lipH = Math.abs(P[0].y - P[17].y);
		// 입꼬리가 입 가운데보다 위면 양수 (웃는 상)
		var mouthTilt = ((P[13].y + P[14].y) / 2) - ((P[61].y + P[291].y) / 2);

		// 하악각 — 턱 모서리(172·397)와 턱끝(152)이 이루는 각. 작을수록 각진 턱.
		function angle(a, b, c) {
			var ux = P[a].x - P[b].x, uy = P[a].y - P[b].y;
			var wx = P[c].x - P[b].x, wy = P[c].y - P[b].y;
			var d = (ux * wx + uy * wy) / (Math.hypot(ux, uy) * Math.hypot(wx, wy) || 1);
			return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
		}
		var jawAngle = (angle(234, 172, I.chin) + angle(454, 397, I.chin)) / 2;

		return {
			faceW: faceW, faceH: faceH,
			ratio: faceH / faceW,                       // 세로/가로. 크면 긴 얼굴
			foreheadW: dist(54, 284) / faceW,           // 이마 폭
			jawW: dist(172, 397) / faceW,               // 턱 폭
			chinW: dist(148, 377) / faceW,              // 턱 끝 폭 (작을수록 뾰족)
			jawAngle: jawAngle,                         // 작을수록 각진 턱
			up: up / sum, mid: mid / sum, low: low / sum,   // 삼정 비율 (합이 1)
			eyeSize: eyeW / faceW,
			eyeOpen: eyeH / (eyeW || 1),                // 눈이 얼마나 큰가(세로/가로)
			eyeTilt: eyeTilt / (eyeW || 1),             // + 올라간 눈 / - 처진 눈
			eyeGap: dist(133, 362) / (eyeW || 1),       // 미간
			browThick: browThick / (faceH || 1),
			browTilt: browTilt / (eyeW || 1),
			noseW: dist(I.alaL, I.alaR) / faceW,        // 콧방울 폭 — 관상에서 재물궁
			noseLen: (P[I.noseBase].y - P[I.noseRoot].y) / (faceH || 1),
			mouthW: mouthW / faceW,
			lipThick: lipH / (faceH || 1),
			mouthTilt: mouthTilt / (mouthW || 1)        // + 올라간 입꼬리
		};
	};

	global.FM = FM;
})(window);
