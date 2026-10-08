import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import { LocalNotifications, Weekday } from '@capacitor/local-notifications';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { AppShortcuts } from '@capawesome/capacitor-app-shortcuts';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { Badge } from '@capawesome/capacitor-badge';

if (Capacitor.isNativePlatform()) {
  const webBase = () => (window.MATEON_CONFIG && window.MATEON_CONFIG.webBaseUrl) || '';

  window.MateNative = {
    isNative:true,
    copy: text => Clipboard.write({string:text}),
    share: (title,text,url) => Share.share({title,text:text + (url ? '\n'+url : ''),dialogTitle:title}),
    async shareFile(filename,data,isText=false) {
      const file=await Filesystem.writeFile({path:filename,data,directory:Directory.Cache,...(isText?{encoding:Encoding.UTF8}:{})});
      return Share.share({files:[file.uri],dialogTitle:filename});
    },
    async syncReminders(reminders) {
      const enabled = reminders && (reminders.checkin || reminders.agreement || reminders.chore);
      const want = enabled ? await LocalNotifications.requestPermissions() : {display:'denied'};
      const pending = await LocalNotifications.getPending();
      const ours = pending.notifications.filter(n => n.id === 9001 || n.id === 9002 || n.id === 9003);
      if (ours.length) await LocalNotifications.cancel({notifications:ours});
      if (want.display !== 'granted') return false;
      const list = [];
      if (reminders.checkin) list.push({id:9001,title:'MATE:ON 주간 체크인',body:'이번 주 우리 집 분위기, 1분이면 정리돼요',schedule:{on:{weekday:Weekday.Sunday,hour:20,minute:0}}});
      if (reminders.agreement) list.push({id:9002,title:'MATE:ON 합의 점검일',body:'우리집 규칙, 오늘 한 번 점검해 볼까요?',schedule:{every:'month',on:{day:1,hour:19,minute:0}}});
      if (reminders.chore) list.push({id:9003,title:'MATE:ON 집안일 리마인더',body:'이번 주 내 차례 집안일을 확인해 보세요',schedule:{on:{weekday:Weekday.Saturday,hour:11,minute:0}},actionTypeId:'MATEON_CHORE'});
      if (list.length) await LocalNotifications.schedule({notifications:list});
      return true;
    },
    /* ---- 앱 아이콘 배지: 미완료 항목 수 ---- */
    async setBadge(n) {
      try {
        if (n > 0) await Badge.set({count: Math.min(n, 99)});
        else await Badge.clear();
      } catch (e) { /* 배지 미지원 런처는 무시 */ }
    },
    /* ---- 암호화 저장소 (Android Keystore / iOS Keychain) ---- */
    async secureSet(key, value) {
      const r = await SecureStoragePlugin.set({key:'mateon.' + key, value:String(value)});
      return r.value === true;
    },
    async secureGet(key) {
      try { const r = await SecureStoragePlugin.get({key:'mateon.' + key}); return r.value || null; }
      catch (e) { return null; }
    },
    async secureRemove(key) {
      try { await SecureStoragePlugin.remove({key:'mateon.' + key}); } catch (e) { }
    },
    /* ---- OTA 업데이트 (수동 모드: 설정에서 "앱 업데이트 확인") ----
       webBaseUrl/ota/latest.json 을 읽어 버전이 다르면 번들을 내려받아 교체한다.
       latest.json 형식: {"version":"20261005-06","url":"ota/mateon-20261005-06.zip"} */
    async checkUpdate() {
      const base = webBase();
      if (!base) return '업데이트 주소가 설정되지 않았어요';
      try {
        const res = await fetch(base.replace(/\/$/,'') + '/ota/latest.json?ts=' + Date.now(), {cache:'no-cache'});
        if (!res.ok) return '업데이트 정보가 아직 없어요';
        const meta = await res.json();
        if (!meta || !meta.version || !meta.url) return '업데이트 정보가 아직 없어요';
        const current = (window.MATEON_CONFIG && window.MATEON_CONFIG.assetVersion) || (window.MATEON_CONFIG || {}).version;
        if (meta.version === current) return '이미 최신 버전이에요';
        const url = /^https?:/.test(meta.url) ? meta.url : base.replace(/\/$/,'') + '/' + meta.url.replace(/^\//,'');
        const bundle = await CapacitorUpdater.download({url, version: String(meta.version)});
        await CapacitorUpdater.next({id: bundle.id});
        return '업데이트 완료 — 앱을 다시 시작하면 적용돼요';
      } catch (e) {
        return '업데이트를 확인하지 못했어요. 나중에 다시 시도해 주세요';
      }
    },
    /* ---- 앱 숏컷 (런처 길게 눌러 바로가기) ---- */
    async setupShortcuts() {
      const shortcuts = [
        {id:'checkin', title:'주간 체크인', description:'이번 주 우리 생활 점검하기'},
        {id:'space', title:'생활 도구', description:'정산·쇼핑·일정·체크인'},
        {id:'settle', title:'생활비 정산', description:'함께 쓴 돈 바로 기록'},
      ];
      try {
        await AppShortcuts.set({shortcuts});
      } catch (e) { /* 시뮬레이터·구형 OS는 무시 */ }
      await AppShortcuts.addListener('click', e => {
        const routes = {checkin:'checkin', space:'space', settle:'settle'};
        const route = routes[e.shortcutId];
        if (route) {
          if (window.__mateon && window.__mateon.navigate) window.__mateon.navigate(route);
          else location.hash = '#/' + route;
        }
      });
    },
  };
  document.documentElement.classList.add('native-app');
  async function init() {
    /* 알림 액션: 집안일 알림에 "확인하러 가기" 버튼 */
    try {
      await LocalNotifications.registerActionTypes({types:[{id:'MATEON_CHORE',actions:[{id:'open',title:'확인하러 가기'}]}]});
      await LocalNotifications.addListener('localNotificationActionPerformed', e => {
        const routes = {9001:'checkin', 9002:'agreement', 9003:'chores'};
        const route = routes[e.notification && e.notification.id] || 'home';
        if (window.__mateon && window.__mateon.navigate) window.__mateon.navigate(route);
        else location.hash = '#/' + route;
      });
    } catch (e) { /* 구형 OS 무시 */ }
    await App.addListener('backButton', () => {
      if (!window.__mateon?.handleBack()) App.minimizeApp();
    });
    const open = ({url}) => window.__mateon?.acceptNativeLink(url);
    await App.addListener('appUrlOpen',open);
    const launch=await App.getLaunchUrl();
    if(launch?.url) open(launch);
    await window.MateNative.setupShortcuts().catch(()=>{});
    document.addEventListener('click',e=>{
      if(e.target.closest('.nav-item,.mobile-primary,[data-sheet-save]')) Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});
  else init().catch(console.error);
}
