/* face_age.js — 미래의 내 모습(노화) 예측
 *
 * 나이가 들면 얼굴에서 실제로 일어나는 일들만 골라 넣었다.
 *   ① 연부조직이 아래로 처진다 (볼·턱선·입꼬리·눈꺼풀)
 *   ② 하관이 넓어지고 턱선이 무너진다
 *   ③ 헤어라인이 뒤로 물러난다
 *   ④ 팔자주름·이마주름·눈가주름이 생기고 눈밑에 그늘이 진다
 *   ⑤ 피부 채도가 떨어지고 노랗게 변한다, 머리가 센다
 * 사진처럼 진짜 늙은 얼굴을 만드는 건 생성모델(GAN)이 필요하고 그건 사진을
 * 서버로 보내야 한다. 여기서는 그 선을 넘지 않는다.
 */
(function () {
	'use strict';

	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	// 0→1 로 부드럽게 올라가는 계단
	function ramp(v, a, b) {
		var t = clamp((v - a) / (b - a), 0, 1);
		return t * t * (3 - 2 * t);
	}
	// 가운데에서 가장 큰 종 모양
	function bell(v, c, w) {
		var t = clamp(Math.abs(v - c) / w, 0, 1);
		return 1 - t * t;
	}

	function agePoints(pts, s) {
		var I = FW.IDX, M = FW.metrics(pts);
		var np = pts.map(function (p) { return { x: p.x, y: p.y }; });
		var moved = {};
		function mv(i, dx, dy) {
			np[i].x += dx; np[i].y += dy; moved[i] = true;
		}

		// ① 윤곽 — 아래쪽일수록 처지고, 하관은 옆으로 퍼진다
		I.oval.forEach(function (i) {
			var ny = (pts[i].y - M.top.y) / M.h;
			var sag = M.h * 0.058 * s * ramp(ny, 0.28, 0.95);
			var out = M.w * 0.045 * s * bell(ny, 0.72, 0.45);
			var dir = pts[i].x < M.cx ? -1 : 1;
			mv(i, dir * out, sag);
		});
		// 헤어라인은 반대로 위로 물러난다
		mv(I.foreheadTop, 0, -M.h * 0.034 * s);
		mv(I.chin, 0, M.h * 0.020 * s);

		// ② 볼 — 광대의 볼륨이 아래로 내려앉는다
		[[I.cheekL, -1], [I.cheekR, 1], [205, -1], [425, 1], [116, -1], [345, 1]].forEach(function (c) {
			if (!pts[c[0]]) return;
			mv(c[0], c[1] * M.w * 0.024 * s, M.h * 0.046 * s);
		});

		// ③ 입 — 입꼬리가 내려가고 입술이 얇아진다
		I.lips.forEach(function (i) { mv(i, 0, M.h * 0.018 * s); });
		mv(I.mouthL, -M.w * 0.018 * s, M.h * 0.028 * s);
		mv(I.mouthR, M.w * 0.018 * s, M.h * 0.028 * s);
		mv(0, 0, M.h * 0.004 * s);      // 윗입술 가운데는 조금만

		// ④ 눈 — 윗꺼풀이 덮이고 바깥 끝이 처진다
		[159, 160, 158, 157, 161, 386, 385, 387, 384, 388].forEach(function (i) {
			mv(i, 0, M.h * 0.020 * s);
		});
		[145, 153, 144, 374, 380, 373].forEach(function (i) { mv(i, 0, M.h * 0.005 * s); });
		mv(I.eyeOuterL, -M.w * 0.004 * s, M.h * 0.010 * s);
		mv(I.eyeOuterR, M.w * 0.004 * s, M.h * 0.010 * s);

		// ⑤ 눈썹이 내려앉는다 (바깥쪽이 더)
		I.browL.concat(I.browR).forEach(function (i, k) {
			var outer = (k === 0 || k === 5) ? 1.6 : 1;
			mv(i, 0, M.h * 0.020 * s * outer);
		});

		// ⑥ 코 — 길어지고 콧방울이 퍼진다
		[I.noseTip, I.noseBase, 4, 5].forEach(function (i) {
			if (pts[i]) mv(i, 0, M.h * 0.018 * s);
		});
		mv(I.alaL, -M.w * 0.014 * s, M.h * 0.006 * s);
		mv(I.alaR, M.w * 0.014 * s, M.h * 0.006 * s);

		var from = [], to = [];
		Object.keys(moved).forEach(function (k) {
			from.push(pts[k]); to.push(np[k]);
		});
		return { from: from, to: to, np: np, M: M };
	}

	// 주름·그늘을 얹는다. 좌표는 변형된 뒤의 위치(np)를 쓴다.
	function drawWrinkles(cv, np, M, s) {
		var ctx = cv.getContext('2d'), I = FW.IDX;
		var ink = 'rgb(168,133,116)';
		var lw = Math.max(0.8, M.w * 0.006);

		// 팔자주름 — 콧방울에서 입꼬리를 지나 아래로
		[[I.alaL, I.mouthL, -1], [I.alaR, I.mouthR, 1]].forEach(function (t) {
			var a = np[t[0]], b = np[t[1]], dir = t[2];
			FW.softStroke(ctx, [
				{ x: a.x + dir * M.w * 0.010, y: a.y - M.h * 0.005 },
				{ x: (a.x + b.x) / 2 + dir * M.w * 0.028, y: (a.y + b.y) / 2 },
				{ x: b.x + dir * M.w * 0.012, y: b.y + M.h * 0.010 },
				{ x: b.x + dir * M.w * 0.006, y: b.y + M.h * 0.045 }
			], ink, lw, clamp(0.26 * s, 0, 0.34));
		});

		// 입가에서 턱으로 내려가는 선 (마리오네트 라인) — 많이 늙었을 때만
		if (s > 0.55) {
			[[I.mouthL, -1], [I.mouthR, 1]].forEach(function (t) {
				var b = np[t[0]], dir = t[1];
				FW.softStroke(ctx, [
					{ x: b.x + dir * M.w * 0.020, y: b.y + M.h * 0.012 },
					{ x: b.x + dir * M.w * 0.030, y: b.y + M.h * 0.070 }
				], ink, lw * 0.85, clamp(0.14 * (s - 0.55), 0, 0.16));
			});
		}

		// 이마 주름 — 눈썹 위와 헤어라인 사이에 가로로 세 줄
		var browY = Math.min(np[105].y, np[334].y), topY = np[I.foreheadTop].y;
		var xl = np[103].x, xr = np[332].x;
		for (var k = 1; k <= 3; k++) {
			var y = browY - (browY - topY) * (k / 4.2);
			FW.softStroke(ctx, [
				{ x: xl + M.w * 0.09, y: y + M.h * 0.006 },
				{ x: (xl + xr) / 2, y: y - M.h * 0.004 },
				{ x: xr - M.w * 0.09, y: y + M.h * 0.006 }
			], ink, lw * 0.75, clamp(0.16 * s, 0, 0.21));
		}

		// 눈가 주름 — 바깥 눈꼬리에서 부챗살로
		[[I.eyeOuterL, -1], [I.eyeOuterR, 1]].forEach(function (t) {
			var e = np[t[0]], dir = t[1];
			[-0.55, 0, 0.55].forEach(function (ang) {
				FW.softStroke(ctx, [
					{ x: e.x + dir * M.w * 0.012, y: e.y + M.h * 0.004 * ang * 3 },
					{ x: e.x + dir * M.w * 0.055, y: e.y + M.h * (0.004 + 0.020 * ang) }
				], ink, lw * 0.6, clamp(0.20 * s, 0, 0.26));
			});
		});

		// 눈밑 그늘
		[FW.mean(np, I.eyeL), FW.mean(np, I.eyeR)].forEach(function (e) {
			FW.softShade(ctx, e.x, e.y + M.h * 0.055, M.w * 0.10, M.h * 0.035,
				'rgba(150,122,120,1)', clamp(0.30 * s, 0, 0.36));
		});

		// 볼 아래 그늘 (처진 살의 경계)
		[[np[I.cheekL], -1], [np[I.cheekR], 1]].forEach(function (t) {
			if (!t[0]) return;
			FW.softShade(ctx, t[0].x + t[1] * M.w * 0.02, t[0].y + M.h * 0.075,
				M.w * 0.11, M.h * 0.045, 'rgba(158,136,126,1)', clamp(0.20 * s, 0, 0.24));
		});
	}

	/* 머리를 세게 한다 — 머리 부분의 어두운 픽셀만 회색 쪽으로 끌어당긴다.
	 *
	 * ⚠ 여기서 두 번 실패했다(2026-09-07).
	 *   ① 네모 영역에 그대로 적용 → 머리 위에 **회색 사각형**이 생겼다.
	 *   ② 타원으로 바꿨는데도 아래쪽을 이마선에서 뚝 끊어 → **앞머리 한가운데 가로줄**이 남았다.
	 *   그래서 좌우는 타원, 아래는 이마선을 사이에 두고 길게 흐려지도록 두 겹으로 준다.
	 *   흰머리는 "티 나게" 하는 것보다 "티 안 나게" 하는 게 결과가 낫다. 약하게 간다.
	 */
	function grayHair(cv, np, M, s) {
		var ctx = cv.getContext('2d');
		var top = np[FW.IDX.foreheadTop];
		var x0 = Math.max(0, Math.round(top.x - M.w * 0.85));
		var x1 = Math.min(cv.width, Math.round(top.x + M.w * 0.85));
		var y0 = Math.max(0, Math.round(top.y - M.h * 0.85));
		var y1 = Math.min(cv.height, Math.round(top.y + M.h * 0.14));
		if (x1 <= x0 || y1 <= y0) return;

		var im = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = im.data;
		var W = x1 - x0, H = y1 - y0;
		var cx = top.x - x0, cy = top.y - y0;
		var rx = M.w * 0.80, ry = M.h * 0.80;
		var fadeTop = M.h * 0.10, fadeSpan = M.h * 0.22;   // 이마선을 사이에 둔 세로 흐림

		for (var y = 0; y < H; y++) {
			// 이마선보다 아래로 갈수록 0 이 된다 (앞머리 잘린 자국을 없앤다)
			var fv = (cy + fadeTop - y) / fadeSpan;
			fv = fv < 0 ? 0 : fv > 1 ? 1 : fv;
			if (fv <= 0) continue;
			for (var x = 0; x < W; x++) {
				var t = Math.hypot((x - cx) / rx, (y - cy) / ry);
				var fe = t >= 1 ? 0 : (t <= 0.35 ? 1 : (1 - t) / 0.65);
				var f = fe * fv;
				if (f <= 0) continue;
				var i = (y * W + x) * 4;
				var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
				if (l > 165) continue;                       // 이미 밝으면 머리카락이 아니다
				var k = s * 0.70 * f * (1 - l / 190);
				// 밝기 변화(=머리카락 결)는 남기고 색만 회색으로 끌어간다
				var g = l * 0.68 + 165 * 0.32;
				d[i] += (g - d[i]) * k;
				d[i + 1] += (g - d[i + 1]) * k;
				d[i + 2] += (g - d[i + 2]) * k;
			}
		}
		ctx.putImageData(im, x0, y0);
	}

	WarpUI.page({
		title: '미래의 내 모습',
		subtitle: '몇 년 뒤 나는 어떻게 생겼을까',
		note: '정면으로 크고 밝게 나온 사진일수록 잘 됩니다. 안경·마스크는 벗은 사진이 좋아요.',
		afterLabel: '몇 년 뒤',
		fileName: '미래의_내모습',
		shareText: '인공지능이 그려준 몇 년 뒤 내 얼굴',
		photos: [{ key: 'a', label: '내 사진' }],
		sliders: [{ key: 'years', label: '몇 년 뒤가 궁금한가요', min: 5, max: 50, step: 5, value: 25, unit: '년 뒤' }],
		button: '늙은 내 얼굴 보기',

		run: function (c) {
			var cv = c.img.a, pts = c.pts.a;
			var s = clamp(c.val.years / 38, 0.12, 1.35);

			var W = agePoints(pts, s);
			var out = FW.warp(cv, W.from, W.to, { step: 5 });

			// 피부 — 채도가 떨어지고 노랗게, 대비는 조금 올라간다
			FW.adjust(out, {
				sat: 1 - 0.28 * s,
				bright: -9 * s,
				warm: 9 * s,
				contrast: 1 + 0.08 * s
			});
			drawWrinkles(out, W.np, W.M, s);
			grayHair(out, W.np, W.M, s);
			return out;
		}
	});
})();
