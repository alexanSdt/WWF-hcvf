module.exports = function(cm) {
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
