require('./styles.css')

window.Promise = window.Promise || require('es6-promise')

require('../external/GMXCommonComponents/PermalinkManager/PermalinkManager.js')

// переопределяем nsGmx.IconSidebarControl external-сайдбаром из ветки v2
require('../external/IconSidebarControl/dist/iconSidebarControl.js')
require('../external/IconSidebarControl/dist/iconSidebarControl.css')

// старый winnie-core не поддерживает сайдбар новой версии
// берём из external ветку v2
require('../external/winnie-core/dist/gmxApplication.js')
require('../external/winnie-core/dist/gmxApplication.css')

// так как leaflet попадает в сборку, для него меняются пути к маркерам
// устанавливаем новые:
L.Icon.Default = L.Icon.Default.extend({
    options: {
        iconUrl: 'resources/marker-icon.png',
        shadowUrl: 'resources/marker-shadow.png'
    }
})
L.Icon.Default.imagePath = 'resources'
L.Marker = L.Marker.extend({
    options: {
        icon: new L.Icon.Default()
    }
})

if (!Array.prototype.find) {
  Array.prototype.find = require('./array-find.js')
 }

$(document).ready(function (je) {
    const ie = ieVersion()
    if (ie && ie < 11) {
        $('body').html('ваш браузер не поддерживается')
        return
    }

    $.ajax('./resources/config.json').then(function (resp) {
        var cm = window.cm = nsGmx.createGmxApplication($('body')[0], resp)

        require('./runtime.js')(cm)

        cm.create().then(function () {
            console.log('ready')
        }, function (err) {
            console.error('error initializing application', err)
        })
    }, function (err) {
        console.error('error', err)
    })
})

function ieVersion() {
  var ua = window.navigator.userAgent;

  // Test values; Uncomment to check result …

  // IE 10
  // ua = 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)';

  // IE 11
  // ua = 'Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko';

  // Edge 12 (Spartan)
  // ua = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36 Edge/12.0';

  // Edge 13
  // ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Safari/537.36 Edge/13.10586';

  var msie = ua.indexOf('MSIE ');
  if (msie > 0) {
    // IE 10 or older => return version number
    return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
  }

  var trident = ua.indexOf('Trident/');
  if (trident > 0) {
    // IE 11 => return version number
    var rv = ua.indexOf('rv:');
    return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
  }

  var edge = ua.indexOf('Edge/');
  if (edge > 0) {
    // Edge (IE 12+) => return version number
    return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
  }

  // other browser
  return false;
}
