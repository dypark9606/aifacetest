/* ------------------------------------------------------------------
 * '다시 하기' 를 화면 새로고침 없이 처리한다.
 *
 * 원래 각 화면의 재시도 버튼은 onclick="window.location.reload()" 였다.
 * 브라우저에서는 그럭저럭 넘어갔지만 앱에서는 문제가 된다 —
 * 새로고침이 곧 **학습 모델을 다시 읽는 것**이라 몇 초가 그냥 날아가고,
 * 그 사이 화면이 하얗게 비어 사용자는 앱이 멎은 줄 안다.
 *
 * 그래서 그 자리에서 처음 상태로 되돌린다. 모델은 이미 메모리에 있으니
 * 사진만 다시 고르면 바로 결과가 나온다.
 *
 * 사진을 두 장 받는 커플궁합 화면처럼 버튼이 아예 없던 곳에는 버튼을 넣어 준다.
 * ------------------------------------------------------------------ */
(function () {
	'use strict';

	var LABEL = '다른 사진으로 다시 하기';

	function each(sel, fn) {
		Array.prototype.forEach.call(document.querySelectorAll(sel), fn);
	}

	function reset() {
		var $ = window.jQuery;

		/* 1) 결과를 지운다 */
		each('.result-message, .result-description', function (e) { e.innerHTML = ''; });
		each('#label-container, [id$="label-container"]', function (e) { e.innerHTML = ''; });
		var comp = document.getElementById('compatibility-result');
		if (comp) comp.style.display = 'none';

		/* 2) 고른 사진을 지운다.
		   입력칸은 통째로 갈아끼우지 않는다 — 앱(native.js)이 감싼 영역에 걸어 둔
		   카메라/앨범 처리기가 살아 있어야 하기 때문이다. value 만 비우면
		   같은 사진을 다시 골라도 change 가 정상적으로 뜬다. */
		each('input.file-upload-input, input[type="file"]', function (i) {
			try { i.value = ''; } catch (e) { }
		});
		each('.file-upload-image', function (i) { i.removeAttribute('src'); });

		/* 3) 사진 고르는 화면으로 되돌린다 */
		if ($) {
			$('.file-upload-content').hide();
			$('[id$="file-content"]').hide();
			$('#loading, [id$="loading"]').hide();
			$('.image-upload-wrap').show();
		} else {
			each('.file-upload-content, [id$="file-content"]', function (e) { e.style.display = 'none'; });
			each('.image-upload-wrap', function (e) { e.style.display = ''; });
		}

		var top = document.querySelector('.image-upload-wrap');
		if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'center' });
		else window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function wire() {
		/* 기존 버튼: 새로고침 대신 그 자리 되돌리기 */
		each('.try-again-btn', function (b) {
			b.removeAttribute('onclick');
			b.onclick = null;
			b.addEventListener('click', function (e) {
				e.preventDefault();
				reset();
			});
			var span = b.querySelector('.try-again-text');
			if (span) span.textContent = LABEL;
		});

		/* 버튼이 없는 화면(커플궁합)에는 결과 상자 안에 넣어 준다 */
		var comp = document.getElementById('compatibility-result');
		if (comp && !comp.querySelector('.try-again-btn')) {
			var wrap = document.createElement('div');
			wrap.className = 'pt-3 image-title-wrap';
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'try-again-btn';
			var sp = document.createElement('span');
			sp.className = 'try-again-text';
			sp.textContent = LABEL;
			btn.appendChild(sp);
			btn.addEventListener('click', function (e) { e.preventDefault(); reset(); });
			wrap.appendChild(btn);
			comp.appendChild(wrap);
		}
	}

	window.tryAgainReset = reset;
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
	else wire();
})();
