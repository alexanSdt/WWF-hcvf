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

$(document).ready(function (je) {
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
