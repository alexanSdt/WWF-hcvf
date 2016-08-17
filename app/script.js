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
        var cm = window.cm = nsGmx.createGmxApplication($('body')[0], resp);

        cm.define('headerContainerControl', ['map'], function (cm) {
            var map = cm.get('map');
            var headerContainerControl = new nsGmx.HeaderContainerControl();
            headerContainerControl.addTo(map);
            $(headerContainerControl._container).removeClass('leaflet-control')
            //$('.leaflet-control-zoom').css({ 'margin-top': '50px', 'margin-left': '15px' });
            return headerContainerControl;
        });

        cm.define('searchBarWidget', ['headerContainerControl'], function (cm) {
            var headerContainerControl = cm.get('headerContainerControl');
            var searchBarContainer = headerContainerControl.getSearchBarContainer();
            var searchBarWidget = { searchControl: new window.nsGmx.SearchControl(
            { map: cm.get('map'), sidebarWidget: cm.get('sidebarWidget'), searchBarContainer: searchBarContainer })
            };
            return searchBarWidget;
        });

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
