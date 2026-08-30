#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
모델 라벨과 화면 설명(obj 배열)을 맞춰주는 도구.

 - 모델 metadata.json 의 labels 를 기준으로 삼는다.
 - retrain/descriptions.json 에서 설명을 가져와 HTML 의 obj 배열을 다시 쓴다.
 - 라벨에 설명이 없으면 기본 문구로 채워 넣어 화면에 'undefined' 가 뜨지 않게 한다.
 - 연예인 프로필은 사진을 직접 띄우지 않고 나무위키 링크로만 연결한다.

사용 예)
  python3 retrain/sync_descriptions.py            # 점검만 (변경 없음)
  python3 retrain/sync_descriptions.py --apply    # HTML 에 반영
"""
import argparse, io, json, os, re, sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SECTIONS = [
    ('Sec2_man_ent.html', ['AI_star_m', 'AI_star_w']),
    ('Sec4_GAG.html',     ['AI_GAG_M', 'AI_GAG_w']),
]

# 동명이인이 많아 문서를 특정하기 어려운 경우는 나무위키 검색으로 보낸다
AMBIGUOUS_HINT = re.compile(r'\s')


def namu_url(name):
    """나무위키 주소. 괄호/부연 설명이 붙은 이름은 검색 결과로 연결한다."""
    base = re.sub(r'\s*\([^)]*\)\s*', '', name).strip()
    if AMBIGUOUS_HINT.search(base):            # 예) '박지윤 가수'
        return 'https://namu.wiki/Search?q=' + quote(base)
    return 'https://namu.wiki/w/' + quote(base)


def default_expl(name, female):
    tail = '닮으셨네요!' if female else '닮으셨군요!'
    return f'당신은 {name}씨와 {tail} 아래 링크에서 프로필을 확인해 보세요.'


def parse_block(body):
    """obj 배열 본문에서 {name, expl, img_site} 를 뽑는다. img_site 는 없어도 된다."""
    out = []
    for m in re.finditer(r'\{\s*"name"\s*:\s*"([^"]*)"\s*,\s*"expl"\s*:\s*"([^"]*)"'
                         r'(?:\s*,\s*"img_site"\s*:\s*"([^"]*)")?\s*\}', body):
        out.append({'name': m.group(1), 'expl': m.group(2), 'img_site': m.group(3) or ''})
    return out


def render_block(items, indent):
    lines = []
    for it in items:
        lines.append('%s{"name":"%s", "expl":"%s", "img_site":"%s"},'
                     % (indent, it['name'], it['expl'], it['img_site']))
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='실제로 HTML 을 수정한다')
    ap.add_argument('--descriptions', default=os.path.join(HERE, 'descriptions.json'))
    args = ap.parse_args()

    desc = {}
    if os.path.isfile(args.descriptions):
        desc = json.load(io.open(args.descriptions, encoding='utf-8'))

    problems = 0
    for fname, mods in SECTIONS:
        path = os.path.join(ROOT, fname)
        text = io.open(path, encoding='utf-8').read()
        blocks = list(re.finditer(r'(var obj = \[\n)(.*?)(\n\s*\];)', text, re.S))
        if len(blocks) != len(mods):
            print(f'! {fname}: obj 배열 {len(blocks)}개 (모델 {len(mods)}개) - 건너뜀')
            problems += 1
            continue

        new_text, cursor, out_parts = '', 0, []
        for blk, mod in zip(blocks, mods):
            female = mod.endswith('_w')
            labels = json.load(io.open(os.path.join(ROOT, 'AI_model', mod, 'metadata.json'),
                                       encoding='utf-8'))['labels']
            current = {it['name']: it for it in parse_block(blk.group(2))}
            table = desc.get(mod, {})

            indent = re.match(r'[\t ]*', blk.group(2).lstrip('\n')).group(0) or '\t' * 10
            items, filled, relinked, dropped = [], [], 0, []
            for lab in labels:
                expl = table.get(lab) or (current.get(lab) or {}).get('expl')
                if not expl:
                    expl = default_expl(lab, female)
                    filled.append(lab)
                url = namu_url(lab)
                if (current.get(lab) or {}).get('img_site') != url:
                    relinked += 1
                items.append({'name': lab, 'expl': expl, 'img_site': url})
            dropped = [n for n in current if n not in labels]

            print(f'{mod:12s} 라벨 {len(labels):3d}개 | 새 설명 필요 {len(filled):2d}개 '
                  f'| 링크 갱신 {relinked:3d}개 | 사용 안 하는 항목 {len(dropped)}개')
            if filled:
                print('    기본 문구로 채움: ' + ', '.join(filled))
            if dropped:
                print('    제거됨(모델에 없음): ' + ', '.join(dropped))
            out_parts.append((blk, render_block(items, indent)))

        if args.apply:
            for blk, rendered in reversed(out_parts):
                text = text[:blk.start(2)] + rendered + text[blk.end(2):]
            io.open(path, 'w', encoding='utf-8').write(text)
            print(f'  -> {fname} 반영 완료')

    if not args.apply:
        print('\n(점검만 했습니다. 실제로 고치려면 --apply 를 붙이세요.)')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
