window.nsGmx = window.nsGmx || {};

/**
	options.map
	options.searchBarContainer
	options.sidebarWidget
*/
window.nsGmx.SearchControl = function (options) {

    var SearchResultView = Backbone.View.extend({
        tagName: "tr",
        className: 'SearchResultRow',
        render: function () {
            var imo = this.model.get("imo");
            if (imo == 0 || imo == -1)
                imo = '';
            this.$el.html('<td class="searchElemPosition">' + (this.model.position + 1) + '. </td>' +
			'<td class="SearchResultText"><span class="searchElem">' + this.model.get("holder1") + '</span> ' +
			'<span style="white-space: nowrap">' + this.model.get("fsc_id") + '</span>' +
			'</td>');
            this.$el.find('.searchElem').on('click', function () {
                this.trigger('marker', this.model);
            } .bind(this));
        }
    });

    var SearchResultListView = Backbone.View.extend({
        tagName: "table",
        render: function () {
            this.$el.html();
            for (var i = 0; i < this.model.length; ++i) {
                this.model.at(i).position = i;
                var itemView = new SearchResultView({ model: this.model.at(i) })
				.on('marker', function (model) { this.trigger('marker', model) } .bind(this));
                this.$el.append(itemView.$el);
                itemView.render();
            }
        },
        appendTo: function (el) {
            $(el).append(this.$el);
            return this;
        }
    });

    var SearchResultContainer = Backbone.View.extend({
        className: 'searchResultContainer',
        initialize: function () {
        }
    });

    // Search object by attributes
    var searchLayerObject = function (map, searchString, dateInterval, options, stop, proceed, showResults) {
        var objCollection = new nsGmx.FSCCollection(map, options)
        .on('update', function (e) {
            //console.log(objCollection);
            if (objCollection.getStatus() === 'success') {
                if (!objCollection.isEmpty()) {
                    showResults(objCollection);
                    stop();
                }
                else
                // Try to geocode 
                    proceed();
            }
            else {
                // On error stop any futher search
                proceed(); //stop();			
            }
        })
        .on('error', function (e) {
            $('.searchResultCanvas').find('.icon-refresh').remove();
            console.log(e);
        });
        objCollection.getObjectByStr(searchString, dateInterval);
        return null;
    }

    // Show it position on map
    var markers = [];
    var showObjectPosition = function (first) {
        var MinLat_MinLon = L.Projection.Mercator.unproject(new L.Point(first.xmin, first.ymin)),
        MaxLat_MaxLon = L.Projection.Mercator.unproject(new L.Point(first.xmax, first.ymax)),
        bounds = L.latLngBounds(MinLat_MinLon, MaxLat_MaxLon);
        map.fitBounds(bounds);
        //L.geoJson({ type: 'LineString', coordinates: [[MinLat_MinLon.lng, MinLat_MinLon.lat], [MaxLat_MaxLon.lng, MaxLat_MaxLon.lat]] }, { style: { color: '#ff0000'} }).addTo(map)
        var mapper = cm.get('layersMapper')
        var layer = mapper._layersHash['06CCCC47405646C1BC5C45090D38EA2B'],
        enough = false,
        border = function (b) {
            //if (!enough) {
                //console.log(b.coordinates[0])
                //console.log(b.coordinates[0][0])
                for (var i = 0; i < b.coordinates.length; ++i)
                    for (var j = 0; j < b.coordinates[i].length; ++j) {
                        var a = [];
                        for (var k = 0; k < b.coordinates[i][j].length; ++k) {
                            a.push(L.Projection.Mercator.unproject(L.point(b.coordinates[i][j][k])))
                        }
                        //console.log()
                        markers.push(L.polygon(a, { color: 'red', fill: false }).addTo(map));
                    }
                enough = !enough;
            //}
        };
                for (var i = 0; i < markers.length; ++i) map.removeLayer(markers[i]);
                markers = [];
        if (layer && !mapper._layersTree.find('06CCCC47405646C1BC5C45090D38EA2B').get('visible')) {
            layer.setFilter(function (arg) {
                var found = arg.properties[1] == first.fsc_id && arg.properties[4] == first.holder1
                //if (found)
                //    border(arg.properties[arg.properties.length - 1]);
                return found;
            })
            cm.get('map').addLayer(layer);
        }
        else {
            layer.setFilter(function (arg) {
                //if (arg.properties[1] == first.fsc_id && arg.properties[4] == first.holder1)
                //    border(arg.properties[arg.properties.length - 1]);
                return true;
            })
        }

    }

    // Define observer on starting of query suggestions search 
    var autoCompleteSearchObserver = function (next, deferred, params) {
        if (params.searchString && params.searchString.search(/\S/) != -1) {
            searchLayerObject(map,
            params.searchString,
            null, //params.dateInterval, 
            {pagesize: 10 },
            function () { deferred.resolve(-1) },
            function () { deferred.resolve(next) },
            function (objCollection) {
                var arrResult = [];
                objCollection.each(function (item) {
                    //console.log(item.attributes.mmsi + ' ' + item.attributes.vesselName + ' ' + new Date(item.attributes.last * 1000));				
                    arrResult.push({
                        label: (item.attributes.fsc_id ? item.attributes.fsc_id + ' ' : '') + item.attributes.holder1,
                        value: item.attributes.holder1,
                        foundObject: [item.attributes.fsc_id, item.attributes.holder1,
                        null//item.attributes.gmxGeojson
                        , item.attributes.FM_CERT, item.attributes.CB
                        , item.attributes.xmin, item.attributes.ymin, item.attributes.xmax, item.attributes.ymax
                        ],
                        GeoObject: null
                    });
                });
                // Show result in a dropdown list and prevent geocoding the searh string
                params.callback(arrResult);
            });
        }
        else
            deferred.resolve(-1);
    }

    // Create and place 
    window.gmxGeoCodeUseOSM = true;
    nsGmx.Translations.addText("rus", { SearchControl: {
        SearchPlaceholder: "Поиск по FSC_ID или компании-арендатору",
        NoResult: "Поиск не дал результатов"
    }
    });
    nsGmx.Translations.addText("eng", { SearchControl: {
        SearchPlaceholder: "FSC_ID, company search",
        NoResult: "No results found"
    }
    });

    var searchJs = gmxCore.getModule('search'),
		map = options.map,
		searchBarContainer = options.searchBarContainer,
		sideBar = options.sidebarWidget,
		resultTabId = 'searchControlResults',
		container = new SearchResultContainer(),
		searchControl = new searchJs.SearchControlGet({ ServerBase: "http://maps.kosmosnimki.ru/",
		    ImagesHost: "http://maps.kosmosnimki.ru/api/img",
		    ContainerInput: searchBarContainer,
		    ContainerList: container.el,
		    Map: map
		});
    searchControl.SetPlaceholder(nsGmx.Translations.getText('SearchControl.SearchPlaceholder'));
    var scrollView = new nsGmx.ScrollView();
    scrollView.appendTo(sideBar.addTab(resultTabId, 'icon-search'));
    $(window).on('resize', function () {
        scrollView.repaint();
    });
    //console.log(scrollView.el);
    scrollView.addView(container);

    $(searchControl).bind('onBeforeSearch', function () {
        sideBar.open(resultTabId);
        $('.searchResultCanvas').html('<div style="width:100%; text-align:center"><span class="animate-spin icon-refresh"></span></div>')
			.next('div').remove();
        setInterval(function () {
            scrollView.repaint();
        }, 10);

    });

    $(searchControl).bind('onAfterSearch', function () {
        setInterval(function () {
            scrollView.repaint();
            //container.trigger('resize')
            $('.SearchResultListNotFound').attr("title", nsGmx.Translations.getText('SearchControl.NoResult'))
        }, 10);
    });

    // Custom coordinate search
    searchControl.removeSearchByStringHook();
    searchControl.onAutoCompleteDataSearchStarting({
        observer: { add: true, observer: function (next, deferred, params) {
            var pos = L.gmxUtil.parseCoordinates(params.searchString);
            if (pos) {
                deferred.resolve(-1);
            }
            else
                deferred.resolve(next);
        }
        }
    });

    var coordMarker;
    searchControl.onSearchStarting({
        observer: { add: true, observer: function (next, deferred, params) {
            var pos = L.gmxUtil.parseCoordinates(params.searchString);
            if (coordMarker)
                map.removeLayer(coordMarker);
            if (pos) {
                map.panTo(pos);
                var oldIP = L.Icon.Default.imagePath;
                L.Icon.Default.imagePath = 'images';
                coordMarker = L.marker(pos, { icon: new L.Icon.Default({ iconAnchor: [-19, 40] }), draggable: true, title: params.searchString }).addTo(map);
                L.Icon.Default.imagePath = oldIP;
                deferred.resolve(-1);
            }
            else
                deferred.resolve(next);
        }
        }
    });

    // Subscribe the observer on starting of query suggestions search 
    searchControl.onAutoCompleteDataSearchStarting({
        observer: { add: true, observer: autoCompleteSearchObserver },
        selectItem: function (event, oAutoCompleteItem) {
            if (oAutoCompleteItem && oAutoCompleteItem.foundObject != null) {
                //console.log(oAutoCompleteItem.foundObject);
                showObjectPosition({ fsc_id: oAutoCompleteItem.foundObject[0],
                    holder1: oAutoCompleteItem.foundObject[1],
                    gmxGeojson: oAutoCompleteItem.foundObject[2],
                    FM_CERT: oAutoCompleteItem.foundObject[3],
                    CB: oAutoCompleteItem.foundObject[4],
                    xmin: oAutoCompleteItem.foundObject[5], ymin: oAutoCompleteItem.foundObject[6],
                    xmax: oAutoCompleteItem.foundObject[7], ymax: oAutoCompleteItem.foundObject[8]
                });
            }
        }
    });

    // Subscribe observer on search srarting
    searchControl.onSearchStarting({
        observer: { add: true, observer: function (next, deferred, params) {

            if (params.searchString && params.searchString.search(/\S/) != -1) {

                // Override methods of geocoder result list widget
                params.lstResult.ShowLoading = function () { }

                // Show result panel with status
                $(searchControl).trigger('onBeforeSearch');

                searchLayerObject(map, params.searchString, null, //params.dateInterval, 
                {},
                function () { deferred.resolve(-1) },
                function () { deferred.resolve(next) },
                function (objCollection) {
                    //console.log(objCollection);	
                    params.lstResult.eraseMarkers();

                    // Show first
                    var first = objCollection.first();
                    searchControl.SetSearchString(first.get('holder1'));
                    showObjectPosition({ fsc_id: first.get('fsc_id'),
                        holder1: first.get('holder1'),
                        gmxGeojson: first.get('gmxGeojson'),
                        FM_CERT: first.get('FM_CERT'),
                        CB: first.get('CB'),
                        xmin: first.get('xmin'), ymin: first.get('ymin'),
                        xmax: first.get('xmax'), ymax: first.get('ymax')
                    });

                    // Show result
                    $('.searchResultCanvas').empty()
                    .next('div').remove();
                    //console.log(container.$el);
                    new SearchResultListView({ model: objCollection }).appendTo(container.$el.children()[0])
                    .on('marker', function (model) {
                        showObjectPosition({ fsc_id: model.get('fsc_id'),
                            holder1: model.get('holder1'),
                            gmxGeojson: model.get('gmxGeojson'),
                            FM_CERT: model.get('FM_CERT'),
                            CB: model.get('CB'),
                            xmin: model.get('xmin'), ymin: model.get('ymin'),
                            xmax: model.get('xmax'), ymax: model.get('ymax')
                        });
                    })
                    .render();
                });
            }
            else
                deferred.resolve(-1);
        }
        }
    });
}
// ** window.nsGmx.SearchControl
