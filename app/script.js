$(document).ready(function (je) {
    $.ajax('./app/config.json').then(function (resp) {
        var cm = nsGmx.createGmxApplication($('body')[0], resp)
        cm.create().then(function () {
            console.log('ready');
        }, function (err) {
            console.error('error initializing application', err)
        })
    }, function (err) {
        console.error('error', err)
    })
})
