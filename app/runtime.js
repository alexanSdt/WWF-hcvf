require('../lib/magnific-popup/dist/jquery.magnific-popup.js')
require('../lib/magnific-popup/dist/magnific-popup.css')

module.exports = function(cm) {
    cm.define('layersTreeWidgetDescriptionPopup', ['layersTreeWidget'], function (cm) {
        return cm.get('layersTreeWidget').on('infoButtonClick', (infoProperty, model) => (
            $.magnificPopup.open({
                items: {
                    type: 'inline',
                    src: $('<div>').addClass('white-popup').html(infoProperty)
                }
            })
        )), null
    })

    return

    cm.define('headerContainerControl', ['map'], function (cm) {
        var map = cm.get('map')
        var headerContainerControl = new nsGmx.HeaderContainerControl()
        headerContainerControl.addTo(map)
        $(headerContainerControl._container).removeClass('leaflet-control')
        //$('.leaflet-control-zoom').css({ 'margin-top': '50px', 'margin-left': '15px' })
        return headerContainerControl
    })

    cm.define('searchBarWidget', ['headerContainerControl'], function (cm) {
        var headerContainerControl = cm.get('headerContainerControl')
        var searchBarContainer = headerContainerControl.getSearchBarContainer()
        var searchBarWidget = {
            searchControl: new window.nsGmx.SearchControl({
                map: cm.get('map'),
                sidebarWidget: cm.get('sidebarWidget'),
                searchBarContainer: searchBarContainer
            })
        }
        return searchBarWidget
    })

    cm.define('cosmosagroTimeline', ['map'], function (cm) {
        var map = cm.get('map')
        var t = new L.Control.gmxAgroTimeline()
        map.addControl(t)
        return t.manager
    })
}
