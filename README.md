# Sentence Shooter

TOEFL Build-a-Sentence의 문맥 판단과 어구 배열을 회피 슈팅으로 훈련하는 정적 Canvas 게임이다. 현재 `torus-27`은 통합안 C를 공통 기반으로 삼고 BIG WING SWEEP 뒤 냉각 항적의 조향 방식만 A/B로 비교한다.

## 실행

Node.js 22 이상에서 다음을 실행한다. 런타임 패키지 의존성은 없다.

```text
git clone https://github.com/Epicevent/sentence-shooter.git
cd sentence-shooter
npm run resume
npm run build:check
npm test
npm run dev
```

```text
http://127.0.0.1:7777/game?seed=20260728
http://127.0.0.1:7777/game?ab=A&seed=20260728
http://127.0.0.1:7777/game?ab=B&seed=20260728
```

쿼리 없는 주소와 `?ab=C`는 v25 통합 control이다. `?ab=A`는 방향 고정 항적, `?ab=B`는 재조향 항적 후보이며 둘 다 C의 조립·열역학·보상 규칙을 사용한다.

문자를 입력하면 일치하는 모든 단어 상자가 함께 포커스된다. 입력을 더해 후보를 좁히고, 후보가 하나일 때 Tab으로 확정한다. 완성된 짧은 청크와 더 긴 접두사 청크가 겹치면 완전일치가 우선된다. Tab 아이템과 실드 아이템은 없다. 좌우 화살표로 이동하고, A/B에서는 실물 명중 3회 뒤 `Shift+←/→`로 BIG WING SWEEP을 시전한다. Space는 타자 리듬을 방해하지 않도록 아무 스킬에도 연결하지 않는다. Tab 확정은 즉시 50ms 타격 피드백을 주지만 단어의 폭발·점수 회수·보상 생성은 예약 미사일의 실제 마지막 충돌 순간에만 일어난다.

한 출격은 일반 문장 3개와 8청크 보스 문장 1개로 구성된다. 마지막 청크를 확정하면 다음 편대가 회색 비활성 상태로 먼저 진입하고, 문장 완료는 1.8초 동안 완성문과 오답 교정을 보여 준 뒤 이어진다.

문항 풀은 기존 12문항, 교재 사진에서 전사한 58문항, 8청크 보스 4문항으로 총 74문항이다. 같은 seed의 A/B/C는 문항·어구·초기 배치·판정을 공유한다.

## 열 세계의 수학

화면은 좌우·상하가 주기적인 2차원 토러스다. 다만 천장과 바닥이 동일시되는 원 `y=0`은 절대영도인 내부 Dirichlet 선으로 고정한다.

```text
T(x,y,0) = 0
T(x,0,t) = 0
∂t T = κ ΔT - C_local(x,y,t) T
κ = 0.00125
```

공기 중 전역 열원은 없다. 살아 있거나 아직 실제 피격을 기다리는 단어 상자가 움직이는 고정온도 경계다.

```text
T_word = min(1, 0.25 + 0.55 * descent + 0.10 * rage)
descent ∈ [0,1]
rage ∈ {0,1,2,3}
```

따라서 상자가 바닥으로 내려올수록, 오답으로 과열될수록 더 뜨거워진다. 마지막 미사일이 실제로 박힌 순간 그 경계가 사라지고 이미 퍼진 잔열만 남는다. 정답 콤보가 만드는 지속 냉각은 `C_local`에만 들어간다. 문장 clear와 `SCORE BREAK`의 확장 파동은 시각 front가 처음 통과한 격자 셀만 직접 냉각한다.

오답이 확정되면 화면의 노란 열안개를 내부 표본화하던 위치에서 220ms 예고를 가진 붉은 탄막이 응축된다. 탄은 열장의 복제된 위협 표현이며 권위 온도장과 tracer를 소비하지 않는다. 따라서 일부러 틀려도 세계 온도·안개·바닥 열은 내려가지 않는다. A/B/C 모두 승인 기준선인 원형 실루엣과 속도 반대 방향 11px 꼬리를 사용한다. 탄 수명은 `예고 + 발사 거리/속도 + 통과 여유`이므로 먼 탄도 조준점을 통과하기 전에 사라질 수 없다. 첫 피격은 맞은 한 발만 없애고 나머지 탄막을 보존한다. i-frame 접촉으로 나머지를 지우지 않으므로, 가만히 있으면 약 1초 간격의 연속 피격으로 실제 게임오버까지 이어진다. 단어 상자는 탄을 직접 발사하지 않는다.

## 계산 구조

권위 있는 열장은 64×40 `Float32Array` 격자다. 명시적 유한차분을 30Hz로 적분하고 배열 두 개를 교환해 매 스텝 할당을 피한다. 안정성 계수는 다음과 같다.

```text
κ Δt (Nx² + Ny²) ≈ 0.237 < 0.5
```

화면 표현은 180개 노란 점이 아니라 권위 격자를 보간한 연속 amber 열안개다. 180개 Brownian tracer는 오답 순간 붉은 위협의 발생 위치를 표본화하는 내부 풀로만 남고 열을 운반하는 상호작용 입자가 아니다. 한 번의 오답은 화면 6×4 구획의 고온 표본을 우선해 최대 36개의 원형 위협만 응축하므로, 숙고 시간이 길어져 tracer가 쌓여도 탄막이 무제한 커지지 않는다. 따라서 계산량은 입자쌍 `O(N²)`이 아니라 `O(Nx·Ny + Ntracer + 냉각 raster 셀 수)`다. 냉각장은 먼저 sink 격자에 rasterize하므로 PDE 내부 루프가 모든 노드를 다시 순회하지 않는다. 겹친 sink는 양성 explicit-Euler 조건을 지키도록 12에서 포화한다. trace의 `heat_field_fields`는 스텝 평균·최대 microsecond를 기록한다. 이 예산을 넘길 때만 같은 수학을 네이티브 커널로 내린다.

## 통합 게임 루프

- 공통 기반 C `THERMAL FUSION`: 실제 정답 명중의 조립 연출은 order 순서대로 380ms 직선 `RAIL SLAM`과 560ms `CORE LINK`를 번갈아 사용한다. 명중마다 호위기가 하나씩 붙어 좌우 2기씩 최대 4기가 된다. 각 기체는 실제 평타 발사점 하나이며 MK-I~MK-V의 보이는 탄 밀도를 단계적으로 높인다. 제한 요격 탄약은 실물 명중마다 1발을 벌고 붉은 탄 하나를 실제로 지울 때 1발을 쓴다.
- A/B에서는 같은 실물 명중이 SWEEP charge를 한 칸 채운다. 3칸이 되면 600px/s 대형 아군기가 폭 132px 회랑을 관통해 붉은 탄을 흡수하고, 실제 열을 식히며 1.65초 회피 i-frame을 준다. 뒤에 남은 장은 초당 78px로 수평 토러스 경계를 이어 간다. A는 방향이 고정되고 B는 활성 중에도 항적 방향을 바꿀 수 있다. C control만 기존 이동 자동시전을 유지한다.
- 문장 clear는 직선 rail과 방사형 quench를 함께 발동해 방사 front가 통과한 온도를 52% 낮춘다. 1,500점마다 발동하는 `SCORE BREAK`는 현재 붉은 탄막을 지우고 88% 냉각 front와 넓은 rail을 함께 발동한다. 살아 있는 단어 경계는 다음 열 스텝에서 다시 열원으로 clamp된다.

## A/B 후보

- A `WING SWEEP A`: 대형기 뒤 냉각 항적이 시전 방향으로 끝까지 흐른다. 활성 중 반대 방향 입력은 소비 없이 거절된다.
- B `WING SWEEP B`: 같은 스윕·충전량·반경·수명·냉각력으로 시작하지만 활성 중 `Shift+←/→`로 항적을 반전할 수 있다.

A/B의 차이는 SWEEP 뒤 항적 방향 제어뿐이다. 레일/코어 조립, 오답, 점수, 호위기, 열 계산은 같다.

점수 획득 때의 금색 다이아·상승 속도·도착별 숫자 증가·마지막 pulse와 실제 점수바 도착점은 두 안이 공유한다.

상단 HUD에는 모드, 목숨, 점수/BREAK, 실제로 문장에 도킹한 어구 수, FUSION의 제한 요격탄·STORM 자원, 활성 VOLLEY 경보만 남긴다. build/best/FLOOR/YELLOW 상태와 중복 조립문은 플레이 화면에서 제거했고 build는 trace metadata에 보존한다. 논리 정답은 다음 입력을 즉시 열지만, 어구와 진행 수는 실제 명중 뒤 `assembly_dock`에서만 화면에 붙는다.

## 추적과 검증

로컬 게임오버 또는 페이지 이탈 시 pipeline-9 세션이 `traces/tr_*.json`에 저장된다.

```text
npm run analyze
node tools/analyze-trace.js traces/tr_123.json
npm run verify:play
```

분석기는 문항 속도, 논리 판정→물리 명중 지연, 온도를 보존하는 오답 탄막, 제한 요격 사용, BIG WING SWEEP과 항적, 확장 냉각의 전후 열량, 국소 바닥 온도와 열 커널 시간을 함께 출력한다. `npm test`는 즉시 Tab 피드백, 정확 접두사 포커스, 두 조립 경로, 4기 호위기의 실제 평타 발사, A/B SWEEP, 스트리밍 소티와 보스, 오답 전후 온도 불변, 실물 냉각, swept collision, typed-array 재사용, 74문항과 trace 저장을 검증한다. `npm run verify:play`는 `reviewer=agent-storm-a`/`reviewer=agent-storm-b` 현재 build 원본의 최소 인과 증거만 확인하며 재미를 판정하지 않는다.

GitHub Pages는 루트 `index.html`을 정적으로 실행한다. 공개 페이지에서는 `/api/trace`가 저장되지 않으므로 개발 실측은 로컬 서버를 사용한다. LAN에서는 `node tools/dev-server.js --host 0.0.0.0`을 쓴다.

게임 원본은 `src/items.js`, `trace.js`, `heat.js`, `gameplay.js`, `combat.js`, `input.js`, `loop.js`, `render.js` 등으로 분리되어 있다. 수정 후 `npm run build`가 루트 `index.html`을 만들며, `npm run build:check`와 `npm test`가 생성물 드리프트를 막는다. Pages·로컬 서버·TOEFL 랩은 계속 이 단일 생성물만 읽는다.

로컬 수집기는 1초 단위 증분을 `POST /api/trace-checkpoint`로 같은 `session_id` 파일에 병합한다. 그래서 전체 `scene` JSON이 브라우저의 pagehide 전송 한도보다 커져도 이탈 직전까지 보존된다. 게임오버에서는 `POST /api/trace`가 같은 파일을 완성본으로 덮어쓴다. GitHub Pages에서는 체크포인트 루프를 실행하지 않는다.

공개 게임: https://epicevent.github.io/sentence-shooter/
