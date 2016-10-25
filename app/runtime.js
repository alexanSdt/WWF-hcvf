require('./magnific-popup/dist/jquery.magnific-popup.js')
require('./magnific-popup/dist/magnific-popup.css')

const SearchControl = require('./SearchControl')
const ShareControl = require('./ShareControl')
const Uri = require('jsuri')
const $ = require('jquery')

// безопасно разруливаем получение свойств глубоких объектов
// вместо obj.foo.bar.baz пишем ensureProperty(obj, 'foo.bar.baz')
function ensureProperty(o, p) {
    let arP = p.split('.')
    while (arP.length) {
        o = o[arP.shift()]
        if (!o) {
            return false
        }
    }
    return o
}

function createCustomContainer(map, arPos=[], cls='') {
    const posClassName = arPos.reduce((acc, curr) => `${acc} leaflet-${curr}`, '')
    const customPosName = arPos.join('-') + '-' + L.stamp({})
    const controlCornerEl = L.DomUtil.create('div', posClassName, map._controlContainer)
    cls && L.DomUtil.addClass(controlCornerEl, cls)
    L.DomEvent.disableClickPropagation(controlCornerEl)
    L.DomEvent.disableScrollPropagation(controlCornerEl)
    map._controlCorners[customPosName] = controlCornerEl
    return customPosName
}

module.exports = function(cm) {
    cm.define('uri', [], function (cm) {
        return new Uri(window.location.href)
    })

    cm.define('permalinkData', ['mapsResourceServer', 'permalinkManager', 'uri'], function(cm, cb) {
        var mapsResourceServer = cm.get('mapsResourceServer')
        var pm = cm.get('permalinkManager')
        var uri = cm.get('uri')

        var permalinkManager = new nsGmx.PermalinkManager({
            provider: mapsResourceServer
        })

        var permalinkId = uri.getQueryParamValue('permalink')
        if (permalinkId) {
            permalinkManager.loadFromId(permalinkId).then(function(data) {
                pm.loadFromData(data)
                cb(data)
            }, function() {
                cb(null)
            })
        } else {
            return null
        }
    })

    cm.define('mltGroupDescription', ['layersTree'], function (cm) {
        const layersTree = cm.get('layersTree')
        const mltGroupNode = layersTree.find('GxMKgtMviEPv92yl')
        const descriptionNode = layersTree.find('09FD3B0FE2F94916B73119848046F408')
        const description = ensureProperty(descriptionNode.attributes, 'properties.MetaProperties.desc_long.Value')
        if (!mltGroupNode || !description ) {
            return false
        }

        mltGroupNode.set('properties', $.extend(true, {}, mltGroupNode.get('properties'), {
            MetaProperties: {
                'desc_long': {
                    Value: description
                }
            }
        }))

        return null
    })

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
        return new (L.Control.extend({
            onAdd() {
                const container = L.DomUtil.create('div', 'searchBarContainerControl')
                this._searchBarContainer = L.DomUtil.create('div', 'searchBarContainerControl-searchBarContainer', container)
                return this._container = container
            },

            getSearchBarContainer() {
                return this._searchBarContainer
            }
        }))({
            position: createCustomContainer(cm.get('map'), ['top', 'left', 'right'], 'searchBarContainer')
        }).addTo(cm.get('map')).getSearchBarContainer()
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

    cm.define('cosmosagroTimeline', ['map'], function (cm) {
        var map = cm.get('map')
        var t = new L.Control.gmxAgroTimeline()
        map.addControl(t)
        return t.manager
    })

    cm.define('shareControl', ['permalinkManager', 'map'], function (cm) {
        var permalinkManager = cm.get('permalinkManager')
        var map = cm.get('map')

        var shareControl = new ShareControl({
            position: 'topleft',
            permalinkManager
        });

        map.addControl(shareControl);

        return shareControl
    })
}
