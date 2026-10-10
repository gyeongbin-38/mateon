/* MATE:ON 전역 선언 — js/*.js가 window에 노출하는 네임스페이스와 벤더 전역 */
declare const MateLife: any;
declare const MateSecure: any;
declare const MateNative: any;
declare const MateHouse: any;
declare const MateViews: any;
declare const MateI18n: any;
declare const MateCard: any;
declare const MateScreenshot: any;
declare const TinyBase: any;
declare const tinybase: any;
declare const createMergeableStore: any;
declare const driver: any;
declare const Driver: any;
declare const Tesseract: any;
declare const QRCode: any;
declare const qrcode: any;
declare const Capacitor: any;
declare const modernScreenshot: any;
declare const Kakao: any;

/* DOM 이벤트 위임 패턴 — EventTarget/Element에 optional 멤버를 머지해
   getElementById/e.target narrowing 없이 폼 필드 접근을 허용한다 */
interface EventTarget {
  closest?(selector: string): any;
  tagName?: string;
  classList?: any;
  id?: string;
  value?: any;
  files?: any;
  checked?: any;
  dataset?: any;
  selectionStart?: any;
  removeAttribute?(name: string): void;
  setAttribute?(name: string, value: string): void;
}
interface Element {
  value?: any;
  dataset?: any;
  disabled?: any;
  /* Element에도 focus/click이 있다고 선언해야 strictNullChecks에서
     querySelector 결과의 x.focus()가 'possibly undefined'로 잡히지 않는다.
     (optional이면 HTMLOrSVGElement의 실제 선언과 머지돼 호출 불가로 잡힘) */
  focus(options?: any): void;
  click(): void;
}
interface HTMLElement {
  value?: any;
  checked?: any;
  files?: any;
  reset?(): void;
  selectionStart?: any;
  setSelectionRange?(...args: any[]): void;
}

interface Window {
  MateLife: any;
  MateSecure: any;
  MateNative: any;
  MateHouse: any;
  MateViews: any;
  MateI18n: any;
  MateCard: any;
  MateScreenshot: any;
  MATEON_CONFIG: any;
  __mateon: any;
  __d: any;
  qrcode: any;
  QRCode: any;
  TinyBase: any;
  tinybase: any;
  createMergeableStore: any;
  driver: any;
  Driver: any;
  Tesseract: any;
  Capacitor: any;
  Kakao: any;
  modernScreenshot: any;
}
