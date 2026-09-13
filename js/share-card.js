/* 결과를 인스타그램 등에 올릴 수 있는 이미지 카드로 만든다.
 *
 * 왜 '이미지'인가: 인스타그램은 외부 앱이 피드/스토리에 글을 직접 올리는 공개 API 를
 * 주지 않는다. 실제로 동작하는 유일한 방법은 **이미지 파일을 만들어 OS 공유 시트로
 * 넘기는 것**이다(안드로이드/ iOS 공유 시트에 '스토리에 공유'/'Instagram' 이 뜬다).
 * 또 인스타 캡션 안의 URL 은 눌리지 않으므로, 캡션에는 링크 대신 검색어와 해시태그를
 * 넣고 링크는 클립보드에 같이 복사해 준다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShareCard = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CARD = {
    story: { w: 1080, h: 1920 },  /* 인스타 스토리 9:16 */
    feed: { w: 1080, h: 1350 }    /* 인스타 피드 4:5 */
  };

  var TAGS = '#얼굴상테스트 #메이크업배틀 #관상 #꾸미기게임 #AI테스트';

  function instaCaption(o) {
    o = o || {};
    var lines = [];
    if (o.opponent) {
      lines.push('⚔️ ' + o.theme + ' 메이크업 배틀');
      lines.push('나 ' + o.score + '점 VS ' + o.opponent.name + ' ' + o.opponent.score + '점');
    } else {
      lines.push('💄 ' + o.theme + ' 메이크업 ' + o.score + '점');
      if (o.verdict) lines.push(o.verdict);
    }
    lines.push('');
    lines.push('너도 해봐! 👉 "인공지능 얼굴상 테스트" 검색');
    lines.push('');
    lines.push(TAGS);
    return lines.join('\n').slice(0, 2200);
  }

  function fileName() {
    /* 파일명에 사용자 문자열을 넣지 않는다 — 경로 탈출과 OS별 금지문자 문제를 원천 차단. */
    return 'makeup-battle.png';
  }

  /* ---------- 이미지 그리기 (브라우저 전용) ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCard(opts) {
    /* opts: {size:'story'|'feed', svg:SVGElement, theme, score, verdict, opponent} */
    var size = CARD[opts.size] || CARD.story;
    var canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    var ctx = canvas.getContext('2d');

    var g = ctx.createLinearGradient(0, 0, 0, size.h);
    g.addColorStop(0, '#fff7fb'); g.addColorStop(1, '#ffd9ea');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size.w, size.h);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#c2185b';
    ctx.font = 'bold 78px Jua, sans-serif';
    ctx.fillText('💄 메이크업 배틀', size.w / 2, 150);

    ctx.fillStyle = '#3a2b33';
    ctx.font = '52px Jua, sans-serif';
    ctx.fillText(opts.theme || '', size.w / 2, 232);

    return new Promise(function (resolve) {
      var faceTop = 290;
      var faceH = Math.round(size.h * 0.42);
      var faceW = Math.round(faceH * (200 / 240));

      function finish() {
        var boxY = faceTop + faceH + 50;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, 70, boxY, size.w - 140, opts.opponent ? 330 : 250, 40);
        ctx.fill();

        ctx.fillStyle = '#c2185b';
        if (opts.opponent) {
          ctx.font = 'bold 60px Jua, sans-serif';
          ctx.fillText('나 ' + opts.score + '점  VS  ' + opts.opponent.name + ' ' + opts.opponent.score + '점',
            size.w / 2, boxY + 110);
          ctx.fillStyle = '#3a2b33';
          ctx.font = '54px Jua, sans-serif';
          var r = opts.score > opts.opponent.score ? '🏆 내 승리!'
            : opts.score < opts.opponent.score ? '🔥 친구 승리!' : '🤝 무승부!';
          ctx.fillText(r, size.w / 2, boxY + 200);
          ctx.font = '40px Jua, sans-serif';
          ctx.fillText('인공지능 얼굴상 테스트', size.w / 2, boxY + 280);
        } else {
          ctx.font = 'bold 120px Jua, sans-serif';
          ctx.fillText(opts.score + '점', size.w / 2, boxY + 130);
          ctx.fillStyle = '#3a2b33';
          ctx.font = '46px Jua, sans-serif';
          ctx.fillText(opts.verdict || '', size.w / 2, boxY + 200);
        }

        ctx.fillStyle = '#a8748c';
        ctx.font = '40px Jua, sans-serif';
        ctx.fillText('인공지능 얼굴상 테스트 · 메이크업 배틀', size.w / 2, size.h - 70);
        canvas.toBlob(function (blob) { resolve({ blob: blob, canvas: canvas }); }, 'image/png');
      }

      if (!opts.svg) { finish(); return; }
      var data = new XMLSerializer().serializeToString(opts.svg);
      var url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, (size.w - faceW) / 2, faceTop, faceW, faceH);
        finish();
      };
      img.onerror = function () { finish(); };
      img.src = url;
    });
  }

  function canShareFile(file) {
    return !!(navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share);
  }

  function shareImage(blob, caption) {
    var file = new File([blob], fileName(), { type: 'image/png' });
    if (canShareFile(file)) {
      return navigator.share({ files: [file], text: caption, title: '메이크업 배틀' })
        .then(function () { return 'shared'; });
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(caption).then(function () { return 'downloaded+copied'; },
        function () { return 'downloaded'; });
    }
    return Promise.resolve('downloaded');
  }

  return {
    CARD: CARD,
    TAGS: TAGS,
    instaCaption: instaCaption,
    fileName: fileName,
    drawCard: drawCard,
    shareImage: shareImage,
    canShareFile: canShareFile
  };
});
