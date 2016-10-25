require('./styles.styl')

const svgIcon = require('./icon.html')

module.exports = L.Control.extend({
    // options.permalinkManager
    initialize(options) {
        L.setOptions(this, options)
    },

    onAdd(map) {
        this._container = L.DomUtil.create('div', 'shareControl')
        L.DomEvent.disableClickPropagation(this._container)
        L.DomEvent.disableScrollPropagation(this._container)
        this._render()
        return this._container
    },

    onRemove(map) {

    },

    _render() {
        this._container.innerHTML = ''
        this._buttonEl = L.DomUtil.create('div', 'shareControl-button mapControlElement', this._container)
        this._buttonEl.innerHTML = svgIcon
        this._permalinkEl = L.DomUtil.create('div', 'shareControl-permalink mapControlElement', this._container)

        L.DomEvent.on(this._buttonEl, 'click', () => {
            this._permalinkIsVisible ? this._hideContent() : this._showContent(), this._createPermalink()
        })
    },

    _renderPermalinkPending() {
        this._permalinkEl.innerHTML = 'создание пермалинка..'
    },

    _renderPermalinkSuccess(permalinkId) {
        const { origin, pathname } = window.location
        this._permalinkEl.innerHTML = ''
        let permalinkInputEl = L.DomUtil.create('input', 'shareControl-permalinkInput', this._permalinkEl)
        let link = `${origin}${pathname}?permalink=${permalinkId}`
        permalinkInputEl.setAttribute('value', link)
    },

    _renderPermalinkError() {
        this._permalinkEl.innerHTML = 'ошибка создания пермалинка'
    },

    _showContent() {
        L.DomUtil.addClass(this._permalinkEl, 'shareControl-permalink_visible')
        this._permalinkIsVisible = true
    },

    _hideContent() {
        L.DomUtil.removeClass(this._permalinkEl, 'shareControl-permalink_visible')
        this._permalinkIsVisible = false
    },

    _createPermalink() {
        const { permalinkManager } = this.options
        if (this._permalinkIsCreating) {
            return
        }

        this._permalinkIsCreating = true
        this._renderPermalinkPending()
        permalinkManager.save().then((permalinkId) => {
            this._permalinkIsCreating = false
            this._renderPermalinkSuccess(permalinkId)
        }, () => {
            this._permalinkIsCreating = false
            this._renderPermalinkError()
        })
    }
})
