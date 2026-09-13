/* mbti_quiz.js — 질문으로 보는 MBTI (20문항)
 *
 * 원래 이 탭은 얼굴 비율로 MBTI 를 뽑았는데, 근거가 없어서 질문형으로 바꿨다.
 * (2026-09-08 사용자 지시. 얼굴로 성격을 알아내는 방법은 없다.)
 *
 * 네 축에 다섯 문항씩. 한 화면에 한 문항만 띄우고, 고르면 바로 다음으로 넘어간다.
 * 스무 개를 한 화면에 늘어놓으면 폰에서 스크롤만 하다 끝난다.
 * 답은 브라우저에만 있고 어디로도 전송되지 않는다.
 */
(function () {
	'use strict';

	// A 를 고르면 앞 글자, B 를 고르면 뒷 글자
	var Q = [
		{ ax: 'EI', a: '처음 보는 사람이 많은 모임, 일단 여기저기 인사하며 돈다', b: '아는 사람 옆에 자리부터 잡는다' },
		{ ax: 'EI', a: '주말에 약속이 잡히면 기운이 난다', b: '주말에 혼자 있는 시간이 있어야 충전된다' },
		{ ax: 'EI', a: '생각이 떠오르면 말하면서 정리한다', b: '정리가 끝난 다음에 말한다' },
		{ ax: 'EI', a: '오래 통화하고 나면 개운하다', b: '오래 통화하고 나면 진이 빠진다' },
		{ ax: 'EI', a: '새 모임에 가면 내가 먼저 말을 건다', b: '상대가 말을 걸어오면 그때부터 편해진다' },

		{ ax: 'SN', a: '설명을 들을 때 "구체적으로 어떻게"가 먼저 궁금하다', b: '"그래서 왜"가 먼저 궁금하다' },
		{ ax: 'SN', a: '여행 계획은 동선과 예산부터 짠다', b: '여행 계획은 어떤 분위기일지부터 그린다' },
		{ ax: 'SN', a: '새 물건을 사면 사양과 사용법부터 확인한다', b: '새 물건을 사면 이걸로 뭘 할 수 있을지부터 떠올린다' },
		{ ax: 'SN', a: '근거가 있어야 믿는 편이다', b: '근거 없이도 감이 자주 맞는 편이다' },
		{ ax: 'SN', a: '회의록은 나온 말을 정확히 적는다', b: '회의록은 흐름과 의미를 요약한다' },

		{ ax: 'TF', a: '친구가 손해를 봤다면 왜 그렇게 됐는지 먼저 짚어준다', b: '많이 속상했겠다고 먼저 말한다' },
		{ ax: 'TF', a: '결정이 갈리면 어느 쪽이 더 맞는지를 본다', b: '결정이 갈리면 누가 더 상처받는지를 본다' },
		{ ax: 'TF', a: '칭찬을 들으면 어떤 점이 좋았는지 궁금하다', b: '칭찬을 들으면 그 마음이 먼저 고맙다' },
		{ ax: 'TF', a: '갈등이 생기면 사실관계부터 정리한다', b: '갈등이 생기면 감정부터 가라앉힌다' },
		{ ax: 'TF', a: '"맞는 말인데 말투가 셌다"는 말을 들으면, 그래도 맞는 건 맞다고 생각한다', b: '말투를 고쳐야겠다고 생각한다' },

		{ ax: 'JP', a: '여행 첫날 아침, 짜둔 일정대로 움직인다', b: '여행 첫날 아침, 그날 기분 따라 정한다' },
		{ ax: 'JP', a: '마감이 있는 일은 미리 끝내 놓는다', b: '마감이 가까워져야 속도가 붙는다' },
		{ ax: 'JP', a: '물건은 자리가 정해져 있어야 편하다', b: '쓰던 자리에 있으면 그걸로 충분하다' },
		{ ax: 'JP', a: '계획이 갑자기 바뀌면 짜증부터 난다', b: '계획이 갑자기 바뀌면 오히려 재밌다' },
		{ ax: 'JP', a: '장 볼 때 살 것을 정하고 간다', b: '장 볼 때 가서 보고 정한다' }
	];

	var AXNAME = {
		EI: ['E · 밖으로', 'I · 안으로'],
		SN: ['S · 사실로', 'N · 상상으로'],
		TF: ['T · 머리로', 'F · 마음으로'],
		JP: ['J · 정해놓고', 'P · 열어놓고']
	};

	var TYPES = {
		ISTJ: ['원칙주의자', '한번 정한 방식은 웬만해선 안 바꿉니다. 그래서 이 사람이 맡은 일은 아무도 다시 확인하지 않습니다.',
			'약속을 지키는 힘', '융통성이 필요한 자리에서 답답해 보일 수 있습니다.'],
		ISFJ: ['조용한 보호자', '표는 안 내는데 챙길 건 다 챙깁니다. 고맙다는 말을 한참 뒤에 듣는 편입니다.',
			'묵묵히 오래 가는 신뢰', '거절을 못 해서 혼자 짐을 지는 일이 잦습니다.'],
		INFJ: ['속 깊은 관찰자', '말수보다 생각이 훨씬 많습니다. 한참 뒤에 던진 한마디가 정곡을 찌릅니다.',
			'사람의 속을 읽는 눈', '혼자 다 이해하고 혼자 지칩니다.'],
		INTJ: ['판을 짜는 사람', '지금 말고 몇 수 뒤를 봅니다. 설명을 생략해서 오해를 자주 삽니다.',
			'긴 그림을 그리는 힘', '과정을 안 알려줘서 주변이 못 따라옵니다.'],
		ISTP: ['손이 먼저 나가는 사람', '말로 설명하는 대신 일단 해봅니다. 그리고 대체로 됩니다.',
			'문제를 바로 손보는 힘', '설명이 짧아 무심해 보입니다.'],
		ISFP: ['조용한 감각파', '취향이 확고한데 강요는 하지 않습니다. 같이 있으면 편한 쪽입니다.',
			'분위기를 부드럽게 만드는 힘', '싫은 소리를 안 해서 속으로만 쌓입니다.'],
		INFP: ['속에 불이 있는 사람', '겉은 잔잔한데 안에서 계속 뭔가 끓습니다. 아닌 건 끝까지 못 합니다.',
			'가치를 지키는 뚝심', '이상과 현실 사이에서 자주 지칩니다.'],
		INTP: ['질문이 많은 사람', '"근데 왜?"가 입에 붙어 있습니다. 답을 찾는 동안 시간이 사라집니다.',
			'끝까지 파고드는 힘', '마무리보다 탐구가 재밌어서 일이 남습니다.'],
		ESTP: ['일단 저지르는 사람', '고민할 시간에 이미 해보고 있습니다. 수습도 본인이 합니다.',
			'현장에서 빠른 판단', '뒷일을 덜 보고 움직입니다.'],
		ESFP: ['분위기 담당', '이 사람이 빠지면 자리가 조용해집니다. 본인만 그걸 모릅니다.',
			'사람을 편하게 만드는 힘', '재미없는 일을 오래 못 붙듭니다.'],
		ENFP: ['불씨를 던지는 사람', '새 아이디어가 끝없이 나옵니다. 마무리는 옆 사람 몫일 때가 있습니다.',
			'사람과 판을 살리는 힘', '벌린 일을 다 못 거둡니다.'],
		ENTP: ['판을 흔드는 사람', '정해진 답에 굳이 토를 답니다. 그 토가 맞을 때가 많아 미움받지 않습니다.',
			'통념을 뒤집는 발상', '이겨놓고 사람을 잃는 일이 있습니다.'],
		ESTJ: ['정리하는 사람', '흩어진 일을 표로 만들어 옵니다. 회의가 20분 짧아집니다.',
			'조직을 굴리는 추진력', '속도가 다른 사람을 몰아붙입니다.'],
		ESFJ: ['사람 챙기는 사람', '누가 빠졌는지 제일 먼저 압니다. 모임이 굴러가는 건 이 사람 덕입니다.',
			'관계를 잇는 힘', '남의 평가에 마음이 많이 흔들립니다.'],
		ENFJ: ['끌고 가는 사람', '말로 사람을 움직입니다. 정작 본인 힘든 건 맨 나중에 말합니다.',
			'사람을 키우는 힘', '남을 챙기다 자기를 놓칩니다.'],
		ENTJ: ['밀어붙이는 사람', '방향을 정하고 뒤돌아보지 않습니다. 따라가다 보면 도착해 있습니다.',
			'결정을 내리는 배짱', '반대 의견을 늦게 듣습니다.']
	};

	function el(t, c, x) {
		var e = document.createElement(t);
		if (c) e.className = c;
		if (x != null) e.textContent = x;
		return e;
	}

	var root = el('div', 'rd-wrap');
	document.body.appendChild(root);

	var head = el('section', 'rd-head');
	head.appendChild(el('h1', 'rd-title', 'MBTI 테스트'));
	head.appendChild(el('h2', 'rd-sub', '스무 개 질문으로 보는 열여섯 가지'));
	head.appendChild(el('p', 'rd-note',
		'둘 중 더 가까운 쪽을 고르면 됩니다. 오래 고민하지 말고 먼저 떠오르는 쪽으로 고르세요. 1분이면 끝납니다.'));
	head.appendChild(el('p', 'rd-privacy',
		'답은 이 화면 안에만 있습니다. 어디로도 전송되지 않고, 저장하지도 않습니다.'));
	root.appendChild(head);

	var quiz = el('div', 'qz');
	root.appendChild(quiz);
	var res = el('div', 'rd-res');
	res.style.display = 'none';
	root.appendChild(res);

	var answers = [];   // 'a' 또는 'b'
	var at = 0;

	function draw() {
		quiz.innerHTML = '';
		if (at >= Q.length) return show();

		var bar = el('div', 'qz-prog');
		var fill = el('div', 'qz-progfill');
		fill.style.width = (at / Q.length * 100) + '%';
		bar.appendChild(fill);
		quiz.appendChild(bar);
		quiz.appendChild(el('div', 'qz-count', (at + 1) + ' / ' + Q.length));

		var q = Q[at];
		['a', 'b'].forEach(function (k) {
			var b = el('button', 'qz-opt', q[k]);
			b.type = 'button';
			b.addEventListener('click', function () {
				answers[at] = k;
				at++;
				draw();
			});
			quiz.appendChild(b);
		});

		if (at > 0) {
			var back = el('button', 'qz-back', '← 앞 질문으로');
			back.type = 'button';
			back.addEventListener('click', function () { at--; draw(); });
			quiz.appendChild(back);
		}
	}

	function show() {
		quiz.innerHTML = '';
		var cnt = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
		Q.forEach(function (q, i) {
			var letter = answers[i] === 'a' ? q.ax[0] : q.ax[1];
			cnt[letter]++;
		});

		var code = '', bars = [], secs = [];
		['EI', 'SN', 'TF', 'JP'].forEach(function (ax) {
			var A = cnt[ax[0]], B = cnt[ax[1]], tot = A + B;
			var first = A >= B;                 // 동점이면 앞 글자
			var on = first ? ax[0] : ax[1];
			var pctv = Math.round((first ? A : B) / tot * 100);
			code += on;
			bars.push({ label: AXNAME[ax][first ? 0 : 1], pct: pctv });
			secs.push({
				h: AXNAME[ax][first ? 0 : 1] + ' — ' + (first ? A : B) + '/' + tot + '문항 (' + pctv + '%)',
				p: pctv >= 80 ? '이 축은 아주 뚜렷합니다. 웬만한 상황에서 늘 이쪽으로 움직입니다.'
					: pctv >= 60 ? '이쪽이 우세하지만 반대쪽도 꽤 나왔습니다. 상황에 따라 달라지는 편입니다.'
						: '거의 반반입니다. 이 축은 그날 상황이나 상대에 따라 바뀌는 쪽으로 보는 게 맞습니다.'
			});
		});

		var t = TYPES[code];
		var card = el('div', 'rd-card');
		card.appendChild(el('div', 'rd-headline', code + ' — ' + t[0]));
		card.appendChild(el('div', 'rd-tagline', '스무 문항으로 나온 결과'));
		res.appendChild(card);

		var bw = el('div', 'rd-bars');
		bars.forEach(function (b) {
			var row = el('div', 'rd-bar on');
			row.appendChild(el('span', 'rd-bl', b.label));
			var track = el('span', 'rd-track'), fill = el('span', 'rd-fill');
			fill.style.width = b.pct + '%';
			track.appendChild(fill);
			row.appendChild(track);
			row.appendChild(el('span', 'rd-bv', b.pct + '%'));
			bw.appendChild(row);
		});
		res.appendChild(bw);

		[{ h: '한 줄로 말하면', p: t[1] },
		{ h: '강점', p: t[2] },
		{ h: '조심할 점', p: t[3] }].concat(secs).forEach(function (s) {
			var sec = el('section', 'rd-sec');
			sec.appendChild(el('h3', null, s.h));
			sec.appendChild(el('p', null, s.p));
			res.appendChild(sec);
		});

		var btns = el('div', 'rd-btns');
		var again = el('button', 'rd-btn', '처음부터 다시 하기');
		var copy = el('button', 'rd-btn', '결과 복사');
		var share = el('button', 'rd-btn share-result-btn', '결과 공유');
		again.type = copy.type = share.type = 'button';
		btns.appendChild(again); btns.appendChild(copy); btns.appendChild(share);
		res.appendChild(btns);
		res.appendChild(el('p', 'rd-disc',
			'재미로 보는 짧은 검사입니다. 정식 검사(MBTI®)를 대신하지 않습니다.'));

		var text = 'MBTI 테스트 결과: ' + code + ' — ' + t[0] + '\n' + t[1] +
			'\nhttps://dypark9606.github.io/aifacetest/';
		share.setAttribute('data-share-text', text);
		again.addEventListener('click', function () {
			answers = []; at = 0; res.innerHTML = ''; res.style.display = 'none';
			draw(); window.scrollTo({ top: 0, behavior: 'smooth' });
		});
		copy.addEventListener('click', function () { toClip(text, copy); });
		share.addEventListener('click', function () {
			if (navigator.share) navigator.share({ text: text }).catch(function () { });
			else toClip(text, share);
		});

		res.style.display = '';
		res.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function toClip(t, btn) {
		var done = function () {
			var old = btn.textContent;
			btn.textContent = '복사했습니다';
			setTimeout(function () { btn.textContent = old; }, 1500);
		};
		if (navigator.clipboard) {
			navigator.clipboard.writeText(t).then(done, function () { fb(t, done); });
		} else { fb(t, done); }
	}
	function fb(t, done) {
		var ta = document.createElement('textarea');
		ta.value = t; document.body.appendChild(ta); ta.select();
		try { document.execCommand('copy'); done(); } catch (e) { }
		ta.remove();
	}

	draw();
})();
