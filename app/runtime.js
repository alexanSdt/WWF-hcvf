require('./magnific-popup/dist/jquery.magnific-popup.js')
require('./magnific-popup/dist/magnific-popup.css')

const SearchControl = require('./SearchControl')
const HeaderContainerControl = require('./HeaderContainerControl')

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

    cm.define('searchBarContainer', ['map'], function (cm) {
        var map = cm.get('map')
        var headerContainerControl = new HeaderContainerControl()
        headerContainerControl.addTo(map)
        $(headerContainerControl._container).removeClass('leaflet-control')
        //$('.leaflet-control-zoom').css({ 'margin-top': '50px', 'margin-left': '15px' })
        return headerContainerControl.getSearchBarContainer()
    })

    cm.define('searchBarWidget', ['searchBarContainer'], function (cm) {
        return {
            searchControl: new SearchControl({
                map: cm.get('map'),
                sidebarWidget: cm.get('sidebarWidget'),
                searchBarContainer: cm.get('searchBarContainer')
            })
        }
    })

    return

    cm.define('cosmosagroTimeline', ['map'], function (cm) {
        var map = cm.get('map')
        var t = new L.Control.gmxAgroTimeline()
        map.addControl(t)
        return t.manager
    })
}
