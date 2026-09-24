import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';

if (Capacitor.isNativePlatform()) {
  window.MateNative = {
    isNative:true,
    copy: text => Clipboard.write({string:text}),
    share: (title,text,url) => Share.share({title,text:text + (url ? '\n'+url : ''),dialogTitle:title}),
    async shareFile(filename,data,isText=false) {
      const file=await Filesystem.writeFile({path:filename,data,directory:Directory.Cache,...(isText?{encoding:Encoding.UTF8}:{})});
      return Share.share({files:[file.uri],dialogTitle:filename});
    },
  };
  document.documentElement.classList.add('native-app');
  async function init() {
    await App.addListener('backButton', () => {
      if (!window.__mateon?.handleBack()) App.minimizeApp();
    });
    const open = ({url}) => window.__mateon?.acceptNativeLink(url);
    await App.addListener('appUrlOpen',open);
    const launch=await App.getLaunchUrl();
    if(launch?.url) open(launch);
    document.addEventListener('click',e=>{
      if(e.target.closest('.nav-item,.mobile-primary,[data-sheet-save]')) Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});
  else init().catch(console.error);
}
