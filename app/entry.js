require('./styles.css')

window.Promise = window.Promise || require('es6-promise')

// переопределяем nsGmx.IconSidebarControl external-сайдбаром из ветки v2
require('../external/IconSidebarControl/dist/iconSidebarControl.js')
require('../external/IconSidebarControl/dist/iconSidebarControl.css')

// старый winnie-core не поддерживает сайдбар новой версии
// берём из external ветку v2
require('../external/winnie-core/dist/gmxApplication.js')
require('../external/winnie-core/dist/gmxApplication.css')

$(document).ready(function (je) {
    $.ajax('./app/config.json').then(function (resp) {
        var cm = window.cm = nsGmx.createGmxApplication($('body')[0], resp);

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
