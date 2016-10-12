const Backbone = window.Backbone
const $ = require('jquery')

require('./styles.css')

module.exports = Backbone.View.extend({
    className: 'searchBarWidget',

    initialize: function (options) {
        this.options = _.extend({}, options);
        this.render();
        this.on('submit', function (str) {
            var latLng = L.gmxUtil.parseCoordinates(str);
            if (latLng) {
                this.trigger('coordinates', latLng);
            } else {
                this.trigger('vessel', str);
            }
        }.bind(this));
    },

    render: function () {
        var $input = $('<input type="text">').addClass('searchBarWidget-input').attr('placeholder', 'поиск по судам и координатам');
        var $icon = $('<div>').addClass('searchBarWidget-icon').addClass('icon-search');
        $input.on('keypress', function (je) {
            if (je.charCode === 13) {
                this.trigger('submit', $input.val());
            }
        }.bind(this));
        $icon.on('click', function (je) {
            this.trigger('submit', $input.val());
        }.bind(this));
        this.$el.append($input);
        this.$el.append($icon);
        return this;
    },

    appendTo: function (el) {
        $(el).append(this.$el);
    }
});
