# Sentence Shooter

TOEFL Build-a-Sentence를 어순대로 격추하는 정적 Canvas 게임이다. 공개 게임은 GitHub Pages에서 실행되고, 이 저장소를 클론한 개발 에이전트는 같은 코드로 로컬 플레이 세션 전체를 수집·분석할 수 있다. 외부 프로젝트나 사용자별 절대경로가 필요하지 않다.

## 다른 PC에서 시작

요구 사항은 Node.js 22 이상과 브라우저다. 런타임 의존성은 없다.

```text
git clone https://github.com/Epicevent/sentence-shooter.git
cd sentence-shooter
npm test
npm run dev
```

브라우저에서 `http://127.0.0.1:7777/game`을 연다. 게임오버나 페이지 이탈 때 게임이 만든 pipeline-4 세션이 `traces/tr_*.json`에 저장된다. 이 폴더의 세션은 기본적으로 Git에 올라가지 않는다.

```text
npm run analyze
node tools/analyze-trace.js traces/tr_123.json
node tools/analyze-trace.js fixtures/traces/resize-overlap-before.json
```

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
