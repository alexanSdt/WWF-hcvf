window.nsGmx = window.nsGmx || {};

// ev.error - on collection load fail
window.nsGmx.FSCCollection = Backbone.Collection.extend({
    options: {
        serverScript: 'http://maps.kosmosnimki.ru/VectorLayer/Search.ashx',
        layerId: '06CCCC47405646C1BC5C45090D38EA2B',
        out_cs: 'EPSG:4326',
    },

    // map - required
    // options.page
    // options.pagesize
    // options.borderCs
    constructor: function (map, options) {
        //this.options = _.extend(this.options, options);
        this.options.map = map;
        this.options.map.on('zoomend moveend', this._updateViewBox, this);
        this._updateViewBox();

        this.queryParams = {
            layer: this.options.layerId,
            out_cs: this.options.out_cs,
            WrapStyle: 'window',
            columns: '{"Value":"FSC_ID"},{"Value":"HOLDER_1"}'
        };
        this.queryParams = _.extend(this.queryParams, options);
        if (this.queryParams.border_cs)
            this.queryParams.border = JSON.stringify(this.geoViewBox);
        Backbone.Collection.apply(this);
    },

    getObjectByStr: function (searchString, dateInterval) {
        searchString = searchString.replace(/^["\s]+|["\s]+$/g, '');
        this.queryParams.columns = '[' + this.queryParams.columns
        + ',{"Value":"FM_CERT", "Alias":"FM_CERT"}'
        + ',{"Value":"CB", "Alias":"CB"}'
        //+ ',{"Value":"[GeomixerGeoJson]", "Alias":"gmxGeojson"}'
        + ',{"Value":"STEnvelopeMinX([GeomixerGeoJson])", "Alias":"xmin"}'
        + ',{"Value":"STEnvelopeMaxX([GeomixerGeoJson])", "Alias":"xmax"}'
        + ',{"Value":"STEnvelopeMinY([GeomixerGeoJson])", "Alias":"ymin"}'
        + ',{"Value":"STEnvelopeMaxY([GeomixerGeoJson])", "Alias":"ymax"}'
        + ']';
        this.queryParams.orderby = 'HOLDER_1';
        this.queryParams.query = '([FSC_ID] contains \'' + searchString + '\') OR ([HOLDER_1] contains \'' + searchString + '\')';
        this.update();
    },

    update: function () {
        if (this.getStatus === 'pending') {
            return;
        }

        var fieldsMap = {
            'FSC_ID': 'fsc_id',
            'HOLDER_1': 'holder1',
            'gmxGeojson': 'gmxGeojson',
            'FM_CERT': 'FM_CERT',
            'CB': 'CB',
            'xmin': 'xmin',
            'xmax': 'xmax',
            'ymin': 'ymin',
            'ymax': 'ymax',

        };

        this._updateStatus('pending');
        L.gmxUtil.sendCrossDomainPostRequest(this.options.serverScript, this.queryParams,
		function (resp) {
		    if (resp.Status === 'error') {
		        this.reset();
		        this._updateStatus('error');
		        this.trigger('update');
		        this.trigger('error', {
		            message: resp.ErrorInfo.ErrorMessage
		        });
		        return;
		    }
		    var fields = resp.Result.fields;
		    var values = resp.Result.values;
		    this.set(values.map(function (objParams) {
		        var h = {};
		        for (var i = 0; i < objParams.length; i++) {
		            h[fieldsMap[fields[i]]] = objParams[i];
		        }
		        return new Backbone.Model(h);
		    }));
		    this._updateStatus('success');
		    this.trigger('update');
		} .bind(this));
    },

    getStatus: function () {
        return this.status;
    },

    _updateStatus: function (statusStr) {
        this.status = statusStr;
        this.trigger('status', this.getStatus());
    },

    _updateViewBox: function () {
        //this.geoViewBox = nsGmx.Utils.getBoundsGeometry(this.options.map.getBounds());
    }
});
