/* ==================================================================
 * saju.js - 사주팔자(四柱八字) 계산 엔진
 *
 * 계산 근거
 *  - 일주(日柱): 율리우스적일(JDN) 기준. (JDN + 49) % 60 = 60갑자 순번(0 = 갑자).
 *                1949-10-01 = 갑자일 을 기준으로 잡았고,
 *                1592-12-31 = 갑신일(그레고리력), 1338-08-04 = 신해일(율리우스력)
 *                두 건으로 교차 검증했다.
 *  - 연주(年柱): 입춘(태양황경 315도)을 해의 경계로 본다. 1984년 = 갑자년.
 *  - 월주(月柱): 24절기 중 '절(節)' 기준. 태양황경 315도부터 30도씩 인월->축월.
 *                월간은 오호둔(五虎遁), 시간은 오서둔(五鼠遁)으로 뽑는다.
 *  - 태양황경은 천문 근사식으로 계산한다(오차 약 0.01도 = 15분 안팎).
 *    절기 경계에 아주 가까운 시각이면 만세력과 다를 수 있다.
 * ================================================================== */
(function (global) {
	'use strict';

	var GAN = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
	var GAN_H = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
	var JI = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
	var JI_H = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
	var ZODIAC = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];

	/* 오행 / 음양 */
	var GAN_ELEM = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
	var JI_ELEM = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
	var GAN_YIN = [false, true, false, true, false, true, false, true, false, true];
	var JI_YIN = [false, true, false, true, false, true, false, true, false, true];

	var ELEMS = ['목', '화', '토', '금', '수'];
	var ELEM_COLOR = {목: '#3ba363', 화: '#e2574c', 토: '#c8963e', 금: '#8d99a6', 수: '#3d6fb4'};

	/* 절기 이름 (절, 태양황경 315도부터 30도 간격) */
	var TERMS = ['입춘', '경칩', '청명', '입하', '망종', '소서',
	             '입추', '백로', '한로', '입동', '대설', '소한'];

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function mod(a, b) { return ((a % b) + b) % b; }

	/* 그레고리력 -> 율리우스적일(정수, 그날 정오 기준) */
	function toJDN(y, m, d) {
		var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
		return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
			Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
	}

	/* 한국 표준시(UTC+9) 기준 날짜/시각 -> 율리우스일(실수, UT) */
	function toJD(y, m, d, hour, minute) {
		return toJDN(y, m, d) - 0.5 + (hour - 9 + (minute || 0) / 60) / 24;
	}

	/* 태양황경(도). 근사식, 오차 약 0.01도 */
	function solarLongitude(jd) {
		var n = jd - 2451545.0;
		var L = mod(280.460 + 0.9856474 * n, 360);
		var g = mod(357.528 + 0.9856003 * n, 360) * Math.PI / 180;
		return mod(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g), 360);
	}

	/* 해당 연도의 입춘(황경 315도) 순간을 이분법으로 찾는다 (UT 율리우스일) */
	function ipchunJD(year) {
		var lo = toJD(year, 2, 1, 0, 0), hi = toJD(year, 2, 8, 0, 0);
		for (var i = 0; i < 60; i++) {
			var mid = (lo + hi) / 2;
			// 315도 이전이면(=280~315 구간) 아직 입춘 전
			var lam = solarLongitude(mid);
			var before = (lam < 315 && lam > 200);
			if (before) lo = mid; else hi = mid;
		}
		return (lo + hi) / 2;
	}

	function pillar(idx) {
		var g = mod(idx, 10), j = mod(idx, 12);
		return {
			index: mod(idx, 60),
			gan: GAN[g], ji: JI[j],
			ganH: GAN_H[g], jiH: JI_H[j],
			ko: GAN[g] + JI[j],
			hanja: GAN_H[g] + JI_H[j],
			ganElem: GAN_ELEM[g], jiElem: JI_ELEM[j],
			ganIdx: g, jiIdx: j
		};
	}

	/* 오행 상생(生) / 상극(剋) */
	var SHENG = {목: '화', 화: '토', 토: '금', 금: '수', 수: '목'};
	var KE = {목: '토', 토: '수', 수: '화', 화: '금', 금: '목'};

	/* 일간 오행을 기준으로 다른 오행이 어떤 십성(十星)에 해당하는지 */
	function tenGod(dayElem, other) {
		if (other === dayElem) return '비겁';
		if (SHENG[dayElem] === other) return '식상';
		if (KE[dayElem] === other) return '재성';
		if (KE[other] === dayElem) return '관성';
		if (SHENG[other] === dayElem) return '인성';
		return '비겁';
	}

	/* 특정 연도의 세운(歲運) 간지 - 입춘 기준이라 그 해 전체를 대표한다 */
	function yearPillar(year) { return pillar(mod(year - 1984, 60)); }

	/* 천간/지지 번호로 60갑자 순번을 되돌린다 (둘의 홀짝이 맞아야 성립) */
	function fromGanJi(g, j) {
		for (var i = 0; i < 60; i++)
			if (mod(i, 10) === g && mod(i, 12) === j) return pillar(i);
		return pillar(0);
	}

	/* 시지: 자시 23~01, 축 01~03 ... */
	function hourBranch(hour, minute) {
		var t = hour + (minute || 0) / 60;
		return mod(Math.floor((t + 1) / 2), 12);
	}

	/**
	 * 사주 계산
	 * @param {number} y,m,d  양력 생년월일
	 * @param {number} hour,minute  24시간제 (모르면 unknownTime=true)
	 * @param {object} opt {unknownTime:bool, trueSolarTime:bool, lateZi:bool}
	 *        trueSolarTime : 한국 경도 보정(약 -32분) 적용
	 *        lateZi        : 23시 이후를 다음날 일주로 볼지 (기본 true)
	 */
	function calc(y, m, d, hour, minute, opt) {
		opt = opt || {};
		var unknown = !!opt.unknownTime;
		var lateZi = opt.lateZi !== false;
		hour = unknown ? 12 : hour;
		minute = unknown ? 0 : (minute || 0);

		/* 진태양시 보정: 한국 표준시는 동경 135도, 서울은 약 126.98도 -> 약 -32분.
		   자정을 넘어가면 날짜도 함께 하루 당겨야 한다. */
		var adjH = hour, adjM = minute, dateOffset = 0;
		if (opt.trueSolarTime && !unknown) {
			var total = hour * 60 + minute - 32;
			dateOffset = Math.floor(total / 1440);      // 음수면 전날로 넘어간다
			adjH = Math.floor(mod(total, 1440) / 60);
			adjM = mod(total, 60);
		}

		var baseJDN = toJDN(y, m, d) + dateOffset;
		var jd = baseJDN - 0.5 + (adjH - 9 + adjM / 60) / 24;
		var lam = solarLongitude(jd);

		/* --- 연주: 입춘 경계 (보정으로 날짜가 밀렸을 수 있으니 실제 날짜 기준으로 판단) --- */
		var calYear = new Date(Date.UTC(y, m - 1, d + dateOffset)).getUTCFullYear();
		var sajuYear = jd >= ipchunJD(calYear) ? calYear : calYear - 1;
		var yearIdx = mod(sajuYear - 1984, 60);
		var yearP = pillar(yearIdx);

		/* --- 월주: 절기(황경) --- */
		var mOff = Math.floor(mod(lam - 315, 360) / 30);   // 0 = 인월
		var monthJi = mod(2 + mOff, 12);
		/* 오호둔: 년간 갑/기 -> 인월 천간 병(2), 을/경 -> 무(4), 병/신 -> 경(6), 정/임 -> 임(8), 무/계 -> 갑(0) */
		var monthGan = mod([2, 4, 6, 8, 0][yearP.ganIdx % 5] + mOff, 10);
		var monthP = fromGanJi(monthGan, monthJi);

		/* --- 일주 --- */
		var dayShift = 0;
		if (!unknown && lateZi && adjH >= 23) dayShift = 1;
		var dayIdx = mod(baseJDN + dayShift + 49, 60);
		var dayP = pillar(dayIdx);

		/* --- 시주: 오서둔 --- */
		var timeP = null;
		if (!unknown) {
			var hb = hourBranch(adjH, adjM);
			/* 일간 갑/기 -> 자시 갑(0), 을/경 -> 병(2), 병/신 -> 무(4), 정/임 -> 경(6), 무/계 -> 임(8) */
			var hg = mod([0, 2, 4, 6, 8][dayP.ganIdx % 5] + hb, 10);
			timeP = fromGanJi(hg, hb);
		}

		/* --- 오행 분포 --- */
		var counts = {목: 0, 화: 0, 토: 0, 금: 0, 수: 0};
		var used = [yearP, monthP, dayP].concat(timeP ? [timeP] : []);
		used.forEach(function (p) { counts[p.ganElem]++; counts[p.jiElem]++; });
		var total = used.length * 2;

		return {
			year: yearP, month: monthP, day: dayP, time: timeP,
			sajuYear: sajuYear,
			zodiac: ZODIAC[yearP.jiIdx],
			dayMaster: dayP.gan,
			dayMasterElem: dayP.ganElem,
			dayMasterYin: GAN_YIN[dayP.ganIdx],
			elements: counts, elementTotal: total,
			term: TERMS[mOff], solarLongitude: lam,
			unknownTime: unknown
		};
	}

	global.Saju = {
		calc: calc, GAN: GAN, JI: JI, GAN_H: GAN_H, JI_H: JI_H,
		ZODIAC: ZODIAC, ELEMS: ELEMS, ELEM_COLOR: ELEM_COLOR,
		toJDN: toJDN, solarLongitude: solarLongitude, pillar: pillar,
		tenGod: tenGod, yearPillar: yearPillar, SHENG: SHENG, KE: KE
	};
})(window);
