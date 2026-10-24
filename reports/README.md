# MATE:ON 최종 보고서

- `mateon-final-report.pdf`: 16:9, 30쪽. 제공된 중간고사 안내의 브랜딩·페르소나·메인 및 부가 기능 플로우·시나리오 요구사항을 정리한 제출용 PDF입니다.
- PDF의 마지막 페이지에 배포 앱과 참고 Figma 링크, 요구사항별 페이지 안내가 있습니다.
- 페르소나는 인터뷰로 검증된 인물이 아닌 기획 가설입니다. 결과·이름·규칙·준비 항목은 시연 예시입니다.
- 규칙 동의·서명은 현재 같은 기기를 번갈아 사용하는 방식입니다. 인증된 원격 동의나 스토어 출시 완료를 의미하지 않습니다.

## 수정용 원본

최종 전달 ZIP에는 `index.html`, 로컬 폰트, 로고·캐릭터·시나리오 이미지, 실제 배포 앱 화면, 화면 출처 목록을 포함합니다. 압축을 풀고 `index.html`을 브라우저로 열면 모든 텍스트와 표를 확인할 수 있습니다. HTML 텍스트와 스타일을 수정한 뒤 1600 × 900px 페이지 크기로 PDF를 다시 저장할 수 있습니다.

## 화면 및 PDF 재생성

1. 제공된 Figma 시나리오 프레임 `387:3622`의 장면 이미지 6개를 `artifacts/final-report/assets/scene-1.png`부터 `scene-6.png`로 준비합니다. 이 이미지는 사용자가 제공한 디자인 자료입니다.
2. `node scripts/capture-final-report.mjs`: 배포된 버전에서 30개 화면을 시연 데이터로 캡처합니다. 독립된 브라우저 프로필을 사용합니다.
3. `node scripts/build-final-report.mjs`: HTML 원본과 제출 PDF를 생성하고 이미지·폰트 로드 및 페이지 경계를 확인합니다.

Playwright의 로컬 브라우저 경로는 이 PC의 `C:\tools\ms-playwright`를 사용합니다. 앱 화면을 캡처할 때 로컬 앱 서버는 열지 않습니다.

평가 틀은 [Jakob Nielsen의 10가지 사용성 휴리스틱](https://www.nngroup.com/articles/ten-usability-heuristics/)을 참고했으며, 평가 결과는 설계자 점검으로 실제 사용자 테스트와 구분했습니다.
