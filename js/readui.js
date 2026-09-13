/* readui.js — "얼굴로 보는 ○○" 페이지가 같이 쓰는 화면 껍데기.
 *
 * 각 페이지는 analyze(지표) 하나만 쓰면 된다. 사진 올리기·얼굴 찾기·
 * 결과 카드·막대그래프·저장/공유는 전부 여기서 처리한다.
 *
 *   ReadUI.page({
 *     title, subtitle, note, button, fileName,
 *     analyze: function (f, pts, cv) {
 *       return {
 *         headline: '土(토) 얼굴',
 *         tagline : '사람이 모이는 상',
 *         bars    : [{label:'토', pct:38, on:true}, ...],
 *         sections: [{h:'타고난 기질', p:'...'}, ...],
 *         share   : '공유할 때 붙는 한 줄'
 *       };
 *     }
 *   })
 */
(function (global) {
	'use strict';

	var ReadUI = {};

	function el(tag, cls, txt) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (txt != null) e.textContent = txt;
		return e;
	}

	ReadUI.page = function (spec) {
		var root = el('div', 'rd-wrap');
		document.body.appendChild(root);

		var head = el('section', 'rd-head');
		head.appendChild(el('h1', 'rd-title', spec.title));
		head.appendChild(el('h2', 'rd-sub', spec.subtitle));
		if (spec.note) head.appendChild(el('p', 'rd-note', spec.note));
		head.appendChild(el('p', 'rd-privacy',
			'사진은 이 화면 안에서만 계산됩니다. 서버로 보내지 않고, 저장하지도 않습니다.'));
		root.appendChild(head);

		/* 사진 */
		var box = el('label', 'rd-pick');
		var input = el('input');
		input.type = 'file'; input.accept = 'image/*'; input.className = 'rd-file';
		var ph = el('div', 'rd-ph', '＋');
		box.appendChild(input); box.appendChild(ph);
		box.appendChild(el('div', 'rd-cap', '얼굴 사진을 올려 주세요'));
		root.appendChild(box);

		var go = el('button', 'rd-go', spec.button || '결과 보기');
		go.type = 'button'; go.disabled = true;
		root.appendChild(go);
		var st = el('p', 'rd-status', '사진을 올려 주세요.');
		root.appendChild(st);

		var res = el('div', 'rd-res');
		res.style.display = 'none';
		root.appendChild(res);

		var cur = { cv: null, pts: null };
		var misses = 0;          /* 연달아 얼굴을 못 찾은 횟수 */

		function status(msg, busy) {
			st.textContent = msg;
			st.className = 'rd-status' + (busy ? ' busy' : '');
		}

		/* 얼굴 인식은 기기의 그래픽 엔진(WebGL)을 탄다. 드물게 그 엔진이 결과를
		   제대로 못 내놓는 기기가 있고, 그러면 어떤 사진을 넣어도 "얼굴을 못 찾았습니다"
		   만 반복된다. 사용자는 자기 사진 탓인 줄 알고 몇 번이고 다시 시도한다.
		   두 번 연속 실패하면 사정을 솔직히 알려 주고 빠져나갈 길을 준다. */
		function noteDeviceIssue() {
			if (document.querySelector('.rd-devnote')) return;
			var box = el('p', 'rd-devnote');
			box.appendChild(document.createTextNode(
				'사진을 여러 장 바꿔도 얼굴을 못 찾는다면 이 기기에서 얼굴 인식이 지원되지 않는 것일 수 있습니다. '));
			var a = document.createElement('a');
			a.href = 'https://dypark9606.github.io/aifacetest/';
			a.textContent = '웹에서 열어 보기';
			box.appendChild(a);
			st.parentNode.insertBefore(box, st.nextSibling);
		}

		input.addEventListener('change', function () {
			var f = input.files && input.files[0];
			if (!f) return;
			status('사진을 읽고 얼굴을 찾는 중입니다…', true);
			go.disabled = true;
			FM.fileToCanvas(f).then(function (cv) {
				cur.cv = cv;
				ph.textContent = '';
				ph.style.backgroundImage = 'url(' + cv.toDataURL('image/jpeg', 0.8) + ')';
				return FM.detect(cv);
			}).then(function (pts) {
				cur.pts = pts;
				if (!pts) {
					box.classList.add('rd-bad');
					status('얼굴을 못 찾았습니다. 정면으로 크게 나온 사진으로 바꿔 보세요.');
					if (++misses >= 2) noteDeviceIssue();
					return;
				}
				misses = 0;
				var bad = FM.check(pts, cur.cv);
				box.classList.toggle('rd-bad', !!bad);
				status(bad || '준비됐습니다. 아래 버튼을 누르세요.');
				go.disabled = false;
			}).catch(function (e) {
				ph.textContent = '＋';
				status('사진을 읽지 못했습니다. (' + e.message + ')');
			});
		});

		go.addEventListener('click', function () {
			if (!cur.pts) return;
			status('보는 중입니다…', true);
			setTimeout(function () {
				try {
					render(spec.analyze(FM.features(cur.pts), cur.pts, cur.cv));
					status('');
				} catch (e) {
					status('결과를 만들지 못했습니다. (' + e.message + ')');
				}
			}, 30);
		});

		/* 처음 상태로 되돌린다. 사진·판정·결과를 모두 지우고 고르기 화면으로 올린다. */
		function reset() {
			cur.cv = null;
			cur.pts = null;
			last = null;
			try { input.value = ''; } catch (e) { }
			res.style.display = 'none';
			res.innerHTML = '';
			ph.textContent = '＋';
			ph.style.backgroundImage = '';
			box.classList.remove('rd-bad');
			go.disabled = true;
			status('사진을 올려 주세요.');
			box.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}

		var last = null;
		function render(r) {
			last = r;
			res.innerHTML = '';
			var card = el('div', 'rd-card');
			card.appendChild(el('div', 'rd-headline', r.headline));
			if (r.tagline) card.appendChild(el('div', 'rd-tagline', r.tagline));
			res.appendChild(card);

			if (r.bars && r.bars.length) {
				var wrap = el('div', 'rd-bars');
				r.bars.forEach(function (b) {
					var row = el('div', 'rd-bar' + (b.on ? ' on' : ''));
					row.appendChild(el('span', 'rd-bl', b.label));
					var track = el('span', 'rd-track');
					var fill = el('span', 'rd-fill');
					fill.style.width = Math.max(2, Math.min(100, b.pct)) + '%';
					track.appendChild(fill);
					row.appendChild(track);
					row.appendChild(el('span', 'rd-bv', Math.round(b.pct) + '%'));
					wrap.appendChild(row);
				});
				res.appendChild(wrap);
			}

			(r.sections || []).forEach(function (s) {
				var sec = el('section', 'rd-sec');
				sec.appendChild(el('h3', null, s.h));
				sec.appendChild(el('p', null, s.p));
				res.appendChild(sec);
			});

			var btns = el('div', 'rd-btns');
			var bCopy = el('button', 'rd-btn', '결과 복사');
			var bShare = el('button', 'rd-btn share-result-btn', '결과 공유');
			/* 결과를 본 뒤 다른 사진으로 바로 다시 할 수 있어야 한다.
			   화면을 새로 읽지 않고 그 자리에서 되돌린다 — 앱에서는 새로고침이
			   MediaPipe 를 다시 올리느라 몇 초씩 걸린다. */
			var bAgain = el('button', 'rd-btn rd-again', '다른 사진으로 다시 하기');
			bCopy.type = bShare.type = bAgain.type = 'button';
			bShare.setAttribute('data-share-text', text(r));
			btns.appendChild(bCopy); btns.appendChild(bShare); btns.appendChild(bAgain);
			res.appendChild(btns);
			res.appendChild(el('p', 'rd-disc',
				'재미로 보는 결과입니다. 얼굴로 사람의 성격이나 운명이 정해지지는 않습니다.'));

			bCopy.addEventListener('click', function () { copy(text(r), bCopy); });
			bShare.addEventListener('click', function () {
				if (navigator.share) navigator.share({ text: text(r) }).catch(function () { });
				else copy(text(r), bShare);
			});
			bAgain.addEventListener('click', reset);

			res.style.display = '';
			res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}

		function text(r) {
			var lines = [spec.title, r.headline + (r.tagline ? ' — ' + r.tagline : ''), ''];
			(r.sections || []).forEach(function (s) { lines.push('[' + s.h + '] ' + s.p); });
			lines.push('', r.share || '', 'https://dypark9606.github.io/aifacetest/');
			return lines.join('\n');
		}

		function copy(t, btn) {
			var done = function () {
				var old = btn.textContent;
				btn.textContent = '복사했습니다';
				setTimeout(function () { btn.textContent = old; }, 1500);
			};
			if (navigator.clipboard) {
				navigator.clipboard.writeText(t).then(done, function () { fallback(t, done); });
			} else { fallback(t, done); }
		}
		function fallback(t, done) {
			var ta = document.createElement('textarea');
			ta.value = t; document.body.appendChild(ta); ta.select();
			try { document.execCommand('copy'); done(); } catch (e) { }
			ta.remove();
		}

		FM.load().catch(function () {
			status('얼굴 인식 모듈을 못 불러왔습니다. 인터넷 연결을 확인해 주세요.');
		});
	};

	global.ReadUI = ReadUI;
})(window);
