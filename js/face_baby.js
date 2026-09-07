/* face_baby.js — 우리 2세는 어떻게 생겼을까
 *
 * 시중 앱들이 쓰는 방법과 같은 원리다.
 *   ① 두 사진을 눈 위치로 겹쳐 같은 자리에 놓고
 *   ② 랜드마크를 반씩 섞어 "가운데 얼굴"을 만든 뒤 두 사진을 거기로 끌어와 겹치고
 *   ③ 아기 얼굴의 비율로 바꾼다 — 이마가 크고, 눈이 크고, 턱이 작고, 코가 짧다
 * 유전을 계산하는 게 아니라 **두 얼굴의 평균**이다. 재미로 보는 것이다.
 */
(function () {
	'use strict';

	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function ramp(v, a, b) {
		var t = clamp((v - a) / (b - a), 0, 1);
		return t * t * (3 - 2 * t);
	}

	// 모프에 쓸 제어점 — 468점을 다 쓰면 느리기만 하고 결과는 같다
	function ctrlIdx() {
		var I = FW.IDX;
		var s = I.oval.concat(I.eyeL, I.eyeR, I.browL, I.browR, I.lips,
			[I.noseRoot, I.noseTip, I.noseBase, I.alaL, I.alaR, I.chin, I.foreheadTop,
				I.cheekL, I.cheekR, 205, 425, 116, 345, 4, 5, 6, 197]);
		var seen = {}, out = [];
		s.forEach(function (i) { if (!seen[i]) { seen[i] = 1; out.push(i); } });
		return out;
	}

	// 어른 비율 → 아기 비율
	function babyPoints(pts, sex) {
		var I = FW.IDX, M = FW.metrics(pts);
		var np = pts.map(function (p) { return { x: p.x, y: p.y }; });
		var moved = {};
		function mv(i, x, y) { np[i].x = x; np[i].y = y; moved[i] = true; }

		// 이마는 크게, 턱은 작게 — 아기 얼굴을 아기처럼 보이게 하는 건 사실 이 두 가지다
		I.oval.forEach(function (i) {
			var p = pts[i];
			var ny = (p.y - M.top.y) / M.h;
			var x = p.x, y = p.y;
			// 위쪽(이마)
			var up = 1 - ramp(ny, 0.05, 0.40);
			x = M.cx + (x - M.cx) * (1 + 0.06 * up);
			y = y - M.h * 0.075 * up;
			// 아래쪽(턱)
			var lo = ramp(ny, 0.45, 1.0);
			var narrow = 0.26 * lo * (sex === 'girl' ? 1.12 : 0.92);
			x = M.cx + (x - M.cx) * (1 - narrow);
			y = M.top.y + (y - M.top.y) * (1 - 0.17 * lo);
			mv(i, x, y);
		});

		// 눈은 크게 (아기 눈이 커 보이는 건 얼굴이 작아서이기도 하다)
		[[I.eyeL, FW.mean(pts, I.eyeL)], [I.eyeR, FW.mean(pts, I.eyeR)]].forEach(function (e) {
			var c = e[1];
			e[0].forEach(function (i) {
				mv(i, c.x + (pts[i].x - c.x) * 1.24, c.y + (pts[i].y - c.y) * 1.26 - M.h * 0.014);
			});
		});

		// 코는 작고 짧게
		var root = pts[I.noseRoot];
		[I.noseTip, I.noseBase, I.alaL, I.alaR, 4, 5, 195, 197].forEach(function (i) {
			if (!pts[i]) return;
			mv(i, root.x + (pts[i].x - root.x) * 0.82, root.y + (pts[i].y - root.y) * 0.80);
		});

		// 입도 작게, 조금 위로
		var lc = FW.mean(pts, I.lips);
		I.lips.forEach(function (i) {
			mv(i, lc.x + (pts[i].x - lc.x) * 0.86, lc.y + (pts[i].y - lc.y) * 0.86 - M.h * 0.010);
		});

		// 눈썹은 눈을 따라 올라가고 흐려진다
		I.browL.concat(I.browR).forEach(function (i) {
			mv(i, pts[i].x, pts[i].y - M.h * 0.018);
		});

		var from = [], to = [];
		Object.keys(moved).forEach(function (k) { from.push(pts[k]); to.push(np[k]); });
		return { from: from, to: to, np: np, M: M };
	}

	// 두 부모 사진을 나란히 한 장으로 (비교 화면 왼쪽에 쓴다)
	function parentsStrip(state) {
		var a = state.img.a, b = state.img.b;
		if (!a || !b) return a || b;
		var h = 260, w = Math.round(h * 0.78);
		var cv = document.createElement('canvas');
		cv.width = w * 2 + 8; cv.height = h;
		var ctx = cv.getContext('2d');
		ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
		[[a, 0], [b, w + 8]].forEach(function (t) {
			var im = t[0], r = Math.max(w / im.width, h / im.height);
			var dw = im.width * r, dh = im.height * r;
			ctx.save();
			ctx.beginPath(); ctx.rect(t[1], 0, w, h); ctx.clip();
			ctx.drawImage(im, t[1] + (w - dw) / 2, (h - dh) / 2, dw, dh);
			ctx.restore();
		});
		return cv;
	}

	WarpUI.page({
		title: '우리 2세 얼굴',
		subtitle: '두 사람을 섞으면 아이는 이렇게',
		note: '두 사람 모두 정면 사진이어야 합니다. 얼굴 크기는 달라도 알아서 맞춥니다.',
		afterLabel: '우리 아기',
		fileName: '우리2세',
		shareText: '인공지능이 그려준 우리 2세 얼굴',
		photos: [
			{ key: 'a', label: '아빠 (또는 남자)' },
			{ key: 'b', label: '엄마 (또는 여자)' }
		],
		sliders: [
			{ key: 'mix', label: '누구를 더 닮았나요 (0 아빠 ↔ 100 엄마)', min: 20, max: 80, step: 5, value: 50, unit: '' }
		],
		toggles: [
			{ key: 'sex', label: '아들일까요 딸일까요', options: [['boy', '아들'], ['girl', '딸']], value: 'boy' }
		],
		button: '우리 아기 얼굴 보기',
		baseCanvas: parentsStrip,

		run: function (c) {
			// ① 두 사람을 같은 틀에 앉힌다 — 이걸 안 하면 크기·각도가 달라 겹치지 않는다
			var FRAME = { w: 420, h: 520, eyeGap: 0.30, eyeY: 0.40, bg: '#efe7de' };
			var ca = FW.canonical(c.img.a, c.pts.a, FRAME);
			var cb = FW.canonical(c.img.b, c.pts.b, FRAME);
			var pa = ca.pts, pb = cb.pts;

			var w = clamp(c.val.mix / 100, 0, 1);
			var IDX = ctrlIdx();

			// ② 가운데 얼굴을 만들고 둘 다 거기로 끌어온 뒤 겹친다
			var mean = pa.map(function (p, i) {
				return { x: p.x * (1 - w) + pb[i].x * w, y: p.y * (1 - w) + pb[i].y * w };
			});
			var fa = [], fb = [], tm = [];
			IDX.forEach(function (i) { fa.push(pa[i]); fb.push(pb[i]); tm.push(mean[i]); });

			var wa = FW.warp(ca.canvas, fa, tm, { step: 4, lambda: 1e-6 });
			var wb = FW.warp(cb.canvas, fb, tm, { step: 4, lambda: 1e-6 });
			var mixed = FW.blend(wa, wb, w);

			// ③ 아기 비율로
			var Bp = babyPoints(mean, c.val.sex);
			var out = FW.warp(mixed, Bp.from, Bp.to, { step: 4, lambda: 1e-6 });

			// 아기 피부 — 매끈하고 밝다
			FW.smooth(out, Math.max(2, Math.round(Bp.M.w * 0.014)), 0.42);
			FW.adjust(out, {
				sat: c.val.sex === 'girl' ? 1.10 : 1.05,
				bright: 14,
				warm: c.val.sex === 'girl' ? 3 : 1,
				contrast: 0.95
			});

			// ④ 두 사람 배경이 서로 다르니 얼굴만 남기고 부드럽게 지운다
			// 턱 아래(옷·손·마이크)까지 남기면 두 사진이 섞여 이상해진다. 얼굴만 남긴다.
			var M2 = FW.metrics(Bp.np);
			FW.ovalMask(out, (M2.top.x + M2.chin.x) / 2, M2.top.y + M2.h * 0.34,
				M2.w * 0.80, M2.h * 0.86, 0.32);
			out = FW.onBackdrop(out,
				c.val.sex === 'girl' ? '#fff3f6' : '#f0f6ff',
				c.val.sex === 'girl' ? '#ffe3ec' : '#dfeaff');

			c.status(c.val.sex === 'girl' ? '딸이라면 이런 얼굴입니다.' : '아들이라면 이런 얼굴입니다.');
			return out;
		}
	});
})();
