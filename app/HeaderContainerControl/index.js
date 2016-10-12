const L = window.L

require('./styles.css')

module.exports = L.Control.extend({
    options: {
        className: 'headerContainerControl'
    },

    initialize: function(options) {
        this.options = L.extend(this.options, options);
        this.options.position = this.options.className.toLowerCase();
    },

    render: function () {
        this._container = L.DomUtil.create('div', this.options.className);
        this._menuContainer = L.DomUtil.create('div', 'headerContainerControl-menuContainer', this._container);
        this._searchBarContainer = L.DomUtil.create('div', 'headerContainerControl-searchBarContainer leaflet-control', this._container);
        this._authContainer = L.DomUtil.create('div', 'headerContainerControl-authContainer', this._container);
    },

    onAdd: function(map) {
        this._controlCornerEl = L.DomUtil.create('div', 'leaflet-top leaflet-left leaflet-right ' + this.options.className +
            '-controlCorner', map._controlContainer);
        this._terminateMouseEvents(this._controlCornerEl);
        map._controlCorners[this.options.className.toLowerCase()] = this._controlCornerEl;
        this.render();
        return this._container;
    },

    getMenuContainer: function () {
        return this._menuContainer;
    },

    getSearchBarContainer: function () {
        return this._searchBarContainer;
    },

    getAuthContainer: function () {
        return this._authContainer;
    },

    _terminateMouseEvents: function(el) {
        L.DomEvent.disableClickPropagation(el);
        el.addEventListener('mousewheel', L.DomEvent.stopPropagation);
    }
});
