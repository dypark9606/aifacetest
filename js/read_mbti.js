/* read_mbti.js — 얼굴로 보는 MBTI
 *
 * 솔직히 밝혀 둔다: **얼굴로 MBTI 를 알아내는 방법은 없다.** 근거가 없다.
 * 이 탭이 하는 일은 얼굴의 네 가지 비율을 재서 네 축에 억지로 대응시키는 것이다.
 *   E/I ← 입 크기와 입꼬리      (표정이 밖으로 나오는 정도)
 *   N/S ← 이마 비율과 미간      (관상에서 '생각의 방'으로 보는 자리)
 *   F/T ← 눈꼬리·입술·턱선      (인상이 부드러운가 단단한가)
 *   J/P ← 턱 각짐과 턱끝 모양    (윤곽이 딱 떨어지는가)
 * 그래서 화면에도 "재미로 보는 것"이라고 적어 둔다. 성격 검사 대신 쓰라는 게 아니다.
 * 대신 **같은 얼굴이면 늘 같은 결과**가 나오도록 만들었다. 새로고침할 때마다
 * 다른 게 뜨면 그건 재미도 아니고 그냥 난수다.
 */
(function () {
	'use strict';

	/* 실측 중앙값(MID)과 퍼짐(SPAN). 눈대중으로 넣으면 열여섯 중 두세 개로만 쏠린다.
	 * (2026-09-08, 사진 80장. 정면만 골라 재면 실제 사용자 사진과 어긋난다.) */
	var MID = {
		mouthW: 0.384, mouthTilt: 0.032, eyeOpen: 0.268,
		up: 0.161, eyeGap: 1.262,
		eyeTilt: 0.078, lipThick: 0.122, jawAngle: 139.9, chinW: 0.188
	};
	var SPAN = {
		mouthW: 0.053, mouthTilt: 0.034, eyeOpen: 0.083,
		up: 0.016, eyeGap: 0.087,
		eyeTilt: 0.047, lipThick: 0.027, jawAngle: 5.4, chinW: 0.018
	};

	function z(v, mid, span) {
		var t = (v - mid) / span;
		return t < -1 ? -1 : t > 1 ? 1 : t;
	}

	var TYPES = {
		ISTJ: ['원칙주의자', '한번 정한 방식은 웬만해선 안 바꿉니다. 그래서 이 사람이 맡은 일은 아무도 확인하지 않습니다.'],
		ISFJ: ['조용한 보호자', '표는 안 내는데 챙길 건 다 챙깁니다. 고맙다는 말을 늦게 듣는 편입니다.'],
		INFJ: ['속 깊은 관찰자', '말수보다 생각이 훨씬 많습니다. 한참 뒤에 던진 한마디가 정곡을 찌릅니다.'],
		INTJ: ['판을 짜는 사람', '지금 말고 3수 뒤를 봅니다. 설명을 생략해서 오해를 자주 삽니다.'],
		ISTP: ['손이 먼저 나가는 사람', '설명서를 안 읽고 일단 뜯어봅니다. 그리고 대체로 고칩니다.'],
		ISFP: ['조용한 감각파', '취향이 확고한데 강요는 안 합니다. 같이 있으면 편한 쪽입니다.'],
		INFP: ['속에 불이 있는 사람', '겉은 잔잔한데 안에서 계속 뭔가 끓습니다. 아닌 건 절대 못 합니다.'],
		INTP: ['질문이 많은 사람', '"근데 왜?"가 입에 붙어 있습니다. 답을 찾는 동안 시간이 사라집니다.'],
		ESTP: ['일단 저지르는 사람', '고민하는 시간에 이미 해보고 있습니다. 수습도 본인이 합니다.'],
		ESFP: ['분위기 담당', '이 사람이 빠지면 자리가 조용해집니다. 본인만 그걸 모릅니다.'],
		ENFP: ['불씨를 던지는 사람', '새 아이디어가 끝없이 나옵니다. 마무리는 옆 사람 몫일 때가 많습니다.'],
		ENTP: ['판을 흔드는 사람', '정해진 답에 굳이 토를 답니다. 그 토가 맞을 때가 많아서 미움받지 않습니다.'],
		ESTJ: ['정리하는 사람', '흩어진 일을 표로 만들어 옵니다. 회의가 20분 짧아집니다.'],
		ESFJ: ['사람 챙기는 사람', '누가 빠졌는지 제일 먼저 압니다. 모임이 굴러가는 건 이 사람 덕입니다.'],
		ENFJ: ['끌고 가는 사람', '말로 사람을 움직입니다. 본인 힘든 건 맨 나중에 말합니다.'],
		ENTJ: ['밀어붙이는 사람', '방향을 정하고 뒤도 안 돌아봅니다. 따라가다 보면 도착해 있습니다.']
	};

	var AXIS = [
		{
			pair: ['E', 'I'], name: '밖으로 / 안으로',
			calc: function (f) {
				return 0.55 * z(f.mouthW, MID.mouthW, SPAN.mouthW)
					+ 0.30 * z(f.mouthTilt, MID.mouthTilt, SPAN.mouthTilt)
					+ 0.15 * z(f.eyeOpen, MID.eyeOpen, SPAN.eyeOpen);
			},
			why: function (f, on) {
				return on === 'E'
					? '입이 크고 입꼬리가 위로 붙어 있습니다. 표정이 밖으로 잘 나오는 얼굴이라 처음 본 사람도 말을 걸기 쉽습니다.'
					: '입매가 단정하고 표정 변화가 크지 않습니다. 속을 다 보여주지 않아 진중해 보이는 얼굴입니다.';
			}
		},
		{
			pair: ['N', 'S'], name: '상상으로 / 사실로',
			calc: function (f) {
				return 0.65 * z(f.up, MID.up, SPAN.up) + 0.35 * z(f.eyeGap, MID.eyeGap, SPAN.eyeGap);
			},
			why: function (f, on) {
				return on === 'N'
					? '이마가 넓고 미간이 여유롭습니다. 관상에서 생각이 노는 자리로 보는 곳이 넉넉한 얼굴입니다.'
					: '이마와 미간이 야무지게 모여 있습니다. 눈앞의 것을 정확히 보는 데 강한 얼굴입니다.';
			}
		},
		{
			pair: ['F', 'T'], name: '마음으로 / 머리로',
			calc: function (f) {
				return 0.50 * (-z(f.eyeTilt, MID.eyeTilt, SPAN.eyeTilt))
					+ 0.35 * z(f.lipThick, MID.lipThick, SPAN.lipThick)
					+ 0.15 * z(f.jawAngle, MID.jawAngle, SPAN.jawAngle);
			},
			why: function (f, on) {
				return on === 'F'
					? '눈꼬리가 부드럽고 턱선이 둥급니다. 사람들이 속 이야기를 잘 꺼내 놓는 인상입니다.'
					: '눈매가 또렷하고 턱선이 분명합니다. 감정보다 사실을 먼저 말할 것 같은 인상입니다.';
			}
		},
		{
			pair: ['J', 'P'], name: '정해놓고 / 열어놓고',
			// ⚠ 처음엔 눈썹 두께·각도도 넣었는데, 실측해 보니 사람마다 값이 널뛰어서
			//    믿을 수가 없었다(랜드마크가 눈썹 아래위를 제대로 못 잡는다). 턱 윤곽만 쓴다.
			calc: function (f) {
				return 0.65 * (-z(f.jawAngle, MID.jawAngle, SPAN.jawAngle))
					+ 0.35 * z(f.chinW, MID.chinW, SPAN.chinW);
			},
			why: function (f, on) {
				return on === 'J'
					? '턱선이 각지고 턱끝이 평평합니다. 윤곽이 딱 떨어지는 얼굴이라 계획대로 갈 것 같아 보입니다.'
					: '턱선이 둥글고 턱끝이 부드럽습니다. 상황에 맞춰 움직이는, 편해 보이는 얼굴입니다.';
			}
		}
	];

	ReadUI.page({
		title: '얼굴로 보는 MBTI',
		subtitle: '얼굴 비율로 뽑는 열여섯 가지',
		note: '얼굴로 성격을 알 수 있다는 근거는 없습니다. 얼굴의 네 가지 비율을 네 축에 맞춰 본 것뿐이니 재미로만 보세요. ' +
			'대신 같은 얼굴이면 언제 해도 같은 결과가 나옵니다.',
		button: '내 얼굴 MBTI 보기',
		fileName: '얼굴MBTI',

		analyze: function (f) {
			var code = '', bars = [], secs = [];
			AXIS.forEach(function (a) {
				var s = a.calc(f);
				var first = s >= 0;
				var on = first ? a.pair[0] : a.pair[1];
				var strength = Math.round(50 + Math.abs(s) * 50);   // 50~100%
				// ⚠ 막대는 '이긴 쪽이 얼마나 이겼나'를 그린다. 예전엔 축 위의 위치(50+s*50)를
				//    그렸더니 I 가 이겼는데 막대에 45% 가 떠서 아래 문단(55%)과 어긋났다.
				var half = a.name.split(' / ')[first ? 0 : 1];
				code += on;
				bars.push({ label: on + ' (' + a.pair[0] + '↔' + a.pair[1] + ')', pct: strength, on: true });
				secs.push({
					h: on + ' · ' + half + ' (' + strength + '%)',
					p: a.why(f, on) + (strength < 60
						? ' 다만 이 축은 거의 반반이라, 상황에 따라 반대쪽으로도 잘 갑니다.' : '')
				});
			});

			var t = TYPES[code];
			return {
				headline: code + ' — ' + t[0],
				tagline: '얼굴 비율로 뽑은 열여섯 중 하나',
				bars: bars,
				sections: [{ h: '한 줄 요약', p: t[1] }].concat(secs).concat([{
					h: '숫자가 50%에 가까울수록',
					p: '그 축은 얼굴만으로는 판정이 어렵다는 뜻입니다. 실제 검사와 다르게 나왔다면 ' +
						'그건 검사가 맞고 이 탭이 틀린 겁니다. 얼굴은 성격을 알려주지 않습니다.'
				}]),
				share: '얼굴로 본 내 MBTI 는 ' + code + ' — ' + t[0]
			};
		}
	});
})();
