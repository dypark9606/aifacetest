#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사진 폴더 -> 학습용 얼굴 이미지.

아무렇게나 모아둔 사진을 넣으면 얼굴만 잘라서 학습 폴더에 넣어 준다.
macOS 의 CoreImage 얼굴 검출을 쓰므로 **따로 설치할 게 없다**(HEIC 도 그대로 읽는다).

  # 한 사람
  python3 retrain/prep_faces.py --src ~/Downloads/차은우 --name 차은우 \
      --dataset "남자 연예인 얼굴_완료"

  # 여러 사람 한꺼번에 (하위 폴더 하나 = 한 사람)
  python3 retrain/prep_faces.py --src ~/Downloads/새인물들 --bulk \
      --dataset "남자 연예인 얼굴_완료"

  # 넣기 전에 확인만
  python3 retrain/prep_faces.py --src ... --dry-run

하는 일
  1. 얼굴을 찾아 여백 40% 를 두고 잘라 512px 정사각형으로 맞춘다
  2. 쓸 수 없는 사진을 걸러낸다
     - 얼굴을 못 찾음 / 얼굴이 너무 작음(사진 폭의 12% 미만)
     - 흐림(라플라시안 분산이 낮음)
     - 얼굴이 여럿인데 어느 게 주인공인지 모호함
  3. 거의 같은 사진(연사·리사이즈본)을 dHash 로 걸러낸다
  4. `1.jpg, 2.jpg ...` 로 번호를 붙여 저장하고, 사람별로 몇 장이 남았는지 알려준다
"""
import argparse, os, sys, io, hashlib, multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor
import unicodedata as ud

try:
    import Quartz
    from Quartz import CIImage, CIDetector, CIContext
except Exception:
    sys.exit("PyObjC(Quartz) 가 필요합니다. macOS 에서 실행하세요.")
try:
    from PIL import Image
    import numpy as np
except Exception:
    sys.exit("Pillow / numpy 가 필요합니다.")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # 9.code_face_AI
FACEDIR = os.path.normpath(os.path.join(ROOT, '..', '2.Face image'))
EXT = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff')

MARGIN      = 0.40     # 얼굴 주변 여백
OUT_SIZE    = 512
MIN_FACE_R  = 0.12     # 얼굴 폭 / 사진 폭
BLUR_MIN    = 40.0     # 라플라시안 분산
DOMINANT_R  = 1.6      # 가장 큰 얼굴이 두 번째보다 이만큼 커야 '주인공'으로 인정


def nfc(s):
    return ud.normalize('NFC', s)


_detector = None
def detector():
    global _detector
    if _detector is None:
        _detector = CIDetector.detectorOfType_context_options_(
            "CIDetectorTypeFace", None, {"CIDetectorAccuracy": "CIDetectorAccuracyHigh"})
    return _detector


_ctx = None
def ctx():
    global _ctx
    if _ctx is None:
        _ctx = CIContext.contextWithOptions_(None)
    return _ctx


def load_ci(path):
    b = path.encode('utf-8')
    url = Quartz.CFURLCreateFromFileSystemRepresentation(None, b, len(b), False)
    return CIImage.imageWithContentsOfURL_(url)


def crop_face(path):
    """(PIL이미지, 사유) 를 돌려준다. 실패하면 (None, 사유)."""
    img = load_ci(path)
    if img is None:
        return None, '읽기 실패'
    ext = img.extent()
    W, H = ext.size.width, ext.size.height
    if W < 1 or H < 1:
        return None, '읽기 실패'

    faces = detector().featuresInImage_(img)
    if not faces:
        return None, '얼굴 없음'

    boxes = sorted(((f.bounds().size.width, f.bounds()) for f in faces),
                   key=lambda t: t[0], reverse=True)
    if len(boxes) > 1 and boxes[0][0] < boxes[1][0] * DOMINANT_R:
        return None, '얼굴 여럿(주인공 모호)'

    w, b = boxes[0]
    if w / W < MIN_FACE_R:
        return None, '얼굴이 너무 작음'

    # CoreImage 는 좌하단 원점. 여백을 주고 정사각형으로 넓힌다.
    side = max(b.size.width, b.size.height) * (1 + 2 * MARGIN)
    cx = b.origin.x + b.size.width / 2
    cy = b.origin.y + b.size.height / 2
    x = max(0.0, min(cx - side / 2, W - 1))
    y = max(0.0, min(cy - side / 2, H - 1))
    side = min(side, W - x, H - y)
    if side < 32:
        return None, '잘라낼 영역이 너무 작음'

    rect = Quartz.CGRectMake(x, y, side, side)
    cropped = img.imageByCroppingToRect_(rect)
    # 원점을 0,0 으로 옮기고 목표 크기로 스케일
    cropped = cropped.imageByApplyingTransform_(
        Quartz.CGAffineTransformMakeTranslation(-x, -y))
    s = OUT_SIZE / side
    cropped = cropped.imageByApplyingTransform_(Quartz.CGAffineTransformMakeScale(s, s))

    data = ctx().JPEGRepresentationOfImage_colorSpace_options_(
        cropped, cropped.colorSpace() or Quartz.CGColorSpaceCreateDeviceRGB(), {})
    if data is None:
        return None, 'JPEG 변환 실패'
    pil = Image.open(io.BytesIO(bytes(data))).convert('RGB')
    if pil.size != (OUT_SIZE, OUT_SIZE):
        pil = pil.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    return pil, ''


def blur_score(pil):
    g = np.asarray(pil.convert('L').resize((256, 256)), dtype=np.float32)
    lap = (g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1])
    return float(lap.var())


def dhash(pil, size=8):
    g = np.asarray(pil.convert('L').resize((size + 1, size)), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return ''.join('1' if b else '0' for b in bits)


def hamming(a, b):
    return sum(1 for x, y in zip(a, b) if x != y)



def _worker(path):
    """자식 프로세스에서 얼굴을 잘라 JPEG 바이트로 돌려준다."""
    pil, why = crop_face(path)
    if pil is None:
        return (None, why, None)
    b = blur_score(pil)
    if b < BLUR_MIN:
        return (None, '흐림', None)
    buf = io.BytesIO()
    pil.save(buf, format='JPEG', quality=92)
    return (buf.getvalue(), '', dhash(pil))


def process_person(src, out_dir, dry, keep_existing, jobs=1, pool=None):
    files = [os.path.join(src, f) for f in sorted(os.listdir(src), key=nfc)
             if f.lower().endswith(EXT) and not f.startswith('.')]
    stats = {'입력': len(files), '저장': 0}
    rej = {}
    hashes = []

    # 이미 있는 사진의 해시도 넣어 중복을 막는다
    start = 1
    if keep_existing and os.path.isdir(out_dir):
        olds = [f for f in os.listdir(out_dir) if f.lower().endswith(EXT)]
        nums = [int(os.path.splitext(f)[0]) for f in olds if os.path.splitext(f)[0].isdigit()]
        start = (max(nums) + 1) if nums else (len(olds) + 1)
        for f in olds:
            try:
                hashes.append(dhash(Image.open(os.path.join(out_dir, f)).convert('RGB')))
            except Exception:
                pass

    kept = []
    if pool is not None and files:
        results = list(pool.map(_worker, files, chunksize=1))
    elif jobs > 1 and len(files) > 3:
        ctxmp = mp.get_context('spawn')
        with ProcessPoolExecutor(max_workers=jobs, mp_context=ctxmp) as ex:
            results = list(ex.map(_worker, files, chunksize=1))
    else:
        results = [_worker(p) for p in files]

    for jpg, why, h in results:
        if jpg is None:
            rej[why] = rej.get(why, 0) + 1
            continue
        if any(hamming(h, o) <= 5 for o in hashes):
            rej['중복'] = rej.get('중복', 0) + 1
            continue
        hashes.append(h)
        kept.append(jpg)

    stats['저장'] = len(kept)
    if not dry and kept:
        os.makedirs(out_dir, exist_ok=True)
        for i, jpg in enumerate(kept):
            with open(os.path.join(out_dir, f'{start + i}.jpg'), 'wb') as fh:
                fh.write(jpg)
    return stats, rej


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='원본 사진 폴더')
    ap.add_argument('--dataset', help='2.Face image 아래 대상 폴더명')
    ap.add_argument('--name', help='인물 이름 (폴더는 <이름>얼굴 이 된다)')
    ap.add_argument('--bulk', action='store_true', help='--src 하위 폴더 하나 = 한 사람')
    ap.add_argument('--suffix', default='얼굴', help="폴더 접미사 (기본 '얼굴')")
    ap.add_argument('--dry-run', action='store_true', help='저장하지 않고 결과만 본다')
    ap.add_argument('--append', action='store_true', help='기존 사진 뒤에 이어 붙인다')
    ap.add_argument('--target', type=int, default=15, help='인물당 목표 장수 (기본 15)')
    ap.add_argument('--jobs', type=int, default=max(2, (os.cpu_count() or 4) - 2),
                    help='동시 처리 개수 (기본: CPU-2)')
    args = ap.parse_args()

    src = os.path.expanduser(args.src)
    if not os.path.isdir(src):
        sys.exit(f'폴더가 없습니다: {src}')
    if not args.dry_run and not args.dataset:
        sys.exit('--dataset 을 지정하세요 (예: "남자 연예인 얼굴_완료")')

    people = []
    if args.bulk:
        for d in sorted(os.listdir(src), key=nfc):
            p = os.path.join(src, d)
            if os.path.isdir(p) and not d.startswith('.'):
                people.append((nfc(d), p))
    else:
        name = nfc(args.name or os.path.basename(src.rstrip('/')))
        people.append((name, src))

    if not people:
        sys.exit('처리할 사람이 없습니다.')

    ds_dir = os.path.join(FACEDIR, args.dataset) if args.dataset else None
    print(f'대상 데이터셋: {ds_dir or "(dry-run)"}')
    print(f'{"인물":<14}{"입력":>6}{"저장":>6}   걸러낸 사유')
    print('-' * 72)

    pool = None
    if args.jobs > 1 and len(people) > 0:
        pool = ProcessPoolExecutor(max_workers=args.jobs, mp_context=mp.get_context('spawn'))

    short = []
    for name, folder in people:
        suf = nfc(args.suffix)
        label = name[:-len(suf)] if name.endswith(suf) else name
        label = label.strip()
        out_dir = os.path.join(ds_dir, label + args.suffix) if ds_dir else ''
        stats, rej = process_person(folder, out_dir, args.dry_run, args.append, args.jobs, pool)
        total = stats['저장']
        if args.append and out_dir and os.path.isdir(out_dir):
            total = len([f for f in os.listdir(out_dir) if f.lower().endswith(EXT)])
        rs = ', '.join(f'{k} {v}' for k, v in sorted(rej.items(), key=lambda x: -x[1])) or '-'
        print(f'{label:<14}{stats["입력"]:>6}{stats["저장"]:>6}   {rs}')
        if total < args.target:
            short.append((label, total))

    if pool is not None:
        pool.shutdown(wait=True)

    print('-' * 72)
    if short:
        print(f'⚠ 목표({args.target}장) 미달: ' + ', '.join(f'{n}({c})' for n, c in short))
        print('  → 사진을 더 넣고 --append 로 다시 돌리세요.')
    else:
        print('모든 인물이 목표 장수를 채웠습니다.')
    if args.dry_run:
        print('\n(--dry-run 이라 저장하지 않았습니다.)')
    else:
        print('\n다음 단계: retrain/retrain.py 로 재학습하세요.')


if __name__ == '__main__':
    main()
