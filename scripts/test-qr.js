var qrcode = require('../js/vendor/qrcode.js');
var q = qrcode(0, 'M');
q.addData('https://gyeongbin-38.github.io/mateon/?invite=test');
q.make();
console.log('modules', q.getModuleCount(), 'img', q.createImgTag ? 'ok' : 'no');
