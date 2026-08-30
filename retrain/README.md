# 얼굴상 AI 재학습 / 콘텐츠 관리

새 연예인을 추가하거나 설명을 고칠 때 쓰는 도구 모음입니다.

## 0. 앱 실행

정적 사이트지만 AI 모델을 `fetch` 로 읽기 때문에 파일을 더블클릭하면 동작하지 않습니다.
반드시 로컬 서버로 띄우세요.

```bash
cd "9.code_face_AI"
python3 -m http.server 8899
# 브라우저에서 http://localhost:8899/index.html
```

## 1. 새 연예인 추가하기

### (1) 사진 폴더 만들기

학습용 사진은 `../2.Face image/` 아래에 **인물 한 명당 폴더 하나**로 넣습니다.
폴더 이름이 그대로 화면에 표시되는 이름이 되므로 오타에 주의하세요.

```
2.Face image/
  남자 연예인 얼굴_완료/
    차은우얼굴/        <- 폴더명에서 '얼굴'은 자동으로 떼어냅니다
      1.jpg
      2.jpg
      ...             <- 얼굴이 크게 나온 사진 15~20장 권장 (최소 2장)
```

정면·측면·표정이 골고루 섞일수록 정확해집니다.
얼굴이 작게 나온 사진은 오히려 정확도를 떨어뜨리니 넣지 마세요.

### (2) 먼저 점검 (학습 없이 확인만)

```bash
python3 retrain/retrain.py \
  --dataset "../2.Face image/남자 연예인 얼굴_완료" \
  --out AI_model/AI_star_m --strip-token 얼굴 --dry-run
```

- 새로 추가되는 인물 / 빠지는 인물
- 사진이 부족한 인물
- 라벨 중복

이 한 번에 표시됩니다. 여기서 오타를 다 잡고 넘어가세요.

### (3) 재학습

`--dry-run` 을 빼면 실제로 학습합니다.

```bash
python3 retrain/retrain.py \
  --dataset "../2.Face image/남자 연예인 얼굴_완료" \
  --out AI_model/AI_star_m --strip-token 얼굴
```

- 기존 모델은 `AI_star_m.bak_<날짜시각>` 으로 자동 백업됩니다.
- 헤드리스 Chrome 이 뒤에서 학습을 돌립니다. 창은 뜨지 않습니다.
- 사진 2,000장 기준으로 10~20분 정도 걸립니다.

네 모델을 한 번에 돌리려면:

```bash
bash retrain/run_all.sh
```

### (4) 설명 채우기

모델에 인물이 늘어나면 화면에 띄울 설명도 있어야 합니다.
없으면 결과 화면에 `undefined` 가 뜹니다.

```bash
python3 retrain/sync_descriptions.py            # 점검만
python3 retrain/sync_descriptions.py --apply    # HTML 에 반영
```

설명 문구는 `retrain/descriptions.json` 에서 관리합니다.

```json
{
  "AI_star_m": {
    "차은우": "당신은 얼굴 천재라는 별명이 따라다니는 ... 차은우씨를 닮으셨군요!"
  }
}
```

여기에 없는 인물은 기본 문구로 자동으로 채워지므로 화면이 깨지지는 않습니다.
나중에 `descriptions.json` 에 문구를 넣고 `--apply` 를 다시 돌리면 교체됩니다.

프로필 링크는 이름을 기준으로 **나무위키 주소가 자동 생성**됩니다.
사진은 앱에서 직접 띄우지 않고 링크로만 연결합니다.

## 2. 동물상에 새 항목 추가하기

동물상 폴더는 한 단계 더 깊습니다. (동물 → 인물 → 사진)

```
2.Face image/남자 동물상_완료/
  monkey/
    개그맨김기욱얼굴/1.jpg ...
    개그맨황기순얼굴/1.jpg ...
```

재학습 후에는 `Sec3_ani.html` 의 `switch` 문에 `case '<폴더명>':` 을 추가하고,
`style_Sec3.css` 에 `.<폴더명>-animal-title` / `.<폴더명>-animal-celeb` 색을 넣어주세요.

## 3. 동작 원리

Teachable Machine 모델은 **MobileNetV2(alpha 0.35) 백본 + 작은 분류 헤드**로 되어 있습니다.
백본은 이미 학습된 것을 그대로 쓰고, 헤드(1280 → 100 → 사람 수)만 다시 학습합니다.

1. 기존 `model.json` 에서 백본을 꺼내 온다
2. 사진을 전부 백본에 통과시켜 1280차원 특징으로 바꾼다
   (전처리는 Teachable Machine 과 동일: 중앙 정사각 크롭 → 224px → `/127 - 1`)
3. 헤드만 새로 학습한다
4. 백본 + 새 헤드를 합쳐 원본과 같은 형식으로 저장한다

그래서 결과물이 기존 파일과 **완전히 호환**되고, 앱 코드는 한 줄도 고칠 필요가 없습니다.

## 4. 파일

| 파일 | 역할 |
|---|---|
| `retrain.py` | 재학습 실행 (데이터 점검 + 학습 + 저장) |
| `trainer.html` | 브라우저에서 실제 학습을 수행 |
| `sync_descriptions.py` | 모델 라벨과 화면 설명 맞추기 |
| `descriptions.json` | 인물별 설명 문구 |
| `run_all.sh` | 네 모델 일괄 재학습 |

## 5. 자주 겪는 문제

**"Chrome 을 찾을 수 없습니다"**
→ `--chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` 로 경로를 직접 지정하세요.

**"시간 초과"**
→ 사진이 많으면 `--timeout 7200` 처럼 늘리세요.

**학습 정확도(val acc)가 낮다**
→ 인물당 사진이 적거나 얼굴이 작게 나온 사진이 섞인 경우입니다.
   동물상처럼 주관적인 분류는 원래 낮게 나옵니다.

**결과 화면에 `undefined` 가 뜬다**
→ `python3 retrain/sync_descriptions.py --apply` 를 돌리지 않은 것입니다.

## 6. 앱 전체 회귀 테스트

재학습이나 설명 수정 뒤에 한 번 돌려보세요.
다섯 개 얼굴상 섹션, 설명 커버리지, 사주팔자, 신년운세, 입력 검증을 한 번에 확인합니다.

```bash
python3 retrain/selftest.py
```

`ALL PASS` 가 아니면 어떤 항목이 왜 실패했는지 줄 단위로 표시됩니다.
특히 `설명 커버리지 ... 누락:` 이 뜨면 `sync_descriptions.py --apply` 를 돌리지 않은 것입니다.
