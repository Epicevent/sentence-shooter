# Sentence Shooter

TOEFL Build-a-Sentence의 대화 맥락·어구 배열·함정 선택을 실제 회피 슈팅으로 훈련하는 정적 Canvas 게임이다. 공개 게임은 GitHub Pages에서 실행되고, 이 저장소를 클론한 개발 에이전트는 같은 코드로 로컬 플레이 세션 전체를 수집·분석할 수 있다. 외부 프로젝트나 사용자별 절대경로가 필요하지 않다.

## 다른 PC에서 시작

요구 사항은 Node.js 22 이상과 브라우저다. 런타임 의존성은 없다.

```text
git clone https://github.com/Epicevent/sentence-shooter.git
cd sentence-shooter
npm test
npm run dev
```

브라우저에서 `http://127.0.0.1:7777/game`을 연다. 쿼리가 없으면 최종 채택안 B가 실행된다.
두 버전 모두 좌/우 화살표와 마우스를 동시에 쓸 수 있다. 문자를 입력하면 일치하는 모든 어구가 포커스되고,
더 입력하면 후보가 좁혀진다. 후보가 하나일 때 Tab으로 확정하며 이때는 ⚡를 쓰지 않는다. 포커스가 없는
상태의 Tab만 ⚡ 1개를 소비해 다음 어구를 자동 조립한다. 일치하지 않는 문자는 포커스만 해제하고,
고유한 오답 후보를 Tab으로 확정하거나 마우스로 오답을 선택했을 때만 사격 고장·편대 전진·반격탄이 발생한다.
게임오버나 페이지 이탈 때 게임이 만든 pipeline-4 세션이 `traces/tr_*.json`에 저장된다. 이 폴더의 세션은 기본적으로 Git에 올라가지 않는다.

B가 최종 게임이며 A는 이전 비교안을 재현하는 쿼리로 남아 있다. 두 안 모두 정답 판정·점수·다음 어구 개방은
입력 즉시 처리하지만, B의 단어는 예약된 미사일이 실제로 박힐 때까지 온전하게 보이고 마지막 물리 피해 순간에만
폭발한다. B에서 적탄을 아슬아슬하게 흘리면 `SYNC`가 20씩 차고, 100을 채운 뒤 수동 정답 미사일이 실제 명중하면
`CORE BURST`가 전탄을 지우고 추가 점수를 준다. 피격은 SYNC 40을 잃으며 Tab 자동 조립은 충전 코어를 소비하지 않는다.
A `VECTOR GRID`는 기존 직선형 전술 레일과 3열 편대, B `SIGNAL CORE`는 중앙 코어·방사형 신호망·2열 편대를 쓴다.
문항 풀은 기존 독자 작성 12문항과 사용자가 제공한 교재 사진 6장의 58문항을 합친 총 70문항이다.

```text
http://127.0.0.1:7777/game?ab=A&seed=20260728
http://127.0.0.1:7777/game?ab=B&seed=20260728
```

```text
npm run analyze
node tools/analyze-trace.js traces/tr_123.json
node tools/analyze-trace.js fixtures/traces/resize-overlap-before.json
```

분석기의 `completed item pace`는 실제 완료 문항으로 10문항 예상 시간을 계산한다. 두 안의 공통 하강 압박은
플레이를 6분으로 강제하지 않고 TOEFL 10문항≈6분에 맞는 사고·회피 여유를 주기 위한 생존 기준이다.

LAN 기기에서 플레이하려면 `node tools/dev-server.js --host 0.0.0.0`을 사용한다. 포트나 저장 위치는 `--port`, `--traces`로 바꿀 수 있다.

## 에이전트 개발 루프

1. 주 개발 에이전트는 먼저 `AGENTS.md`를 전부 읽고 `npm test`로 기준 상태를 확인한다.
2. `traces/`의 현재 파일 목록을 기준선으로 기록한 뒤 `npm run dev`를 실행한다.
3. 독립 플레이어 에이전트는 실제 브라우저 픽셀만 보며 사람처럼 플레이한다. DOM·소스·네트워크·게임 전역·트레이스 파일을 읽지 않는다. 키보드와 클릭을 함께 쓰고, 화면에 보이는 재고와 위협에 따라 Tab과 Shield를 사용한다.
4. 주 개발 에이전트는 플레이어의 해석이나 보고를 판정 근거로 쓰지 않는다. 새로 생성된 `traces/tr_*.json`을 처음부터 끝까지 직접 읽고, `tools/analyze-trace.js`의 기하·시간축 계산을 보조 증거로 사용한다.
5. 수정 후 결정론적 테스트를 추가하고 `npm test`를 통과시킨다. 같은 플레이 절차로 새 세션을 만들어 전체 시간축의 전후 차이를 확인한다.
6. `main`에 의도한 파일만 커밋·푸시한다. GitHub Pages 응답에서 변경의 고유 표식을 확인해야 배포 완료다.

에이전트 실행 환경에 서브에이전트나 실제 브라우저 제어 기능이 없으면 그 부분은 환경 차원의 blocker다. 코드나 fixture 테스트를 실제 사람형 플레이 검증으로 가장하지 않는다.

## GitHub Pages와 개발 도구

GitHub Pages는 루트의 `index.html`을 정적으로 실행한다. `tools/`, `fixtures/`, `traces/`가 저장소에 함께 있어도 게임 실행에는 영향을 주지 않으며 Node 서버도 Pages에서 실행되지 않는다. 공개 페이지의 `/api/trace` 전송은 저장되지 않으므로, 에이전트 실측 개발에는 위 로컬 서버를 사용한다.

## 회귀 증거

`fixtures/traces/`에는 실제 게임 소유 세션 두 개가 있다.

- `resize-overlap-before.json`: 알려진 실패. 최대 9쌍, 2769px²의 블록 교차를 반드시 검출해야 한다.
- `resize-recovery-after.json`: 알려진 성공. 모든 장면이 있고 렌더 교차가 0이어야 한다.

`npm test`는 입력/판정 파이프라인, 휴대형 서버의 실제 저장, 두 fixture의 음성·양성 대조를 모두 실행한다.

공개 게임: https://epicevent.github.io/sentence-shooter/
