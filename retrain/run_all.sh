#!/bin/bash
# 4개 얼굴상 모델 일괄 재학습
cd "$(dirname "$0")/.."
set -x
python3 retrain/retrain.py --dataset "../2.Face image/남자 동물상_완료"      --out AI_model/AI_animal_M --epochs 50
python3 retrain/retrain.py --dataset "../2.Face image/남자 연예인 얼굴_완료" --out AI_model/AI_star_m   --strip-token 얼굴 --epochs 50
python3 retrain/retrain.py --dataset "../2.Face image/여자연예인얼굴_완료"   --out AI_model/AI_star_w   --strip-token 얼굴 --epochs 50
