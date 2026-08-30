#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
앱 전체 회귀 테스트.

  - 다섯 개 얼굴상 섹션이 실제로 모델을 읽고 결과를 그리는지
  - 결과에 'undefined' 가 새지 않는지 (모델 라벨 <-> 화면 설명 연결)
  - 사주팔자 / 신년운세가 제대로 계산되는지
  - 잘못된 입력을 걸러내는지

재학습을 하거나 설명을 고친 뒤에 한 번씩 돌려보세요.

사용:  python3 retrain/selftest.py
"""
import json, os, shutil, socket, subprocess, sys, threading, time
import unicodedata as ud
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

RESULT = {}
DONE = threading.Event()

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, 'selftest', 'fixtures')

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# (테스트에 쓸 사진, 어느 학습 폴더에서 가져올지)
SAMPLES = [
    ('m_star.jpg',   '남자 연예인 얼굴_완료', None),
    ('w_star.jpg',   '여자연예인얼굴_완료',   None),
    ('m_gag.jpg',    '남자 개그맨 얼굴_완료', None),
    ('w_gag.jpg',    '여자 개그우먼 얼굴_완료', None),
    ('m_monkey.jpg', '남자 개그맨 얼굴_완료', '개그맨김기욱얼굴'),
]


def nfc(s):
    return ud.normalize('NFC', s)


def ensure_fixtures():
    """학습 폴더에서 테스트용 사진 몇 장을 뽑아 둔다."""
    os.makedirs(FIXTURES, exist_ok=True)
    base = os.path.abspath(os.path.join(ROOT, '..', '2.Face image'))
    for out, folder, person in SAMPLES:
        dst = os.path.join(FIXTURES, out)
        if os.path.exists(dst):
            continue
        d = os.path.join(base, folder)
        if not os.path.isdir(d):
            print(f'  ! 학습 폴더 없음: {d}')
            continue
        people = sorted(n for n in os.listdir(d)
                        if os.path.isdir(os.path.join(d, n)) and not n.startswith('.'))
        pick = None
        if person:
            pick = next((n for n in people if nfc(n) == person), None)
        if pick is None:
            pick = next((n for n in people
                         if any(f.lower().endswith('.jpg') for f in os.listdir(os.path.join(d, n)))), None)
        if pick is None:
            continue
        pd = os.path.join(d, pick)
        img = sorted(f for f in os.listdir(pd) if f.lower().endswith(('.jpg', '.jpeg', '.png')))[0]
        shutil.copy(os.path.join(pd, img), dst)
        print(f'  테스트 사진 준비: {out} <- {nfc(pick)}/{img}')


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path == '/__result':
            n = int(self.headers.get('Content-Length', 0))
            RESULT.update(json.loads(self.rfile.read(n).decode('utf-8')))
            DONE.set()
            self.send_response(200)
            self.send_header('Content-Length', '2')
            self.end_headers()
            self.wfile.write(b'{}')
            return
        self.send_error(404)

    def translate_path(self, path):
        """macOS 는 파일명을 NFD 로 저장하므로 못 찾으면 정규화해서 다시 찾는다."""
        p = super().translate_path(path)
        if os.path.exists(p):
            return p
        rel = os.path.relpath(p, ROOT)
        cur = ROOT
        for part in rel.split(os.sep):
            if part in ('.', ''):
                continue
            try:
                m = next((n for n in os.listdir(cur) if nfc(n) == nfc(part)), None)
            except OSError:
                return p
            if m is None:
                return p
            cur = os.path.join(cur, m)
        return cur


def main():
    timeout = int(os.environ.get('SELFTEST_TIMEOUT', '1800'))
    if not os.path.exists(CHROME):
        print('Chrome 을 찾을 수 없습니다:', CHROME); return 2
    print('테스트 사진 확인...')
    ensure_fixtures()

    cfg = {
        'face': [
            {'page': 'Sec1_appea.html',   'male': True,  'img': 'retrain/selftest/fixtures/m_star.jpg', 'label': '외모점수'},
            {'page': 'Sec2_man_ent.html', 'male': True,  'img': 'retrain/selftest/fixtures/m_star.jpg', 'label': '닮은꼴'},
            {'page': 'Sec2_man_ent.html', 'male': False, 'img': 'retrain/selftest/fixtures/w_star.jpg', 'label': '닮은꼴'},
            {'page': 'Sec3_ani.html',     'male': True,  'img': 'retrain/selftest/fixtures/m_monkey.jpg', 'label': '동물상'},
            {'page': 'Sec3_ani.html',     'male': False, 'img': 'retrain/selftest/fixtures/w_star.jpg', 'label': '동물상'},
            {'page': 'Sec4_GAG.html',     'male': True,  'img': 'retrain/selftest/fixtures/m_gag.jpg', 'label': '개그맨'},
            {'page': 'Sec4_GAG.html',     'male': False, 'img': 'retrain/selftest/fixtures/w_gag.jpg', 'label': '개그우먼'},
            {'page': 'Sec5_good_bad.html', 'male': True, 'img': 'retrain/selftest/fixtures/m_star.jpg', 'label': '일진'},
        ],
        'coverage': [
            ['AI_star_m', 'Sec2_man_ent.html', 0],
            ['AI_star_w', 'Sec2_man_ent.html', 1],
            ['AI_GAG_M',  'Sec4_GAG.html', 0],
            ['AI_GAG_w',  'Sec4_GAG.html', 1],
        ],
        'saju': [[1990, 5, 15, 14, 30, False], [1984, 2, 2, 12, 0, False],
                 [2000, 1, 1, 0, 30, False], [1995, 7, 7, 0, 0, True]],
        'fortune': [[1990, 5, 15], [1984, 2, 2], [1977, 11, 3]],
    }

    port = free_port()
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = (f'http://127.0.0.1:{port}/retrain/selftest/page.html'
           f'?cfg={quote(json.dumps(cfg, ensure_ascii=False))}')

    profile = os.path.join(HERE, '.selftest-profile')
    shutil.rmtree(profile, ignore_errors=True)
    print('브라우저에서 테스트 실행 중... (모델을 여러 개 읽으므로 몇 분 걸립니다)\n')
    proc = subprocess.Popen(
        [CHROME, '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
         f'--user-data-dir={profile}', '--disable-dev-shm-usage', url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = DONE.wait(timeout)
    proc.terminate()
    srv.shutdown()
    shutil.rmtree(profile, ignore_errors=True)

    if not ok:
        print(f'시간 초과({timeout}초). 브라우저가 끝내지 못했습니다.')
        return 2
    print(RESULT.get('summary', '(결과 없음)'))
    return 0 if RESULT.get('failed', 1) == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
