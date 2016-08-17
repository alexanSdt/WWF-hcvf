function onApplicationReady(cm) {
    cm.get('layersTreeWidget').on('infoButtonClick', function (infoProperty, model) {
        $.magnificPopup.open({
            items: {
                type: 'inline',
                src: $('<div>').addClass('white-popup').html(infoProperty)
            }
        })
        console.log();
    })
}

$(document).ready(function (je) {
    $.ajax('./app/config.json').then(function (resp) {
        var cm = window.cm = nsGmx.createGmxApplication($('body')[0], resp)
        cm.create().then(function () {
            console.log('ready');
            onApplicationReady(cm)
        }, function (err) {
            console.error('error initializing application', err)
        })
    }, function (err) {
        console.error('error', err)
    })
})
