/* face_bodyfat.js — 체지방률이 바뀌면 얼굴이 어떻게 변할까
 *
 * 셋 중에서 **원리가 가장 단순하고 그래서 가장 잘 맞는** 기능이다.
 * 체지방이 빠지고 붙는 건 결국 얼굴에서 **형상 변화**로 나타나기 때문이다.
 *   살이 붙으면 : 볼이 옆으로 퍼지고, 턱선이 묻히고, 턱 아래에 살이 접힌다
 *   살이 빠지면 : 하관이 좁아지고, 광대뼈 밑에 그늘이 지고, 턱선이 드러난다
 * 체지방 1%p 당 얼굴 폭이 얼마나 변하는지는 사람마다 다르다. 여기서는
 * 12%p 차이를 "눈에 띄게 달라 보이는 정도"로 잡았다.
 */
(function () {
	'use strict';

	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function ramp(v, a, b) {
		var t = clamp((v - a) / (b - a), 0, 1);
		return t * t * (3 - 2 * t);
	}
	function bell(v, c, w) {
		var t = clamp(Math.abs(v - c) / w, 0, 1);
		return 1 - t * t;
	}

	function fatPoints(pts, s) {
		var I = FW.IDX, M = FW.metrics(pts);
		var np = pts.map(function (p) { return { x: p.x, y: p.y }; });
		var moved = {};
		function mv(i, dx, dy) { np[i].x += dx; np[i].y += dy; moved[i] = true; }

		// 윤곽 — 하관이 옆으로 퍼진다(또는 좁아진다)
		I.oval.forEach(function (i) {
			var ny = (pts[i].y - M.top.y) / M.h;
			var k = 0.175 * s * bell(ny, 0.70, 0.58) * ramp(ny, 0.18, 0.42);
			var dir = pts[i].x < M.cx ? -1 : 1;
			mv(i, dir * Math.abs(pts[i].x - M.cx) * k, M.h * 0.030 * s * ramp(ny, 0.55, 1.0));
		});

		// 볼 — 살이 붙으면 바깥·아래로
		[[I.cheekL, -1], [I.cheekR, 1], [205, -1], [425, 1], [116, -1], [345, 1],
		[123, -1], [352, 1]].forEach(function (c) {
			if (!pts[c[0]]) return;
			mv(c[0], c[1] * M.w * 0.040 * s, M.h * 0.018 * s);
		});

		// 콧방울도 아주 조금 따라 움직인다
		mv(I.alaL, -M.w * 0.006 * s, 0);
		mv(I.alaR, M.w * 0.006 * s, 0);

		var from = [], to = [];
		Object.keys(moved).forEach(function (k) { from.push(pts[k]); to.push(np[k]); });

		// 턱 아래(목)에는 랜드마크가 없다. 가상의 제어점을 놓아 이중턱을 만든다.
		var chin = pts[I.chin];
		[-1, 1].forEach(function (dir) {
			var p = { x: chin.x + dir * M.w * 0.30, y: chin.y + M.h * 0.13 };
			from.push(p);
			to.push({ x: p.x + dir * M.w * 0.130 * s, y: p.y + M.h * 0.016 * s });
		});
		var below = { x: chin.x, y: chin.y + M.h * 0.10 };
		from.push(below);
		to.push({ x: below.x, y: below.y + M.h * 0.045 * s });

		return { from: from, to: to, np: np, M: M };
	}

	// 살이 빠졌을 때: 광대 아래와 턱선에 그늘을 넣어야 "빠진 것처럼" 보인다
	function leanShading(cv, np, M, k) {
		var ctx = cv.getContext('2d');
		[[np[116] || np[FW.IDX.cheekL], -1], [np[345] || np[FW.IDX.cheekR], 1]].forEach(function (t) {
			if (!t[0]) return;
			FW.softShade(ctx, t[0].x + t[1] * M.w * 0.01, t[0].y + M.h * 0.055,
				M.w * 0.125, M.h * 0.055, 'rgba(140,115,105,1)', 0.42 * k);
		});
		// 턱선 아래 그림자
		var chin = np[FW.IDX.chin];
		FW.softShade(ctx, chin.x, chin.y + M.h * 0.035, M.w * 0.22, M.h * 0.035,
			'rgba(140,120,112,1)', 0.30 * k);
	}

	// 살이 붙었을 때: 볼에 부드러운 하이라이트가 생긴다
	function fullShading(cv, np, M, k) {
		var ctx = cv.getContext('2d');
		[[np[FW.IDX.cheekL], -1], [np[FW.IDX.cheekR], 1]].forEach(function (t) {
			if (!t[0]) return;
			ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			ctx.globalAlpha = 0.10 * k;
			var g = ctx.createRadialGradient(t[0].x, t[0].y, 0, t[0].x, t[0].y, M.w * 0.16);
			g.addColorStop(0, 'rgba(255,225,205,1)');
			g.addColorStop(1, 'rgba(0,0,0,0)');
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.arc(t[0].x, t[0].y, M.w * 0.16, 0, 6.2832); ctx.fill();
			ctx.restore();
		});
	}

	WarpUI.page({
		title: '체지방률별 내 얼굴',
		subtitle: '살이 빠지면 (또는 찌면) 얼굴이 이렇게 됩니다',
		note: '지금 체지방률과 목표 체지방률을 넣으세요. 남자는 보통 15~25%, 여자는 22~32% 사이입니다.',
		afterLabel: '목표 체지방률',
		fileName: '체지방별_내얼굴',
		shareText: '체지방률이 바뀌면 내 얼굴은 이렇게 됩니다',
		photos: [{ key: 'a', label: '내 사진' }],
		sliders: [
			{ key: 'now', label: '지금 체지방률', min: 5, max: 45, step: 1, value: 24, unit: '%' },
			{ key: 'goal', label: '목표 체지방률', min: 5, max: 45, step: 1, value: 15, unit: '%' }
		],
		button: '바뀐 얼굴 보기',

		run: function (c) {
			var cv = c.img.a, pts = c.pts.a;
			var d = c.val.goal - c.val.now;
			var s = clamp(d / 12, -1.3, 1.3);

			var W = fatPoints(pts, s);
			var out = FW.warp(cv, W.from, W.to, { step: 5 });

			if (s < 0) {
				var k = Math.min(1, -s);
				FW.adjust(out, { sat: 1 - 0.03 * k, contrast: 1 + 0.07 * k, bright: -2 * k });
				leanShading(out, W.np, W.M, k);
			} else if (s > 0) {
				var k2 = Math.min(1, s);
				FW.smooth(out, Math.max(1, Math.round(W.M.w * 0.012)), 0.25 * k2);
				FW.adjust(out, { sat: 1 + 0.04 * k2, bright: 3 * k2, warm: 2 * k2 });
				fullShading(out, W.np, W.M, k2);
			}

			c.status(d === 0
				? '지금과 목표가 같습니다. 목표 체지방률을 바꿔 보세요.'
				: '체지방 ' + c.val.now + '% → ' + c.val.goal + '% ('
				+ (d > 0 ? '+' : '') + d + '%p) 일 때의 얼굴입니다.');
			return out;
		}
	});
})();
