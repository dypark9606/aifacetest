/* warpui.js — 노화·체지방·2세 세 페이지가 같이 쓰는 화면 껍데기.
 *
 * 각 페이지는 "무엇을 받아서 어떻게 바꿀지"(run)만 쓰고, 사진 올리기·슬라이더·
 * 진행 표시·결과 비교·저장/공유는 전부 여기서 처리한다.
 *
 *   WarpUI.page({
 *     title, subtitle, note,
 *     photos : [{key:'a', label:'내 사진'}],       // 1장 또는 2장
 *     sliders: [{key:'age', label:'몇 살의 나', min:30, max:80, step:5, value:50, unit:'세'}],
 *     toggles: [{key:'sex', options:[['boy','아들'],['girl','딸']], value:'boy'}],
 *     button : '만들어 보기',
 *     run    : function(ctx){ ... return 캔버스 }   // ctx = {img, pts, val, status}
 *   })
 */
(function (global) {
	'use strict';

	var WarpUI = {};

	function el(tag, cls, txt) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (txt != null) e.textContent = txt;
		return e;
	}

	WarpUI.page = function (spec) {
		var root = el('div', 'fw-wrap');
		document.body.appendChild(root);

		/* 머리말 */
		var head = el('section', 'fw-head');
		head.appendChild(el('h1', 'fw-title', spec.title));
		head.appendChild(el('h2', 'fw-sub', spec.subtitle));
		if (spec.note) head.appendChild(el('p', 'fw-note', spec.note));
		head.appendChild(el('p', 'fw-privacy',
			'사진은 이 화면 안에서만 계산됩니다. 서버로 보내지 않고, 저장하지도 않습니다.'));
		root.appendChild(head);

		/* 사진 올리는 칸 */
		var state = { img: {}, pts: {}, val: {} };
		var picks = el('div', 'fw-picks');
		spec.photos.forEach(function (p) {
			var box = el('label', 'fw-pick');
			var input = el('input');
			input.type = 'file'; input.accept = 'image/*'; input.className = 'fw-file';
			var ph = el('div', 'fw-ph', '＋');
			var cap = el('div', 'fw-cap', p.label);
			box.appendChild(input); box.appendChild(ph); box.appendChild(cap);
			picks.appendChild(box);

			input.addEventListener('change', function () {
				var f = input.files && input.files[0];
				if (!f) return;
				ph.textContent = '읽는 중…';
				status('사진을 읽고 얼굴을 찾는 중입니다…', true);
				FW.fileToCanvas(f).then(function (cv) {
					state.img[p.key] = cv;
					ph.textContent = '';
					ph.style.backgroundImage = 'url(' + cv.toDataURL('image/jpeg', 0.8) + ')';
					return FW.detect(cv);
				}).then(function (pts) {
					state.pts[p.key] = pts;
					if (!pts) {
						box.classList.add('fw-bad');
						status('얼굴을 못 찾았습니다. 정면으로 크게 나온 사진으로 바꿔 보세요.');
					} else {
						// 얼굴은 찾았는데 사진이 이상한 경우를 따로 알려 준다
						var bad = FW.check(pts, state.img[p.key]);
						box.classList.toggle('fw-bad', !!bad);
						status(bad || '준비됐습니다. 아래 버튼을 누르세요.');
					}
					refresh();
				}).catch(function (e) {
					ph.textContent = '＋';
					status('사진을 읽지 못했습니다. (' + e.message + ')');
				});
			});
		});
		root.appendChild(picks);

		/* 조절기 */
		var ctrls = el('div', 'fw-ctrls');
		(spec.sliders || []).forEach(function (s) {
			state.val[s.key] = s.value;
			var row = el('div', 'fw-row');
			var lab = el('div', 'fw-lab');
			lab.appendChild(el('span', null, s.label));
			var out = el('b', 'fw-out', s.value + (s.unit || ''));
			lab.appendChild(out);
			var r = el('input'); r.type = 'range';
			r.min = s.min; r.max = s.max; r.step = s.step; r.value = s.value;
			r.className = 'fw-range';
			r.addEventListener('input', function () {
				state.val[s.key] = +r.value;
				out.textContent = r.value + (s.unit || '');
			});
			row.appendChild(lab); row.appendChild(r);
			ctrls.appendChild(row);
		});
		(spec.toggles || []).forEach(function (t) {
			state.val[t.key] = t.value;
			var row = el('div', 'fw-row');
			if (t.label) row.appendChild(el('div', 'fw-lab', t.label));
			var g = el('div', 'fw-seg');
			t.options.forEach(function (o) {
				var b = el('button', 'fw-segbtn' + (o[0] === t.value ? ' on' : ''), o[1]);
				b.type = 'button';
				b.addEventListener('click', function () {
					state.val[t.key] = o[0];
					Array.prototype.forEach.call(g.children, function (c) { c.classList.remove('on'); });
					b.classList.add('on');
				});
				g.appendChild(b);
			});
			row.appendChild(g);
			ctrls.appendChild(row);
		});
		root.appendChild(ctrls);

		/* 실행 버튼 + 상태 */
		var go = el('button', 'fw-go', spec.button || '만들어 보기');
		go.type = 'button'; go.disabled = true;
		root.appendChild(go);
		var st = el('p', 'fw-status', '사진을 올려 주세요.');
		root.appendChild(st);

		function status(msg, busy) {
			st.textContent = msg;
			st.className = 'fw-status' + (busy ? ' busy' : '');
		}
		function refresh() {
			var ok = spec.photos.every(function (p) { return state.pts[p.key]; });
			go.disabled = !ok;
		}

		/* 결과 */
		var res = el('div', 'fw-res');
		res.style.display = 'none';
		var cmp = el('div', 'fw-cmp');
		var beforeBox = el('figure', 'fw-fig'), afterBox = el('figure', 'fw-fig');
		beforeBox.appendChild(el('figcaption', null, '지금'));
		afterBox.appendChild(el('figcaption', null, spec.afterLabel || '예측'));
		cmp.appendChild(beforeBox); cmp.appendChild(afterBox);
		res.appendChild(cmp);
		var btns = el('div', 'fw-btns');
		var bSave = el('button', 'fw-btn', '사진으로 저장');
		var bShare = el('button', 'fw-btn', '공유하기');
		bSave.type = bShare.type = 'button';
		btns.appendChild(bSave); btns.appendChild(bShare);
		res.appendChild(btns);
		res.appendChild(el('p', 'fw-disc',
			'재미로 보는 결과입니다. 실제 모습이나 건강 상태를 뜻하지 않습니다.'));
		root.appendChild(res);

		var lastOut = null;
		go.addEventListener('click', function () {
			go.disabled = true;
			status('만드는 중입니다… 몇 초 걸립니다.', true);
			// 화면이 멈춘 것처럼 보이지 않게 한 박자 쉬고 계산한다
			setTimeout(function () {
				try {
					var out = spec.run({
						img: state.img, pts: state.pts, val: state.val, status: status
					});
					lastOut = out;
					show(out);
					status('다 됐습니다. 값을 바꾸고 다시 눌러 보세요.');
				} catch (e) {
					status('만들지 못했습니다. (' + e.message + ')');
				}
				go.disabled = false;
			}, 40);
		});

		function show(out) {
			var src = state.img[spec.photos[0].key];
			put(beforeBox, spec.baseCanvas ? spec.baseCanvas(state) : src);
			put(afterBox, out);
			res.style.display = '';
			res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
		function put(fig, cv) {
			var old = fig.querySelector('canvas');
			if (old) old.remove();
			cv.className = 'fw-canvas';
			fig.insertBefore(cv, fig.firstChild);
		}

		bSave.addEventListener('click', function () {
			if (lastOut) FW.save(lastOut, (spec.fileName || 'result') + '.png');
		});
		bShare.addEventListener('click', function () {
			if (lastOut) FW.share(lastOut, (spec.fileName || 'result') + '.png', spec.shareText || '');
		});

		// 모델은 미리 받아 둔다 (처음 한 번 몇 초 걸린다)
		FW.load().then(function () {
			if (st.textContent === '사진을 올려 주세요.') status('사진을 올려 주세요.');
		}).catch(function () {
			status('얼굴 인식 모듈을 못 불러왔습니다. 인터넷 연결을 확인해 주세요.');
		});

		return state;
	};

	global.WarpUI = WarpUI;
})(window);
