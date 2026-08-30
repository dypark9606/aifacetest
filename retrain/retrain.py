#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teachable Machine 호환 모델 재학습기.

기존 모델의 MobileNetV2(alpha=0.35) 백본은 그대로 재사용하고,
분류 헤드(1280 -> 100 -> N)만 다시 학습해서 model.json / weights.bin /
metadata.json 을 원본과 동일한 포맷으로 다시 써 넣는다.

사용 예)
  python3 retrain/retrain.py \
      --dataset "../2.Face image/여자연예인얼굴_완료" \
      --out AI_model/AI_star_w \
      --strip-suffix 얼굴

  # 새 폴더를 추가한 뒤 그대로 다시 돌리면 인물이 늘어난 모델이 만들어진다.
"""
import argparse, base64, json, os, re, shutil, socket, subprocess, sys, threading, time
import unicodedata as ud
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # 9.code_face_AI
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')

CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]


def nfc(s):
    return ud.normalize('NFC', s)


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('Chrome 을 찾을 수 없습니다. --chrome 으로 경로를 지정하세요.')


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def scan_dataset(dataset, strip_prefix, strip_suffix, strip_tokens, rename, min_images):
    """하위 폴더 = 클래스. (라벨, [이미지 절대경로]) 목록을 정렬해서 돌려준다."""
    classes, skipped = [], []
    for entry in sorted(os.listdir(dataset), key=nfc):
        d = os.path.join(dataset, entry)
        if not os.path.isdir(d) or entry.startswith('.'):
            continue
        imgs = []
        for root, dirs, files in os.walk(d):
            dirs[:] = [x for x in dirs if not x.startswith('.')]
            imgs += [os.path.join(root, f) for f in files
                     if f.lower().endswith(IMG_EXT) and not f.startswith('.')]
        imgs.sort()
        label = nfc(entry).strip()
        if strip_prefix and label.startswith(strip_prefix):
            label = label[len(strip_prefix):]
        if strip_suffix and label.endswith(strip_suffix):
            label = label[:-len(strip_suffix)]
        for tok in strip_tokens:
            label = label.replace(tok, '')
        label = re.sub(r'[_\s]+', ' ', label).strip()
        label = rename.get(label, label)
        if len(imgs) < min_images:
            skipped.append((label, len(imgs)))
            continue
        classes.append((label, imgs))
    return classes, skipped


class Handler(BaseHTTPRequestHandler):
    routes = {}      # url prefix -> 실제 디렉터리
    manifest = None
    saved = {}
    done = threading.Event()

    def log_message(self, *a):
        pass

    def _send(self, code, body=b'', ctype='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == '/manifest.json':
            return self._send(200, json.dumps(Handler.manifest, ensure_ascii=False).encode())
        for prefix, base in Handler.routes.items():
            if path.startswith(prefix):
                rel = path[len(prefix):].lstrip('/')
                # macOS 파일명은 NFD 로 저장되므로 정규화해 가며 찾는다
                full = os.path.join(base, rel)
                if not os.path.exists(full):
                    full = self._resolve_nfc(base, rel)
                if full and os.path.isfile(full):
                    ctype = 'application/json' if full.endswith('.json') else 'application/octet-stream'
                    if full.lower().endswith(('.jpg', '.jpeg')):
                        ctype = 'image/jpeg'
                    elif full.lower().endswith('.png'):
                        ctype = 'image/png'
                    elif full.endswith('.html'):
                        ctype = 'text/html; charset=utf-8'
                    with open(full, 'rb') as f:
                        return self._send(200, f.read(), ctype)
        return self._send(404, b'{}')

    @staticmethod
    def _resolve_nfc(base, rel):
        cur = base
        for part in rel.split('/'):
            if not part:
                continue
            try:
                match = next((n for n in os.listdir(cur) if nfc(n) == nfc(part)), None)
            except OSError:
                return None
            if match is None:
                return None
            cur = os.path.join(cur, match)
        return cur

    def do_POST(self):
        path = urlparse(self.path).path
        n = int(self.headers.get('Content-Length', 0))
        payload = json.loads(self.rfile.read(n).decode('utf-8'))
        if path == '/progress':
            msg = payload.get('msg', '')
            print('   ' + msg, flush=True)
            return self._send(200, b'{"ok":true}')
        if path == '/save':
            Handler.saved = payload
            Handler.done.set()
            return self._send(200, b'{"ok":true}')
        if path == '/error':
            Handler.saved = {'error': payload.get('error', 'unknown')}
            Handler.done.set()
            return self._send(200, b'{"ok":true}')
        return self._send(404, b'{}')


def write_model(outdir, artifacts, labels, model_name, base_metadata):
    os.makedirs(outdir, exist_ok=True)
    weights = base64.b64decode(artifacts['weightData'])
    with open(os.path.join(outdir, 'weights.bin'), 'wb') as f:
        f.write(weights)
    model_json = {
        'modelTopology': artifacts['modelTopology'],
        'weightsManifest': [{'paths': ['weights.bin'], 'weights': artifacts['weightSpecs']}],
    }
    with open(os.path.join(outdir, 'model.json'), 'w', encoding='utf-8') as f:
        json.dump(model_json, f, ensure_ascii=False)
    meta = dict(base_metadata) if base_metadata else {}
    meta.update({
        'tfjsVersion': '1.3.1',
        'tmVersion': '2.3.1',
        'packageVersion': '0.8.4',
        'packageName': '@teachablemachine/image',
        'timeStamp': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()),
        'labels': labels,
        'modelName': model_name,
    })
    meta.setdefault('userMetadata', {})
    with open(os.path.join(outdir, 'metadata.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True, help='클래스별 하위 폴더가 있는 이미지 폴더')
    ap.add_argument('--out', required=True, help='결과 모델 폴더 (예: AI_model/AI_star_w)')
    ap.add_argument('--base', default=None, help='백본을 가져올 기존 모델 폴더 (기본: --out)')
    ap.add_argument('--strip-prefix', default='')
    ap.add_argument('--strip-suffix', default='')
    ap.add_argument('--strip-token', action='append', default=[],
                    help="폴더명 어디에 있든 지울 문자열 (여러 번 지정 가능, 예: --strip-token 얼굴)")
    ap.add_argument('--rename', default=None,
                    help='{"폴더에서_뽑은라벨": "실제 표기"} 형태의 JSON 파일')
    ap.add_argument('--epochs', type=int, default=50)
    ap.add_argument('--batch-size', type=int, default=16)
    ap.add_argument('--lr', type=float, default=0.001)
    ap.add_argument('--val-split', type=float, default=0.15)
    ap.add_argument('--min-images', type=int, default=2)
    ap.add_argument('--chrome', default=None)
    ap.add_argument('--timeout', type=int, default=3600)
    ap.add_argument('--dry-run', action='store_true', help='학습 없이 데이터셋만 점검')
    args = ap.parse_args()

    dataset = os.path.abspath(os.path.join(ROOT, args.dataset)) if not os.path.isabs(args.dataset) else args.dataset
    outdir = os.path.abspath(os.path.join(ROOT, args.out)) if not os.path.isabs(args.out) else args.out
    basedir = os.path.abspath(os.path.join(ROOT, args.base)) if args.base else outdir
    if not os.path.isdir(dataset):
        raise SystemExit(f'데이터셋 폴더가 없습니다: {dataset}')
    if not os.path.isfile(os.path.join(basedir, 'model.json')):
        raise SystemExit(f'백본을 가져올 기존 모델이 없습니다: {basedir}/model.json')

    rename = {}
    if args.rename:
        rp = args.rename if os.path.isabs(args.rename) else os.path.join(ROOT, args.rename)
        rename = {nfc(k): nfc(v) for k, v in json.load(open(rp, encoding='utf-8')).items()}
    classes, skipped = scan_dataset(dataset, args.strip_prefix, args.strip_suffix,
                                    [nfc(x) for x in args.strip_token], rename, args.min_images)
    print(f'데이터셋: {dataset}')
    print(f'  클래스 {len(classes)}개, 이미지 {sum(len(v) for _, v in classes)}장')
    thin = [(l, len(v)) for l, v in classes if len(v) < 10]
    if thin:
        print(f'  ! 사진이 10장 미만이라 정확도가 낮을 수 있는 인물 {len(thin)}명: ' +
              ', '.join(f'{l}({n})' for l, n in thin))
    dup = {l for l, _ in classes if [x for x, _ in classes].count(l) > 1}
    if dup:
        raise SystemExit('라벨이 중복됩니다(폴더명을 구분하세요): ' + ', '.join(sorted(dup)))
    if skipped:
        print(f'  ! 사진이 {args.min_images}장 미만이라 제외: ' +
              ', '.join(f'{l}({n})' for l, n in skipped))
    if not classes:
        raise SystemExit('학습할 클래스가 없습니다.')

    base_meta = {}
    mp = os.path.join(basedir, 'metadata.json')
    if os.path.isfile(mp):
        base_meta = json.load(open(mp, encoding='utf-8'))
        old = base_meta.get('labels', [])
        new_labels = [l for l, _ in classes]
        added = [l for l in new_labels if l not in old]
        removed = [l for l in old if l not in new_labels]
        if added:
            print(f'  + 새로 추가되는 인물 {len(added)}명: ' + ', '.join(added))
        if removed:
            print(f'  - 빠지는 인물 {len(removed)}명: ' + ', '.join(removed))

    if args.dry_run:
        print('\n--dry-run 이므로 학습은 건너뜁니다.')
        return

    port = free_port()
    Handler.routes = {'/dataset/': dataset, '/base/': basedir, '/app/': ROOT, '/': HERE}
    Handler.manifest = {
        'classes': [{'label': l,
                     'images': ['/dataset/' + os.path.relpath(p, dataset).replace(os.sep, '/')
                                for p in imgs]}
                    for l, imgs in classes],
        'baseModel': '/base/model.json',
        'epochs': args.epochs, 'batchSize': args.batch_size,
        'learningRate': args.lr, 'valSplit': args.val_split,
    }
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    chrome = args.chrome or find_chrome()
    profile = os.path.join(HERE, '.chrome-profile')
    shutil.rmtree(profile, ignore_errors=True)
    url = f'http://127.0.0.1:{port}/trainer.html'
    print(f'\n학습 시작 (헤드리스 Chrome, {url})')
    proc = subprocess.Popen(
        [chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
         f'--user-data-dir={profile}', '--disable-dev-shm-usage', url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ok = Handler.done.wait(args.timeout)
    proc.terminate()
    srv.shutdown()
    shutil.rmtree(profile, ignore_errors=True)
    if not ok:
        raise SystemExit(f'시간 초과({args.timeout}s). --timeout 을 늘려보세요.')
    res = Handler.saved
    if 'error' in res:
        raise SystemExit('학습 실패: ' + str(res['error']))

    labels = res['labels']
    model_name = os.path.basename(outdir)
    if os.path.isdir(outdir):
        stamp = time.strftime('%Y%m%d_%H%M%S')
        bak = outdir + '.bak_' + stamp
        shutil.copytree(outdir, bak)
        print(f'기존 모델 백업: {bak}')
    write_model(outdir, res['artifacts'], labels, model_name, base_meta)
    print(f'\n완료 -> {outdir}')
    print(f'  클래스 {len(labels)}개')
    print(f'  train acc {res["trainAcc"]:.3f} / val acc {res["valAcc"]:.3f}')
    print('\n다음 단계: python3 retrain/sync_descriptions.py  (새 인물 설명 채우기)')


if __name__ == '__main__':
    main()
