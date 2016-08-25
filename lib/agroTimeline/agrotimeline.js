/**
 * @file timeline.js
 *
 * @brief
 * The Timeline is an interactive visualization chart to visualize events in
 * time, having a start and end date.
 * You can freely move and zoom in the timeline by dragging
 * and scrolling in the Timeline. Items are optionally dragable. The time
 * scale on the axis is adjusted automatically, and supports scales ranging
 * from milliseconds to years.
 *
 * Timeline is part of the CHAP Links library.
 *
 * Timeline is tested on Firefox 3.6, Safari 5.0, Chrome 6.0, Opera 10.6, and
 * Internet Explorer 6+.
 *
 * @license
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * Copyright (c) 2011-2012 Almende B.V.
 *
 * @author 	Jos de Jong, <jos@almende.org>
 * @date    2012-11-02
 * @version 2.4.1
 */

/*
 * TODO
 *
 * Add zooming with pinching on Android
 * 
 * Bug: when an item contains a javascript onclick or a link, this does not work
 *      when the item is not selected (when the item is being selected,
 *      it is redrawn, which cancels any onclick or link action)
 * Bug: when an item contains an image without size, or a css max-width, it is not sized correctly
 * Bug: neglect items when they have no valid start/end, instead of throwing an error
 * Bug: Pinching on ipad does not work very well, sometimes the page will zoom when pinching vertically
 * Bug: cannot set max width for an item, like div.timeline-event-content {white-space: normal; max-width: 100px;}
 * Bug on IE in Quirks mode. When you have groups, and delete an item, the groups become invisible
 */

/**
 * Declare a unique namespace for CHAP's Common Hybrid Visualisation Library,
 * "links"
 */
if (typeof links === 'undefined') {
    links = {};
    // important: do not use var, as "var links = {};" will overwrite 
    //            the existing links variable value with undefined in IE8, IE7.  
}


/**
 * Ensure the variable google exists
 */
if (typeof google === 'undefined') {
    google = undefined;
    // important: do not use var, as "var google = undefined;" will overwrite 
    //            the existing google variable value with undefined in IE8, IE7.
}



// Internet Explorer 8 and older does not support Array.indexOf,
// so we define it here in that case
// http://soledadpenades.com/2007/05/17/arrayindexof-in-internet-explorer/
if(!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(obj){
        for(var i = 0; i < this.length; i++){
            if(this[i] == obj){
                return i;
            }
        }
        return -1;
    }
}

// Internet Explorer 8 and older does not support Array.forEach,
// so we define it here in that case
// https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/forEach
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function(fn, scope) {
        for(var i = 0, len = this.length; i < len; ++i) {
            fn.call(scope || this, this[i], i, this);
        }
    }
}


/**
 * @constructor links.Timeline
 * The timeline is a visualization chart to visualize events in time.
 *
 * The timeline is developed in javascript as a Google Visualization Chart.
 *
 * @param {Element} container   The DOM element in which the Timeline will
 *                                  be created. Normally a div element.
 */
links.Timeline = function(container) {
    // create variables and set default values
    this.dom = {};
    this.conversion = {};
    this.eventParams = {}; // stores parameters for mouse events
    this.groups = [];
    this.groupIndexes = {};
    this.items = [];
    this.renderQueue = {
        show: [],   // Items made visible but not yet added to DOM
        hide: [],   // Items currently visible but not yet removed from DOM
        update: []  // Items with changed data but not yet adjusted DOM
    };
    this.renderedItems = [];  // Items currently rendered in the DOM
    this.clusterGenerator = new links.Timeline.ClusterGenerator(this);
    this.currentClusters = [];
    this.selection = []; // stores indexes and items that are currently selected

    this.listeners = {}; // event listener callbacks

    // Initialize sizes. 
    // Needed for IE (which gives an error when you try to set an undefined
    // value in a style)
    this.size = {
        'actualHeight': 0,
        'axis': {
            'characterMajorHeight': 0,
            'characterMajorWidth': 0,
            'characterMinorHeight': 0,
            'characterMinorWidth': 0,
            'height': 0,
            'labelMajorTop': 0,
            'labelMinorTop': 0,
            'line': 0,
            'lineMajorWidth': 0,
            'lineMinorHeight': 0,
            'lineMinorTop': 0,
            'lineMinorWidth': 0,
            'top': 0
        },
        'contentHeight': 0,
        'contentLeft': 0,
        'contentWidth': 0,
        'frameHeight': 0,
        'frameWidth': 0,
        'groupsLeft': 0,
        'groupsWidth': 0,
        'items': {
            'top': 0
        }
    };

    this.dom.container = container;

    this.options = {
        'width': "100%",
        'height': "auto",
        'minHeight': 0,        // minimal height in pixels
        'autoHeight': true,

        'eventMargin': 10,     // minimal margin between events
        'eventMarginAxis': 20, // minimal margin between events and the axis
        'dragAreaWidth': 10,   // pixels

        'min': undefined,
        'max': undefined,
        'intervalMin': 10,     // milliseconds
        'intervalMax': 1000 * 60 * 60 * 24 * 365 * 10000, // milliseconds

        'moveable': true,
        'zoomable': true,
        'selectable': true,
        'editable': false,
        'snapEvents': true,
        'groupChangeable': true,

        'showCurrentTime': true, // show a red bar displaying the current time
        'showCustomTime': false, // show a blue, draggable bar displaying a custom time    
        'showMajorLabels': true,
        'showMinorLabels': true,
        'showNavigation': false,
        'showButtonNew': false,
        'groupsOnRight': false,
        'axisOnTop': false,
        'stackEvents': true,
        'animate': true,
        'animateZoom': true,
        'cluster': false,
        'style': 'box'
    };

    this.clientTimeOffset = 0;    // difference between client time and the time
    // set via Timeline.setCurrentTime()
    var dom = this.dom;

    // remove all elements from the container element.
    while (dom.container.hasChildNodes()) {
        dom.container.removeChild(dom.container.firstChild);
    }

    // create a step for drawing the axis
    this.step = new links.Timeline.StepDate();
    
    // add standard item types
    this.itemTypes = {
        box:   links.Timeline.ItemBox,
        range: links.Timeline.ItemRange,
        dot:   links.Timeline.ItemDot
    };

    // initialize data
    this.data = [];
    this.firstDraw = true;

    // date interval must be initialized 
    this.setVisibleChartRange(undefined, undefined, false);

    // render for the first time
    this.render();

    // fire the ready event
    this.trigger('ready');
};


/**
 * Main drawing logic. This is the function that needs to be called
 * in the html page, to draw the timeline.
 *
 * A data table with the events must be provided, and an options table.
 *
 * @param {google.visualization.DataTable}      data
 *                                 The data containing the events for the timeline.
 *                                 Object DataTable is defined in
 *                                 google.visualization.DataTable
 * @param {Object} options         A name/value map containing settings for the
 *                                 timeline. Optional.
 */
links.Timeline.prototype.draw = function(data, options) {
    this.setOptions(options);

    // read the data
    this.setData(data);

    // set timer range. this will also redraw the timeline
    if (options && (options.start || options.end)) {
        this.setVisibleChartRange(options.start, options.end);
    }
    else if (this.firstDraw) {
        this.setVisibleChartRangeAuto();
    }

    this.firstDraw = false;
};


/**
 * Set options for the timeline.
 * Timeline must be redrawn afterwards
 * @param {Object} options A name/value map containing settings for the
 *                                 timeline. Optional.
 */
links.Timeline.prototype.setOptions = function(options) {
    if (options) {
        // retrieve parameter values
        for (var i in options) {
            if (options.hasOwnProperty(i)) {
                this.options[i] = options[i];
            }
        }

        // check for deprecated options
        if (options.showButtonAdd != undefined) {
            this.options.showButtonNew = options.showButtonAdd;
            console.log('WARNING: Option showButtonAdd is deprecated. Use showButtonNew instead');
        }

        if (options.scale && options.step) {
            this.step.setScale(options.scale, options.step);
        }
    }

    // validate options
    this.options.autoHeight = (this.options.height === "auto");
};

/**
 * Add new type of items
 * @param {String} typeName  Name of new type
 * @param {links.Timeline.Item} typeFactory Constructor of items
 */
links.Timeline.prototype.addItemType = function (typeName, typeFactory) {
    this.itemTypes[typeName] = typeFactory;
};

/**
 * Retrieve a map with the column indexes of the columns by column name.
 * For example, the method returns the map
 *     {
 *         start: 0,
 *         end: 1,
 *         content: 2,
 *         group: undefined,
 *         className: undefined
 *     }
 * @param {google.visualization.DataTable} dataTable
 * @type {Object} map
 */
links.Timeline.mapColumnIds = function (dataTable) {
    var cols = {},
        colMax = dataTable.getNumberOfColumns(),
        allUndefined = true;

    // loop over the columns, and map the column id's to the column indexes
    for (var col = 0; col < colMax; col++) {
        var id = dataTable.getColumnId(col) || dataTable.getColumnLabel(col);
        cols[id] = col;
        if (id == 'start' || id == 'end' || id == 'content' ||
                id == 'group' || id == 'className' || id == 'editable') {
            allUndefined = false;
        }
    }

    // if no labels or ids are defined,
    // use the default mapping for start, end, content
    if (allUndefined) {
        cols.start = 0;
        cols.end = 1;
        cols.content = 2;
    }

    return cols;
};

/**
 * Set data for the timeline
 * @param {google.visualization.DataTable | Array} data
 */
links.Timeline.prototype.setData = function(data) {
    // unselect any previously selected item
    this.unselectItems();

    if (!data) {
        data = [];
    }

    // clear all data
    this.stackCancelAnimation();
    this.clearItems();
    this.data = data;
    var items = this.items;
    this.deleteGroups();

    if (google && google.visualization &&
        data instanceof google.visualization.DataTable) {
        // map the datatable columns
        var cols = links.Timeline.mapColumnIds(data);

        // read DataTable
        for (var row = 0, rows = data.getNumberOfRows(); row < rows; row++) {
            items.push(this.createItem({
                'start':     ((cols.start != undefined)     ? data.getValue(row, cols.start)     : undefined),
                'end':       ((cols.end != undefined)       ? data.getValue(row, cols.end)       : undefined),
                'content':   ((cols.content != undefined)   ? data.getValue(row, cols.content)   : undefined),
                'group':     ((cols.group != undefined)     ? data.getValue(row, cols.group)     : undefined),
                'className': ((cols.className != undefined) ? data.getValue(row, cols.className) : undefined),
                'editable':  ((cols.editable != undefined)  ? data.getValue(row, cols.editable)  : undefined)
            }));
        }
    }
    else if (links.Timeline.isArray(data)) {
        // read JSON array
        for (var row = 0, rows = data.length; row < rows; row++) {
            var itemData = data[row];
            var item = this.createItem(itemData);
            items.push(item);
        }
    }
    else {
        throw "Unknown data type. DataTable or Array expected.";
    }

    // prepare data for clustering, by filtering and sorting by type
    if (this.options.cluster) {
        this.clusterGenerator.setData(this.items);
    }

    this.render({
        animate: false
    });
};

/**
 * Return the original data table.
 * @return {google.visualization.DataTable | Array} data
 */
links.Timeline.prototype.getData = function  () {
    return this.data;
};


/**
 * Update the original data with changed start, end or group.
 *
 * @param {Number} index
 * @param {Object} values   An object containing some of the following parameters:
 *                          {Date} start,
 *                          {Date} end,
 *                          {String} content,
 *                          {String} group
 */
links.Timeline.prototype.updateData = function  (index, values) {
    var data = this.data,
        prop;

    if (google && google.visualization &&
        data instanceof google.visualization.DataTable) {
        // update the original google DataTable
        var missingRows = (index + 1) - data.getNumberOfRows();
        if (missingRows > 0) {
            data.addRows(missingRows);
        }

        // map the column id's by name
        var cols = links.Timeline.mapColumnIds(data);

        // merge all fields from the provided data into the current data
        for (prop in values) {
            if (values.hasOwnProperty(prop)) {
                var col = cols[prop];
                if (col == undefined) {
                    // create new column
                    var value = values[prop];
                    var valueType = 'string';
                    if (typeof(value) == 'number')       valueType = 'number';
                    else if (typeof(value) == 'boolean') valueType = 'boolean';
                    else if (value instanceof Date)      valueType = 'datetime';
                    col = data.addColumn(valueType, prop);
                }
                data.setValue(index, col, values[prop]);
            }
        }
    }
    else if (links.Timeline.isArray(data)) {
        // update the original JSON table
        var row = data[index];
        if (row == undefined) {
            row = {};
            data[index] = row;
        }

        // merge all fields from the provided data into the current data
        for (prop in values) {
            if (values.hasOwnProperty(prop)) {
                row[prop] = values[prop];
            }
        }
    }
    else {
        throw "Cannot update data, unknown type of data";
    }
};

/**
 * Find the item index from a given HTML element
 * If no item index is found, undefined is returned
 * @param {Element} element
 * @return {Number | undefined} index
 */
links.Timeline.prototype.getItemIndex = function(element) {
    var e = element,
        dom = this.dom,
        frame = dom.items.frame,
        items = this.items,
        index = undefined;

    // try to find the frame where the items are located in
    while (e.parentNode && e.parentNode !== frame) {
        e = e.parentNode;
    }

    if (e.parentNode === frame) {
        // yes! we have found the parent element of all items
        // retrieve its id from the array with items
        for (var i = 0, iMax = items.length; i < iMax; i++) {
            if (items[i].dom === e) {
                index = i;
                break;
            }
        }
    }

    return index;
};

/**
 * Set a new size for the timeline
 * @param {string} width   Width in pixels or percentage (for example "800px"
 *                         or "50%")
 * @param {string} height  Height in pixels or percentage  (for example "400px"
 *                         or "30%")
 */
links.Timeline.prototype.setSize = function(width, height) {
    if (width) {
        this.options.width = width;
        this.dom.frame.style.width = width;
    }
    if (height) {
        this.options.height = height;
        this.options.autoHeight = (this.options.height === "auto");
        if (height !==  "auto" ) {
            this.dom.frame.style.height = height;
        }
    }

    this.render({
        animate: false
    });
};


/**
 * Set a new value for the visible range int the timeline.
 * Set start undefined to include everything from the earliest date to end.
 * Set end undefined to include everything from start to the last date.
 * Example usage:
 *    myTimeline.setVisibleChartRange(new Date("2010-08-22"),
 *                                    new Date("2010-09-13"));
 * @param {Date}   start     The start date for the timeline. optional
 * @param {Date}   end       The end date for the timeline. optional
 * @param {boolean} redraw   Optional. If true (default) the Timeline is
 *                           directly redrawn
 */
links.Timeline.prototype.setVisibleChartRange = function(start, end, redraw) {
    var range = {};
    if (!start || !end) {
        // retrieve the date range of the items
        range = this.getDataRange(true);
    }

    if (!start) {
        if (end) {
            if (range.min && range.min.valueOf() < end.valueOf()) {
                // start of the data
                start = range.min;
            }
            else {
                // 7 days before the end
                start = new Date(end);
                start.setDate(start.getDate() - 7);
            }
        }
        else {
            // default of 3 days ago
            start = new Date();
            start.setDate(start.getDate() - 3);
        }
    }

    if (!end) {
        if (range.max) {
            // end of the data
            end = range.max;
        }
        else {
            // 7 days after start
            end = new Date(start);
            end.setDate(end.getDate() + 7);
        }
    }

    // prevent start Date <= end Date
    if (end.valueOf() <= start.valueOf()) {
        end = new Date(start);
        end.setDate(end.getDate() + 7);
    }

    // limit to the allowed range (don't let this do by applyRange,
    // because that method will try to maintain the interval (end-start)
    var min = this.options.min ? this.options.min.valueOf() : undefined;
    if (min != undefined && start.valueOf() < min) {
        start = new Date(min);
    }
    var max = this.options.max ? this.options.max.valueOf() : undefined;
    if (max != undefined && end.valueOf() > max) {
        end = new Date(max);
    }

    this.applyRange(start, end);

    if (redraw == undefined || redraw == true) {
        this.render({
            animate: false
        });  // TODO: optimize, no reflow needed
    }
    else {
        this.recalcConversion();
    }
};


/**
 * Change the visible chart range such that all items become visible
 */
links.Timeline.prototype.setVisibleChartRangeAuto = function() {
    var range = this.getDataRange(true),
        start = undefined,
        end = undefined;
    this.setVisibleChartRange(range.min, range.max);
};

/**
 * Adjust the visible range such that the current time is located in the center
 * of the timeline
 */
links.Timeline.prototype.setVisibleChartRangeNow = function() {
    var now = new Date();

    var diff = (this.end.getTime() - this.start.getTime());

    var startNew = new Date(now.getTime() - diff/2);
    var endNew = new Date(startNew.getTime() + diff);
    this.setVisibleChartRange(startNew, endNew);
};


/**
 * Retrieve the current visible range in the timeline.
 * @return {Object} An object with start and end properties
 */
links.Timeline.prototype.getVisibleChartRange = function() {
    return {
        'start': new Date(this.start),
        'end': new Date(this.end)
    };
};

/**
 * Get the date range of the items.
 * @param {boolean} [withMargin]  If true, 5% of whitespace is added to the
 *                                left and right of the range. Default is false.
 * @return {Object} range    An object with parameters min and max.
 *                           - {Date} min is the lowest start date of the items
 *                           - {Date} max is the highest start or end date of the items
 *                           If no data is available, the values of min and max
 *                           will be undefined
 */
links.Timeline.prototype.getDataRange = function (withMargin) {
    var items = this.items,
        min = undefined,
        max = undefined;

    if (items) {
        for (var i = 0, iMax = items.length; i < iMax; i++) {
            var item = items[i],
                start = item.start ? item.start.valueOf() : undefined,
                end = item.end ? item.end.valueOf() : start;

            if (min != undefined && start != undefined) {
                min = Math.min(min, start);
            }
            else {
                min = start;
            }

            if (max != undefined && end != undefined) {
                max = Math.max(max, end);
            }
            else {
                max = end;
            }
        }
    }

    if (min && max && withMargin) {
        // zoom out 5% such that you have a little white space on the left and right
        var diff = (max.valueOf() - min.valueOf());
        min = new Date(min.valueOf() - diff * 0.05);
        max = new Date(max.valueOf() + diff * 0.05);
    }

    return {
        'min': min ? new Date(min) : undefined,
        'max': max ? new Date(max) : undefined
    };
};

/**
 * Re-render (reflow and repaint) all components of the Timeline: frame, axis,
 * items, ...
 * @param {Object} [options]  Available options:
 *                            {boolean} renderTimesLeft   Number of times the
 *                                                        render may be repeated
 *                                                        5 times by default.
 *                            {boolean} animate           takes options.animate
 *                                                        as default value
 */
links.Timeline.prototype.render = function(options) {
    var frameResized = this.reflowFrame();
    var axisResized = this.reflowAxis();
    var groupsResized = this.reflowGroups();
    var itemsResized = this.reflowItems();
    var resized = (frameResized || axisResized || groupsResized || itemsResized);

    // TODO: only stackEvents/filterItems when resized or changed. (gives a bootstrap issue).
    // if (resized) {
    var animate = this.options.animate;
    if (options && options.animate != undefined) {
        animate = options.animate;
    }

    this.recalcConversion();
    this.clusterItems();
    this.filterItems();
    // this.stackItems(animate); //TODO: only for lineItems

    this.recalcItems();
/* TODO: use or cleanup
    // re-cluster when the actualHeight is changed
    if (this.options.cluster && this.size.actualHeight != this.size.prevActualHeight) {
        // console.log('actualHeight changed. reclustering...'); // TODO: cleanup

        // remove current clusters
        this.unclusterItems();

        // TODO: improve efficiency here (when unclustering, update the visibility of the affected items)

        // filter and stack the unclustered items
        this.filterItems();
        this.stackItems(animate);

        // apply clustering
        this.clusterItems();
        if (this.currentClusters && this.currentClusters.length) {
            this.filterItems();
            this.stackItems(animate);
        }

        this.size.prevActualHeight = this.size.actualHeight;
    }
    // }
*/
    // TODO: only repaint when resized or when filterItems or stackItems gave a change?
    var needsReflow = this.repaint();

    // re-render once when needed (prevent endless re-render loop)
    if (needsReflow) {
        var renderTimesLeft = options ? options.renderTimesLeft : undefined;
        if (renderTimesLeft == undefined) {
            renderTimesLeft = 5;
        }
        if (renderTimesLeft > 0) {
            this.render({
                'animate': options ? options.animate: undefined,
                'renderTimesLeft': (renderTimesLeft - 1)
            });
        }
        this.trigger('reflow');
    }
};

/**
 * Repaint all components of the Timeline
 * @return {boolean} needsReflow   Returns true if the DOM is changed such that
 *                                 a reflow is needed.
 */
links.Timeline.prototype.repaint = function() {
    var frameNeedsReflow = this.repaintFrame();
    var axisNeedsReflow  = this.repaintAxis();
    var groupsNeedsReflow  = this.repaintGroups();
    var itemsNeedsReflow = this.repaintItems();
    this.repaintCurrentTime();
    this.repaintCustomTime();

    return (frameNeedsReflow || axisNeedsReflow || groupsNeedsReflow || itemsNeedsReflow);
};

/**
 * Reflow the timeline frame
 * @return {boolean} resized    Returns true if any of the frame elements
 *                              have been resized.
 */
links.Timeline.prototype.reflowFrame = function() {
    var dom = this.dom,
        options = this.options,
        size = this.size,
        resized = false;

    // Note: IE7 has issues with giving frame.clientWidth, therefore I use offsetWidth instead
    var frameWidth  = dom.frame ? dom.frame.offsetWidth : 0,
        frameHeight = dom.frame ? dom.frame.clientHeight : 0;

    resized = resized || (size.frameWidth !== frameWidth);
    resized = resized || (size.frameHeight !== frameHeight);
    size.frameWidth = frameWidth;
    size.frameHeight = frameHeight;

    return resized;
};

/**
 * repaint the Timeline frame
 * @return {boolean} needsReflow   Returns true if the DOM is changed such that
 *                                 a reflow is needed.
 */
links.Timeline.prototype.repaintFrame = function() {
    var needsReflow = false,
        dom = this.dom,
        options = this.options,
        size = this.size;

    // main frame
    if (!dom.frame) {
        dom.frame = document.createElement("DIV");
        dom.frame.className = "timeline-frame";
        dom.frame.style.position = "relative";
        dom.frame.style.overflow = "hidden";
        dom.container.appendChild(dom.frame);
        needsReflow = true;
    }

    var height = options.autoHeight ?
            (size.actualHeight + "px") :
            (options.height || "100%");
    var width  = options.width || "100%";
    needsReflow = needsReflow || (dom.frame.style.height != height);
    needsReflow = needsReflow || (dom.frame.style.width != width);
    dom.frame.style.height = height;
    dom.frame.style.width = width;

    // contents
    if (!dom.content) {
        // create content box where the axis and items will be created
        dom.content = document.createElement("DIV");
        dom.content.style.position = "relative";
        dom.content.style.overflow = "hidden";
        dom.frame.appendChild(dom.content);

        var timelines = document.createElement("DIV");
        timelines.style.position = "absolute";
        timelines.style.left = "0px";
        timelines.style.top = "0px";
        timelines.style.height = "100%";
        timelines.style.width = "0px";
        dom.content.appendChild(timelines);
        dom.contentTimelines = timelines;

        var params = this.eventParams,
            me = this;
        if (!params.onMouseDown) {
            params.onMouseDown = function (event) {me.onMouseDown(event);};
            links.Timeline.addEventListener(dom.content, "mousedown", params.onMouseDown);
        }
        if (!params.onTouchStart) {
            params.onTouchStart = function (event) {me.onTouchStart(event);};
            links.Timeline.addEventListener(dom.content, "touchstart", params.onTouchStart);
        }
        if (!params.onMouseWheel) {
            params.onMouseWheel = function (event) {me.onMouseWheel(event);};
            links.Timeline.addEventListener(dom.content, "mousewheel", params.onMouseWheel);
        }
        if (!params.onDblClick) {
            params.onDblClick = function (event) {me.onDblClick(event);};
            links.Timeline.addEventListener(dom.content, "dblclick", params.onDblClick);
        }

        needsReflow = true;
    }
    dom.content.style.left = size.contentLeft + "px";
    dom.content.style.top = "0px";
    dom.content.style.width = size.contentWidth + "px";
    dom.content.style.height = size.frameHeight + "px";

    this.repaintNavigation();

    return needsReflow;
};

/**
 * Reflow the timeline axis. Calculate its height, width, positioning, etc...
 * @return {boolean} resized    returns true if the axis is resized
 */
links.Timeline.prototype.reflowAxis = function() {
    var resized = false,
        dom = this.dom,
        options = this.options,
        size = this.size,
        axisDom = dom.axis;

    var characterMinorWidth  = (axisDom && axisDom.characterMinor) ? axisDom.characterMinor.clientWidth : 0,
        characterMinorHeight = (axisDom && axisDom.characterMinor) ? axisDom.characterMinor.clientHeight : 0,
        characterMajorWidth  = (axisDom && axisDom.characterMajor) ? axisDom.characterMajor.clientWidth : 0,
        characterMajorHeight = (axisDom && axisDom.characterMajor) ? axisDom.characterMajor.clientHeight : 0,
        axisHeight = (options.showMinorLabels ? characterMinorHeight : 0) +
            (options.showMajorLabels ? characterMajorHeight : 0);

    var axisTop  = options.axisOnTop ? 0 : size.frameHeight - axisHeight,
        axisLine = options.axisOnTop ? axisHeight : axisTop;

    resized = resized || (size.axis.top !== axisTop);
    resized = resized || (size.axis.line !== axisLine);
    resized = resized || (size.axis.height !== axisHeight);
    size.axis.top = axisTop;
    size.axis.line = axisLine;
    size.axis.height = axisHeight;
    size.axis.labelMajorTop = options.axisOnTop ? 0 : axisLine +
        (options.showMinorLabels ? characterMinorHeight : 0);
    size.axis.labelMinorTop = options.axisOnTop ?
        (options.showMajorLabels ? characterMajorHeight : 0) :
        axisLine;
    size.axis.lineMinorTop = options.axisOnTop ? size.axis.labelMinorTop : 0;
    size.axis.lineMinorHeight = options.showMajorLabels ?
        size.frameHeight - characterMajorHeight:
        size.frameHeight;
    if (axisDom && axisDom.minorLines && axisDom.minorLines.length) {
        size.axis.lineMinorWidth = axisDom.minorLines[0].offsetWidth;
    }
    else {
        size.axis.lineMinorWidth = 1;
    }
    if (axisDom && axisDom.majorLines && axisDom.majorLines.length) {
        size.axis.lineMajorWidth = axisDom.majorLines[0].offsetWidth;
    }
    else {
        size.axis.lineMajorWidth = 1;
    }

    resized = resized || (size.axis.characterMinorWidth  !== characterMinorWidth);
    resized = resized || (size.axis.characterMinorHeight !== characterMinorHeight);
    resized = resized || (size.axis.characterMajorWidth  !== characterMajorWidth);
    resized = resized || (size.axis.characterMajorHeight !== characterMajorHeight);
    size.axis.characterMinorWidth  = characterMinorWidth;
    size.axis.characterMinorHeight = characterMinorHeight;
    size.axis.characterMajorWidth  = characterMajorWidth;
    size.axis.characterMajorHeight = characterMajorHeight;

    var contentHeight = Math.max(size.frameHeight - axisHeight, 0);
    size.contentLeft = options.groupsOnRight ? 0 : size.groupsWidth;
    size.contentWidth = Math.max(size.frameWidth - size.groupsWidth, 0);
    size.contentHeight = contentHeight;

    return resized;
};

/**
 * Redraw the timeline axis with minor and major labels
 * @return {boolean} needsReflow     Returns true if the DOM is changed such
 *                                   that a reflow is needed.
 */
links.Timeline.prototype.repaintAxis = function() {
    var needsReflow = false,
        dom = this.dom,
        options = this.options,
        size = this.size,
        step = this.step;

    var axis = dom.axis;
    if (!axis) {
        axis = {};
        dom.axis = axis;
    }
    if (!size.axis.properties) {
        size.axis.properties = {};
    }
    if (!axis.minorTexts) {
        axis.minorTexts = [];
    }
    if (!axis.minorLines) {
        axis.minorLines = [];
    }
    if (!axis.majorTexts) {
        axis.majorTexts = [];
    }
    if (!axis.majorLines) {
        axis.majorLines = [];
    }

    if (!axis.frame) {
        axis.frame = document.createElement("DIV");
        axis.frame.style.position = "absolute";
        axis.frame.style.left = "0px";
        axis.frame.style.top = "0px";
        dom.content.appendChild(axis.frame);
    }

    // take axis offline
    dom.content.removeChild(axis.frame);

    axis.frame.style.width = (size.contentWidth) + "px";
    axis.frame.style.height = (size.axis.height) + "px";

    // the drawn axis is more wide than the actual visual part, such that
    // the axis can be dragged without having to redraw it each time again.
    var start = this.screenToTime(0);
    var end = this.screenToTime(size.contentWidth);

    // calculate minimum step (in milliseconds) based on character size
    if (size.axis.characterMinorWidth) {
        this.minimumStep =
            this.screenToTime(size.axis.characterMinorWidth * 6).valueOf() -
            this.screenToTime(0).valueOf();

        step.setRange(start, end, this.minimumStep);
    }

    var charsNeedsReflow = this.repaintAxisCharacters();
    needsReflow = needsReflow || charsNeedsReflow;

    // The current labels on the axis will be re-used (much better performance),
    // therefore, the repaintAxis method uses the mechanism with
    // repaintAxisStartOverwriting, repaintAxisEndOverwriting, and
    // this.size.axis.properties is used.
    this.repaintAxisStartOverwriting();

    step.start();
    var xFirstMajorLabel = undefined;
    var max = 0;
    while (!step.end() && max < 1000) {
        max++;
        var cur = step.getCurrent(),
            x = this.timeToScreen(cur),
            isMajor = step.isMajor();

        if (options.showMinorLabels) {
            this.repaintAxisMinorText(x, step.getLabelMinor());
        }

        if (isMajor && options.showMajorLabels) {
            if (x > 0) {
                if (xFirstMajorLabel === undefined) {
                    xFirstMajorLabel = x;
                }
                this.repaintAxisMajorText(x, step.getLabelMajor());
            }
            this.repaintAxisMajorLine(x);
        }
        else {
            this.repaintAxisMinorLine(x);
        }

        step.next();
    }

    // create a major label on the left when needed
    if (options.showMajorLabels) {
        var leftTime = this.screenToTime(0),
            leftText = this.step.getLabelMajor(leftTime),
            width = leftText.length * size.axis.characterMajorWidth + 10; // upper bound estimation

        if (xFirstMajorLabel === undefined || width < xFirstMajorLabel) {
            this.repaintAxisMajorText(0, leftText, leftTime);
        }
    }

    // cleanup left over labels
    this.repaintAxisEndOverwriting();

    this.repaintAxisHorizontal();

    // put axis online
    dom.content.insertBefore(axis.frame, dom.content.firstChild);

    return needsReflow;
};

/**
 * Create characters used to determine the size of text on the axis
 * @return {boolean} needsReflow   Returns true if the DOM is changed such that
 *                                 a reflow is needed.
 */
links.Timeline.prototype.repaintAxisCharacters = function () {
    // calculate the width and height of a single character
    // this is used to calculate the step size, and also the positioning of the
    // axis
    var needsReflow = false,
        dom = this.dom,
        axis = dom.axis,
        text;

    if (!axis.characterMinor) {
        text = document.createTextNode("0");
        var characterMinor = document.createElement("DIV");
        characterMinor.className = "timeline-axis-text timeline-axis-text-minor";
        characterMinor.appendChild(text);
        characterMinor.style.position = "absolute";
        characterMinor.style.visibility = "hidden";
        characterMinor.style.paddingLeft = "0px";
        characterMinor.style.paddingRight = "0px";
        axis.frame.appendChild(characterMinor);

        axis.characterMinor = characterMinor;
        needsReflow = true;
    }

    if (!axis.characterMajor) {
        text = document.createTextNode("0");
        var characterMajor = document.createElement("DIV");
        characterMajor.className = "timeline-axis-text timeline-axis-text-major";
        characterMajor.appendChild(text);
        characterMajor.style.position = "absolute";
        characterMajor.style.visibility = "hidden";
        characterMajor.style.paddingLeft = "0px";
        characterMajor.style.paddingRight = "0px";
        axis.frame.appendChild(characterMajor);

        axis.characterMajor = characterMajor;
        needsReflow = true;
    }

    return needsReflow;
};

/**
 * Initialize redraw of the axis. All existing labels and lines will be
 * overwritten and reused.
 */
links.Timeline.prototype.repaintAxisStartOverwriting = function () {
    var properties = this.size.axis.properties;

    properties.minorTextNum = 0;
    properties.minorLineNum = 0;
    properties.majorTextNum = 0;
    properties.majorLineNum = 0;
};

/**
 * End of overwriting HTML DOM elements of the axis.
 * remaining elements will be removed
 */
links.Timeline.prototype.repaintAxisEndOverwriting = function () {
    var dom = this.dom,
        props = this.size.axis.properties,
        frame = this.dom.axis.frame,
        num;

    // remove leftovers
    var minorTexts = dom.axis.minorTexts;
    num = props.minorTextNum;
    while (minorTexts.length > num) {
        var minorText = minorTexts[num];
        frame.removeChild(minorText);
        minorTexts.splice(num, 1);
    }

    var minorLines = dom.axis.minorLines;
    num = props.minorLineNum;
    while (minorLines.length > num) {
        var minorLine = minorLines[num];
        frame.removeChild(minorLine);
        minorLines.splice(num, 1);
    }

    var majorTexts = dom.axis.majorTexts;
    num = props.majorTextNum;
    while (majorTexts.length > num) {
        var majorText = majorTexts[num];
        frame.removeChild(majorText);
        majorTexts.splice(num, 1);
    }

    var majorLines = dom.axis.majorLines;
    num = props.majorLineNum;
    while (majorLines.length > num) {
        var majorLine = majorLines[num];
        frame.removeChild(majorLine);
        majorLines.splice(num, 1);
    }
};

/**
 * Repaint the horizontal line and background of the axis
 */
links.Timeline.prototype.repaintAxisHorizontal = function() {
    var axis = this.dom.axis,
        size = this.size,
        options = this.options;

    // line behind all axis elements (possibly having a background color)
    var hasAxis = (options.showMinorLabels || options.showMajorLabels);
    if (hasAxis) {
        if (!axis.backgroundLine) {
            // create the axis line background (for a background color or so)
            var backgroundLine = document.createElement("DIV");
            backgroundLine.className = "timeline-axis";
            backgroundLine.style.position = "absolute";
            backgroundLine.style.left = "0px";
            backgroundLine.style.width = "100%";
            backgroundLine.style.border = "none";
            axis.frame.insertBefore(backgroundLine, axis.frame.firstChild);

            axis.backgroundLine = backgroundLine;
        }

        if (axis.backgroundLine) {
            axis.backgroundLine.style.top = size.axis.top + "px";
            axis.backgroundLine.style.height = size.axis.height + "px";
        }
    }
    else {
        if (axis.backgroundLine) {
            axis.frame.removeChild(axis.backgroundLine);
            delete axis.backgroundLine;
        }
    }

    // line before all axis elements
    if (hasAxis) {
        if (axis.line) {
            // put this line at the end of all childs
            var line = axis.frame.removeChild(axis.line);
            axis.frame.appendChild(line);
        }
        else {
            // make the axis line
            var line = document.createElement("DIV");
            line.className = "timeline-axis";
            line.style.position = "absolute";
            line.style.left = "0px";
            line.style.width = "100%";
            line.style.height = "0px";
            axis.frame.appendChild(line);

            axis.line = line;
        }

        axis.line.style.top = size.axis.line + "px";
    }
    else {
        if (axis.line && axis.line.parentElement) {
            axis.frame.removeChild(axis.line);
            delete axis.line;
        }
    }
};

/**
 * Create a minor label for the axis at position x
 * @param {Number} x
 * @param {String} text
 */
links.Timeline.prototype.repaintAxisMinorText = function (x, text) {
    var size = this.size,
        dom = this.dom,
        props = size.axis.properties,
        frame = dom.axis.frame,
        minorTexts = dom.axis.minorTexts,
        index = props.minorTextNum,
        label;

    if (index < minorTexts.length) {
        label = minorTexts[index]
    }
    else {
        // create new label
        var content = document.createTextNode("");
        label = document.createElement("DIV");
        label.appendChild(content);
        label.className = "timeline-axis-text timeline-axis-text-minor";
        label.style.position = "absolute";

        frame.appendChild(label);

        minorTexts.push(label);
    }

    label.childNodes[0].nodeValue = text;
    label.style.left = x + "px";
    label.style.top  = size.axis.labelMinorTop + "px";
    //label.title = title;  // TODO: this is a heavy operation

    props.minorTextNum++;
};

/**
 * Create a minor line for the axis at position x
 * @param {Number} x
 */
links.Timeline.prototype.repaintAxisMinorLine = function (x) {
    var axis = this.size.axis,
        dom = this.dom,
        props = axis.properties,
        frame = dom.axis.frame,
        minorLines = dom.axis.minorLines,
        index = props.minorLineNum,
        line;

    if (index < minorLines.length) {
        line = minorLines[index];
    }
    else {
        // create vertical line
        line = document.createElement("DIV");
        line.className = "timeline-axis-grid timeline-axis-grid-minor";
        line.style.position = "absolute";
        line.style.width = "0px";

        frame.appendChild(line);
        minorLines.push(line);
    }

    line.style.top = axis.lineMinorTop + "px";
    line.style.height = axis.lineMinorHeight + "px";
    line.style.left = (x - axis.lineMinorWidth/2) + "px";

    props.minorLineNum++;
};

/**
 * Create a Major label for the axis at position x
 * @param {Number} x
 * @param {String} text
 */
links.Timeline.prototype.repaintAxisMajorText = function (x, text) {
    var size = this.size,
        props = size.axis.properties,
        frame = this.dom.axis.frame,
        majorTexts = this.dom.axis.majorTexts,
        index = props.majorTextNum,
        label;

    if (index < majorTexts.length) {
        label = majorTexts[index];
    }
    else {
        // create label
        var content = document.createTextNode(text);
        label = document.createElement("DIV");
        label.className = "timeline-axis-text timeline-axis-text-major";
        label.appendChild(content);
        label.style.position = "absolute";
        label.style.top = "0px";

        frame.appendChild(label);
        majorTexts.push(label);
    }

    label.childNodes[0].nodeValue = text;
    label.style.top = size.axis.labelMajorTop + "px";
    label.style.left = x + "px";
    //label.title = title; // TODO: this is a heavy operation

    props.majorTextNum ++;
};

/**
 * Create a Major line for the axis at position x
 * @param {Number} x
 */
links.Timeline.prototype.repaintAxisMajorLine = function (x) {
    var size = this.size,
        props = size.axis.properties,
        axis = this.size.axis,
        frame = this.dom.axis.frame,
        majorLines = this.dom.axis.majorLines,
        index = props.majorLineNum,
        line;

    if (index < majorLines.length) {
        line = majorLines[index];
    }
    else {
        // create vertical line
        line = document.createElement("DIV");
        line.className = "timeline-axis-grid timeline-axis-grid-major";
        line.style.position = "absolute";
        line.style.top = "0px";
        line.style.width = "0px";

        frame.appendChild(line);
        majorLines.push(line);
    }

    line.style.left = (x - axis.lineMajorWidth/2) + "px";
    line.style.height = size.frameHeight + "px";

    props.majorLineNum ++;
};

/**
 * Reflow all items, retrieve their actual size
 * @return {boolean} resized    returns true if any of the items is resized
 */
links.Timeline.prototype.reflowItems = function() {
    var resized = false,
        i,
        iMax,
        group,
        dom = this.dom,
        groups = this.groups,
        renderedItems = this.renderedItems;

    if (groups) { // TODO: need to check if labels exists?
        // loop through all groups to reset the items height
        groups.forEach(function (group) {
            group.itemsHeight = 0;
        });
    }

    // loop through the width and height of all visible items
    for (i = 0, iMax = renderedItems.length; i < iMax; i++) {
        var item = renderedItems[i],
            domItem = item.dom;
        group = item.group;

        if (domItem) {
            // TODO: move updating width and height into item.reflow
            var width = domItem ? domItem.clientWidth : 0;
            var height = domItem ? domItem.clientHeight : 0;
            resized = resized || (item.width != width);
            resized = resized || (item.height != height);
            item.width = width;
            item.height = height;
            //item.borderWidth = (domItem.offsetWidth - domItem.clientWidth - 2) / 2; // TODO: borderWidth
            item.reflow();
        }

        if (group) {
            group.itemsHeight = group.itemsHeight ?
                Math.max(group.itemsHeight, item.height) :
                item.height;
        }
    }

    return resized;
};

/**
 * Recalculate item properties:
 * - the height of each group.
 * - the actualHeight, from the stacked items or the sum of the group heights
 * @return {boolean} resized    returns true if any of the items properties is
 *                              changed
 */
links.Timeline.prototype.recalcItems = function () {
    var resized = false,
        i,
        iMax,
        item,
        finalItem,
        finalItems,
        group,
        groups = this.groups,
        size = this.size,
        options = this.options,
        renderedItems = this.renderedItems;

    var actualHeight = 0;
    if (groups.length == 0) {
        // calculate actual height of the timeline when there are no groups
        // but stacked items
        if (options.autoHeight || options.cluster) {
            var min = 0,
                max = 0;

            if (this.stack && this.stack.finalItems) {
                // adjust the offset of all finalItems when the actualHeight has been changed
                finalItems = this.stack.finalItems;
                finalItem = finalItems[0];
                if (finalItem && finalItem.top) {
                    min = finalItem.top;
                    max = finalItem.top + finalItem.height;
                }
                for (i = 1, iMax = finalItems.length; i < iMax; i++) {
                    finalItem = finalItems[i];
                    min = Math.min(min, finalItem.top);
                    max = Math.max(max, finalItem.top + finalItem.height);
                }
            }
            else {
                item = renderedItems[0];
                if (item && item.top) {
                    min = item.top;
                    max = item.top + item.height;
                }
                for (i = 1, iMax = renderedItems.length; i < iMax; i++) {
                    item = renderedItems[i];
                    if (item.top) {
                        min = Math.min(min, item.top);
                        max = Math.max(max, (item.top + item.height));
                    }
                }
            }

            actualHeight = (max - min) + 2 * options.eventMarginAxis + size.axis.height;
            if (actualHeight < options.minHeight) {
                actualHeight = options.minHeight;
            }

            if (size.actualHeight != actualHeight && options.autoHeight && !options.axisOnTop) {
                // adjust the offset of all items when the actualHeight has been changed
                var diff = actualHeight - size.actualHeight;
                if (this.stack && this.stack.finalItems) {
                    finalItems = this.stack.finalItems;
                    for (i = 0, iMax = finalItems.length; i < iMax; i++) {
                        finalItems[i].top += diff;
                        finalItems[i].item.top += diff;
                    }
                }
                else {
                    for (i = 0, iMax = renderedItems.length; i < iMax; i++) {
                        renderedItems[i].top += diff;
                    }
                }
            }
        }
    }
    else {
        // loop through all groups to get the height of each group, and the
        // total height
        actualHeight = size.axis.height + 2 * options.eventMarginAxis;
        for (i = 0, iMax = groups.length; i < iMax; i++) {
            group = groups[i];

            var groupHeight = Math.max(group.labelHeight || 0, group.itemsHeight || 0);
            resized = resized || (groupHeight != group.height);
            group.height = groupHeight;

            actualHeight += groups[i].height + options.eventMargin;
        }

        // calculate top positions of the group labels and lines
        var eventMargin = options.eventMargin,
            top = options.axisOnTop ?
                options.eventMarginAxis + eventMargin/2 :
                size.contentHeight - options.eventMarginAxis + eventMargin/ 2,
            axisHeight = size.axis.height;

        for (i = 0, iMax = groups.length; i < iMax; i++) {
            group = groups[i];
            if (options.axisOnTop) {
                group.top = top + axisHeight;
                group.labelTop = top + axisHeight + (group.height - group.labelHeight) / 2;
                group.lineTop = top + axisHeight + group.height + eventMargin/2;
                top += group.height + eventMargin;
            }
            else {
                top -= group.height + eventMargin;
                group.top = top;
                group.labelTop = top + (group.height - group.labelHeight) / 2;
                group.lineTop = top - eventMargin/2;
            }
        }

        // calculate top position of the visible items
        for (i = 0, iMax = renderedItems.length; i < iMax; i++) {
            item = renderedItems[i];
            group = item.group;

            if (group) {
                item.top = group.top;
            }
        }

        resized = true;
    }

    if (actualHeight < options.minHeight) {
        actualHeight = options.minHeight;
    }
    resized = resized || (actualHeight != size.actualHeight);
    size.actualHeight = actualHeight;

    return resized;
};

/**
 * This method clears the (internal) array this.items in a safe way: neatly
 * cleaning up the DOM, and accompanying arrays this.renderedItems and
 * the created clusters.
 */
links.Timeline.prototype.clearItems = function() {
    // add all visible items to the list to be hidden
    var hideItems = this.renderQueue.hide;
    this.renderedItems.forEach(function (item) {
        hideItems.push(item);
    });

    // clear the cluster generator
    this.clusterGenerator.clear();

    // actually clear the items
    this.items = [];
};

/**
 * Repaint all items
 * @return {boolean} needsReflow   Returns true if the DOM is changed such that
 *                                 a reflow is needed.
 */
links.Timeline.prototype.repaintItems = function() {
    var i, iMax, item, index;

    var needsReflow = false,
        dom = this.dom,
        size = this.size,
        timeline = this,
        renderedItems = this.renderedItems;

    if (!dom.items) {
        dom.items = {};
    }

    // draw the frame containing the items
    var frame = dom.items.frame;
    if (!frame) {
        frame = document.createElement("DIV");
        frame.style.position = "relative";
        dom.content.appendChild(frame);
        dom.items.frame = frame;
    }

    frame.style.left = "0px";
    frame.style.top = size.items.top + "px";
    frame.style.height = "0px";

    // Take frame offline (for faster manipulation of the DOM)
    // dom.content.removeChild(frame);

    // process the render queue with changes
    var queue = this.renderQueue;
    var newImageUrls = [];
    needsReflow = needsReflow ||
        (queue.show.length > 0) ||
        (queue.update.length > 0) ||
        (queue.hide.length > 0);   // TODO: reflow needed on hide of items?
    /* TODO: cleanup
    console.log(
        'show=', queue.show.length,
        'hide=', queue.show.length,
        'update=', queue.show.length
    );
    */
    while (item = queue.show.shift()) {
        item.showDOM(frame);
        item.getImageUrls(newImageUrls);
        renderedItems.push(item);
    }
    while (item = queue.update.shift()) {
        item.updateDOM(frame);
        item.getImageUrls(newImageUrls);
        index = this.renderedItems.indexOf(item);
        if (index == -1) {
            renderedItems.push(item);
        }
    }
    while (item = queue.hide.shift()) {
        item.hideDOM(frame);
        index = this.renderedItems.indexOf(item);
        if (index != -1) {
            renderedItems.splice(index, 1);
        }
    }
    // console.log('renderedItems=', renderedItems.length); // TODO: cleanup

    // reposition all visible items
    renderedItems.forEach(function (item) {
        item.updatePosition(timeline);
    });

    // redraw the delete button and dragareas of the selected item (if any)
    this.repaintDeleteButton();
    this.repaintDragAreas();

    // put frame online again
    // dom.content.appendChild(frame);

    if (newImageUrls.length) {
        // retrieve all image sources from the items, and set a callback once
        // all images are retrieved
        var callback = function () {
            timeline.render();
        };
        var sendCallbackWhenAlreadyLoaded = false;
        links.imageloader.loadAll(newImageUrls, callback, sendCallbackWhenAlreadyLoaded);
    }

    return needsReflow;
};

/**
 * Reflow the size of the groups
 * @return {boolean} resized    Returns true if any of the frame elements
 *                              have been resized.
 */
links.Timeline.prototype.reflowGroups = function() {
    var resized = false,
        options = this.options,
        size = this.size,
        dom = this.dom;

    // calculate the groups width and height
    // TODO: only update when data is changed! -> use an updateSeq
    var groupsWidth = 0;

    // loop through all groups to get the labels width and height
    var groups = this.groups;
    var labels = this.dom.groups ? this.dom.groups.labels : [];
    for (var i = 0, iMax = groups.length; i < iMax; i++) {
        var group = groups[i];
        var label = labels[i];
        group.labelWidth  = label ? label.clientWidth : 0;
        group.labelHeight = label ? label.clientHeight : 0;
        group.width = group.labelWidth;  // TODO: group.width is redundant with labelWidth

        groupsWidth = Math.max(groupsWidth, group.width);
    }

    // limit groupsWidth to the groups width in the options
    if (options.groupsWidth !== undefined) {
        groupsWidth = dom.groups.frame ? dom.groups.frame.clientWidth : 0;
    }

    // compensate for the border width. TODO: calculate the real border width
    groupsWidth += 1;

    var groupsLeft = options.groupsOnRight ? size.frameWidth - groupsWidth : 0;
    resized = resized || (size.groupsWidth !== groupsWidth);
    resized = resized || (size.groupsLeft !== groupsLeft);
    size.groupsWidth = groupsWidth;
    size.groupsLeft = groupsLeft;

    return resized;
};

/**
 * Redraw the group labels
 */
links.Timeline.prototype.repaintGroups = function() {
    var dom = this.dom,
        options = this.options,
        size = this.size,
        groups = this.groups;

    if (dom.groups === undefined) {
        dom.groups = {};
    }

    var labels = dom.groups.labels;
    if (!labels) {
        labels = [];
        dom.groups.labels = labels;
    }
    var labelLines = dom.groups.labelLines;
    if (!labelLines) {
        labelLines = [];
        dom.groups.labelLines = labelLines;
    }
    var itemLines = dom.groups.itemLines;
    if (!itemLines) {
        itemLines = [];
        dom.groups.itemLines = itemLines;
    }

    // create the frame for holding the groups
    var frame = dom.groups.frame;
    if (!frame) {
        frame =  document.createElement("DIV");
        frame.className = "timeline-groups-axis";
        frame.style.position = "absolute";
        frame.style.overflow = "hidden";
        frame.style.top = "0px";
        frame.style.height = "100%";

        dom.frame.appendChild(frame);
        dom.groups.frame = frame;
    }

    frame.style.left = size.groupsLeft + "px";
    frame.style.width = (options.groupsWidth !== undefined) ?
        options.groupsWidth :
        size.groupsWidth + "px";

    // hide groups axis when there are no groups
    if (groups.length == 0) {
        frame.style.display = 'none';
    }
    else {
        frame.style.display = '';
    }

    // TODO: only create/update groups when data is changed.

    // create the items
    var current = labels.length,
        needed = groups.length;

    // overwrite existing group labels
    for (var i = 0, iMax = Math.min(current, needed); i < iMax; i++) {
        var group = groups[i];
        var label = labels[i];
        label.innerHTML = this.getGroupName(group);
        label.style.display = '';
    }

    // append new items when needed
    for (var i = current; i < needed; i++) {
        var group = groups[i];

        // create text label
        var label = document.createElement("DIV");
        label.className = "timeline-groups-text";
        label.style.position = "absolute";
        if (options.groupsWidth === undefined) {
            label.style.whiteSpace = "nowrap";
        }
        label.innerHTML = this.getGroupName(group);
        frame.appendChild(label);
        labels[i] = label;

        // create the grid line between the group labels
        var labelLine = document.createElement("DIV");
        labelLine.className = "timeline-axis-grid timeline-axis-grid-minor";
        labelLine.style.position = "absolute";
        labelLine.style.left = "0px";
        labelLine.style.width = "100%";
        labelLine.style.height = "0px";
        labelLine.style.borderTopStyle = "solid";
        frame.appendChild(labelLine);
        labelLines[i] = labelLine;

        // create the grid line between the items
        var itemLine = document.createElement("DIV");
        itemLine.className = "timeline-axis-grid timeline-axis-grid-minor";
        itemLine.style.position = "absolute";
        itemLine.style.left = "0px";
        itemLine.style.width = "100%";
        itemLine.style.height = "0px";
        itemLine.style.borderTopStyle = "solid";
        dom.content.insertBefore(itemLine, dom.content.firstChild);
        itemLines[i] = itemLine;
    }

    // remove redundant items from the DOM when needed
    for (var i = needed; i < current; i++) {
        var label = labels[i],
            labelLine = labelLines[i],
            itemLine = itemLines[i];

        frame.removeChild(label);
        frame.removeChild(labelLine);
        dom.content.removeChild(itemLine);
    }
    labels.splice(needed, current - needed);
    labelLines.splice(needed, current - needed);
    itemLines.splice(needed, current - needed);

    frame.style.borderStyle = options.groupsOnRight ?
        "none none none solid" :
        "none solid none none";

    // position the groups
    for (var i = 0, iMax = groups.length; i < iMax; i++) {
        var group = groups[i],
            label = labels[i],
            labelLine = labelLines[i],
            itemLine = itemLines[i];

        label.style.top = group.labelTop + "px";
        labelLine.style.top = group.lineTop + "px";
        itemLine.style.top = group.lineTop + "px";
        itemLine.style.width = size.contentWidth + "px";
    }

    if (!dom.groups.background) {
        // create the axis grid line background
        var background = document.createElement("DIV");
        background.className = "timeline-axis";
        background.style.position = "absolute";
        background.style.left = "0px";
        background.style.width = "100%";
        background.style.border = "none";

        frame.appendChild(background);
        dom.groups.background = background;
    }
    dom.groups.background.style.top = size.axis.top + 'px';
    dom.groups.background.style.height = size.axis.height + 'px';

    if (!dom.groups.line) {
        // create the axis grid line
        var line = document.createElement("DIV");
        line.className = "timeline-axis";
        line.style.position = "absolute";
        line.style.left = "0px";
        line.style.width = "100%";
        line.style.height = "0px";

        frame.appendChild(line);
        dom.groups.line = line;
    }
    dom.groups.line.style.top = size.axis.line + 'px';

    // create a callback when there are images which are not yet loaded
    // TODO: more efficiently load images in the groups
    if (dom.groups.frame && groups.length) {
        var imageUrls = [];
        links.imageloader.filterImageUrls(dom.groups.frame, imageUrls);
        if (imageUrls.length) {
            // retrieve all image sources from the items, and set a callback once
            // all images are retrieved
            var callback = function () {
                timeline.render();
            };
            var sendCallbackWhenAlreadyLoaded = false;
            links.imageloader.loadAll(imageUrls, callback, sendCallbackWhenAlreadyLoaded);
        }
    }
};


/**
 * Redraw the current time bar
 */
links.Timeline.prototype.repaintCurrentTime = function() {
    var options = this.options,
        dom = this.dom,
        size = this.size;

    if (!options.showCurrentTime) {
        if (dom.currentTime) {
            dom.contentTimelines.removeChild(dom.currentTime);
            delete dom.currentTime;
        }

        return;
    }

    if (!dom.currentTime) {
        // create the current time bar
        var currentTime = document.createElement("DIV");
        currentTime.className = "timeline-currenttime";
        currentTime.style.position = "absolute";
        currentTime.style.top = "0px";
        currentTime.style.height = "100%";

        dom.contentTimelines.appendChild(currentTime);
        dom.currentTime = currentTime;
    }

    var now = new Date();
    var nowOffset = new Date(now.getTime() + this.clientTimeOffset);
    var x = this.timeToScreen(nowOffset);

    var visible = (x > -size.contentWidth && x < 2 * size.contentWidth);
    dom.currentTime.style.display = visible ? '' : 'none';
    dom.currentTime.style.left = x + "px";
    dom.currentTime.title = "Current time: " + nowOffset;

    // start a timer to adjust for the new time
    if (this.currentTimeTimer != undefined) {
        clearTimeout(this.currentTimeTimer);
        delete this.currentTimeTimer;
    }
    var timeline = this;
    var onTimeout = function() {
        timeline.repaintCurrentTime();
    };
    // the time equal to the width of one pixel, divided by 2 for more smoothness
    var interval = 1 / this.conversion.factor / 2;
    if (interval < 30) interval = 30;
    this.currentTimeTimer = setTimeout(onTimeout, interval);
};

/**
 * Redraw the custom time bar
 */
links.Timeline.prototype.repaintCustomTime = function() {
    var options = this.options,
        dom = this.dom,
        size = this.size;

    if (!options.showCustomTime) {
        if (dom.customTime) {
            dom.contentTimelines.removeChild(dom.customTime);
            delete dom.customTime;
        }

        return;
    }

    if (!dom.customTime) {
        var customTime = document.createElement("DIV");
        customTime.className = "timeline-customtime";
        customTime.style.position = "absolute";
        customTime.style.top = "0px";
        customTime.style.height = "100%";

        var drag = document.createElement("DIV");
        drag.style.position = "relative";
        drag.style.top = "0px";
        drag.style.left = "-10px";
        drag.style.height = "100%";
        drag.style.width = "20px";
        customTime.appendChild(drag);

        dom.contentTimelines.appendChild(customTime);
        dom.customTime = customTime;

        // initialize parameter
        this.customTime = new Date();
    }

    var x = this.timeToScreen(this.customTime),
        visible = (x > -size.contentWidth && x < 2 * size.contentWidth);
    dom.customTime.style.display = visible ? '' : 'none';
    dom.customTime.style.left = x + "px";
    dom.customTime.title = "Time: " + this.customTime;
};


/**
 * Redraw the delete button, on the top right of the currently selected item
 * if there is no item selected, the button is hidden.
 */
links.Timeline.prototype.repaintDeleteButton = function () {
    var timeline = this,
        dom = this.dom,
        frame = dom.items.frame;

    var deleteButton = dom.items.deleteButton;
    if (!deleteButton) {
        // create a delete button
        deleteButton = document.createElement("DIV");
        deleteButton.className = "timeline-navigation-delete";
        deleteButton.style.position = "absolute";

        frame.appendChild(deleteButton);
        dom.items.deleteButton = deleteButton;
    }

    var index = this.selection.length ? this.selection[0].index : -1,
        item = this.selection.length ? this.items[index] : undefined;
    if (item && item.rendered && this.isEditable(item)) {
        var right = item.getRight(this),
            top = item.top;

        deleteButton.style.left = right + 'px';
        deleteButton.style.top = top + 'px';
        deleteButton.style.display = '';
        frame.removeChild(deleteButton);
        frame.appendChild(deleteButton);
    }
    else {
        deleteButton.style.display = 'none';
    }
};


/**
 * Redraw the drag areas. When an item (ranges only) is selected,
 * it gets a drag area on the left and right side, to change its width
 */
links.Timeline.prototype.repaintDragAreas = function () {
    var timeline = this,
        options = this.options,
        dom = this.dom,
        frame = this.dom.items.frame;

    // create left drag area
    var dragLeft = dom.items.dragLeft;
    if (!dragLeft) {
        dragLeft = document.createElement("DIV");
        dragLeft.className="timeline-event-range-drag-left";
        dragLeft.style.width = options.dragAreaWidth + "px";
        dragLeft.style.position = "absolute";

        frame.appendChild(dragLeft);
        dom.items.dragLeft = dragLeft;
    }

    // create right drag area
    var dragRight = dom.items.dragRight;
    if (!dragRight) {
        dragRight = document.createElement("DIV");
        dragRight.className="timeline-event-range-drag-right";
        dragRight.style.width = options.dragAreaWidth + "px";
        dragRight.style.position = "absolute";

        frame.appendChild(dragRight);
        dom.items.dragRight = dragRight;
    }

    // reposition left and right drag area
    var index = this.selection.length ? this.selection[0].index : -1,
        item = this.selection.length ? this.items[index] : undefined;
    if (item && item.rendered && this.isEditable(item) &&
            (item instanceof links.Timeline.ItemRange)) {
        var left = this.timeToScreen(item.start),
            right = this.timeToScreen(item.end),
            top = item.top,
            height = item.height;

        dragLeft.style.left = left + 'px';
        dragLeft.style.top = top + 'px';
        dragLeft.style.height = height + 'px';
        dragLeft.style.display = '';
        frame.removeChild(dragLeft);
        frame.appendChild(dragLeft);

        dragRight.style.left = (right - options.dragAreaWidth) + 'px';
        dragRight.style.top = top + 'px';
        dragRight.style.height = height + 'px';
        dragRight.style.display = '';
        frame.removeChild(dragRight);
        frame.appendChild(dragRight);
    }
    else {
        dragLeft.style.display = 'none';
        dragRight.style.display = 'none';
    }
};

/**
 * Create the navigation buttons for zooming and moving
 */
links.Timeline.prototype.repaintNavigation = function () {
    var timeline = this,
        options = this.options,
        dom = this.dom,
        frame = dom.frame,
        navBar = dom.navBar;

    if (!navBar) {
        if (options.showNavigation || options.showButtonNew) {
            // create a navigation bar containing the navigation buttons
            navBar = document.createElement("DIV");
            navBar.style.position = "absolute";
            navBar.className = "timeline-navigation";
            if (options.groupsOnRight) {
                navBar.style.left = '10px';
            }
            else {
                navBar.style.right = '10px';
            }
            if (options.axisOnTop) {
                navBar.style.bottom = '10px';
            }
            else {
                navBar.style.top = '10px';
            }
            dom.navBar = navBar;
            frame.appendChild(navBar);
        }

        if (options.editable && options.showButtonNew) {
            // create a new in button
            navBar.addButton = document.createElement("DIV");
            navBar.addButton.className = "timeline-navigation-new";

            navBar.addButton.title = "Create new event";
            var onAdd = function(event) {
                links.Timeline.preventDefault(event);
                links.Timeline.stopPropagation(event);

                // create a new event at the center of the frame
                var w = timeline.size.contentWidth;
                var x = w / 2;
                var xstart = timeline.screenToTime(x - w / 10); // subtract 10% of timeline width
                var xend = timeline.screenToTime(x + w / 10);   // add 10% of timeline width
                if (options.snapEvents) {
                    timeline.step.snap(xstart);
                    timeline.step.snap(xend);
                }

                var content = "New";
                var group = timeline.groups.length ? timeline.groups[0].content : undefined;

                timeline.addItem({
                    'start': xstart,
                    'end': xend,
                    'content': content,
                    'group': group
                });
                var index = (timeline.items.length - 1);
                timeline.selectItems([index]);

                timeline.applyAdd = true;

                // fire an add event.
                // Note that the change can be canceled from within an event listener if
                // this listener calls the method cancelAdd().
                timeline.trigger('add');

                if (!timeline.applyAdd) {
                    // undo an add
                    timeline.deleteItem(index);
                }
            };
            links.Timeline.addEventListener(navBar.addButton, "mousedown", onAdd);
            navBar.appendChild(navBar.addButton);
        }

        if (options.editable && options.showButtonNew && options.showNavigation) {
            // create a separator line
            navBar.addButton.style.borderRightWidth = "1px";
            navBar.addButton.style.borderRightStyle = "solid";
        }

        if (options.showNavigation) {
            // create a zoom in button
            navBar.zoomInButton = document.createElement("DIV");
            navBar.zoomInButton.className = "timeline-navigation-zoom-in";
            navBar.zoomInButton.title = "Zoom in";
            var onZoomIn = function(event) {
                links.Timeline.preventDefault(event);
                links.Timeline.stopPropagation(event);
                timeline.zoom(0.4);
                timeline.trigger("rangechange");
                timeline.trigger("rangechanged");
            };
            links.Timeline.addEventListener(navBar.zoomInButton, "mousedown", onZoomIn);
            navBar.appendChild(navBar.zoomInButton);

            // create a zoom out button
            navBar.zoomOutButton = document.createElement("DIV");
            navBar.zoomOutButton.className = "timeline-navigation-zoom-out";
            navBar.zoomOutButton.title = "Zoom out";
            var onZoomOut = function(event) {
                links.Timeline.preventDefault(event);
                links.Timeline.stopPropagation(event);
                timeline.zoom(-0.4);
                timeline.trigger("rangechange");
                timeline.trigger("rangechanged");
            };
            links.Timeline.addEventListener(navBar.zoomOutButton, "mousedown", onZoomOut);
            navBar.appendChild(navBar.zoomOutButton);

            // create a move left button
            navBar.moveLeftButton = document.createElement("DIV");
            navBar.moveLeftButton.className = "timeline-navigation-move-left";
            navBar.moveLeftButton.title = "Move left";
            var onMoveLeft = function(event) {
                links.Timeline.preventDefault(event);
                links.Timeline.stopPropagation(event);
                timeline.move(-0.2);
                timeline.trigger("rangechange");
                timeline.trigger("rangechanged");
            };
            links.Timeline.addEventListener(navBar.moveLeftButton, "mousedown", onMoveLeft);
            navBar.appendChild(navBar.moveLeftButton);

            // create a move right button
            navBar.moveRightButton = document.createElement("DIV");
            navBar.moveRightButton.className = "timeline-navigation-move-right";
            navBar.moveRightButton.title = "Move right";
            var onMoveRight = function(event) {
                links.Timeline.preventDefault(event);
                links.Timeline.stopPropagation(event);
                timeline.move(0.2);
                timeline.trigger("rangechange");
                timeline.trigger("rangechanged");
            };
            links.Timeline.addEventListener(navBar.moveRightButton, "mousedown", onMoveRight);
            navBar.appendChild(navBar.moveRightButton);
        }
    }
};


/**
 * Set current time. This function can be used to set the time in the client
 * timeline equal with the time on a server.
 * @param {Date} time
 */
links.Timeline.prototype.setCurrentTime = function(time) {
    var now = new Date();
    this.clientTimeOffset = time.getTime() - now.getTime();

    this.repaintCurrentTime();
};

/**
 * Get current time. The time can have an offset from the real time, when
 * the current time has been changed via the method setCurrentTime.
 * @return {Date} time
 */
links.Timeline.prototype.getCurrentTime = function() {
    var now = new Date();
    return new Date(now.getTime() + this.clientTimeOffset);
};


/**
 * Set custom time.
 * The custom time bar can be used to display events in past or future.
 * @param {Date} time
 */
links.Timeline.prototype.setCustomTime = function(time) {
    this.customTime = new Date(time);
    this.repaintCustomTime();
};

/**
 * Retrieve the current custom time.
 * @return {Date} customTime
 */
links.Timeline.prototype.getCustomTime = function() {
    return new Date(this.customTime);
};

/**
 * Set a custom scale. Autoscaling will be disabled.
 * For example setScale(SCALE.MINUTES, 5) will result
 * in minor steps of 5 minutes, and major steps of an hour.
 *
 * @param {links.Timeline.StepDate.SCALE} scale
 *                               A scale. Choose from SCALE.MILLISECOND,
 *                               SCALE.SECOND, SCALE.MINUTE, SCALE.HOUR,
 *                               SCALE.WEEKDAY, SCALE.DAY, SCALE.MONTH,
 *                               SCALE.YEAR.
 * @param {int}        step   A step size, by default 1. Choose for
 *                               example 1, 2, 5, or 10.
 */
links.Timeline.prototype.setScale = function(scale, step) {
    this.step.setScale(scale, step);
    this.render(); // TODO: optimize: only reflow/repaint axis
};

/**
 * Enable or disable autoscaling
 * @param {boolean} enable  If true or not defined, autoscaling is enabled.
 *                          If false, autoscaling is disabled.
 */
links.Timeline.prototype.setAutoScale = function(enable) {
    this.step.setAutoScale(enable);
    this.render(); // TODO: optimize: only reflow/repaint axis
};

/**
 * Redraw the timeline
 * Reloads the (linked) data table and redraws the timeline when resized.
 * See also the method checkResize
 */
links.Timeline.prototype.redraw = function() {
    this.setData(this.data);
};


/**
 * Check if the timeline is resized, and if so, redraw the timeline.
 * Useful when the webpage is resized.
 */
links.Timeline.prototype.checkResize = function() {
    // TODO: re-implement the method checkResize, or better, make it redundant as this.render will be smarter
    this.render();
};

/**
 * Check whether a given item is editable
 * @param {links.Timeline.Item} item
 * @return {boolean} editable
 */
links.Timeline.prototype.isEditable = function (item) {
    if (item) {
        if (item.editable != undefined) {
            return item.editable;
        }
        else {
            return this.options.editable;
        }
    }
    return false;
};

/**
 * Calculate the factor and offset to convert a position on screen to the
 * corresponding date and vice versa.
 * After the method calcConversionFactor is executed once, the methods screenToTime and
 * timeToScreen can be used.
 */
links.Timeline.prototype.recalcConversion = function() {
    this.conversion.offset = parseFloat(this.start.valueOf());
    this.conversion.factor = parseFloat(this.size.contentWidth) /
        parseFloat(this.end.valueOf() - this.start.valueOf());
};


/**
 * Convert a position on screen (pixels) to a datetime
 * Before this method can be used, the method calcConversionFactor must be
 * executed once.
 * @param {int}     x    Position on the screen in pixels
 * @return {Date}   time The datetime the corresponds with given position x
 */
links.Timeline.prototype.screenToTime = function(x) {
    var conversion = this.conversion,
        time = new Date(parseFloat(x) / conversion.factor + conversion.offset);
    return time;
};

/**
 * Convert a datetime (Date object) into a position on the screen
 * Before this method can be used, the method calcConversionFactor must be
 * executed once.
 * @param {Date}   time A date
 * @return {int}   x    The position on the screen in pixels which corresponds
 *                      with the given date.
 */
links.Timeline.prototype.timeToScreen = function(time) {
    var conversion = this.conversion;
    var x = (time.valueOf() - conversion.offset) * conversion.factor;
    return x;
};



/**
 * Event handler for touchstart event on mobile devices
 */
links.Timeline.prototype.onTouchStart = function(event) {
    var params = this.eventParams,
        me = this;

    if (params.touchDown) {
        // if already moving, return
        return;
    }

    params.touchDown = true;
    params.zoomed = false;

    this.onMouseDown(event);

    if (!params.onTouchMove) {
        params.onTouchMove = function (event) {me.onTouchMove(event);};
        links.Timeline.addEventListener(document, "touchmove", params.onTouchMove);
    }
    if (!params.onTouchEnd) {
        params.onTouchEnd  = function (event) {me.onTouchEnd(event);};
        links.Timeline.addEventListener(document, "touchend",  params.onTouchEnd);
    }

    /* TODO
    // check for double tap event
    var delta = 500; // ms
    var doubleTapStart = (new Date()).getTime();
    var target = links.Timeline.getTarget(event);
    var doubleTapItem = this.getItemIndex(target);
    if (params.doubleTapStart &&
            (doubleTapStart - params.doubleTapStart) < delta &&
            doubleTapItem == params.doubleTapItem) {
        delete params.doubleTapStart;
        delete params.doubleTapItem;
        me.onDblClick(event);
        params.touchDown = false;
    }
    params.doubleTapStart = doubleTapStart;
    params.doubleTapItem = doubleTapItem;
    */
    // store timing for double taps
    var target = links.Timeline.getTarget(event);
    var item = this.getItemIndex(target);
    params.doubleTapStartPrev = params.doubleTapStart;
    params.doubleTapStart = (new Date()).getTime();
    params.doubleTapItemPrev = params.doubleTapItem;
    params.doubleTapItem = item;

    links.Timeline.preventDefault(event);
};

/**
 * Event handler for touchmove event on mobile devices
 */
links.Timeline.prototype.onTouchMove = function(event) {
    var params = this.eventParams;

    if (event.scale && event.scale !== 1) {
        params.zoomed = true;
    }

    if (!params.zoomed) {
        // move 
        this.onMouseMove(event);
    }
    else {
        if (this.options.zoomable) {
            // pinch
            // TODO: pinch only supported on iPhone/iPad. Create something manually for Android?
            params.zoomed = true;

            var scale = event.scale,
                oldWidth = (params.end.valueOf() - params.start.valueOf()),
                newWidth = oldWidth / scale,
                diff = newWidth - oldWidth,
                start = new Date(parseInt(params.start.valueOf() - diff/2)),
                end = new Date(parseInt(params.end.valueOf() + diff/2));

            // TODO: determine zoom-around-date from touch positions?

            this.setVisibleChartRange(start, end);
            this.trigger("rangechange");
        }
    }

    links.Timeline.preventDefault(event);
};

/**
 * Event handler for touchend event on mobile devices
 */
links.Timeline.prototype.onTouchEnd = function(event) {
    var params = this.eventParams;
    var me = this;
    params.touchDown = false;

    if (params.zoomed) {
        this.trigger("rangechanged");
    }

    if (params.onTouchMove) {
        links.Timeline.removeEventListener(document, "touchmove", params.onTouchMove);
        delete params.onTouchMove;

    }
    if (params.onTouchEnd) {
        links.Timeline.removeEventListener(document, "touchend",  params.onTouchEnd);
        delete params.onTouchEnd;
    }

    this.onMouseUp(event);

    // check for double tap event
    var delta = 500; // ms
    var doubleTapEnd = (new Date()).getTime();
    var target = links.Timeline.getTarget(event);
    var doubleTapItem = this.getItemIndex(target);
    if (params.doubleTapStartPrev &&
        (doubleTapEnd - params.doubleTapStartPrev) < delta &&
        params.doubleTapItem == params.doubleTapItemPrev) {
        params.touchDown = true;
        me.onDblClick(event);
        params.touchDown = false;
    }

    links.Timeline.preventDefault(event);
};


/**
 * Start a moving operation inside the provided parent element
 * @param {event} event       The event that occurred (required for
 *                             retrieving the  mouse position)
 */
links.Timeline.prototype.onMouseDown = function(event) {
    event = event || window.event;

    var params = this.eventParams,
        options = this.options,
        dom = this.dom;

    // only react on left mouse button down
    var leftButtonDown = event.which ? (event.which == 1) : (event.button == 1);
    if (!leftButtonDown && !params.touchDown) {
        return;
    }

    // get mouse position
    if (!params.touchDown) {
        params.mouseX = event.clientX;
        params.mouseY = event.clientY;
    }
    else {
        params.mouseX = event.targetTouches[0].clientX;
        params.mouseY = event.targetTouches[0].clientY;
    }
    if (params.mouseX === undefined) {params.mouseX = 0;}
    if (params.mouseY === undefined) {params.mouseY = 0;}
    params.frameLeft = links.Timeline.getAbsoluteLeft(this.dom.content);
    params.frameTop = links.Timeline.getAbsoluteTop(this.dom.content);
    params.previousLeft = 0;
    params.previousOffset = 0;

    params.moved = false;
    params.start = new Date(this.start);
    params.end = new Date(this.end);

    params.target = links.Timeline.getTarget(event);
    var dragLeft = (dom.items && dom.items.dragLeft) ? dom.items.dragLeft : undefined;
    var dragRight = (dom.items && dom.items.dragRight) ? dom.items.dragRight : undefined;
    params.itemDragLeft = (params.target === dragLeft);
    params.itemDragRight = (params.target === dragRight);

    if (params.itemDragLeft || params.itemDragRight) {
        params.itemIndex = this.selection.length ? this.selection[0].index : undefined;
    }
    else {
        params.itemIndex = this.getItemIndex(params.target);
    }

    params.customTime = (params.target === dom.customTime ||
        params.target.parentNode === dom.customTime) ?
        this.customTime :
        undefined;

    params.addItem = (options.editable && event.ctrlKey);
    if (params.addItem) {
        // create a new event at the current mouse position
        var x = params.mouseX - params.frameLeft;
        var y = params.mouseY - params.frameTop;

        var xstart = this.screenToTime(x);
        if (options.snapEvents) {
            this.step.snap(xstart);
        }
        var xend = new Date(xstart);
        var content = "New";
        var group = this.getGroupFromHeight(y);
        this.addItem({
            'start': xstart,
            'end': xend,
            'content': content,
            'group': this.getGroupName(group)
        });
        params.itemIndex = (this.items.length - 1);
        this.selectItems([params.itemIndex]);
        params.itemDragRight = true;
    }

    var item = this.items[params.itemIndex];
    var isSelected = this.isSelected(params.itemIndex);
    params.editItem = isSelected && this.isEditable(item);
    if (params.editItem) {
        params.itemStart = item.start;
        params.itemEnd = item.end;
        params.itemGroup = item.group;
        params.itemLeft = item.start ? this.timeToScreen(item.start) : undefined;
        params.itemRight = item.end ? this.timeToScreen(item.end) : undefined;
    }
    else {
        this.dom.frame.style.cursor = 'move';
    }
    if (!params.touchDown) {
        // add event listeners to handle moving the contents
        // we store the function onmousemove and onmouseup in the timeline, so we can
        // remove the eventlisteners lateron in the function mouseUp()
        var me = this;
        if (!params.onMouseMove) {
            params.onMouseMove = function (event) {me.onMouseMove(event);};
            links.Timeline.addEventListener(document, "mousemove", params.onMouseMove);
        }
        if (!params.onMouseUp) {
            params.onMouseUp = function (event) {me.onMouseUp(event);};
            links.Timeline.addEventListener(document, "mouseup", params.onMouseUp);
        }

        links.Timeline.preventDefault(event);
    }
};


/**
 * Perform moving operating.
 * This function activated from within the funcion links.Timeline.onMouseDown().
 * @param {event}   event  Well, eehh, the event
 */
links.Timeline.prototype.onMouseMove = function (event) {
    event = event || window.event;

    var params = this.eventParams,
        size = this.size,
        dom = this.dom,
        options = this.options;

    // calculate change in mouse position
    var mouseX, mouseY;
    if (!params.touchDown) {
        mouseX = event.clientX;
        mouseY = event.clientY;
    }
    else {
        mouseX = event.targetTouches[0].clientX;
        mouseY = event.targetTouches[0].clientY;
    }
    if (mouseX === undefined) {mouseX = 0;}
    if (mouseY === undefined) {mouseY = 0;}

    if (params.mouseX === undefined) {
        params.mouseX = mouseX;
    }
    if (params.mouseY === undefined) {
        params.mouseY = mouseY;
    }

    var diffX = parseFloat(mouseX) - params.mouseX;
    var diffY = parseFloat(mouseY) - params.mouseY;

    // if mouse movement is big enough, register it as a "moved" event
    if (Math.abs(diffX) >= 1) {
        params.moved = true;
    }

    if (params.customTime) {
        var x = this.timeToScreen(params.customTime);
        var xnew = x + diffX;
        this.customTime = this.screenToTime(xnew);
        this.repaintCustomTime();

        // fire a timechange event
        this.trigger('timechange');
    }
    else if (params.editItem) {
        var item = this.items[params.itemIndex],
            left,
            right;

        if (params.itemDragLeft) {
            // move the start of the item
            left = params.itemLeft + diffX;
            right = params.itemRight;

            item.start = this.screenToTime(left);
            if (options.snapEvents) {
                this.step.snap(item.start);
                left = this.timeToScreen(item.start);
            }

            if (left > right) {
                left = right;
                item.start = this.screenToTime(left);
            }
        }
        else if (params.itemDragRight) {
            // move the end of the item
            left = params.itemLeft;
            right = params.itemRight + diffX;

            item.end = this.screenToTime(right);
            if (options.snapEvents) {
                this.step.snap(item.end);
                right = this.timeToScreen(item.end);
            }

            if (right < left) {
                right = left;
                item.end = this.screenToTime(right);
            }
        }
        else {
            // move the item
            left = params.itemLeft + diffX;
            item.start = this.screenToTime(left);
            if (options.snapEvents) {
                this.step.snap(item.start);
                left = this.timeToScreen(item.start);
            }

            if (item.end) {
                right = left + (params.itemRight - params.itemLeft);
                item.end = this.screenToTime(right);
            }
        }

        item.setPosition(left, right);

        if (this.groups.length == 0) {
            // TODO: does not work well in FF, forces redraw with every mouse move it seems
            this.render(); // TODO: optimize, only redraw the items?
            // Note: when animate==true, no redraw is needed here, its done by stackItems animation
        }
        else {
            // move item from one group to another when needed
            var y = mouseY - params.frameTop;
            var group = this.getGroupFromHeight(y);
            if (options.groupsChangeable && item.group !== group) {
                // move item to the other group
                var index = this.items.indexOf(item);
                this.changeItem(index, {'group': this.getGroupName(group)});
            }
            else {
                this.repaintDeleteButton();
                this.repaintDragAreas();
            }
        }
    }
    else if (options.moveable) {
        var interval = (params.end.valueOf() - params.start.valueOf());
        var diffMillisecs = Math.round(parseFloat(-diffX) / size.contentWidth * interval);
        var newStart = new Date(params.start.valueOf() + diffMillisecs);
        var newEnd = new Date(params.end.valueOf() + diffMillisecs);
        this.applyRange(newStart, newEnd);

        // if the applied range is moved due to a fixed min or max, 
        // change the diffMillisecs accordingly
        var appliedDiff = (this.start.valueOf() - newStart.valueOf());
        if (appliedDiff) {
            diffMillisecs += appliedDiff;
        }

        this.recalcConversion();

        // move the items by changing the left position of their frame.
        // this is much faster than repositioning all elements individually via the 
        // repaintFrame() function (which is done once at mouseup)
        // note that we round diffX to prevent wrong positioning on millisecond scale
        var previousLeft = params.previousLeft || 0;
        var currentLeft = parseFloat(dom.items.frame.style.left) || 0;
        var previousOffset = params.previousOffset || 0;
        var frameOffset = previousOffset + (currentLeft - previousLeft);
        var frameLeft = -diffMillisecs / interval * size.contentWidth + frameOffset;

        dom.items.frame.style.left = (frameLeft) + "px";

        // read the left again from DOM (IE8- rounds the value)
        params.previousOffset = frameOffset;
        params.previousLeft = parseFloat(dom.items.frame.style.left) || frameLeft;

        this.repaintCurrentTime();
        this.repaintCustomTime();
        this.repaintAxis();

        // fire a rangechange event
        this.trigger('rangechange');
    }

    links.Timeline.preventDefault(event);
};


/**
 * Stop moving operating.
 * This function activated from within the funcion links.Timeline.onMouseDown().
 * @param {event}  event   The event
 */
links.Timeline.prototype.onMouseUp = function (event) {
    var params = this.eventParams,
        options = this.options;

    event = event || window.event;

    this.dom.frame.style.cursor = 'auto';

    // remove event listeners here, important for Safari
    if (params.onMouseMove) {
        links.Timeline.removeEventListener(document, "mousemove", params.onMouseMove);
        delete params.onMouseMove;
    }
    if (params.onMouseUp) {
        links.Timeline.removeEventListener(document, "mouseup",   params.onMouseUp);
        delete params.onMouseUp;
    }
    //links.Timeline.preventDefault(event);

    if (params.customTime) {
        // fire a timechanged event
        this.trigger('timechanged');
    }
    else if (params.editItem) {
        var item = this.items[params.itemIndex];

        if (params.moved || params.addItem) {
            this.applyChange = true;
            this.applyAdd = true;

            this.updateData(params.itemIndex, {
                'start': item.start,
                'end': item.end
            });

            // fire an add or change event. 
            // Note that the change can be canceled from within an event listener if 
            // this listener calls the method cancelChange().
            this.trigger(params.addItem ? 'add' : 'change');

            if (params.addItem) {
                if (this.applyAdd) {
                    this.updateData(params.itemIndex, {
                        'start': item.start,
                        'end': item.end,
                        'content': item.content,
                        'group': this.getGroupName(item.group)
                    });
                }
                else {
                    // undo an add
                    this.deleteItem(params.itemIndex);
                }
            }
            else {
                if (this.applyChange) {
                    this.updateData(params.itemIndex, {
                        'start': item.start,
                        'end': item.end
                    });
                }
                else {
                    // undo a change
                    delete this.applyChange;
                    delete this.applyAdd;

                    var item = this.items[params.itemIndex],
                        domItem = item.dom;

                    item.start = params.itemStart;
                    item.end = params.itemEnd;
                    item.group = params.itemGroup;
                    // TODO: original group should be restored too
                    item.setPosition(params.itemLeft, params.itemRight);
                }
            }

            this.render();
        }
    }
    else {
        if (!params.moved && !params.zoomed) {
            // mouse did not move -> user has selected an item

            if (params.target === this.dom.items.deleteButton) {
                // delete item
                if (this.selection.length) {
                    this.confirmDeleteItem(this.selection[0].index);
                }
            }
            else if (options.selectable) {
                // select/unselect item
                if (params.itemIndex !== undefined) {
                    if (!this.isSelected(params.itemIndex)) {
                        if (event.ctrlKey)
                        {
                            var curSelection = this.getSelection();
                            var selectionIndexes = [];
                            for (var i = 0; i < curSelection.length; i++)
                                selectionIndexes.push(curSelection[i].row);
                            selectionIndexes.push(params.itemIndex);
                            this.selectItems(selectionIndexes);
                        }
                        else
                        {
                            this.selectItems([params.itemIndex]);
                        }
                        this.trigger('select');
                    }
                }
                else {
                    this.unselectItems();
                    this.trigger('select');
                }
            }
        }
        else {
            // timeline is moved
            // TODO: optimize: no need to reflow and cluster again?
            this.render();

            if ((params.moved && options.moveable) || (params.zoomed && options.zoomable) ) {
                // fire a rangechanged event
                this.trigger('rangechanged');
            }
        }
    }
};

/**
 * Double click event occurred for an item
 * @param {event}  event
 */
links.Timeline.prototype.onDblClick = function (event) {
    var params = this.eventParams,
        options = this.options,
        dom = this.dom,
        size = this.size;
    event = event || window.event;

    if (params.itemIndex !== undefined) {
        var item = this.items[params.itemIndex];
        if (item && this.isEditable(item)) {
            // fire the edit event
            this.trigger('edit');
        }
    }
    else {
        if (options.editable) {
            // create a new item

            // get mouse position
            if (!params.touchDown) {
                params.mouseX = event.clientX;
                params.mouseY = event.clientY;
            }
            if (params.mouseX === undefined) {params.mouseX = 0;}
            if (params.mouseY === undefined) {params.mouseY = 0;}
            var x = params.mouseX - links.Timeline.getAbsoluteLeft(dom.content);
            var y = params.mouseY - links.Timeline.getAbsoluteTop(dom.content);

            // create a new event at the current mouse position
            var xstart = this.screenToTime(x);
            var xend = this.screenToTime(x  + size.frameWidth / 10); // add 10% of timeline width
            if (options.snapEvents) {
                this.step.snap(xstart);
                this.step.snap(xend);
            }

            var content = "New";
            var group = this.getGroupFromHeight(y);   // (group may be undefined)
            this.addItem({
                'start': xstart,
                'end': xend,
                'content': content,
                'group': this.getGroupName(group)
            });
            params.itemIndex = (this.items.length - 1);
            this.selectItems([params.itemIndex]);

            this.applyAdd = true;

            // fire an add event.
            // Note that the change can be canceled from within an event listener if
            // this listener calls the method cancelAdd().
            this.trigger('add');

            if (!this.applyAdd) {
                // undo an add
                this.deleteItem(params.itemIndex);
            }
        }
    }

    links.Timeline.preventDefault(event);
};


/**
 * Event handler for mouse wheel event, used to zoom the timeline
 * Code from http://adomas.org/javascript-mouse-wheel/
 * @param {event}  event   The event
 */
links.Timeline.prototype.onMouseWheel = function(event) {
    if (!this.options.zoomable)
        return;

    if (!event) { /* For IE. */
        event = window.event;
    }

    // retrieve delta    
    var delta = 0;
    if (event.wheelDelta) { /* IE/Opera. */
        delta = event.wheelDelta/120;
    } else if (event.detail) { /* Mozilla case. */
        // In Mozilla, sign of delta is different than in IE.
        // Also, delta is multiple of 3.
        delta = -event.detail/3;
    }

    // If delta is nonzero, handle it.
    // Basically, delta is now positive if wheel was scrolled up,
    // and negative, if wheel was scrolled down.
    if (delta) {
        // TODO: on FireFox, the window is not redrawn within repeated scroll-events 
        // -> use a delayed redraw? Make a zoom queue?

        var timeline = this;
        var zoom = function () {
            // perform the zoom action. Delta is normally 1 or -1
            var zoomFactor = delta / 5.0;
            var frameLeft = links.Timeline.getAbsoluteLeft(timeline.dom.content);
            var zoomAroundDate =
                (event.clientX != undefined && frameLeft != undefined) ?
                    timeline.screenToTime(event.clientX - frameLeft) :
                    undefined;

            timeline.zoom(zoomFactor, zoomAroundDate);

            // fire a rangechange and a rangechanged event
            timeline.trigger("rangechange");
            timeline.trigger("rangechanged");

            /* TODO: smooth scrolling on FF
             timeline.zooming = false;

             if (timeline.zoomingQueue) {
             setTimeout(timeline.zoomingQueue, 100);
             timeline.zoomingQueue = undefined;
             }

             timeline.zoomCount = (timeline.zoomCount || 0) + 1;
             console.log('zoomCount', timeline.zoomCount)
             */
        };

        zoom();

        /* TODO: smooth scrolling on FF
         if (!timeline.zooming || true) {

         timeline.zooming = true;
         setTimeout(zoom, 100);
         }
         else {
         timeline.zoomingQueue = zoom;
         }
         //*/
    }

    // Prevent default actions caused by mouse wheel.
    // That might be ugly, but we handle scrolls somehow
    // anyway, so don't bother here...
    links.Timeline.preventDefault(event);
};


/**
 * Zoom the timeline the given zoomfactor in or out. Start and end date will
 * be adjusted, and the timeline will be redrawn. You can optionally give a
 * date around which to zoom.
 * For example, try zoomfactor = 0.1 or -0.1
 * @param {Number} zoomFactor      Zooming amount. Positive value will zoom in,
 *                                 negative value will zoom out
 * @param {Date}   zoomAroundDate  Date around which will be zoomed. Optional
 */
links.Timeline.prototype.zoom = function(zoomFactor, zoomAroundDate) {
    // if zoomAroundDate is not provided, take it half between start Date and end Date
    if (zoomAroundDate == undefined) {
        zoomAroundDate = new Date((this.start.valueOf() + this.end.valueOf()) / 2);
    }

    // prevent zoom factor larger than 1 or smaller than -1 (larger than 1 will
    // result in a start>=end )
    if (zoomFactor >= 1) {
        zoomFactor = 0.9;
    }
    if (zoomFactor <= -1) {
        zoomFactor = -0.9;
    }

    // adjust a negative factor such that zooming in with 0.1 equals zooming
    // out with a factor -0.1
    if (zoomFactor < 0) {
        zoomFactor = zoomFactor / (1 + zoomFactor);
    }

    // zoom start Date and end Date relative to the zoomAroundDate
    var startDiff = parseFloat(this.start.valueOf() - zoomAroundDate.valueOf());
    var endDiff = parseFloat(this.end.valueOf() - zoomAroundDate.valueOf());

    // calculate new dates
    var newStart = new Date(this.start.valueOf() - startDiff * zoomFactor);
    var newEnd   = new Date(this.end.valueOf() - endDiff * zoomFactor);

    this.applyRange(newStart, newEnd, zoomAroundDate);

    this.render({
        animate: this.options.animate && this.options.animateZoom
    });
};

/**
 * Move the timeline the given movefactor to the left or right. Start and end
 * date will be adjusted, and the timeline will be redrawn.
 * For example, try moveFactor = 0.1 or -0.1
 * @param {Number}  moveFactor      Moving amount. Positive value will move right,
 *                                 negative value will move left
 */
links.Timeline.prototype.move = function(moveFactor) {
    // zoom start Date and end Date relative to the zoomAroundDate
    var diff = parseFloat(this.end.valueOf() - this.start.valueOf());

    // apply new dates
    var newStart = new Date(this.start.valueOf() + diff * moveFactor);
    var newEnd   = new Date(this.end.valueOf() + diff * moveFactor);
    this.applyRange(newStart, newEnd);

    this.render(); // TODO: optimize, no need to reflow, only to recalc conversion and repaint
};

/**
 * Apply a visible range. The range is limited to feasible maximum and minimum
 * range.
 * @param {Date} start
 * @param {Date} end
 * @param {Date}   zoomAroundDate  Optional. Date around which will be zoomed.
 */
links.Timeline.prototype.applyRange = function (start, end, zoomAroundDate) {
    // calculate new start and end value
    var startValue = start.valueOf();
    var endValue = end.valueOf();
    var interval = (endValue - startValue);

    // determine maximum and minimum interval
    var options = this.options;
    var year = 1000 * 60 * 60 * 24 * 365;
    var intervalMin = Number(options.intervalMin) || 10;
    if (intervalMin < 10) {
        intervalMin = 10;
    }
    var intervalMax = Number(options.intervalMax) || 10000 * year;
    if (intervalMax > 10000 * year) {
        intervalMax = 10000 * year;
    }
    if (intervalMax < intervalMin) {
        intervalMax = intervalMin;
    }

    // determine min and max date value
    var min = options.min ? options.min.valueOf() : undefined;
    var max = options.max ? options.max.valueOf() : undefined;
    if (min != undefined && max != undefined) {
        if (min >= max) {
            // empty range
            var day = 1000 * 60 * 60 * 24;
            max = min + day;
        }
        if (intervalMax > (max - min)) {
            intervalMax = (max - min);
        }
        if (intervalMin > (max - min)) {
            intervalMin = (max - min);
        }
    }

    // prevent empty interval
    if (startValue >= endValue) {
        endValue += 1000 * 60 * 60 * 24;
    }

    // prevent too small scale
    // TODO: IE has problems with milliseconds
    if (interval < intervalMin) {
        var diff = (intervalMin - interval);
        var f = zoomAroundDate ? (zoomAroundDate.valueOf() - startValue) / interval : 0.5;
        startValue -= Math.round(diff * f);
        endValue   += Math.round(diff * (1 - f));
    }

    // prevent too large scale
    if (interval > intervalMax) {
        var diff = (interval - intervalMax);
        var f = zoomAroundDate ? (zoomAroundDate.valueOf() - startValue) / interval : 0.5;
        startValue += Math.round(diff * f);
        endValue   -= Math.round(diff * (1 - f));
    }

    // prevent to small start date
    if (min != undefined) {
        var diff = (startValue - min);
        if (diff < 0) {
            startValue -= diff;
            endValue -= diff;
        }
    }

    // prevent to large end date
    if (max != undefined) {
        var diff = (max - endValue);
        if (diff < 0) {
            startValue += diff;
            endValue += diff;
        }
    }

    // apply new dates
    this.start = new Date(startValue);
    this.end = new Date(endValue);
};

/**
 * Delete an item after a confirmation.
 * The deletion can be cancelled by executing .cancelDelete() during the
 * triggered event 'delete'.
 * @param {int} index   Index of the item to be deleted
 */
links.Timeline.prototype.confirmDeleteItem = function(index) {
    this.applyDelete = true;

    // select the event to be deleted
    if (!this.isSelected(index)) {
        this.selectItems([index]);
    }

    // fire a delete event trigger. 
    // Note that the delete event can be canceled from within an event listener if 
    // this listener calls the method cancelChange().
    this.trigger('delete');

    if (this.applyDelete) {
        this.deleteItem(index);
    }

    delete this.applyDelete;
};

/**
 * Delete an item
 * @param {int} index   Index of the item to be deleted
 * @param {boolean} [preventRender=false]   Do not re-render timeline if true (optimization for multiple delete)
 */
links.Timeline.prototype.deleteItem = function(index, preventRender) {
    if (index >= this.items.length) {
        throw "Cannot delete row, index out of range";
    }
    
    var newSelection = [];
    
    for (var i = 0; i < this.selection.length; i++) {
        var curIndex = this.selection[i].index;
        if (curIndex !== index) {
            if (curIndex > index) {
                curIndex--;
            }
            newSelection.push({row: curIndex});
        }
    }

    // actually delete the item and remove it from the DOM
    var item = this.items.splice(index, 1)[0];
    this.renderQueue.hide.push(item);

    // delete the row in the original data table
    if (this.data) {
        if (google && google.visualization &&
            this.data instanceof google.visualization.DataTable) {
            this.data.removeRow(index);
        }
        else if (links.Timeline.isArray(this.data)) {
            this.data.splice(index, 1);
        }
        else {
            throw "Cannot delete row from data, unknown data type";
        }
    }
    
    if (this.selection.length > 0) {
        this.setSelection(newSelection, true);
    }

    if (!preventRender) {
        this.render();
    }
};


/**
 * Delete all items
 */
links.Timeline.prototype.deleteAllItems = function() {
    this.unselectItems();

    // delete the loaded items
    this.clearItems();

    // delete the groups
    this.deleteGroups();

    // empty original data table
    if (this.data) {
        if (google && google.visualization &&
            this.data instanceof google.visualization.DataTable) {
            this.data.removeRows(0, this.data.getNumberOfRows());
        }
        else if (links.Timeline.isArray(this.data)) {
            this.data.splice(0, this.data.length);
        }
        else {
            throw "Cannot delete row from data, unknown data type";
        }
    }

    this.render();
};


/**
 * Find the group from a given height in the timeline
 * @param {Number} height   Height in the timeline
 * @return {Object | undefined} group   The group object, or undefined if out
 *                                      of range
 */
links.Timeline.prototype.getGroupFromHeight = function(height) {
    var i,
        group,
        groups = this.groups;

    if (groups) {
        if (this.options.axisOnTop) {
            for (i = groups.length - 1; i >= 0; i--) {
                group = groups[i];
                if (height > group.top) {
                    return group;
                }
            }
        }
        else {
            for (i = 0; i < groups.length; i++) {
                group = groups[i];
                if (height > group.top) {
                    return group;
                }
            }
        }

        return group; // return the last group
    }

    return undefined;
};

/**
 * @constructor links.Timeline.Item
 * @param {Object} data       Object containing parameters start, end
 *                            content, group. type, group.
 * @param {Object} [options]  Options to set initial property values
 *                                {Number} top
 *                                {Number} left
 *                                {Number} width
 *                                {Number} height
 */
links.Timeline.Item = function (data, options) {
    if (data) {
        this.start = data.start;
        this.end = data.end;
        this.content = data.content;
        this.className = data.className;
        this.editable = data.editable;
        this.group = data.group;

        if (this.start) {
            if (this.end) {
                // range
                this.center = (this.start.valueOf() + this.end.valueOf()) / 2;
            }
            else {
                // box, dot
                this.center = this.start.valueOf();
            }
        }
    }
    this.top = 0;
    this.left = 0;
    this.width = 0;
    this.height = 0;
    this.lineWidth = 0;
    this.dotWidth = 0;
    this.dotHeight = 0;

    this.rendered = false; // true when the item is draw in the Timeline DOM

    if (options) {
        // override the default properties
        for (var option in options) {
            if (options.hasOwnProperty(option)) {
                this[option] = options[option];
            }
        }
    }

};

/**
 * Reflow the Item: retrieve its actual size from the DOM
 * @return {boolean} resized    returns true if the axis is resized
 */
links.Timeline.Item.prototype.reflow = function () {
    // Should be implemented by sub-prototype
    return false;
};

/**
 * Append all image urls present in the items DOM to the provided array
 * @param {String[]} imageUrls
 */
links.Timeline.Item.prototype.getImageUrls = function (imageUrls) {
    if (this.dom) {
        links.imageloader.filterImageUrls(this.dom, imageUrls);
    }
};

/**
 * Select the item
 */
links.Timeline.Item.prototype.select = function () {
    // Should be implemented by sub-prototype
};

/**
 * Unselect the item
 */
links.Timeline.Item.prototype.unselect = function () {
    // Should be implemented by sub-prototype
};

/**
 * Creates the DOM for the item, depending on its type
 * @return {Element | undefined}
 */
links.Timeline.Item.prototype.createDOM = function () {
    // Should be implemented by sub-prototype
};

/**
 * Append the items DOM to the given HTML container. If items DOM does not yet
 * exist, it will be created first.
 * @param {Element} container
 */
links.Timeline.Item.prototype.showDOM = function (container) {
    // Should be implemented by sub-prototype
};

/**
 * Remove the items DOM from the current HTML container
 * @param {Element} container
 */
links.Timeline.Item.prototype.hideDOM = function (container) {
    // Should be implemented by sub-prototype
};

/**
 * Update the DOM of the item. This will update the content and the classes
 * of the item
 */
links.Timeline.Item.prototype.updateDOM = function () {
    // Should be implemented by sub-prototype
};

/**
 * Reposition the item, recalculate its left, top, and width, using the current
 * range of the timeline and the timeline options.
 * @param {links.Timeline} timeline
 */
links.Timeline.Item.prototype.updatePosition = function (timeline) {
    // Should be implemented by sub-prototype
};

/**
 * Check if the item is drawn in the timeline (i.e. the DOM of the item is
 * attached to the frame. You may also just request the parameter item.rendered
 * @return {boolean} rendered
 */
links.Timeline.Item.prototype.isRendered = function () {
    return this.rendered;
};

/**
 * Check if the item is located in the visible area of the timeline, and
 * not part of a cluster
 * @param {Date} start
 * @param {Date} end
 * @return {boolean} visible
 */
links.Timeline.Item.prototype.isVisible = function (start, end) {
    // Should be implemented by sub-prototype
    return false;
};

/**
 * Reposition the item
 * @param {Number} left
 * @param {Number} right
 */
links.Timeline.Item.prototype.setPosition = function (left, right) {
    // Should be implemented by sub-prototype
};

/**
 * Calculate the right position of the item
 * @param {links.Timeline} timeline
 * @return {Number} right
 */
links.Timeline.Item.prototype.getRight = function (timeline) {
    // Should be implemented by sub-prototype
    return 0;
};


/**
 * @constructor links.Timeline.ItemBox
 * @extends links.Timeline.Item
 * @param {Object} data       Object containing parameters start, end
 *                            content, group. type, group.
 * @param {Object} [options]  Options to set initial property values
 *                                {Number} top
 *                                {Number} left
 *                                {Number} width
 *                                {Number} height
 */
links.Timeline.ItemBox = function (data, options) {
    links.Timeline.Item.call(this, data, options);
};

links.Timeline.ItemBox.prototype = new links.Timeline.Item();

/**
 * Reflow the Item: retrieve its actual size from the DOM
 * @return {boolean} resized    returns true if the axis is resized
 * @override
 */
links.Timeline.ItemBox.prototype.reflow = function () {
    var dom = this.dom,
        dotHeight = dom.dot.offsetHeight,
        dotWidth = dom.dot.offsetWidth,
        lineWidth = dom.line.offsetWidth,
        resized = (
            (this.dotHeight != dotHeight) ||
            (this.dotWidth != dotWidth) ||
            (this.lineWidth != lineWidth)
        );

    this.dotHeight = dotHeight;
    this.dotWidth = dotWidth;
    this.lineWidth = lineWidth;

    return resized;
};

/**
 * Select the item
 * @override
 */
links.Timeline.ItemBox.prototype.select = function () {
    var dom = this.dom;
    links.Timeline.addClassName(dom, 'timeline-event-selected');
    links.Timeline.addClassName(dom.line, 'timeline-event-selected');
    links.Timeline.addClassName(dom.dot, 'timeline-event-selected');
};

/**
 * Unselect the item
 * @override
 */
links.Timeline.ItemBox.prototype.unselect = function () {
    var dom = this.dom;
    links.Timeline.removeClassName(dom, 'timeline-event-selected');
    links.Timeline.removeClassName(dom.line, 'timeline-event-selected');
    links.Timeline.removeClassName(dom.dot, 'timeline-event-selected');
};

/**
 * Creates the DOM for the item, depending on its type
 * @return {Element | undefined}
 * @override
 */
links.Timeline.ItemBox.prototype.createDOM = function () {
    // background box
    var divBox = document.createElement("DIV");
    divBox.style.position = "absolute";
    divBox.style.left = this.left + "px";
    divBox.style.top = this.top + "px";

    // contents box (inside the background box). used for making margins
    var divContent = document.createElement("DIV");
    divContent.className = "timeline-event-content";
    divContent.innerHTML = this.content;
    divBox.appendChild(divContent);

    // line to axis
    var divLine = document.createElement("DIV");
    divLine.style.position = "absolute";
    divLine.style.width = "0px";
    // important: the vertical line is added at the front of the list of elements,
    // so it will be drawn behind all boxes and ranges
    divBox.line = divLine;

    // dot on axis
    var divDot = document.createElement("DIV");
    divDot.style.position = "absolute";
    divDot.style.width  = "0px";
    divDot.style.height = "0px";
    divBox.dot = divDot;

    this.dom = divBox;
    this.updateDOM();

    return divBox;
};

/**
 * Append the items DOM to the given HTML container. If items DOM does not yet
 * exist, it will be created first.
 * @param {Element} container
 * @override
 */
links.Timeline.ItemBox.prototype.showDOM = function (container) {
    var dom = this.dom;
    if (!dom) {
        dom = this.createDOM();
    }

    if (dom.parentNode != container) {
        if (dom.parentNode) {
            // container is changed. remove from old container
            this.hideDOM();
        }

        // append to this container
        container.appendChild(dom);
        container.insertBefore(dom.line, container.firstChild);
        // Note: line must be added in front of the this,
        //       such that it stays below all this
        container.appendChild(dom.dot);
        this.rendered = true;
    }
};

/**
 * Remove the items DOM from the current HTML container, but keep the DOM in
 * memory
 * @override
 */
links.Timeline.ItemBox.prototype.hideDOM = function () {
    var dom = this.dom;
    if (dom) {
        var parent = dom.parentNode;
        if (parent) {
            parent.removeChild(dom);
            parent.removeChild(dom.line);
            parent.removeChild(dom.dot);
            this.rendered = false;
        }
    }
};

/**
 * Update the DOM of the item. This will update the content and the classes
 * of the item
 * @override
 */
links.Timeline.ItemBox.prototype.updateDOM = function () {
    var divBox = this.dom;
    if (divBox) {
        var divLine = divBox.line;
        var divDot = divBox.dot;

        // update contents
        divBox.firstChild.innerHTML = this.content;

        // update class
        divBox.className = "timeline-event timeline-event-box";
        divLine.className = "timeline-event timeline-event-line";
        divDot.className  = "timeline-event timeline-event-dot";

        if (this.isCluster) {
            links.Timeline.addClassName(divBox, 'timeline-event-cluster');
            links.Timeline.addClassName(divLine, 'timeline-event-cluster');
            links.Timeline.addClassName(divDot, 'timeline-event-cluster');
        }

        // add item specific class name when provided
        if (this.className) {
            links.Timeline.addClassName(divBox, this.className);
            links.Timeline.addClassName(divLine, this.className);
            links.Timeline.addClassName(divDot, this.className);
        }

        // TODO: apply selected className?
    }
};

/**
 * Reposition the item, recalculate its left, top, and width, using the current
 * range of the timeline and the timeline options.
 * @param {links.Timeline} timeline
 * @override
 */
links.Timeline.ItemBox.prototype.updatePosition = function (timeline) {
    var dom = this.dom;
    if (dom) {
        var left = timeline.timeToScreen(this.start),
            axisOnTop = timeline.options.axisOnTop,
            axisTop = timeline.size.axis.top,
            axisHeight = timeline.size.axis.height,
            boxAlign = (timeline.options.box && timeline.options.box.align) ?
                timeline.options.box.align : undefined;

        dom.style.top = this.top + "px";
        if (boxAlign == 'right') {
            dom.style.left = (left - this.width) + "px";
        }
        else if (boxAlign == 'left') {
            dom.style.left = (left) + "px";
        }
        else { // default or 'center'
            dom.style.left = (left - this.width/2) + "px";
        }

        var line = dom.line;
        var dot = dom.dot;
        line.style.left = (left - this.lineWidth/2) + "px";
        dot.style.left = (left - this.dotWidth/2) + "px";
        if (axisOnTop) {
            line.style.top = axisHeight + "px";
            line.style.height = Math.max(this.top - axisHeight, 0) + "px";
            dot.style.top = (axisHeight - this.dotHeight/2) + "px";
        }
        else {
            line.style.top = (this.top + this.height) + "px";
            line.style.height = Math.max(axisTop - this.top - this.height, 0) + "px";
            dot.style.top = (axisTop - this.dotHeight/2) + "px";
        }
    }
};

/**
 * Check if the item is visible in the timeline, and not part of a cluster
 * @param {Date} start
 * @param {Date} end
 * @return {Boolean} visible
 * @override
 */
links.Timeline.ItemBox.prototype.isVisible = function (start, end) {
    if (this.cluster) {
        return false;
    }

    return (this.start > start) && (this.start < end);
};

/**
 * Reposition the item
 * @param {Number} left
 * @param {Number} right
 * @override
 */
links.Timeline.ItemBox.prototype.setPosition = function (left, right) {
    var dom = this.dom;

    dom.style.left = (left - this.width / 2) + "px";
    dom.line.style.left = (left - this.lineWidth / 2) + "px";
    dom.dot.style.left = (left - this.dotWidth / 2) + "px";

    if (this.group) {
        this.top = this.group.top;
        dom.style.top = this.top + 'px';
    }
};

/**
 * Calculate the right position of the item
 * @param {links.Timeline} timeline
 * @return {Number} right
 * @override
 */
links.Timeline.ItemBox.prototype.getRight = function (timeline) {
    var boxAlign = (timeline.options.box && timeline.options.box.align) ?
        timeline.options.box.align : undefined;

    var left = timeline.timeToScreen(this.start);
    var right;
    if (boxAlign == 'right') {
        right = left;
    }
    else if (boxAlign == 'left') {
        right = (left + this.width);
    }
    else { // default or 'center'
        right = (left + this.width / 2);
    }

    return right;
};

/**
 * @constructor links.Timeline.ItemRange
 * @extends links.Timeline.Item
 * @param {Object} data       Object containing parameters start, end
 *                            content, group. type, group.
 * @param {Object} [options]  Options to set initial property values
 *                                {Number} top
 *                                {Number} left
 *                                {Number} width
 *                                {Number} height
 */
links.Timeline.ItemRange = function (data, options) {
    links.Timeline.Item.call(this, data, options);
};

links.Timeline.ItemRange.prototype = new links.Timeline.Item();

/**
 * Select the item
 * @override
 */
links.Timeline.ItemRange.prototype.select = function () {
    var dom = this.dom;
    links.Timeline.addClassName(dom, 'timeline-event-selected');
};

/**
 * Unselect the item
 * @override
 */
links.Timeline.ItemRange.prototype.unselect = function () {
    var dom = this.dom;
    links.Timeline.removeClassName(dom, 'timeline-event-selected');
};

/**
 * Creates the DOM for the item, depending on its type
 * @return {Element | undefined}
 * @override
 */
links.Timeline.ItemRange.prototype.createDOM = function () {
    // background box
    var divBox = document.createElement("DIV");
    divBox.style.position = "absolute";

    // contents box
    var divContent = document.createElement("DIV");
    divContent.className = "timeline-event-content";
    divBox.appendChild(divContent);

    this.dom = divBox;
    this.updateDOM();

    return divBox;
};

/**
 * Append the items DOM to the given HTML container. If items DOM does not yet
 * exist, it will be created first.
 * @param {Element} container
 * @override
 */
links.Timeline.ItemRange.prototype.showDOM = function (container) {
    var dom = this.dom;
    if (!dom) {
        dom = this.createDOM();
    }

    if (dom.parentNode != container) {
        if (dom.parentNode) {
            // container changed. remove the item from the old container
            this.hideDOM();
        }

        // append to the new container
        container.appendChild(dom);
        this.rendered = true;
    }
};

/**
 * Remove the items DOM from the current HTML container
 * The DOM will be kept in memory
 * @override
 */
links.Timeline.ItemRange.prototype.hideDOM = function () {
    var dom = this.dom;
    if (dom) {
        var parent = dom.parentNode;
        if (parent) {
            parent.removeChild(dom);
            this.rendered = false;
        }
    }
};

/**
 * Update the DOM of the item. This will update the content and the classes
 * of the item
 * @override
 */
links.Timeline.ItemRange.prototype.updateDOM = function () {
    var divBox = this.dom;
    if (divBox) {
        // update contents
        divBox.firstChild.innerHTML = this.content;

        // update class
        divBox.className = "timeline-event timeline-event-range";

        if (this.isCluster) {
            links.Timeline.addClassName(divBox, 'timeline-event-cluster');
        }

        // add item specific class name when provided
        if (this.className) {
            links.Timeline.addClassName(divBox, this.className);
        }

        // TODO: apply selected className?
    }
};

/**
 * Reposition the item, recalculate its left, top, and width, using the current
 * range of the timeline and the timeline options. *
 * @param {links.Timeline} timeline
 * @override
 */
links.Timeline.ItemRange.prototype.updatePosition = function (timeline) {
    var dom = this.dom;
    if (dom) {
            var contentWidth = timeline.size.contentWidth,
            left = timeline.timeToScreen(this.start),
            right = timeline.timeToScreen(this.end);

        // limit the width of the this, as browsers cannot draw very wide divs
        if (left < -contentWidth) {
            left = -contentWidth;
        }
        if (right > 2 * contentWidth) {
            right = 2 * contentWidth;
        }

        dom.style.top = this.top + "px";
        dom.style.left = left + "px";
        //dom.style.width = Math.max(right - left - 2 * this.borderWidth, 1) + "px"; // TODO: borderWidth
        dom.style.width = Math.max(right - left, 1) + "px";
    }
};

/**
 * Check if the item is visible in the timeline, and not part of a cluster
 * @param {Number} start
 * @param {Number} end
 * @return {boolean} visible
 * @override
 */
links.Timeline.ItemRange.prototype.isVisible = function (start, end) {
    if (this.cluster) {
        return false;
    }

    return (this.end > start)
        && (this.start < end);
};

/**
 * Reposition the item
 * @param {Number} left
 * @param {Number} right
 * @override
 */
links.Timeline.ItemRange.prototype.setPosition = function (left, right) {
    var dom = this.dom;

    dom.style.left = left + 'px';
    dom.style.width = (right - left) + 'px';

    if (this.group) {
        this.top = this.group.top;
        dom.style.top = this.top + 'px';
    }
};

/**
 * Calculate the right position of the item
 * @param {links.Timeline} timeline
 * @return {Number} right
 * @override
 */
links.Timeline.ItemRange.prototype.getRight = function (timeline) {
    return timeline.timeToScreen(this.end);
};

/**
 * @constructor links.Timeline.ItemDot
 * @extends links.Timeline.Item
 * @param {Object} data       Object containing parameters start, end
 *                            content, group, type.
 * @param {Object} [options]  Options to set initial property values
 *                                {Number} top
 *                                {Number} left
 *                                {Number} width
 *                                {Number} height
 */
links.Timeline.ItemDot = function (data, options) {
    links.Timeline.Item.call(this, data, options);
};

links.Timeline.ItemDot.prototype = new links.Timeline.Item();

/**
 * Reflow the Item: retrieve its actual size from the DOM
 * @return {boolean} resized    returns true if the axis is resized
 * @override
 */
links.Timeline.ItemDot.prototype.reflow = function () {
    var dom = this.dom,
        dotHeight = dom.dot.offsetHeight,
        dotWidth = dom.dot.offsetWidth,
        contentHeight = dom.content.offsetHeight,
        resized = (
            (this.dotHeight != dotHeight) ||
            (this.dotWidth != dotWidth) ||
            (this.contentHeight != contentHeight)
        );

    this.dotHeight = dotHeight;
    this.dotWidth = dotWidth;
    this.contentHeight = contentHeight;

    return resized;
};

/**
 * Select the item
 * @override
 */
links.Timeline.ItemDot.prototype.select = function () {
    var dom = this.dom;
    links.Timeline.addClassName(dom, 'timeline-event-selected');
};

/**
 * Unselect the item
 * @override
 */
links.Timeline.ItemDot.prototype.unselect = function () {
    var dom = this.dom;
    links.Timeline.removeClassName(dom, 'timeline-event-selected');
};

/**
 * Creates the DOM for the item, depending on its type
 * @return {Element | undefined}
 * @override
 */
links.Timeline.ItemDot.prototype.createDOM = function () {
    // background box
    var divBox = document.createElement("DIV");
    divBox.style.position = "absolute";

    // contents box, right from the dot
    var divContent = document.createElement("DIV");
    divContent.className = "timeline-event-content";
    divBox.appendChild(divContent);

    // dot at start
    var divDot = document.createElement("DIV");
    divDot.style.position = "absolute";
    divDot.style.width = "0px";
    divDot.style.height = "0px";
    divBox.appendChild(divDot);

    divBox.content = divContent;
    divBox.dot = divDot;

    this.dom = divBox;
    this.updateDOM();

    return divBox;
};

/**
 * Append the items DOM to the given HTML container. If items DOM does not yet
 * exist, it will be created first.
 * @param {Element} container
 * @override
 */
links.Timeline.ItemDot.prototype.showDOM = function (container) {
    var dom = this.dom;
    if (!dom) {
        dom = this.createDOM();
    }

    if (dom.parentNode != container) {
        if (dom.parentNode) {
            // container changed. remove it from old container first
            this.hideDOM();
        }

        // append to container
        container.appendChild(dom);
        this.rendered = true;
    }
};

/**
 * Remove the items DOM from the current HTML container
 * @override
 */
links.Timeline.ItemDot.prototype.hideDOM = function () {
    var dom = this.dom;
    if (dom) {
        var parent = dom.parentNode;
        if (parent) {
            parent.removeChild(dom);
            this.rendered = false;
        }
    }
};

/**
 * Update the DOM of the item. This will update the content and the classes
 * of the item
 * @override
 */
links.Timeline.ItemDot.prototype.updateDOM = function () {
    if (this.dom) {
        var divBox = this.dom;
        var divDot = divBox.dot;

        // update contents
        divBox.firstChild.innerHTML = this.content;

        // update class
        divDot.className  = "timeline-event timeline-event-dot";

        if (this.isCluster) {
            links.Timeline.addClassName(divBox, 'timeline-event-cluster');
            links.Timeline.addClassName(divDot, 'timeline-event-cluster');
        }

        // add item specific class name when provided
        if (this.className) {
            links.Timeline.addClassName(divBox, this.className);
            links.Timeline.addClassName(divDot, this.className);
        }

        // TODO: apply selected className?
    }
};

/**
 * Reposition the item, recalculate its left, top, and width, using the current
 * range of the timeline and the timeline options. *
 * @param {links.Timeline} timeline
 * @override
 */
links.Timeline.ItemDot.prototype.updatePosition = function (timeline) {
    var dom = this.dom;
    if (dom) {
        var left = timeline.timeToScreen(this.start);

        dom.style.top = this.top + "px";
        dom.style.left = (left - this.dotWidth / 2) + "px";

        dom.content.style.marginLeft = (1.5 * this.dotWidth) + "px";
        //dom.content.style.marginRight = (0.5 * this.dotWidth) + "px"; // TODO
        dom.dot.style.top = ((this.height - this.dotHeight) / 2) + "px";
    }
};

/**
 * Check if the item is visible in the timeline, and not part of a cluster.
 * @param {Date} start
 * @param {Date} end
 * @return {boolean} visible
 * @override
 */
links.Timeline.ItemDot.prototype.isVisible = function (start, end) {
    if (this.cluster) {
        return false;
    }

    return (this.start > start)
        && (this.start < end);
};

/**
 * Reposition the item
 * @param {Number} left
 * @param {Number} right
 * @override
 */
links.Timeline.ItemDot.prototype.setPosition = function (left, right) {
    var dom = this.dom;

    dom.style.left = (left - this.dotWidth / 2) + "px";

    if (this.group) {
        this.top = this.group.top;
        dom.style.top = this.top + 'px';
    }
};

/**
 * Calculate the right position of the item
 * @param {links.Timeline} timeline
 * @return {Number} right
 * @override
 */
links.Timeline.ItemDot.prototype.getRight = function (timeline) {
    return timeline.timeToScreen(this.start) + this.width;
};

/**
 * Retrieve the properties of an item.
 * @param {Number} index
 * @return {Object} properties   Object containing item properties:<br>
 *                              {Date} start (required),
 *                              {Date} end (optional),
 *                              {String} content (required),
 *                              {String} group (optional)
 */
links.Timeline.prototype.getItem = function (index) {
    if (index >= this.items.length) {
        throw "Cannot get item, index out of range";
    }

    var item = this.items[index];

    var properties = {};
    properties.start = new Date(item.start);
    if (item.end) {
        properties.end = new Date(item.end);
    }
    properties.content = item.content;
    if (item.group) {
        properties.group = this.getGroupName(item.group);
    }

    return properties;
};

/**
 * Add a new item.
 * @param {Object} itemData     Object containing item properties:<br>
 *                              {Date} start (required),
 *                              {Date} end (optional),
 *                              {String} content (required),
 *                              {String} group (optional)
 */
links.Timeline.prototype.addItem = function (itemData) {
    var itemsData = [
        itemData
    ];

    this.addItems(itemsData);
};

/**
 * Add new items.
 * @param {Array} itemsData An array containing Objects.
 *                          The objects must have the following parameters:
 *                            {Date} start,
 *                            {Date} end,
 *                            {String} content with text or HTML code,
 *                            {String} group
 */
links.Timeline.prototype.addItems = function (itemsData) {
    var timeline = this,
        items = this.items,
        queue = this.renderQueue;

    // append the items
    itemsData.forEach(function (itemData) {
        var index = items.length;
        items.push(timeline.createItem(itemData));
        timeline.updateData(index, itemData);

        // note: there is no need to add the item to the renderQueue, that
        // will be done when this.render() is executed and all items are
        // filtered again.
    });

    this.render({
        animate: false
    });
};

/**
 * Create an item object, containing all needed parameters
 * @param {Object} itemData  Object containing parameters start, end
 *                           content, group.
 * @return {Object} item
 */
links.Timeline.prototype.createItem = function(itemData) {
    var type = itemData.end ? 'range' : this.options.style;
    var data = {
        start: itemData.start,
        end: itemData.end,
        content: itemData.content,
        className: itemData.className,
        editable: itemData.editable,
        group: this.getGroup(itemData.group)
    };
    // TODO: optimize this, when creating an item, all data is copied twice...

    // TODO: is initialTop needed?
    var initialTop,
        options = this.options;
    if (options.axisOnTop) {
        initialTop = this.size.axis.height + options.eventMarginAxis + options.eventMargin / 2;
    }
    else {
        initialTop = this.size.contentHeight - options.eventMarginAxis - options.eventMargin / 2;
    }

    if (type in this.itemTypes) {
        return new this.itemTypes[type](data, {'top': initialTop})
    }

    console.log('ERROR: Unknown event style "' + type + '"');
    return new links.Timeline.Item(data, {
        'top': initialTop
    });
};

/**
 * Edit an item
 * @param {Number} index
 * @param {Object} itemData     Object containing item properties:<br>
 *                              {Date} start (required),
 *                              {Date} end (optional),
 *                              {String} content (required),
 *                              {String} group (optional)
 */
links.Timeline.prototype.changeItem = function (index, itemData) {
    var oldItem = this.items[index];
    if (!oldItem) {
        throw "Cannot change item, index out of range";
    }

    // replace item, merge the changes
    var newItem = this.createItem({
        'start':   itemData.hasOwnProperty('start') ?   itemData.start :   oldItem.start,
        'end':     itemData.hasOwnProperty('end') ?     itemData.end :     oldItem.end,
        'content': itemData.hasOwnProperty('content') ? itemData.content : oldItem.content,
        'group':   itemData.hasOwnProperty('group') ?   itemData.group :   this.getGroupName(oldItem.group)
    });
    this.items[index] = newItem;

    // append the changes to the render queue
    this.renderQueue.hide.push(oldItem);
    this.renderQueue.show.push(newItem);

    // update the original data table
    this.updateData(index, itemData);

    // redraw timeline
    this.render({
        animate: false
    });

    newItem.select();
};

/**
 * Delete all groups
 */
links.Timeline.prototype.deleteGroups = function () {
    this.groups = [];
    this.groupIndexes = {};
};


/**
 * Get a group by the group name. When the group does not exist,
 * it will be created.
 * @param {String} groupName   the name of the group
 * @return {Object} groupObject
 */
links.Timeline.prototype.getGroup = function (groupName) {
    var groups = this.groups,
        groupIndexes = this.groupIndexes,
        groupObj = undefined;

    var groupIndex = groupIndexes[groupName];
    if (groupIndex === undefined && groupName !== undefined) {
        groupObj = {
            'content': groupName,
            'labelTop': 0,
            'lineTop': 0
            // note: this object will lateron get addition information, 
            //       such as height and width of the group         
        };
        groups.push(groupObj);
        // sort the groups
        groups = groups.sort(function (a, b) {
            if (a.content > b.content) {
                return 1;
            }
            if (a.content < b.content) {
                return -1;
            }
            return 0;
        });

        // rebuilt the groupIndexes
        for (var i = 0, iMax = groups.length; i < iMax; i++) {
            groupIndexes[groups[i].content] = i;
        }
    }
    else {
        groupObj = groups[groupIndex];
    }

    return groupObj;
};

/**
 * Get the group name from a group object.
 * @param {Object} groupObject
 * @return {String} groupName   the name of the group, or undefined when group
 *                              was not provided
 */
links.Timeline.prototype.getGroupName = function (groupObj) {
    return groupObj ? groupObj.content : undefined;
}

/**
 * Cancel a change item
 * This method can be called insed an event listener which catches the "change"
 * event. The changed event position will be undone.
 */
links.Timeline.prototype.cancelChange = function () {
    this.applyChange = false;
};

/**
 * Cancel deletion of an item
 * This method can be called insed an event listener which catches the "delete"
 * event. Deletion of the event will be undone.
 */
links.Timeline.prototype.cancelDelete = function () {
    this.applyDelete = false;
};


/**
 * Cancel creation of a new item
 * This method can be called insed an event listener which catches the "new"
 * event. Creation of the new the event will be undone.
 */
links.Timeline.prototype.cancelAdd = function () {
    this.applyAdd = false;
};


/**
 * Select an event. The visible chart range will be moved such that the selected
 * event is placed in the middle.
 * For example selection = [{row: 5}];
 * @param {Array} selection   An array with a column row, containing the row
 *                            number (the id) of the event to be selected.
 * @param {boolean} holdPosition  Do not adjust timeline position to fit selection to screen
 * @return {boolean}         true if selection is succesfully set, else false.
 */
links.Timeline.prototype.setSelection = function(selection, holdPosition) {
    if (selection.length > 0) {
        
        var minDate = Infinity,
            maxDate = -Infinity, 
            i, 
            indexes = [];
        
        for (i = 0; i < selection.length; i++) {
            var curIndex = selection[i].row;
            
            if (curIndex !== undefined) {
                var item = this.items[curIndex];
                var curEnd = (item.end || item.start).valueOf();
                var curStart = item.start.valueOf();
                
                minDate = Math.min(minDate, curStart);
                maxDate = Math.max(maxDate, curEnd);
                
                indexes.push(curIndex);
            }
        }
        
        this.selectItems(indexes);
        
        if (!holdPosition) {
            var middle   = new Date((maxDate + minDate)/2),
                diff     = (this.end.valueOf() - this.start.valueOf()),
                newStart = new Date(middle.valueOf() - diff/2),
                newEnd   = new Date(middle.valueOf() + diff/2);
                
            this.setVisibleChartRange(newStart, newEnd);
        }
    }
    else {
        // unselect current selection
        this.unselectItems();
    }
    return false;
};

/**
 * Retrieve the currently selected event
 * @return {Array} sel  An array with a column row, containing the row number
 *                      of the selected event. If there is no selection, an
 *                      empty array is returned.
 */
links.Timeline.prototype.getSelection = function() {
    var sel = [];
    for (var i = 0; i < this.selection.length; i++)
        sel.push({row: this.selection[i].index});

    return sel;
};


/**
 * Select items by their indexes
 * @param {Number[]} indexes
 */
links.Timeline.prototype.selectItems = function(indexes) {
    this.unselectItems();

    this.selection = [];
    
    for (var i = 0; i < indexes.length; i++)
    {
        var curIndex = indexes[i];
        if (this.items[curIndex] !== undefined) {
            var item = this.items[curIndex],
                domItem = item.dom;

            this.selection.push({
                'index': curIndex,
                'item': domItem
            });

            // TODO: move adjusting the domItem to the item itself
            if (this.isEditable(item)) {
                domItem.style.cursor = 'move';
            }
            item.select();
            this.repaintDeleteButton();
            this.repaintDragAreas();
        }
    }
};

/**
 * Check if an item is currently selected
 * @param {Number} index
 * @return {boolean} true if row is selected, else false
 */
links.Timeline.prototype.isSelected = function (index) {
    
    for (var i = 0; i < this.selection.length; i++) {
        if (this.selection[i].index === index) {
            return true;
        }
    }
    
    return false;
};

/**
 * Unselect the currently selected events (if any)
 */
links.Timeline.prototype.unselectItems = function() {
    for (var i = 0; i < this.selection.length; i++) {
        var item = this.items[this.selection[i].index];

        if (item && item.dom) {
            var domItem = item.dom;
            domItem.style.cursor = '';
            item.unselect();
        }
    }
    
    this.selection = [];
    this.repaintDeleteButton();
    this.repaintDragAreas();
};


/**
 * Stack the items such that they don't overlap. The items will have a minimal
 * distance equal to options.eventMargin.
 * @param {boolean | undefined} animate    if animate is true, the items are
 *                                         moved to their new position animated
 *                                         defaults to false.
 */
links.Timeline.prototype.stackItems = function(animate) {
    if (this.groups.length > 0) {
        // under this conditions we refuse to stack the events
        // TODO: implement support for stacking items per group
        return;
    }

    if (animate == undefined) {
        animate = false;
    }

    // calculate the order and final stack position of the items
    var stack = this.stack;
    if (!stack) {
        stack = {};
        this.stack = stack;
    }
    stack.sortedItems = this.stackOrder(this.renderedItems);
    stack.finalItems = this.stackCalculateFinal(stack.sortedItems);

    if (animate || stack.timer) {
        // move animated to the final positions
        var timeline = this;
        var step = function () {
            var arrived = timeline.stackMoveOneStep(stack.sortedItems,
                    stack.finalItems);

            timeline.repaint();

            if (!arrived) {
                stack.timer = setTimeout(step, 30);
            }
            else {
                delete stack.timer;
            }
        };

        if (!stack.timer) {
            stack.timer = setTimeout(step, 30);
        }
    }
    else {
        // move immediately to the final positions
        this.stackMoveToFinal(stack.sortedItems, stack.finalItems);
    }
};

/**
 * Cancel any running animation
 */
links.Timeline.prototype.stackCancelAnimation = function() {
    if (this.stack && this.stack.timer) {
        clearTimeout(this.stack.timer);
        delete this.stack.timer;
    }
};


/**
 * Order the items in the array this.items. The order is determined via:
 * - Ranges go before boxes and dots.
 * - The item with the oldest start time goes first
 * @param {Array} items        Array with items
 * @return {Array} sortedItems Array with sorted items
 */
links.Timeline.prototype.stackOrder = function(items) {
    // TODO: store the sorted items, to have less work later on
    var sortedItems = items.concat([]);

    var f = function (a, b) {
        if ((a instanceof links.Timeline.ItemRange) &&
                !(b instanceof links.Timeline.ItemRange)) {
            return -1;
        }

        if (!(a instanceof links.Timeline.ItemRange) &&
                (b instanceof links.Timeline.ItemRange)) {
            return 1;
        }


        return (a.left - b.left);
    };

    sortedItems.sort(f);

    return sortedItems;
};

/**
 * Adjust vertical positions of the events such that they don't overlap each
 * other.
 * @param {timeline.Item[]} items
 * @return {Object[]} finalItems
 */
links.Timeline.prototype.stackCalculateFinal = function(items) {
    var i,
        iMax,
        size = this.size,
        axisTop = size.axis.top,
        axisHeight = size.axis.height,
        options = this.options,
        axisOnTop = options.axisOnTop,
        eventMargin = options.eventMargin,
        eventMarginAxis = options.eventMarginAxis,
        finalItems = [];

    // initialize final positions
    for (i = 0, iMax = items.length; i < iMax; i++) {
        var item = items[i],
            top,
            bottom,
            height = item.height,
            width = item.width,
            right = item.getRight(this),
            left = right - width;

        if (axisOnTop) {
            top = axisHeight + eventMarginAxis + eventMargin / 2;
        }
        else {
            top = axisTop - height - eventMarginAxis - eventMargin / 2;
        }
        bottom = top + height;

        finalItems[i] = {
            'left': left,
            'top': top,
            'right': right,
            'bottom': bottom,
            'height': height,
            'item': item
        };
    }

    if (this.options.stackEvents) {
        // calculate new, non-overlapping positions
        //var items = sortedItems;
        for (i = 0, iMax = finalItems.length; i < iMax; i++) {
            //for (var i = finalItems.length - 1; i >= 0; i--) {
            var finalItem = finalItems[i];
            var collidingItem = null;
            do {
                // TODO: optimize checking for overlap. when there is a gap without items,
                //  you only need to check for items from the next item on, not from zero
                collidingItem = this.stackItemsCheckOverlap(finalItems, i, 0, i-1);
                if (collidingItem != null) {
                    // There is a collision. Reposition the event above the colliding element
                    if (axisOnTop) {
                        finalItem.top = collidingItem.top + collidingItem.height + eventMargin;
                    }
                    else {
                        finalItem.top = collidingItem.top - finalItem.height - eventMargin;
                    }
                    finalItem.bottom = finalItem.top + finalItem.height;
                }
            } while (collidingItem);
        }
    }

    return finalItems;
};


/**
 * Move the events one step in the direction of their final positions
 * @param {Array} currentItems   Array with the real items and their current
 *                               positions
 * @param {Array} finalItems     Array with objects containing the final
 *                               positions of the items
 * @return {boolean} arrived     True if all items have reached their final
 *                               location, else false
 */
links.Timeline.prototype.stackMoveOneStep = function(currentItems, finalItems) {
    var arrived = true;

    // apply new positions animated
    for (i = 0, iMax = currentItems.length; i < iMax; i++) {
        var finalItem = finalItems[i],
            item = finalItem.item;

        var topNow = parseInt(item.top);
        var topFinal = parseInt(finalItem.top);
        var diff = (topFinal - topNow);
        if (diff) {
            var step = (topFinal == topNow) ? 0 : ((topFinal > topNow) ? 1 : -1);
            if (Math.abs(diff) > 4) step = diff / 4;
            var topNew = parseInt(topNow + step);

            if (topNew != topFinal) {
                arrived = false;
            }

            item.top = topNew;
            item.bottom = item.top + item.height;
        }
        else {
            item.top = finalItem.top;
            item.bottom = finalItem.bottom;
        }

        item.left = finalItem.left;
        item.right = finalItem.right;
    }

    return arrived;
};



/**
 * Move the events from their current position to the final position
 * @param {Array} currentItems   Array with the real items and their current
 *                               positions
 * @param {Array} finalItems     Array with objects containing the final
 *                               positions of the items
 */
links.Timeline.prototype.stackMoveToFinal = function(currentItems, finalItems) {
    // Put the events directly at there final position
    for (i = 0, iMax = currentItems.length; i < iMax; i++) {
        var current = currentItems[i],
            finalItem = finalItems[i];

        current.left = finalItem.left;
        current.top = finalItem.top;
        current.right = finalItem.right;
        current.bottom = finalItem.bottom;
    }
};



/**
 * Check if the destiny position of given item overlaps with any
 * of the other items from index itemStart to itemEnd.
 * @param {Array} items      Array with items
 * @param {int}  itemIndex   Number of the item to be checked for overlap
 * @param {int}  itemStart   First item to be checked.
 * @param {int}  itemEnd     Last item to be checked.
 * @return {Object}          colliding item, or undefined when no collisions
 */
links.Timeline.prototype.stackItemsCheckOverlap = function(items, itemIndex,
                                                            itemStart, itemEnd) {
    var eventMargin = this.options.eventMargin,
        collision = this.collision;

    // we loop from end to start, as we suppose that the chance of a 
    // collision is larger for items at the end, so check these first.
    var item1 = items[itemIndex];
    for (var i = itemEnd; i >= itemStart; i--) {
        var item2 = items[i];
        if (collision(item1, item2, eventMargin)) {
            if (i != itemIndex) {
                return item2;
            }
        }
    }

    return undefined;
};

/**
 * Test if the two provided items collide
 * The items must have parameters left, right, top, and bottom.
 * @param {Element} item1       The first item
 * @param {Element} item2       The second item
 * @param {Number}              margin  A minimum required margin. Optional.
 *                              If margin is provided, the two items will be
 *                              marked colliding when they overlap or
 *                              when the margin between the two is smaller than
 *                              the requested margin.
 * @return {boolean}            true if item1 and item2 collide, else false
 */
links.Timeline.prototype.collision = function(item1, item2, margin) {
    // set margin if not specified 
    if (margin == undefined) {
        margin = 0;
    }

    // calculate if there is overlap (collision)
    return (item1.left - margin < item2.right &&
        item1.right + margin > item2.left &&
        item1.top - margin < item2.bottom &&
        item1.bottom + margin > item2.top);
};


/**
 * fire an event
 * @param {String} event   The name of an event, for example "rangechange" or "edit"
 */
links.Timeline.prototype.trigger = function (event) {
    // built up properties
    var properties = null;
    switch (event) {
        case 'rangechange':
        case 'rangechanged':
            properties = {
                'start': new Date(this.start),
                'end': new Date(this.end)
            };
            break;

        case 'timechange':
        case 'timechanged':
            properties = {
                'time': new Date(this.customTime)
            };
            break;
    }

    // trigger the links event bus
    links.events.trigger(this, event, properties);

    // trigger the google event bus
    if (google && google.visualization) {
        google.visualization.events.trigger(this, event, properties);
    }
};


/**
 * Cluster the events
 */
links.Timeline.prototype.clusterItems = function () {
    if (!this.options.cluster) {
        return;
    }

    var clusters = this.clusterGenerator.getClusters(this.conversion.factor);
    if (this.clusters != clusters) {
        // cluster level changed
        var queue = this.renderQueue;

        // remove the old clusters from the scene
        if (this.clusters) {
            this.clusters.forEach(function (cluster) {
                queue.hide.push(cluster);

                // unlink the items
                cluster.items.forEach(function (item) {
                    item.cluster = undefined;
                });
            });
        }

        // append the new clusters
        clusters.forEach(function (cluster) {
            // don't add to the queue.show here, will be done in .filterItems()

            // link all items to the cluster
            cluster.items.forEach(function (item) {
                item.cluster = cluster;
            });
        });

        this.clusters = clusters;
    }
};

/**
 * Filter the visible events
 */
links.Timeline.prototype.filterItems = function () {
    var queue = this.renderQueue,
        window = this.end.valueOf() - this.start.valueOf(),
        start = new Date(this.start.valueOf() - window),
        end = new Date(this.end.valueOf() + window);

    function filter (arr) {
        arr.forEach(function (item) {
            var rendered = item.rendered;
            var visible = item.isVisible(start, end);
            if (rendered != visible) {
                if (rendered) {
                    queue.hide.push(item); // item is rendered but no longer visible
                }
                if (visible && (queue.show.indexOf(item) == -1)) {
                    queue.show.push(item); // item is visible but neither rendered nor queued up to be rendered
                }
            }
        });
    }

    // filter all items and all clusters
    filter(this.items);
    if (this.clusters) {
        filter(this.clusters);
    }
};

/** ------------------------------------------------------------------------ **/

/**
 * @constructor links.Timeline.ClusterGenerator
 * Generator which creates clusters of items, based on the visible range in
 * the Timeline. There is a set of cluster levels which is cached.
 * @param {links.Timeline} timeline
 */
links.Timeline.ClusterGenerator = function (timeline) {
    this.timeline = timeline;
    this.clear();
};

/**
 * Clear all cached clusters and data, and initialize all variables
 */
links.Timeline.ClusterGenerator.prototype.clear = function () {
    // cache containing created clusters for each cluster level
    this.items = [];
    this.groups = {};
    this.clearCache();
};

/**
 * Clear the cached clusters
 */
links.Timeline.ClusterGenerator.prototype.clearCache = function () {
    // cache containing created clusters for each cluster level
    this.cache = {};
    this.cacheLevel = -1;
    this.cache[this.cacheLevel] = [];
};

/**
 * Set the items to be clustered.
 * This will clear cached clusters.
 * @param {Item[]} items
 * @param {Object} [options]  Available options:
 *                            {boolean} applyOnChangedLevel
 *                                If true (default), the changed data is applied
 *                                as soon the cluster level changes. If false,
 *                                The changed data is applied immediately
 */
links.Timeline.ClusterGenerator.prototype.setData = function (items, options) {
    this.items = items || [];
    this.dataChanged = true;
    this.applyOnChangedLevel = true;
    if (options && options.applyOnChangedLevel) {
        this.applyOnChangedLevel = options.applyOnChangedLevel;
    }
    // console.log('clustergenerator setData applyOnChangedLevel=' + this.applyOnChangedLevel); // TODO: cleanup
};

/**
 * Filter the items per group.
 * @private
 */
links.Timeline.ClusterGenerator.prototype.filterData = function () {
    // filter per group
    var items = this.items || [];
    var groups = {};
    this.groups = groups;

    // split the items per group
    items.forEach(function (item) {
        var groupName = item.group ? item.group.content : '';
        var group = groups[groupName];
        if (!group) {
            group = [];
            groups[groupName] = group;
        }
        group.push(item);
    });

    // sort the items per group
    for (var groupName in groups) {
        if (groups.hasOwnProperty(groupName)) {
            groups[groupName].sort(function (a, b) {
                return (a.center - b.center);
            });
        }
    }

    this.dataChanged = false;
};

/**
 * Cluster the events which are too close together
 * @param {Number} scale     The scale of the current window,
 *                           defined as (windowWidth / (endDate - startDate))
 * @return {Item[]} clusters
 */
links.Timeline.ClusterGenerator.prototype.getClusters = function (scale) {
    var level = -1,
        granularity = 2, // TODO: what granularity is needed for the cluster levels?
        timeWindow = 0,  // milliseconds
        maxItems = 5;    // TODO: do not hard code maxItems

    if (scale > 0) {
        level = Math.round(Math.log(100 / scale) / Math.log(granularity));
        timeWindow = Math.pow(granularity, level);

        // groups must have a larger time window, as the items will not be stacked
        if (this.timeline.groups && this.timeline.groups.length) {
            timeWindow *= 4;
        }
    }

    // clear the cache when and re-filter the data when needed.
    if (this.dataChanged) {
        var levelChanged = (level != this.cacheLevel);
        var applyDataNow = this.applyOnChangedLevel ? levelChanged : true;
        if (applyDataNow) {
            // TODO: currently drawn clusters should be removed! mark them as invisible?
            this.clearCache();
            this.filterData();
            // console.log('clustergenerator: cache cleared...'); // TODO: cleanup
        }
    }

    this.cacheLevel = level;
    var clusters = this.cache[level];
    if (!clusters) {
        // console.log('clustergenerator: create cluster level ' + level); // TODO: cleanup
        clusters = [];

        // TODO: spit this method, it is too large
        for (var groupName in this.groups) {
            if (this.groups.hasOwnProperty(groupName)) {
                var items = this.groups[groupName];
                var iMax = items.length;
                var i = 0;
                while (i < iMax) {
                    // find all items around current item, within the timeWindow
                    var item = items[i];
                    var neighbors = 1;  // start at 1, to include itself)

                    // loop through items left from the current item
                    var j = i - 1;
                    while (j >= 0 &&
                            (item.center - items[j].center) < timeWindow / 2) {
                        if (!items[j].cluster) {
                            neighbors++;
                        }
                        j--;
                    }

                    // loop through items right from the current item
                    var k = i + 1;
                    while (k < items.length &&
                            (items[k].center - item.center) < timeWindow / 2) {
                        neighbors++;
                        k++;
                    }

                    // loop through the created clusters
                    var l = clusters.length - 1;
                    while (l >= 0 &&
                            (item.center - clusters[l].center) < timeWindow / 2) {
                        if (item.group == clusters[l].group) {
                            neighbors++;
                        }
                        l--;
                    }

                    // aggregate until the number of items is within maxItems
                    if (neighbors > maxItems) {
                        // too busy in this window.
                        var num = neighbors - maxItems + 1;
                        var clusterItems = [];

                        // append the items to the cluster,
                        // and calculate the average start for the cluster
                        var avg = undefined;  // average of all start dates
                        var min = undefined;  // minimum of all start dates
                        var max = undefined;  // maximum of all start and end dates
                        var containsRanges = false;
                        var count = 0;
                        var m = i;
                        while (clusterItems.length < num && m < items.length) {
                            var p = items[m];
                            var start = p.start.valueOf();
                            var end = p.end ? p.end.valueOf() : p.start.valueOf();
                            clusterItems.push(p);
                            if (count) {
                                // calculate new average (use fractions to prevent overflow)
                                avg = (count / (count + 1)) * avg + (1 / (count + 1)) * p.center;
                            }
                            else {
                                avg = p.center;
                            }
                            min = (min != undefined) ? Math.min(min, start) : start;
                            max = (max != undefined) ? Math.max(max, end) : end;
                            containsRanges = containsRanges || (p instanceof links.Timeline.ItemRange);
                            count++;
                            m++;
                        }

                        var cluster;
                        var title = 'Cluster containing ' + count +
                            ' events. Zoom in to see the individual events.';
                        var content = '<div title="' + title + '">' + count + ' events</div>';
                        var group = item.group ? item.group.content : undefined;
                        if (containsRanges) {
                            // boxes and/or ranges
                            cluster = this.timeline.createItem({
                                'start': new Date(min),
                                'end': new Date(max),
                                'content': content,
                                'group': group
                            });
                        }
                        else {
                            // boxes only
                            cluster = this.timeline.createItem({
                                'start': new Date(avg),
                                'content': content,
                                'group': group
                            });
                        }
                        cluster.isCluster = true;
                        cluster.items = clusterItems;
                        cluster.items.forEach(function (item) {
                            item.cluster = cluster;
                        });

                        clusters.push(cluster);
                        i += num;
                    }
                    else {
                        delete item.cluster;
                        i += 1;
                    }
                }
            }
        }

        this.cache[level] = clusters;
    }

    return clusters;
};


/** ------------------------------------------------------------------------ **/


/**
 * Event listener (singleton)
 */
links.events = links.events || {
    'listeners': [],

    /**
     * Find a single listener by its object
     * @param {Object} object
     * @return {Number} index  -1 when not found
     */
    'indexOf': function (object) {
        var listeners = this.listeners;
        for (var i = 0, iMax = this.listeners.length; i < iMax; i++) {
            var listener = listeners[i];
            if (listener && listener.object == object) {
                return i;
            }
        }
        return -1;
    },

    /**
     * Add an event listener
     * @param {Object} object
     * @param {String} event       The name of an event, for example 'select'
     * @param {function} callback  The callback method, called when the
     *                             event takes place
     */
    'addListener': function (object, event, callback) {
        var index = this.indexOf(object);
        var listener = this.listeners[index];
        if (!listener) {
            listener = {
                'object': object,
                'events': {}
            };
            this.listeners.push(listener);
        }

        var callbacks = listener.events[event];
        if (!callbacks) {
            callbacks = [];
            listener.events[event] = callbacks;
        }

        // add the callback if it does not yet exist
        if (callbacks.indexOf(callback) == -1) {
            callbacks.push(callback);
        }
    },

    /**
     * Remove an event listener
     * @param {Object} object
     * @param {String} event       The name of an event, for example 'select'
     * @param {function} callback  The registered callback method
     */
    'removeListener': function (object, event, callback) {
        var index = this.indexOf(object);
        var listener = this.listeners[index];
        if (listener) {
            var callbacks = listener.events[event];
            if (callbacks) {
                var index = callbacks.indexOf(callback);
                if (index != -1) {
                    callbacks.splice(index, 1);
                }

                // remove the array when empty
                if (callbacks.length == 0) {
                    delete listener.events[event];
                }
            }

            // count the number of registered events. remove listener when empty
            var count = 0;
            var events = listener.events;
            for (var e in events) {
                if (events.hasOwnProperty(e)) {
                    count++;
                }
            }
            if (count == 0) {
                delete this.listeners[index];
            }
        }
    },

    /**
     * Remove all registered event listeners
     */
    'removeAllListeners': function () {
        this.listeners = [];
    },

    /**
     * Trigger an event. All registered event handlers will be called
     * @param {Object} object
     * @param {String} event
     * @param {Object} properties (optional)
     */
    'trigger': function (object, event, properties) {
        var index = this.indexOf(object);
        var listener = this.listeners[index];
        if (listener) {
            var callbacks = listener.events[event];
            if (callbacks) {
                for (var i = 0, iMax = callbacks.length; i < iMax; i++) {
                    callbacks[i](properties);
                }
            }
        }
    }
};


/** ------------------------------------------------------------------------ **/

/**
 * @constructor  links.Timeline.StepDate
 * The class StepDate is an iterator for dates. You provide a start date and an
 * end date. The class itself determines the best scale (step size) based on the
 * provided start Date, end Date, and minimumStep.
 *
 * If minimumStep is provided, the step size is chosen as close as possible
 * to the minimumStep but larger than minimumStep. If minimumStep is not
 * provided, the scale is set to 1 DAY.
 * The minimumStep should correspond with the onscreen size of about 6 characters
 *
 * Alternatively, you can set a scale by hand.
 * After creation, you can initialize the class by executing start(). Then you
 * can iterate from the start date to the end date via next(). You can check if
 * the end date is reached with the function end(). After each step, you can
 * retrieve the current date via get().
 * The class step has scales ranging from milliseconds, seconds, minutes, hours,
 * days, to years.
 *
 * Version: 1.1
 *
 * @param {Date} start          The start date, for example new Date(2010, 9, 21)
 *                              or new Date(2010, 9, 21, 23, 45, 00)
 * @param {Date} end            The end date
 * @param {Number}  minimumStep Optional. Minimum step size in milliseconds
 */
links.Timeline.StepDate = function(start, end, minimumStep) {

    // variables
    this.current = new Date();
    this._start = new Date();
    this._end = new Date();

    this.autoScale  = true;
    this.scale = links.Timeline.StepDate.SCALE.DAY;
    this.step = 1;

    // initialize the range
    this.setRange(start, end, minimumStep);
};

/// enum scale
links.Timeline.StepDate.SCALE = {
    MILLISECOND: 1,
    SECOND: 2,
    MINUTE: 3,
    HOUR: 4,
    DAY: 5,
    WEEKDAY: 6,
    MONTH: 7,
    YEAR: 8
};


/**
 * Set a new range
 * If minimumStep is provided, the step size is chosen as close as possible
 * to the minimumStep but larger than minimumStep. If minimumStep is not
 * provided, the scale is set to 1 DAY.
 * The minimumStep should correspond with the onscreen size of about 6 characters
 * @param {Date} start        The start date and time.
 * @param {Date} end          The end date and time.
 * @param {int}  minimumStep  Optional. Minimum step size in milliseconds
 */
links.Timeline.StepDate.prototype.setRange = function(start, end, minimumStep) {
    if (isNaN(start) || isNaN(end)) {
        //throw  "No legal start or end date in method setRange";
        return;
    }

    this._start = (start != undefined) ? new Date(start) : new Date();
    this._end = (end != undefined) ? new Date(end) : new Date();

    if (this.autoScale) {
        this.setMinimumStep(minimumStep);
    }
};

/**
 * Set the step iterator to the start date.
 */
links.Timeline.StepDate.prototype.start = function() {
    this.current = new Date(this._start);
    this.roundToMinor();
};

/**
 * Round the current date to the first minor date value
 * This must be executed once when the current date is set to start Date
 */
links.Timeline.StepDate.prototype.roundToMinor = function() {
    // round to floor
    // IMPORTANT: we have no breaks in this switch! (this is no bug)
    switch (this.scale) {
        case links.Timeline.StepDate.SCALE.YEAR:
            this.current.setFullYear(this.step * Math.floor(this.current.getFullYear() / this.step));
            this.current.setMonth(0);
        case links.Timeline.StepDate.SCALE.MONTH:        this.current.setDate(1);
        case links.Timeline.StepDate.SCALE.DAY:          // intentional fall through
        case links.Timeline.StepDate.SCALE.WEEKDAY:      this.current.setHours(0);
        case links.Timeline.StepDate.SCALE.HOUR:         this.current.setMinutes(0);
        case links.Timeline.StepDate.SCALE.MINUTE:       this.current.setSeconds(0);
        case links.Timeline.StepDate.SCALE.SECOND:       this.current.setMilliseconds(0);
        //case links.Timeline.StepDate.SCALE.MILLISECOND: // nothing to do for milliseconds
    }

    if (this.step != 1) {
        // round down to the first minor value that is a multiple of the current step size
        switch (this.scale) {
            case links.Timeline.StepDate.SCALE.MILLISECOND:  this.current.setMilliseconds(this.current.getMilliseconds() - this.current.getMilliseconds() % this.step);  break;
            case links.Timeline.StepDate.SCALE.SECOND:       this.current.setSeconds(this.current.getSeconds() - this.current.getSeconds() % this.step); break;
            case links.Timeline.StepDate.SCALE.MINUTE:       this.current.setMinutes(this.current.getMinutes() - this.current.getMinutes() % this.step); break;
            case links.Timeline.StepDate.SCALE.HOUR:         this.current.setHours(this.current.getHours() - this.current.getHours() % this.step); break;
            case links.Timeline.StepDate.SCALE.WEEKDAY:      // intentional fall through
            case links.Timeline.StepDate.SCALE.DAY:          this.current.setDate((this.current.getDate()-1) - (this.current.getDate()-1) % this.step + 1); break;
            case links.Timeline.StepDate.SCALE.MONTH:        this.current.setMonth(this.current.getMonth() - this.current.getMonth() % this.step);  break;
            case links.Timeline.StepDate.SCALE.YEAR:         this.current.setFullYear(this.current.getFullYear() - this.current.getFullYear() % this.step); break;
            default: break;
        }
    }
};

/**
 * Check if the end date is reached
 * @return {boolean}  true if the current date has passed the end date
 */
links.Timeline.StepDate.prototype.end = function () {
    return (this.current.getTime() > this._end.getTime());
};

/**
 * Do the next step
 */
links.Timeline.StepDate.prototype.next = function() {
    var prev = this.current.getTime();

    // Two cases, needed to prevent issues with switching daylight savings 
    // (end of March and end of October)
    if (this.current.getMonth() < 6)   {
        switch (this.scale) {
            case links.Timeline.StepDate.SCALE.MILLISECOND:

                this.current = new Date(this.current.getTime() + this.step); break;
            case links.Timeline.StepDate.SCALE.SECOND:       this.current = new Date(this.current.getTime() + this.step * 1000); break;
            case links.Timeline.StepDate.SCALE.MINUTE:       this.current = new Date(this.current.getTime() + this.step * 1000 * 60); break;
            case links.Timeline.StepDate.SCALE.HOUR:
                this.current = new Date(this.current.getTime() + this.step * 1000 * 60 * 60);
                // in case of skipping an hour for daylight savings, adjust the hour again (else you get: 0h 5h 9h ... instead of 0h 4h 8h ...)
                var h = this.current.getHours();
                this.current.setHours(h - (h % this.step));
                break;
            case links.Timeline.StepDate.SCALE.WEEKDAY:      // intentional fall through
            case links.Timeline.StepDate.SCALE.DAY:          this.current.setDate(this.current.getDate() + this.step); break;
            case links.Timeline.StepDate.SCALE.MONTH:        this.current.setMonth(this.current.getMonth() + this.step); break;
            case links.Timeline.StepDate.SCALE.YEAR:         this.current.setFullYear(this.current.getFullYear() + this.step); break;
            default:                      break;
        }
    }
    else {
        switch (this.scale) {
            case links.Timeline.StepDate.SCALE.MILLISECOND:  this.current = new Date(this.current.getTime() + this.step); break;
            case links.Timeline.StepDate.SCALE.SECOND:       this.current.setSeconds(this.current.getSeconds() + this.step); break;
            case links.Timeline.StepDate.SCALE.MINUTE:       this.current.setMinutes(this.current.getMinutes() + this.step); break;
            case links.Timeline.StepDate.SCALE.HOUR:         this.current.setHours(this.current.getHours() + this.step); break;
            case links.Timeline.StepDate.SCALE.WEEKDAY:      // intentional fall through
            case links.Timeline.StepDate.SCALE.DAY:          this.current.setDate(this.current.getDate() + this.step); break;
            case links.Timeline.StepDate.SCALE.MONTH:        this.current.setMonth(this.current.getMonth() + this.step); break;
            case links.Timeline.StepDate.SCALE.YEAR:         this.current.setFullYear(this.current.getFullYear() + this.step); break;
            default:                      break;
        }
    }

    if (this.step != 1) {
        // round down to the correct major value
        switch (this.scale) {
            case links.Timeline.StepDate.SCALE.MILLISECOND:  if(this.current.getMilliseconds() < this.step) this.current.setMilliseconds(0);  break;
            case links.Timeline.StepDate.SCALE.SECOND:       if(this.current.getSeconds() < this.step) this.current.setSeconds(0);  break;
            case links.Timeline.StepDate.SCALE.MINUTE:       if(this.current.getMinutes() < this.step) this.current.setMinutes(0);  break;
            case links.Timeline.StepDate.SCALE.HOUR:         if(this.current.getHours() < this.step) this.current.setHours(0);  break;
            case links.Timeline.StepDate.SCALE.WEEKDAY:      // intentional fall through
            case links.Timeline.StepDate.SCALE.DAY:          if(this.current.getDate() < this.step+1) this.current.setDate(1); break;
            case links.Timeline.StepDate.SCALE.MONTH:        if(this.current.getMonth() < this.step) this.current.setMonth(0);  break;
            case links.Timeline.StepDate.SCALE.YEAR:         break; // nothing to do for year
            default:                break;
        }
    }

    // safety mechanism: if current time is still unchanged, move to the end
    if (this.current.getTime() == prev) {
        this.current = new Date(this._end);
    }
};


/**
 * Get the current datetime
 * @return {Date}  current The current date
 */
links.Timeline.StepDate.prototype.getCurrent = function() {
    return this.current;
};

/**
 * Set a custom scale. Autoscaling will be disabled.
 * For example setScale(SCALE.MINUTES, 5) will result
 * in minor steps of 5 minutes, and major steps of an hour.
 *
 * @param {links.Timeline.StepDate.SCALE} newScale
 *                               A scale. Choose from SCALE.MILLISECOND,
 *                               SCALE.SECOND, SCALE.MINUTE, SCALE.HOUR,
 *                               SCALE.WEEKDAY, SCALE.DAY, SCALE.MONTH,
 *                               SCALE.YEAR.
 * @param {Number}     newStep   A step size, by default 1. Choose for
 *                               example 1, 2, 5, or 10.
 */
links.Timeline.StepDate.prototype.setScale = function(newScale, newStep) {
    this.scale = newScale;

    if (newStep > 0) {
        this.step = newStep;
    }

    this.autoScale = false;
};

/**
 * Enable or disable autoscaling
 * @param {boolean} enable  If true, autoascaling is set true
 */
links.Timeline.StepDate.prototype.setAutoScale = function (enable) {
    this.autoScale = enable;
};


/**
 * Automatically determine the scale that bests fits the provided minimum step
 * @param {Number} minimumStep  The minimum step size in milliseconds
 */
links.Timeline.StepDate.prototype.setMinimumStep = function(minimumStep) {
    if (minimumStep == undefined) {
        return;
    }

    var stepYear       = (1000 * 60 * 60 * 24 * 30 * 12);
    var stepMonth      = (1000 * 60 * 60 * 24 * 30);
    var stepDay        = (1000 * 60 * 60 * 24);
    var stepHour       = (1000 * 60 * 60);
    var stepMinute     = (1000 * 60);
    var stepSecond     = (1000);
    var stepMillisecond= (1);

    // find the smallest step that is larger than the provided minimumStep
    if (stepYear*1000 > minimumStep)        {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 1000;}
    if (stepYear*500 > minimumStep)         {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 500;}
    if (stepYear*100 > minimumStep)         {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 100;}
    if (stepYear*50 > minimumStep)          {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 50;}
    if (stepYear*10 > minimumStep)          {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 10;}
    if (stepYear*5 > minimumStep)           {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 5;}
    if (stepYear > minimumStep)             {this.scale = links.Timeline.StepDate.SCALE.YEAR;        this.step = 1;}
    if (stepMonth*3 > minimumStep)          {this.scale = links.Timeline.StepDate.SCALE.MONTH;       this.step = 3;}
    if (stepMonth > minimumStep)            {this.scale = links.Timeline.StepDate.SCALE.MONTH;       this.step = 1;}
    if (stepDay*5 > minimumStep)            {this.scale = links.Timeline.StepDate.SCALE.DAY;         this.step = 5;}
    if (stepDay*2 > minimumStep)            {this.scale = links.Timeline.StepDate.SCALE.DAY;         this.step = 2;}
    if (stepDay > minimumStep)              {this.scale = links.Timeline.StepDate.SCALE.DAY;         this.step = 1;}
    if (stepDay/2 > minimumStep)            {this.scale = links.Timeline.StepDate.SCALE.WEEKDAY;     this.step = 1;}
    if (stepHour*4 > minimumStep)           {this.scale = links.Timeline.StepDate.SCALE.HOUR;        this.step = 4;}
    if (stepHour > minimumStep)             {this.scale = links.Timeline.StepDate.SCALE.HOUR;        this.step = 1;}
    if (stepMinute*15 > minimumStep)        {this.scale = links.Timeline.StepDate.SCALE.MINUTE;      this.step = 15;}
    if (stepMinute*10 > minimumStep)        {this.scale = links.Timeline.StepDate.SCALE.MINUTE;      this.step = 10;}
    if (stepMinute*5 > minimumStep)         {this.scale = links.Timeline.StepDate.SCALE.MINUTE;      this.step = 5;}
    if (stepMinute > minimumStep)           {this.scale = links.Timeline.StepDate.SCALE.MINUTE;      this.step = 1;}
    if (stepSecond*15 > minimumStep)        {this.scale = links.Timeline.StepDate.SCALE.SECOND;      this.step = 15;}
    if (stepSecond*10 > minimumStep)        {this.scale = links.Timeline.StepDate.SCALE.SECOND;      this.step = 10;}
    if (stepSecond*5 > minimumStep)         {this.scale = links.Timeline.StepDate.SCALE.SECOND;      this.step = 5;}
    if (stepSecond > minimumStep)           {this.scale = links.Timeline.StepDate.SCALE.SECOND;      this.step = 1;}
    if (stepMillisecond*200 > minimumStep)  {this.scale = links.Timeline.StepDate.SCALE.MILLISECOND; this.step = 200;}
    if (stepMillisecond*100 > minimumStep)  {this.scale = links.Timeline.StepDate.SCALE.MILLISECOND; this.step = 100;}
    if (stepMillisecond*50 > minimumStep)   {this.scale = links.Timeline.StepDate.SCALE.MILLISECOND; this.step = 50;}
    if (stepMillisecond*10 > minimumStep)   {this.scale = links.Timeline.StepDate.SCALE.MILLISECOND; this.step = 10;}
    if (stepMillisecond*5 > minimumStep)    {this.scale = links.Timeline.StepDate.SCALE.MILLISECOND; this.step = 5;}
    if (stepMillisecond > minimumStep)      {this.scale = links.Timeline.StepDate.SCALE.MILLISECOND; this.step = 1;}
};

/**
 * Snap a date to a rounded value. The snap intervals are dependent on the
 * current scale and step.
 * @param {Date} date   the date to be snapped
 */
links.Timeline.StepDate.prototype.snap = function(date) {
    if (this.scale == links.Timeline.StepDate.SCALE.YEAR) {
        var year = date.getFullYear() + Math.round(date.getMonth() / 12);
        date.setFullYear(Math.round(year / this.step) * this.step);
        date.setMonth(0);
        date.setDate(0);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
    }
    else if (this.scale == links.Timeline.StepDate.SCALE.MONTH) {
        if (date.getDate() > 15) {
            date.setDate(1);
            date.setMonth(date.getMonth() + 1);
            // important: first set Date to 1, after that change the month.      
        }
        else {
            date.setDate(1);
        }

        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
    }
    else if (this.scale == links.Timeline.StepDate.SCALE.DAY ||
             this.scale == links.Timeline.StepDate.SCALE.WEEKDAY) {
        switch (this.step) {
            case 5:
            case 2:
                date.setHours(Math.round(date.getHours() / 24) * 24); break;
            default:
                date.setHours(Math.round(date.getHours() / 12) * 12); break;
        }
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
    }
    else if (this.scale == links.Timeline.StepDate.SCALE.HOUR) {
        switch (this.step) {
            case 4:
                date.setMinutes(Math.round(date.getMinutes() / 60) * 60); break;
            default:
                date.setMinutes(Math.round(date.getMinutes() / 30) * 30); break;
        }
        date.setSeconds(0);
        date.setMilliseconds(0);
    } else if (this.scale == links.Timeline.StepDate.SCALE.MINUTE) {
        switch (this.step) {
            case 15:
            case 10:
                date.setMinutes(Math.round(date.getMinutes() / 5) * 5);
                date.setSeconds(0);
                break;
            case 5:
                date.setSeconds(Math.round(date.getSeconds() / 60) * 60); break;
            default:
                date.setSeconds(Math.round(date.getSeconds() / 30) * 30); break;
        }
        date.setMilliseconds(0);
    }
    else if (this.scale == links.Timeline.StepDate.SCALE.SECOND) {
        switch (this.step) {
            case 15:
            case 10:
                date.setSeconds(Math.round(date.getSeconds() / 5) * 5);
                date.setMilliseconds(0);
                break;
            case 5:
                date.setMilliseconds(Math.round(date.getMilliseconds() / 1000) * 1000); break;
            default:
                date.setMilliseconds(Math.round(date.getMilliseconds() / 500) * 500); break;
        }
    }
    else if (this.scale == links.Timeline.StepDate.SCALE.MILLISECOND) {
        var step = this.step > 5 ? this.step / 2 : 1;
        date.setMilliseconds(Math.round(date.getMilliseconds() / step) * step);
    }
};

/**
 * Check if the current step is a major step (for example when the step
 * is DAY, a major step is each first day of the MONTH)
 * @return {boolean} true if current date is major, else false.
 */
links.Timeline.StepDate.prototype.isMajor = function() {
    switch (this.scale) {
        case links.Timeline.StepDate.SCALE.MILLISECOND:
            return (this.current.getMilliseconds() == 0);
        case links.Timeline.StepDate.SCALE.SECOND:
            return (this.current.getSeconds() == 0);
        case links.Timeline.StepDate.SCALE.MINUTE:
            return (this.current.getHours() == 0) && (this.current.getMinutes() == 0);
        // Note: this is no bug. Major label is equal for both minute and hour scale
        case links.Timeline.StepDate.SCALE.HOUR:
            return (this.current.getHours() == 0);
        case links.Timeline.StepDate.SCALE.WEEKDAY: // intentional fall through
        case links.Timeline.StepDate.SCALE.DAY:
            return (this.current.getDate() == 1);
        case links.Timeline.StepDate.SCALE.MONTH:
            return (this.current.getMonth() == 0);
        case links.Timeline.StepDate.SCALE.YEAR:
            return false;
        default:
            return false;
    }
};


/**
 * Returns formatted text for the minor axislabel, depending on the current
 * date and the scale. For example when scale is MINUTE, the current time is
 * formatted as "hh:mm".
 * @param {Date} [date] custom date. if not provided, current date is taken
 */
links.Timeline.StepDate.prototype.getLabelMinor = function(date) {
    var MONTHS_SHORT = ["Jan", "Feb", "Mar",
        "Apr", "May", "Jun",
        "Jul", "Aug", "Sep",
        "Oct", "Nov", "Dec"];
    var DAYS_SHORT = ["Sun", "Mon", "Tue",
        "Wed", "Thu", "Fri", "Sat"];

    if (date == undefined) {
        date = this.current;
    }

    switch (this.scale) {
        case links.Timeline.StepDate.SCALE.MILLISECOND:  return String(date.getMilliseconds());
        case links.Timeline.StepDate.SCALE.SECOND:       return String(date.getSeconds());
        case links.Timeline.StepDate.SCALE.MINUTE:
            return this.addZeros(date.getHours(), 2) + ":" + this.addZeros(date.getMinutes(), 2);
        case links.Timeline.StepDate.SCALE.HOUR:
            return this.addZeros(date.getHours(), 2) + ":" + this.addZeros(date.getMinutes(), 2);
        case links.Timeline.StepDate.SCALE.WEEKDAY:      return DAYS_SHORT[date.getDay()] + ' ' + date.getDate();
        case links.Timeline.StepDate.SCALE.DAY:          return String(date.getDate());
        case links.Timeline.StepDate.SCALE.MONTH:        return MONTHS_SHORT[date.getMonth()];   // month is zero based
        case links.Timeline.StepDate.SCALE.YEAR:         return String(date.getFullYear());
        default:                                         return "";
    }
};


/**
 * Returns formatted text for the major axislabel, depending on the current
 * date and the scale. For example when scale is MINUTE, the major scale is
 * hours, and the hour will be formatted as "hh".
 * @param {Date} [date] custom date. if not provided, current date is taken
 */
links.Timeline.StepDate.prototype.getLabelMajor = function(date) {
    var MONTHS = ["January", "February", "March",
        "April", "May", "June",
        "July", "August", "September",
        "October", "November", "December"];
    var DAYS = ["Sunday", "Monday", "Tuesday",
        "Wednesday", "Thursday", "Friday", "Saturday"];

    if (date == undefined) {
        date = this.current;
    }

    switch (this.scale) {
        case links.Timeline.StepDate.SCALE.MILLISECOND:
            return  this.addZeros(date.getHours(), 2) + ":" +
                this.addZeros(date.getMinutes(), 2) + ":" +
                this.addZeros(date.getSeconds(), 2);
        case links.Timeline.StepDate.SCALE.SECOND:
            return  date.getDate() + " " +
                MONTHS[date.getMonth()] + " " +
                this.addZeros(date.getHours(), 2) + ":" +
                this.addZeros(date.getMinutes(), 2);
        case links.Timeline.StepDate.SCALE.MINUTE:
            return  DAYS[date.getDay()] + " " +
                date.getDate() + " " +
                MONTHS[date.getMonth()] + " " +
                date.getFullYear();
        case links.Timeline.StepDate.SCALE.HOUR:
            return  DAYS[date.getDay()] + " " +
                date.getDate() + " " +
                MONTHS[date.getMonth()] + " " +
                date.getFullYear();
        case links.Timeline.StepDate.SCALE.WEEKDAY:
        case links.Timeline.StepDate.SCALE.DAY:
            return  MONTHS[date.getMonth()] + " " +
                date.getFullYear();
        case links.Timeline.StepDate.SCALE.MONTH:
            return String(date.getFullYear());
        default:
            return "";
    }
};

/**
 * Add leading zeros to the given value to match the desired length.
 * For example addZeros(123, 5) returns "00123"
 * @param {int} value   A value
 * @param {int} len     Desired final length
 * @return {string}     value with leading zeros
 */
links.Timeline.StepDate.prototype.addZeros = function(value, len) {
    var str = "" + value;
    while (str.length < len) {
        str = "0" + str;
    }
    return str;
};



/** ------------------------------------------------------------------------ **/

/**
 * Image Loader service.
 * can be used to get a callback when a certain image is loaded
 *
 */
links.imageloader = (function () {
    var urls = {};  // the loaded urls
    var callbacks = {}; // the urls currently being loaded. Each key contains 
    // an array with callbacks

    /**
     * Check if an image url is loaded
     * @param {String} url
     * @return {boolean} loaded   True when loaded, false when not loaded
     *                            or when being loaded
     */
    function isLoaded (url) {
        if (urls[url] == true) {
            return true;
        }

        var image = new Image();
        image.src = url;
        if (image.complete) {
            return true;
        }

        return false;
    }

    /**
     * Check if an image url is being loaded
     * @param {String} url
     * @return {boolean} loading   True when being loaded, false when not loading
     *                             or when already loaded
     */
    function isLoading (url) {
        return (callbacks[url] != undefined);
    }

    /**
     * Load given image url
     * @param {String} url
     * @param {function} callback
     * @param {boolean} sendCallbackWhenAlreadyLoaded  optional
     */
    function load (url, callback, sendCallbackWhenAlreadyLoaded) {
        if (sendCallbackWhenAlreadyLoaded == undefined) {
            sendCallbackWhenAlreadyLoaded = true;
        }

        if (isLoaded(url)) {
            if (sendCallbackWhenAlreadyLoaded) {
                callback(url);
            }
            return;
        }

        if (isLoading(url) && !sendCallbackWhenAlreadyLoaded) {
            return;
        }

        var c = callbacks[url];
        if (!c) {
            var image = new Image();
            image.src = url;

            c = [];
            callbacks[url] = c;

            image.onload = function (event) {
                urls[url] = true;
                delete callbacks[url];

                for (var i = 0; i < c.length; i++) {
                    c[i](url);
                }
            }
        }

        if (c.indexOf(callback) == -1) {
            c.push(callback);
        }
    }

    /**
     * Load a set of images, and send a callback as soon as all images are
     * loaded
     * @param {String[]} urls
     * @param {function } callback
     * @param {boolean} sendCallbackWhenAlreadyLoaded
     */
    function loadAll (urls, callback, sendCallbackWhenAlreadyLoaded) {
        // list all urls which are not yet loaded
        var urlsLeft = [];
        urls.forEach(function (url) {
            if (!isLoaded(url)) {
                urlsLeft.push(url);
            }
        });

        if (urlsLeft.length) {
            // there are unloaded images
            var countLeft = urlsLeft.length;
            urlsLeft.forEach(function (url) {
                load(url, function () {
                    countLeft--;
                    if (countLeft == 0) {
                        // done!
                        callback();
                    }
                }, sendCallbackWhenAlreadyLoaded);
            });
        }
        else {
            // we are already done!
            if (sendCallbackWhenAlreadyLoaded) {
                callback();
            }
        }
    }

    /**
     * Recursively retrieve all image urls from the images located inside a given
     * HTML element
     * @param {Node} elem
     * @param {String[]} urls   Urls will be added here (no duplicates)
     */
    function filterImageUrls (elem, urls) {
        var child = elem.firstChild;
        while (child) {
            if (child.tagName == 'IMG') {
                var url = child.src;
                if (urls.indexOf(url) == -1) {
                    urls.push(url);
                }
            }

            filterImageUrls(child, urls);

            child = child.nextSibling;
        }
    }

    return {
        'isLoaded': isLoaded,
        'isLoading': isLoading,
        'load': load,
        'loadAll': loadAll,
        'filterImageUrls': filterImageUrls
    };
})();


/** ------------------------------------------------------------------------ **/


/**
 * Add and event listener. Works for all browsers
 * @param {Element} element    An html element
 * @param {string}      action     The action, for example "click",
 *                                 without the prefix "on"
 * @param {function}    listener   The callback function to be executed
 * @param {boolean}     useCapture
 */
links.Timeline.addEventListener = function (element, action, listener, useCapture) {
    if (element.addEventListener) {
        if (useCapture === undefined)
            useCapture = false;

        if (action === "mousewheel" && navigator.userAgent.indexOf("Firefox") >= 0) {
            action = "DOMMouseScroll";  // For Firefox
        }

        element.addEventListener(action, listener, useCapture);
    } else {
        element.attachEvent("on" + action, listener);  // IE browsers
    }
};

/**
 * Remove an event listener from an element
 * @param {Element}  element   An html dom element
 * @param {string}       action    The name of the event, for example "mousedown"
 * @param {function}     listener  The listener function
 * @param {boolean}      useCapture
 */
links.Timeline.removeEventListener = function(element, action, listener, useCapture) {
    if (element.removeEventListener) {
        // non-IE browsers
        if (useCapture === undefined)
            useCapture = false;

        if (action === "mousewheel" && navigator.userAgent.indexOf("Firefox") >= 0) {
            action = "DOMMouseScroll";  // For Firefox
        }

        element.removeEventListener(action, listener, useCapture);
    } else {
        // IE browsers
        element.detachEvent("on" + action, listener);
    }
};


/**
 * Get HTML element which is the target of the event
 * @param {Event} event
 * @return {Element} target element
 */
links.Timeline.getTarget = function (event) {
    // code from http://www.quirksmode.org/js/events_properties.html
    if (!event) {
        event = window.event;
    }

    var target;

    if (event.target) {
        target = event.target;
    }
    else if (event.srcElement) {
        target = event.srcElement;
    }

    if (target.nodeType !== undefined && target.nodeType == 3) {
        // defeat Safari bug
        target = target.parentNode;
    }

    return target;
};

/**
 * Stop event propagation
 */
links.Timeline.stopPropagation = function (event) {
    if (!event)
        event = window.event;

    if (event.stopPropagation) {
        event.stopPropagation();  // non-IE browsers
    }
    else {
        event.cancelBubble = true;  // IE browsers
    }
};


/**
 * Cancels the event if it is cancelable, without stopping further propagation of the event.
 */
links.Timeline.preventDefault = function (event) {
    if (!event)
        event = window.event;

    if (event.preventDefault) {
        event.preventDefault();  // non-IE browsers
    }
    else {
        event.returnValue = false;  // IE browsers
    }
};


/**
 * Retrieve the absolute left value of a DOM element
 * @param {Element} elem        A dom element, for example a div
 * @return {number} left        The absolute left position of this element
 *                              in the browser page.
 */
links.Timeline.getAbsoluteLeft = function(elem) {
    var left = 0;
    while( elem != null ) {
        left += elem.offsetLeft;
        left -= elem.scrollLeft;
        elem = elem.offsetParent;
    }
    if (!document.body.scrollLeft && window.pageXOffset) {
        // FF
        left -= window.pageXOffset;
    }
    return left;
};

/**
 * Retrieve the absolute top value of a DOM element
 * @param {Element} elem        A dom element, for example a div
 * @return {number} top        The absolute top position of this element
 *                              in the browser page.
 */
links.Timeline.getAbsoluteTop = function(elem) {
    var top = 0;
    while( elem != null ) {
        top += elem.offsetTop;
        top -= elem.scrollTop;
        elem = elem.offsetParent;
    }
    if (!document.body.scrollTop && window.pageYOffset) {
        // FF
        top -= window.pageYOffset;
    }
    return top;
};

/**
 * add a className to the given elements style
 * @param {Element} elem
 * @param {String} className
 */
links.Timeline.addClassName = function(elem, className) {
    var classes = elem.className.split(' ');
    if (classes.indexOf(className) == -1) {
        classes.push(className); // add the class to the array
        elem.className = classes.join(' ');
    }
};

/**
 * add a className to the given elements style
 * @param {Element} elem
 * @param {String} className
 */
links.Timeline.removeClassName = function(elem, className) {
    var classes = elem.className.split(' ');
    var index = classes.indexOf(className);
    if (index != -1) {
        classes.splice(index, 1); // remove the class from the array
        elem.className = classes.join(' ');
    }
};

/**
 * Check if given object is a Javascript Array
 * @param {*} obj
 * @return {Boolean} isArray    true if the given object is an array
 */
// See http://stackoverflow.com/questions/2943805/javascript-instanceof-typeof-in-gwt-jsni
links.Timeline.isArray = function (obj) {
    if (obj instanceof Array) {
        return true;
    }
    return (Object.prototype.toString.call(obj) === '[object Array]');
};
;
links.Timeline.ItemLine = function (data, options) {
    links.Timeline.Item.call(this, data, options);
    this.lastLeftPosition = null;
};

links.Timeline.ItemLine.prototype = new links.Timeline.Item();

/**
 * Reflow the Item: retrieve its actual size from the DOM
 * @return {boolean} resized    returns true if the axis is resized
 * @override
 */
links.Timeline.ItemLine.prototype.reflow = function () {
    return false;
};

/**
 * Select the item
 * @override
 */
links.Timeline.ItemLine.prototype.select = function () {
    var dom = this.dom;
    links.Timeline.addClassName(dom, 'timeline-event-selected');
};

/**
 * Unselect the item
 * @override
 */
links.Timeline.ItemLine.prototype.unselect = function () {
    var dom = this.dom;
    links.Timeline.removeClassName(dom, 'timeline-event-selected');
};

/**
 * Creates the DOM for the item, depending on its type
 * @return {Element | undefined}
 * @override
 */
links.Timeline.ItemLine.prototype.createDOM = function () {
    var _this = this;
    var divLine = document.createElement("DIV");
    divLine.style.position = "absolute";
    divLine.style.width = "0px";
    
    var divBox = document.createElement("DIV");
    divBox.style.position = "absolute";
    divBox.style.left = this.left + "px";
    divBox.style.top = this.top + "px";
    divBox.style.display = 'none';

    // contents box (inside the background box). used for making margins
    var divContent = document.createElement("DIV");
    divContent.className = "timeline-event-content";
    divContent.innerHTML = this.content;
    divBox.appendChild(divContent);

    divLine.tip = divBox;
    // divLine.appendChild(divBox);

    divLine.onmouseover = function(event)
    {
        window.jQuery && jQuery(_this).trigger('mouseover');
        
        event = event || window.event;
        
        var offsetY = typeof event.offsetY !== 'undefined' ? event.offsetY : event.layerY;
        
        this.tip.style.top = (offsetY - 25) + 'px';
        this.tip.style.left = (_this.dom.offsetLeft + 3) + 'px';
        this.tip.style.display = '';
    }

    divLine.onmouseout = function()
    {
        window.jQuery && jQuery(_this).trigger('mouseout');
        
        this.tip.style.display = 'none';
    }

    this.dom = divLine;
    this.updateDOM();

    return divLine;
};

/**
 * Append the items DOM to the given HTML container. If items DOM does not yet
 * exist, it will be created first.
 * @param {Element} container
 * @override
 */
links.Timeline.ItemLine.prototype.showDOM = function (container) {
    var dom = this.dom;
    if (!dom) {
        dom = this.createDOM();
    }

    if (dom.parentNode != container) {
        if (dom.parentNode) {
            // container changed. remove it from old container first
            this.hideDOM();
        }

        // container.appendChild(dom);
        container.insertBefore(dom, container.firstChild);
        // container.insertBefore(dom, container.firstChild);
        container.appendChild(dom.tip);
        this.rendered = true;
    }
};

/**
 * Remove the items DOM from the current HTML container
 * @override
 */
links.Timeline.ItemLine.prototype.hideDOM = function () {
    var dom = this.dom;
    if (dom) {
        var parent = dom.parentNode;
        if (parent) {
            parent.removeChild(dom);
            parent.removeChild(dom.tip);
            this.rendered = false;
            this.lastLeftPosition = null;
        }
    }
};

/**
 * Update the DOM of the item. This will update the content and the classes
 * of the item
 * @override
 */
links.Timeline.ItemLine.prototype.updateDOM = function () {
    var divBox = this.dom;
    if (divBox) {
        //var divLine = divBox.line;

        // update class
        divBox.className = "timeline-event timeline-event-line";
        divBox.tip.className = "timeline-event timeline-event-box";

        if (this.isCluster) {
            links.Timeline.addClassName(divBox, 'timeline-event-cluster');
            links.Timeline.addClassName(divBox.tip, 'timeline-event-cluster');
        }

        // add item specific class name when provided
        if (this.className) {
            links.Timeline.addClassName(divBox, this.className);
            links.Timeline.addClassName(divBox.tip, this.className);
        }
    }
};

/**
 * Reposition the item, recalculate its left, top, and width, using the current
 * range of the timeline and the timeline options. *
 * @param {links.Timeline} timeline
 * @override
 */
links.Timeline.ItemLine.prototype.updatePosition = function (timeline) {
    var dom = this.dom;
    if (dom) {
        var left = timeline.timeToScreen(this.start);
        
        if (this.lastLeftPosition !== null && this.lastLeftPosition === left) {
            return;
        }
        
        this.lastLeftPosition = left;
        
        var axisOnTop = timeline.options.axisOnTop,
            axisTop = timeline.size.axis.top,
            axisHeight = timeline.size.axis.height

        dom.style.left = (left - this.lineWidth/2) + "px";
        dom.style.top = "0px";
        dom.style.height = axisTop + "px";
    }
};

/**
 * Check if the item is visible in the timeline, and not part of a cluster.
 * @param {Date} start
 * @param {Date} end
 * @return {boolean} visible
 * @override
 */
links.Timeline.ItemLine.prototype.isVisible = function (start, end) {
    if (this.cluster) {
        return false;
    }

    return (this.start > start)
        && (this.start < end);
};


/**
 * Reposition the item
 * @param {Number} left
 * @param {Number} right
 * @override
 */
links.Timeline.ItemLine.prototype.setPosition = function (left, right) {
    var dom = this.dom;
    if (this.lastLeftPosition === null || this.lastLeftPosition !== left) {
        this.lastLeftPosition = left;
        dom.style.left = (left - this.lineWidth / 2) + "px";
    }
};

/**
 * Calculate the right position of the item
 * @param {links.Timeline} timeline
 * @return {Number} right
 * @override
 */
links.Timeline.ItemLine.prototype.getRight = function (timeline) {
    return timeline.timeToScreen(this.start);
};;
//Плагин для добавления таймлайна для просмотра данных мультивременных слоёв.
(function ($) {

    var stringDate = function (msec, isUtc) {
        var date = new Date(msec);
        excDate = isUtc ? date.getUTCDate() : date.getDate(),
        excMonth = (isUtc ? date.getUTCMonth() : date.getMonth()) + 1,
        excYear = isUtc ? date.getUTCFullYear() : date.getFullYear();

        return (excDate < 10 ? '0' + excDate : excDate) + '.' + (excMonth < 10 ? '0' + excMonth : excMonth) + '.' + excYear;
    };

    var stringTime = function (msec, isUtc) {
        var date = new Date(msec);
        excHour = isUtc ? date.getUTCHours() : date.getHours(),
        excMin = isUtc ? date.getUTCMinutes() : date.getMinutes(),
        excSec = isUtc ? date.getUTCSeconds() : date.getSeconds();

        return (excHour < 10 ? '0' + excHour : excHour) + ':' + (excMin < 10 ? '0' + excMin : excMin) + ':' + (excSec < 10 ? '0' + excSec : excSec);
    };

    var stringDateTime = function (msec, isUtc) {
        return stringDate(msec, isUtc) + ' ' + stringTime(msec, isUtc);
    };

    /** Конвертация данных между форматами сервера и клиента. Используется в тегах слоёв и в атрибутах объектов векторных слоёв.
     * Описание форматов см. в {@link convertFromServer}
     * Если конвертация невозможна для данного типа, возвращает null
     */
    var convertToServer = function (type, value) {
        if (!type) {
            return value;
        }

        var lowerCaseType = type.toLowerCase();

        if (lowerCaseType == 'string') {
            return value;
        }
        else if (lowerCaseType == 'integer' || lowerCaseType == 'float' || lowerCaseType == 'number') {
            if (value === '') return null;
            var num = Number(value);
            return isNaN(num) ? null : num;
        }
        else if (lowerCaseType == 'date') {
            var localDateValue = $.datepicker.parseDate('dd.mm.yy', value);
            if (localDateValue === null) return null;

            var localValue = localDateValue.valueOf() / 1000;
            var timeOffset = (new Date(localValue * 1000)).getTimezoneOffset() * 60;
            return localValue - timeOffset;
        }
        else if (lowerCaseType == 'time') {
            var resTime = $.datepicker.parseTime('HH:mm:ss', value);
            if (!resTime) return null;

            return resTime.hour * 3600 + resTime.minute * 60 + resTime.second;
        }
        else if (lowerCaseType == 'datetime') {
            var localDateValue = $.datepicker.parseDateTime('dd.mm.yy', 'HH:mm:ss', value);
            if (localDateValue === null) return null;

            var localValue = localDateValue.valueOf() / 1000;
            var timeOffset = (new Date(localValue * 1000)).getTimezoneOffset() * 60;
            return localValue - timeOffset;
        }

        return value;
    };

    /** Конвертация данных между форматами сервера и клиента. Используется в тегах слоёв и в атрибутах объектов векторных слоёв.
    *
    * Форматы сервера:
    *
    *  * datetime - unix timestamp
    *  * date - unix timestamp, кратный 24*3600 секунд
    *  * time - кол-во секунд с полуночи
    *
    * Форматы клиента:
    * 
    *  * все числа превращаются в строки
    *  * дата - строка в формате dd.mm.yy
    *  * время - строка в формате hh:mm:ss
    *  * дата-время - dd.mm.yy hh:mm:ss
    */
    var convertFromServer = function (type, value) {
        //if (value === null) return "null";

        if (!type) {
            return value;
        }

        var lowerCaseType = type.toLowerCase();

        if (lowerCaseType == 'string') {
            return value !== null ? value : ''; //все null интерпретируем как пустые строки!
        }
        else if (lowerCaseType == 'integer' || lowerCaseType == 'float' || lowerCaseType == 'number') {
            return value !== null ? String(value) : '';
        }
        else if (lowerCaseType == 'date') {
            if (value === null) return '';

            return stringDate(value * 1000, true);
        }
        else if (lowerCaseType == 'time') {
            if (value === null) return '';
            return stringTime(value * 1000, true);
        }
        else if (lowerCaseType == 'datetime') {
            if (value === null) return '';
            return stringDateTime(value * 1000, true);
        }

        return value;
    };

    var _childs = function (el, children) {
        for (var i = 0; i < children.length; ++i)
            el.appendChild(children[i]);
    };

    var _attr = function (el, attrs) {
        for (var i = 0; i < attrs.length; ++i) {
            var atr = attrs[i],
                type = atr[0];

            switch (type) {
                case 'css':
                    (el.style[atr[1]] = atr[2]);
                    break;
                case 'dir':
                    el[atr[1]] = atr[2];
                    break;
                case 'attr':
                    el.setAttribute(atr[1], atr[2]);
                    break;
            }
        }
    };

    var _el = function (str, childs, attributes) {
        var el = document.createElement(str),
            children = childs,
            attrs = attributes;

        if (children)
            _childs(el, children)

        if (attrs && attrs.length)
            _attr(el, attrs)

        return el;
    };

    var _title = function (elem, title) {
        elem.setAttribute('title', title);
    };

    var _img = function (children, attrs) {
        return _el('IMG', children, attrs)
    };

    _translationsHash.addtext("rus", {
        timeline: {
            modesTextTitle: "Показывать объекты",
            modesTextTimeline: "на таймлайне",
            modesTextMap: "на карте",
            contextMemuTitle: "Добавить к таймлайну",
            mapMode: {
                none: "все",
                screen: "на экране",
                center: "над центром"
            },
            timelineMode: {
                none: "все",
                range: "по датам",
                selected: "выделенные"
            }
        }
    });

    _translationsHash.addtext("eng", {
        timeline: {
            modesTextTitle: "Show objects",
            modesTextTimeline: "at timeline",
            modesTextMap: "on map",
            contextMemuTitle: "Add to timeline",
            mapMode: {
                none: "all",
                screen: "at screen",
                center: "at center"
            },
            timelineMode: {
                none: "all",
                range: "by dates",
                selected: "selected"
            }
        }
    });

    var TimelineData = Backbone.Model.extend({
        defaults: {
            allItems: false,        //все ли данные уже загружены
            items: {},              //{layerName1: {id1 : {...}, ...}, layerName2:...}
            userFilters: [],        //function({obj, bounds}, mapCenter, mapExtent) -> bool
            range: {
                start: null,        //Date
                end: null           //Date
            },
            selection: {},          //{layerName1: [{id, date}, {id, date}, ...], layerName2:...}
            layers: [],             //[{name: ..., dateFunction: ..., filterFunction: ...}, ...]
            timelineMode: 'center', //center, screen, none
            mapMode: 'selected'     //selected, range, none
        },

        bindLayer: function (layer, options) {
            options = options || {};
            var layerName = options.layerName || layer.getGmxProperties().name || L.stamp(layer);

            //если уже есть такой слой, ничего не делаем
            if (_.pluck(this.attributes.layers, 'name').indexOf(layerName) !== -1) {
                return this;
            }

            var newLayerInfo = {
                layer: layer,
                name: layerName,
                dateFunction: options.dateFunction || TimelineData._defaultDateFunction,
                filterFunction: options.filterFunction || TimelineData._defaultFilterFunction,
                selectFunction: options.selectFunction || TimelineData._defaultSelectFunction,
                trackVisibility: 'trackVisibility' in options ? !!options.trackVisibility : true
            }
            this.trigger('preBindLayer', newLayerInfo);

            this.set('layers', this.attributes.layers.concat(newLayerInfo));
            this.trigger('bindLayer', newLayerInfo);

            return this;
        },

        unbindLayer: function (layer) {
            var layerInfos = this.attributes.layers;
            for (var l = 0; l < layerInfos.length; l++) {
                var layerInfo = layerInfos[l];
                if (layerInfo.layer === layer) {
                    var newLayersInfo = layerInfos.slice(0);
                    newLayersInfo.splice(l, 1);
                    this.set('layers', newLayersInfo);
                    this.trigger('unbindLayer', layerInfo);
                    return this;
                }
            }
            return this;
        },

        getLayerInfo: function (layer) {
            return _.findWhere(this.attributes.layers, { layer: layer });
        },

        addFilter: function (filterFunc) {
            var filters = this.attributes.userFilters.slice(0);
            filters.push(filterFunc);
            this.set('userFilters', filters);
        }
    }, {
        _defaultDateFunction: function (layer, obj) {
            var props = layer.getGmxProperties(),
                index = layer._gmx.tileAttributeIndexes[props.TemporalColumnName];

            return new Date(obj.properties[index] * 1000);
        },

        _defaultSelectFunction: function (layer, layerSelection) {
            if (layerSelection) {
                var minValue = Number.POSITIVE_INFINITY,
                    maxValue = Number.NEGATIVE_INFINITY;

                var ids = {};

                layerSelection.forEach(function (s) {
                    minValue = Math.min(minValue, s.date);
                    maxValue = Math.max(maxValue, s.date);
                    ids[s.id] = true;
                });

                //верхняя граница интервала не включается в интервал, поэтому добавляем к ней миллисекунду
                layer.setDateInterval(new Date(minValue), new Date(maxValue + 1));

                layer.setFilter(function (elem) {
                    return elem.id in ids;
                });
            } else {
                layer.setDateInterval();
            }
        },

        _defaultFilterFunction: function (layer, startDate, endDate) {
            layer.setDateInterval(startDate, endDate);
            layer.removeFilter();
        }
    });

    var MapController = function (data) {
        var updateFunctions = {
            none: function (layers) {
                (layers || data.get('layers')).forEach(function (layerInfo) {
                    var layer = layerInfo.layer,
                        props = layer.getGmxProperties(),
                        dateBegin = new Date(convertToServer('date', props.DateBegin) * 1000),
                        dateEnd = new Date(convertToServer('date', props.DateEnd) * 1000 + 24 * 3600 * 1000);

                    layer.setDateInterval(dateBegin, dateEnd);
                    layer.removeFilter();
                });
            },

            selected: function (layers) {
                var selection = data.get('selection');

                (layers || data.get('layers')).forEach(function (layerInfo) {
                    layerInfo.selectFunction(layerInfo.layer, selection[layerInfo.name]);
                })
            },

            range: function (layers) {
                var range = data.get('range');
                (layers || data.get('layers')).forEach(function (layerInfo) {
                    layerInfo.filterFunction(layerInfo.layer, range.start, range.end);
                })
            }
        }

        data.on('change:range', function () {
            if (data.get('mapMode') === 'range') {
                updateFunctions['range']();
            }
        })

        data.on('change:selection', function () {
            if (data.get('mapMode') === 'selected') {
                updateFunctions['selected']();
            }
        })

        data.on('change:mapMode', function () {
            updateFunctions[data.get('mapMode')]();
        })

        //вклчючим фильтрацию для этого снимка до того, как он будет добавлен в список слоёв таймлайна
        data.on('preBindLayer', function (layerInfo) {
            updateFunctions[data.get('mapMode')]([layerInfo]);
        })
    }

    var TimelineController = function (data, map, options) {
        options = $.extend({
            showModeControl: true,
            showSelectionControl: true,
            showCalendar: true,
            position: 'topright',
            hideWithoutActiveLayers: false
        }, options);

        function isPointInPoly(poly, pt) {
            var l = poly.length;
            poly[0][0] == poly[l - 1][0] && poly[0][1] == poly[l - 1][1] && l--;
            for (var c = false, i = -1, j = l - 1; ++i < l; j = i)
                ((poly[i][1] <= pt.y && pt.y < poly[j][1]) || (poly[j][1] <= pt.y && pt.y < poly[i][1]))
                && (pt.x < (poly[j][0] - poly[i][0]) * (pt.y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])
                && (c = !c);
            return c;
        }

        var timelineOptions = {
            style: "line",
            start: new Date(2010, 0, 1),
            end: new Date(),
            width: "100%",
            height: "85px",
            style: "line"
        };

        var timeline = null,
            countSpan = null,
            container = $('<div/>', { 'class': 'timeline-container' }),
            footerContainer = $('<div/>', { 'class': 'timeline-footer' }),
            headerContainer = $('<div/>', { 'class': 'timeline-header' }),
            _this = this;

        container.on('mousedown', function (event) {
            event.stopPropagation();
        })

        container.on('mousewheel', function (event) {
            event.stopPropagation();
        })

        var updateControlsVisibility;

        var layerObservers = {};

        var getObserversBbox = function () {
            if (data.get('timelineMode') === 'center') {
                return L.latLngBounds([map.getCenter()]);
                // return L.gmxUtil.bounds([[center.lng, center.lat]]);
            } else if (data.get('timelineMode') === 'screen') {
                return map.getBounds();
            }

            return null;
        }

        var updateTimelineVisibility = function () {
            if (options.hideWithoutActiveLayers) {
                for (var i in layerObservers) {
                    if (layerObservers[i].isActive()) {
                        container.show();
                        return;
                    }
                }
                container.hide();
            }
        }

        function joinPolygons(objs) {
            var polygonObjects = [];
            for (var i = 0; i < objs.length; i++) {
                var geom = objs[i];
                if (geom.type == 'POLYGON') {
                    polygonObjects.push(geom.coordinates);
                }
                else if (geom.type == 'MULTIPOLYGON') {
                    for (var iC = 0; iC < geom.coordinates.length; iC++)
                        polygonObjects.push(geom.coordinates[iC]);
                }
            }

            if (polygonObjects.length > 1)
                return { type: "MULTIPOLYGON", coordinates: polygonObjects }
            else if (polygonObjects.length == 1) {
                return { type: "POLYGON", coordinates: polygonObjects[0] }
            }
            else
                return null;
        };

        var modeFilters = {
            none: function () { return true; },
            center: function (item, mapCenter, mapExtent, layer) {
                var geom = item.geom = item.geom || joinPolygons(layer._gmx.dataManager.getItemGeometries(item.obj.id)),
                    c = geom.coordinates,
                    intersects = false;

                if (geom.type == "POLYGON") {
                    intersects = isPointInPoly(c[0], mapCenter);
                }
                else {
                    for (var r = 0; r < c.length; r++) {
                        intersects = intersects || isPointInPoly(c[r][0], mapCenter);
                    }
                }

                return intersects;
            },
            screen: function (item, mapCenter, mapExtent) {
                return item.bounds.intersects(mapExtent);
            }
        }

        var deleteLayerItemsFromTimeline = function (layerName) {
            var index = 0;
            while (index < timeline.items.length) {
                var itemData = timeline.getData()[index].userdata;
                if (itemData.layerName === layerName) {
                    timeline.deleteItem(index, true);
                } else {
                    index++;
                }
            }
            timeline.render();
        }

        var sortSelectionFunction = function (a, b) {
            return a.row < b.row ? -1 : 1;
        }

        var updateCalendarSelection = function () {
            var modelSelection = data.get('selection'),
                curSelection = timeline.getSelection().slice(0),
                timelineData = timeline.getData(),
                modelSelectionHash = {},
                newSelection = [];

            for (var l in modelSelection) {
                var byID = {};
                for (var k = 0; k < modelSelection[l].length; k++) {
                    byID[modelSelection[l][k].id] = true;
                }
                modelSelectionHash[l] = byID;
            };

            for (var k = 0; k < timelineData.length; k++) {
                var userdata = timelineData[k].userdata;

                if (userdata.layerName in modelSelectionHash && userdata.objID in modelSelectionHash[userdata.layerName]) {
                    newSelection.push({ row: k });
                }
            }

            timeline.setSelection(newSelection, true);
        }

        var updateLayerItems = function (layerInfo) {
            var layerName = layerInfo.name,
                layer = layerInfo.layer,
                props = layer.getGmxProperties(),
                temporalIndex = layer._gmx.tileAttributeIndexes[props.TemporalColumnName],
                identityField = props.identityField;

            var elemsToAdd = [];
            // var center = map.getCenter();
            var mapCenter = L.Projection.Mercator.project(map.getCenter());
            var mapBounds = map.getBounds();
            var nw = L.Projection.Mercator.project(mapBounds.getNorthWest());
            var se = L.Projection.Mercator.project(mapBounds.getSouthEast());
            var mapExtend = L.gmxUtil.bounds([[nw.x, nw.y], [se.x, se.y]]);
            var items = data.get('items');
            var filters = data.get('userFilters').slice(0);

            filters.unshift(modeFilters[data.get('timelineMode')]);

            if (!layer._map && layerInfo.trackVisibility) {
                layerObservers[layerName].deactivate();
                deleteLayerItemsFromTimeline(layerName);

                for (var id in items[layerName]) {
                    delete items[layerName][id].timelineItem;
                }

                updateTimelineVisibility();
                return;
            } else {
                layerObservers[layerName].activate();
                updateTimelineVisibility();
            }

            var deletedCount = 0;
            for (var i in items[layerName]) {
                var item = items[layerName][i],
                    obj = item.obj;

                var showItem = !item.needToRemove;

                if (!item.needToRemove) {
                    for (var f = 0; f < filters.length; f++) {
                        if (!filters[f](item, mapCenter, mapExtend, layer)) {
                            showItem = false;
                            break;
                        }
                    }
                }

                if (!item.timelineItem && showItem) {
                    var date = layerInfo.dateFunction(layer, obj),
                        content;

                    if (props.NameObject) {
                        content = gmxAPI.applyTemplate(props.NameObject, obj.properties);
                    }
                    else {
                        content = convertFromServer('date', obj.properties[temporalIndex]);
                    }

                    elemsToAdd.push({
                        start: date,
                        content: content,
                        userdata: { objID: obj.id, layerName: layerName }
                    });
                }
                else if (item.timelineItem && !showItem) {
                    for (var index = 0; index < timeline.items.length; index++) {
                        var itemData = timeline.getData()[index].userdata;
                        if (itemData.objID == i && itemData.layerName === layerName) {
                            timeline.deleteItem(index, true);
                            delete item.timelineItem;
                            deletedCount++;
                            break;
                        }
                    }
                }

                if (item.needToRemove) {
                    delete items[layerName][i];
                }
            }

            if (elemsToAdd.length) {
                timeline.addItems(elemsToAdd);
                $.each(elemsToAdd, function (i, elem) {
                    items[layerName][elem.userdata.objID].timelineItem = timeline.items[timeline.items.length - elemsToAdd.length + i];
                });
                updateCalendarSelection();
            } else if (deletedCount > 0) {
                timeline.render();
            }
        }

        var updateCount = function () {
            if (!timeline) return;
            var count = 0;
            var range = timeline.getVisibleChartRange();

            $.each(timeline.getData(), function (i, item) {
                item.start >= range.start && item.start <= range.end && count++;
            })

            countSpan && countSpan.text('(' + count + ')');
        }

        var updateCalendarRange;

        var updateItems = function () {
            data.get('layers').forEach(updateLayerItems);
            updateCount();
        };

        var fireSelectionEvent = function () {
            var selectedItems = [];
            var items = data.get('items');

            var selectedIds = {};

            $.each(timeline.getSelection(), function (i, selection) {
                var item = timeline.getData()[selection.row],
                    userdata = item.userdata,
                    layerName = userdata.layerName;

                selectedIds[layerName] = selectedIds[layerName] || [];
                selectedIds[layerName].push({ id: userdata.objID, date: item.start });
            })

            data.set('selection', selectedIds);
        }

        var findNextByTime = function (itemIndex, step) {
            var sortedItems = $.map(timeline.items, function (item, i) {
                return { index: i, date: item.start.valueOf() };
            }).sort(function (a, b) {
                return a.date - b.date || a.index - b.index;
            });

            var res = null;
            $.each(sortedItems, function (i, item) {
                if (item.index === itemIndex)
                    res = sortedItems[i + step] ? sortedItems[i + step].index : null;
            })

            return res;
        }

        this.getTimeline = function () {
            return timeline;
        }

        this.shiftActiveItem = function (step) {
            var curSelection = timeline.getSelection();
            if (curSelection.length > 0) {
                var newIndex = findNextByTime(curSelection[0].row, step);

                if (newIndex !== null) {
                    curSelection[0].row = newIndex;
                    timeline.setSelection(curSelection);
                }
            }

            fireSelectionEvent();
        }

        var createTimelineLazy = function () {
            if (timeline) return;

            var LeafletTimelineControl = L.Control.extend({
                onAdd: function () {
                    return this.options.timelineContainer;
                },
                onRemove: function () { }
            });

            //nsGmx.leafletMap.addControl(new LeafletTimelineControl({ position: options.position, timelineContainer: container[0] }));
            map.addControl(new LeafletTimelineControl({ position: options.position, timelineContainer: container[0] }));

            //Ugly hack: мы перемещаем контейнер таймлайна наверх соответствующего контейнера контролов leaflet
            container.parent().prepend(container);

            timeline = new links.Timeline(container[0]);
            timeline.addItemType('line', links.Timeline.ItemLine);

            var modelRange = data.get('range');
            if (modelRange.start && modelRange.end) {
                timelineOptions.start = modelRange.start;
                timelineOptions.end = modelRange.end;
            }

            timeline.draw([], timelineOptions);

            //подписываемся на событие reflow, которое возникает 
            //при обновлении элеменов на таймлайне
            links.events.addListener(timeline, 'reflow', function () {
                $(_this).trigger('reflow');
            });

            links.events.addListener(timeline, 'select', fireSelectionEvent);

            links.Timeline.addEventListener(timeline.dom.content, 'dblclick', function (elem) {
                if (timeline.eventParams.itemIndex !== undefined) {
                    var items = data.get('items');
                    var userdata = timeline.getData()[timeline.eventParams.itemIndex].userdata;
                    var b = items[userdata.layerName][userdata.objID].bounds;
                    var min = L.Projection.Mercator.unproject(b.min);
                    var max = L.Projection.Mercator.unproject(b.max);
                    map.fitBounds(L.latLngBounds([min, max]));
                }
            });

            var makeImageButton = function (url, urlHover) {
                var btn = _img();
                btn.setAttribute('src', url)
                btn.style.cursor = 'pointer';
                btn.style.border = 'none';

                if (urlHover) {
                    btn.onmouseover = function () {
                        this.setAttribute('src', urlHover);
                    }
                    btn.onmouseout = function () {
                        this.setAttribute('src', url);
                    }
                }

                return btn;
            };

            var prevDiv = makeImageButton("img/prev.png", "img/prev_a.png");
            _title(prevDiv, _gtxt("Предыдущий слой"));
            prevDiv.onclick = function () {
                _this.shiftActiveItem(-1);
            }
            $(prevDiv).addClass('timeline-shift-icon');

            var nextDiv = makeImageButton("img/next.png", "img/next_a.png");
            _title(nextDiv, _gtxt("Следующий слой"));

            nextDiv.onclick = function () {
                _this.shiftActiveItem(1);
            }
            $(nextDiv).addClass('timeline-shift-icon');

            // container.keypress(function(event) {
            // console.log(event);
            // if (event.keyCode === 37) { //влево
            // shiftActiveItem(-1);
            // } else if (event.keyCode === 39) { //вправо
            // shiftActiveItem(1);
            // }
            // })

            var timelineModeSelect = $('<select/>').addClass('selectStyle')
                    .append($('<option/>').val('none').text(_gtxt('timeline.mapMode.none')))
                    .append($('<option/>').val('screen').text(_gtxt('timeline.mapMode.screen')))
                    .append($('<option/>').val('center').text(_gtxt('timeline.mapMode.center')));

            timelineModeSelect.change(function () {
                data.set('timelineMode', $(':selected', this).val());
            })

            var updateTimelineModeSelect = function () {
                var mode = data.get('timelineMode');
                $('option', timelineModeSelect).each(function (i, option) {
                    this.value === mode ? $(this).attr('selected', true) : $(this).removeAttr('selected');
                })
            }

            data.on('change:timelineMode', updateTimelineModeSelect);
            updateTimelineModeSelect();

            var mapModeSelect = $('<select/>').addClass('selectStyle')
                    .append($('<option/>').val('selected').text(_gtxt('timeline.timelineMode.selected')))
                    .append($('<option/>').val('range').text(_gtxt('timeline.timelineMode.range')))
                    .append($('<option/>').val('none').text(_gtxt('timeline.timelineMode.none')));

            var updateMapModeSelect = function () {
                var mode = data.get('mapMode');
                $('option', mapModeSelect).each(function (i, option) {
                    this.value === mode ? $(this).attr('selected', true) : $(this).removeAttr('selected');
                })
            }

            data.on('change:mapMode', updateMapModeSelect);
            updateMapModeSelect();

            mapModeSelect.change(function () {
                data.set('mapMode', $(':selected', this).val());
            })

            fromUTC = function (date) {
                if (!date) return null;
                var timeOffset = date.getTimezoneOffset() * 60 * 1000;
                return new Date(date.valueOf() - timeOffset);
            };

            toUTC = function (date) {
                if (!date) return null;
                var timeOffset = date.getTimezoneOffset() * 60 * 1000;
                return new Date(date.valueOf() + timeOffset);
            };
            var dateInterval = new nsGmx.DateInterval();

            updateCalendarRange = function () {
                if (!timeline) return;
                var range = timeline.getVisibleChartRange();

                //TODO: не использовать UTC даты в таймлайне (нужна поддержка отображения UTC).
                var trueStart = fromUTC(range.start);
                var trueEnd = fromUTC(range.end);

                dateInterval.set({
                    dateBegin: trueStart,
                    dateEnd: trueEnd,
                });

                data.set('range', range);
                updateCount();
            };

            links.events.addListener(timeline, 'rangechanged', updateCalendarRange);
            updateCalendarRange();

            dateInterval.on('change', function () {
                data.set('range', {
                    start: dateInterval.get('dateBegin'),
                    end: dateInterval.get('dateEnd')
                });
            });

            $(headerContainer).prependTo(container);

            countSpan = $('<span/>', { 'class': 'count-container' });

            var controlsContainer = $('<div/>').addClass('timeline-controls').append(
                $('<div/>').addClass('timeline-mode-control').append(
                    $('<span/>').text(_gtxt('timeline.modesTextTitle') + ': ' + _gtxt('timeline.modesTextTimeline')), timelineModeSelect, countSpan,
                    $('<span></span>').text(_gtxt('timeline.modesTextMap')).css('margin-left', '10px'), mapModeSelect
                ),
                prevDiv, nextDiv//,
                //calendarContainer
            ).appendTo(container);

            updateControlsVisibility = function () {
                $('.timeline-mode-control', controlsContainer).toggle(options.showModeControl);
                $([prevDiv, nextDiv]).toggle(options.showSelectionControl);
            }
            updateControlsVisibility();

            $(footerContainer).appendTo(container);
        }

        data.on('change:userFilters change:items', updateItems);

        map.on('moveend', function () {
            var bounds = getObserversBbox();
            for (var layerName in layerObservers) {
                layerObservers[layerName].setBounds(bounds);
            }
        });

        data.on('change:timelineMode', function () {
            var bounds = getObserversBbox();
            for (var layerName in layerObservers) {
                layerObservers[layerName].setBounds(bounds);
            }
        });

        data.on('bindLayer', function (layerInfo) {
            var layerName = layerInfo.name,
                layer = layerInfo.layer,
                props = layer.getGmxProperties(),
                dateBegin = new Date(convertToServer('date', props.DateBegin) * 1000),
                dateEnd = new Date(convertToServer('date', props.DateEnd) * 1000 + 24 * 3600 * 1000);

            createTimelineLazy();

            //nsGmx.widgets.commonCalendar.unbindLayer(layerName);

            var items = data.get('items');
            items[layerName] = items[layerName] || {};

            layerObservers[layerName] = layer.addObserver({
                callback: function (observerData) {
                    //если мы загрузили все объекты, то нас не особо волнует, попали они на экран или нет...
                    if (data.get('allItems')) {
                        return;
                    }

                    var items = data.get('items'),
                        addedObjs = observerData.added,
                        removedObjs = observerData.removed;

                    if (removedObjs) {
                        for (var i = 0; i < removedObjs.length; i++) {
                            var id = removedObjs[i].id;

                            if (items[layerName][id]) {
                                //пометим для удаления (тут удалять не хочется, чтобы все модификации происходили в одном месте)
                                items[layerName][id].needToRemove = true;
                            }
                        }
                    }

                    if (addedObjs) {
                        for (var i = 0; i < addedObjs.length; i++) {
                            var obj = addedObjs[i];
                            var id = obj.id;

                            items[layerName][id] = items[layerName][id] || {};
                            items[layerName][id].obj = obj;
                            items[layerName][id].bounds = obj.item.bounds;

                            //геометрию объекта нужно пересчитывать, так как мы получили какой-то новый кусок этого объекта
                            delete items[layerName][id].geom;

                            //обработка ситуации, когда за одно изменение удалился и добавился кусок одного из объектов векторного слоя
                            delete items[layerName][id].needToRemove;
                        }
                    }

                    data.trigger('change change:items');
                },
                bounds: getObserversBbox(),
                dateInterval: [dateBegin, dateEnd],
                active: !!layer._map || !layerInfo.trackVisibility
            });

            updateTimelineVisibility();
        });

        map.on('layeradd layerremove', function (event) {
            var layerInfo = data.getLayerInfo(event.layer);
            if (layerInfo && layerInfo.trackVisibility) {
                updateLayerItems(layerInfo);
            }
        }, this);

        data.on('unbindLayer', function (layerInfo) {
            var layerName = layerInfo.name;
            layerInfo.layer.removeObserver(layerObservers[layerName]);
            delete layerObservers[layerName];
            deleteLayerItemsFromTimeline(layerName);
            var items = data.get('items');
            delete items[layerName];
            updateTimelineVisibility();
        });

        data.on('change:range', function () {
            if (!timeline) return;
            var currRange = timeline.getVisibleChartRange();
            var newRange = data.get('range');

            if (currRange.start.valueOf() !== newRange.start.valueOf() || currRange.end.valueOf() !== newRange.end.valueOf()) {
                timeline.setVisibleChartRange(toUTC(newRange.start), toUTC(newRange.end));
                updateCalendarRange && updateCalendarRange();
            }
        })

        this.toggle = function (isVisible) {
            container.toggle(isVisible);
        }

        this.getFooterContainer = function () {
            return footerContainer;
        }

        this.getHeaderContainer = function () {
            return headerContainer;
        }

        this.getContainer = function () {
            return container;
        }

        this.setOptions = function (newOptions) {
            options = $.extend(options, newOptions);
            updateControlsVisibility && updateControlsVisibility();
        }
    }

    /** @callback nsGmx.TimelineControl.FilterFunction
     *  @param {Object} elem Информация об объекте растрового слоя
     *  @param {gmxAPI.MapObject} elem.obj Непосредственно объект растрового слоя
     *  @param {gmxAPI.Bounds} elem.bounds Bbox объекта растрового слоя
     *  @param {Object} mapCenter центр карты (поля x и y)
     *  @param {gmxAPI.Bounds} mapExtent Bbox видимого экстента карты
     *  @return {Boolean} Показывать ли данный объект на таймлайне
    */

    /** Контрол для показа объектов мультивременных слоёв на тамймлайне
     * @class
     * @memberOf nsGmx
     * @param {L.Map} map Текущая Leaflet карта
    */
    var TimelineControl = function (map, options) {
        var data = new TimelineData();
        this.data = data;

        var mapController = new MapController(data);
        var timelineController = new TimelineController(data, map, options);

        /** Добавить векторный мультивременной слой на таймлайн
         * @param {L.gmx.VectorLayer} layer Мультивременной векторный слой
         * @param {Object} options Дополнительные опции
         * @param {function(layer, object): Date} options.dateFunction Пользовательская ф-ция указания даты для объекта слоя. По описанию объекта возвращает его дату
         * @param {function(layer, startDate, endDate)} options.filterFunction Пользовательская ф-ция для фильтрации слоя по временному интервалу
                  Ф-ция должна сама установить фильтры на слое или сделать другие нужные действия над слоем
         * @param {Boolean} [options.trackVisibility = true] Нужно ли удалять с таймлайна объекты слоя если слой удалят с карты
         */
        this.bindLayer = function (layer, options) {
            data.bindLayer(layer, options);
        }

        /** Удалить ранее добавленный векторный мультивременной слой с таймлайна
         * @param {L.gmx.VectorLayer} layer Мультивременной векторный слой
         */
        this.unbindLayer = function (layer) {
            data.unbindLayer(layer);
        }

        /** Возвращает ссылку на timelineController
         * @return {Object}
         */
        this.getTimelineController = function () {
            return timelineController;
        }

        /** Установить режим отображения данных на таймлайне
         * @param {String} newMode Новый режим: center, screen или none
        */
        this.setTimelineMode = function (newMode) {
            data.set('timelineMode', newMode);
        }

        /** Установить режим отображения данных на карте
         * @param {String} newMode Новый режим: selected, range, none
        */
        this.setMapMode = function (newMode) {
            data.set('mapMode', newMode);
        }

        /** Установить временной интервал таймлайна
         * @param {Date} start Начальная дата
         * @param {Date} end Конечная дата
        */
        this.setVisibleRange = function (start, end) {
            data.set('range', { start: start, end: end });
        }

        /** Установить видимость всего таймлайна
         * @param {Boolean} isVisible Показывать ли таймлайн или нет
        */
        this.toggleVisibility = function (isVisible) {
            timelineController.toggle(isVisible);
        }

        /** Добавить пользовательскую ф-цию фильтрации объектов на таймлайне.
         *  На вход ф-ции передаётся информация об объекте и состоянии карты. Ф-ция возвращает признак того, показывать ли объект на таймлайне или нет.
         * @param {nsGmx.TimelineControl.FilterFunction} filterFunc Ф-ция фильтрации
        */
        this.addFilter = function (filterFunc) {
            data.addFilter(filterFunc);
        }

        /** Перепроверить видимость объеков на таймлайне
         */
        this.updateFilters = function () {
            data.trigger('change:userFilters');
        }

        /** Получить контейнер для встраивания дополнительных контролов в подвал таймлайна
         * @return {HTMLElem}
         */
        this.getFooterContainer = function () {
            return timelineController.getFooterContainer();
        }

        /** Получить контейнер для встраивания дополнительных контролов в шапку таймлайна
        * @return {HTMLElem}
        */
        this.getHeaderContainer = function () {
            return timelineController.getHeaderContainer();
        }

        /** Получить контейнер для встраивания дополнительных контролов для всего таймлайна
         * @return {HTMLElem}
         */
        this.getContainer = function () {
            return timelineController.getContainer();
        }

        /** Задать видимость контролов таймлайна
         * @param {Object} visInfo Видимость контролов
         * @param {Boolean} [visInfo.showModeControl=true] Установить видимость контрола переключения режимов отображения информации
         * @param {Boolean} [visInfo.showSelectionControl=true] Установить видимость контрола переключения активного снимка
         * @param {Boolean} [visInfo.showCalendar=true] Установить видимость календаря на таймлайне
         */
        this.setControlsVisibility = function (visInfo) {
            timelineController.setOptions(visInfo);
        }

        /** Активизировать следующий/предыдущий снимок на таймлайне
         * @param {Number} step Смещение нового активного снимка на таймлайне относительно текущего активного. 
         * 1 - следующий, -1 - предыдущий и т.п.
         */
        this.shiftActiveItem = function (step) {
            timelineController.shiftActiveItem(step);
        }
    };

    nsGmx.TimelineControl = TimelineControl;

})(jQuery);
var shared = {};

shared.NEAREST = 100;
shared.LINEAR = 101;

shared.cnvCache = {};

shared.zoomTile = function (sourceImage, srcX, srcY, srcZ, dstX, dstY, dstZ, destinationCanvas, pixelCallback, mode) {

    mode = mode || shared.NEAREST;

    var dZ = dstZ - srcZ;
    var dZ2 = Math.pow(2, dZ);
    var currSize = 256 / dZ2;

    var offsetX = (dstX - srcX * dZ2) * currSize,
        offsetY = (dZ2 - 1 - (dstY - srcY * dZ2)) * currSize;

    var currPix = shared.getPixelsFromImage(sourceImage);

    var pix = [];

    if (mode == shared.NEAREST) {
        for (var i = 0; i < 256; i++) {
            for (var j = 0; j < 256; j++) {

                var currInd = ((Math.floor(i / dZ2) + offsetY) * 256 + Math.floor(j / dZ2) + offsetX) * 4;

                var k = i * 256 + j;
                var ind = k * 4;

                pix[ind] = currPix[currInd];
                pix[ind + 1] = currPix[currInd + 1];
                pix[ind + 2] = currPix[currInd + 2];
                pix[ind + 3] = currPix[currInd + 3];

                if (pixelCallback) {
                    var res = pixelCallback(pix[ind], pix[ind + 1], pix[ind + 2], pix[ind + 3]);
                    pix[ind] = res[0];
                    pix[ind + 1] = res[1];
                    pix[ind + 2] = res[2];
                    pix[ind + 3] = res[3];
                }
            }
        }
        shared.putPixelsToCanvas(destinationCanvas, pix);
    } else if (mode == shared.LINEAR) {
        var count = 256 / currSize;
        var tempCanvas = null;

        var cacheStr = sourceImage.src + count.toString();

        if (shared.cnvCache[cacheStr]) {
            tempCanvas = shared.cnvCache[cacheStr];
        } else {
            tempCanvas = document.createElement("canvas");
            tempCanvas.width = 256 * count;
            tempCanvas.height = 256 * count;
            var ctx = tempCanvas.getContext('2d');
            ctx.drawImage(sourceImage, 0, 0, tempCanvas.width, tempCanvas.height);
            if (count > 1) {
                shared.cnvCache[cacheStr] = tempCanvas;
            }
        }

        var tempCanvas2 = document.createElement("canvas");
        var dctx2 = destinationCanvas.getContext('2d');
        dctx2.drawImage(tempCanvas, offsetX * count, offsetY * count, 256, 256, 0, 0, 256, 256);

        var imgd = dctx2.getImageData(0, 0, 256, 256);
        var currPix = imgd.data;

        for (var i = 0; i < 256; i++) {
            for (var j = 0; j < 256; j++) {
                var k = i * 256 + j;
                var ind = k * 4;

                pix[ind] = currPix[ind];
                pix[ind + 1] = currPix[ind + 1];
                pix[ind + 2] = currPix[ind + 2];
                pix[ind + 3] = currPix[ind + 3];

                if (pixelCallback) {
                    var res = pixelCallback(pix[ind], pix[ind + 1], pix[ind + 2], pix[ind + 3]);
                    pix[ind] = res[0];
                    pix[ind + 1] = res[1];
                    pix[ind + 2] = res[2];
                    pix[ind + 3] = res[3];
                }
            }
        }

        shared.putPixelsToCanvas(destinationCanvas, pix);
    }
};

shared.isTablet = function () {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        return true;
    }
    return false;
};

shared.getPixelsFromImage = function (img) {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    var imgd = ctx.getImageData(0, 0, img.width, img.height);
    var pix = imgd.data;
    return pix;
};

if (window.CanvasPixelArray) {
    CanvasPixelArray.prototype.set = function (arr) {
        var l = this.length, i = 0;

        for (; i < l; i++) {
            this[i] = arr[i];
        }
    };
}

shared.putPixelsToCanvas = function (canvas, data) {
    var context = canvas.getContext('2d');
    var imageData = context.createImageData(canvas.width, canvas.height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);
};

/**
 * example:
 * var list = [
 *    {name: "1", lastname: "foo1", age: "16"},
 *    {name: "2", lastname: "foo", age: "13"},
 *    {name: "3", lastname: "foo1", age: "11"},
 *    {name: "4", lastname: "foo", age: "11"},
 *    {name: "5", lastname: "foo1", age: "16"},
 *    {name: "6", lastname: "foo", age: "16"},
 *    {name: "7", lastname: "foo1", age: "13"},
 *    {name: "8", lastname: "foo1", age: "16"},
 *    {name: "9", lastname: "foo", age: "13"},
 *    {name: "0", lastname: "foo", age: "16"}
 * ];
 * var result = __groupBy(list, function (item) {
 *     return [item.lastname, item.age];
 * });
 */
__groupBy = function (array, f) {
    var groups = {};
    array.forEach(function (o) {
        var group = JSON.stringify(f(o));
        groups[group] = groups[group] || [];
        groups[group].push(o);
    });
    return Object.keys(groups).map(function (group) {
        return groups[group];
    })
};


shared.getRandomColor = function () {
    var letters = '0123456789ABCDEF'.split('');
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

shared.hexToR = function (h) { return parseInt((shared.cutHex(h)).substring(0, 2), 16) };
shared.hexToG = function (h) { return parseInt((shared.cutHex(h)).substring(2, 4), 16) };
shared.hexToB = function (h) { return parseInt((shared.cutHex(h)).substring(4, 6), 16) };
shared.cutHex = function (h) { return (h.charAt(0) == "#") ? h.substring(1, 7) : h };

shared.RGB2HEX = function (red, green, blue) {
    return blue + 256 * green + 65536 * red;
};

shared.DEC2RGB = function (color) {
    var r = (color & 0xff0000) >> 16,
        g = (color & 0x00ff00) >> 8,
        b = (color & 0x0000ff);
    return "rgb(" + r + "," + g + "," + b + ")";
};

shared.dateToString = function (date, inv) {
    var yyyy = date.getFullYear().toString();
    var mm = (date.getMonth() + 1).toString();
    var dd = (date.getDate()).toString();
    if (inv) {
        return (dd[1] ? dd : "0" + dd[0]) + "." + (mm[1] ? mm : "0" + mm[0]) + "." + yyyy;
    }
    return yyyy + "." + (mm[1] ? mm : "0" + mm[0]) + "." + (dd[1] ? dd : "0" + dd[0]);
};

shared.formatDate = function (d, m, y) {
    return shared.strpad(d.toString(), 2) + '.' +
        shared.strpad(m.toString(), 2) + '.' +
        shared.strpad(y.toString(), 4);
}

shared.strpad = function (str, len) {
    if (typeof (len) == "undefined") { var len = 0; }
    if (len + 1 >= str.length) {
        str = Array(len + 1 - str.length).join("0") + str;
    }
    return str;
};

shared.formatDateToString = function (date) {
    return (('0' + date.getDate()).slice(-2) + "." + ('0' + (date.getMonth() + 1)).slice(-2) + "." + date.getFullYear());
};

shared.addDaysToDate = function (date, days) {
    var result = new Date(date);
    result.setDate(date.getDate() + days);
    return result;
};

//Создает палитру для ndvi средних вручную
shared.createPaletteHR = function (palette) {

    var min_i, max_i;
    var interp = false;
    //min_i = 101, max_i = 201;
    min_i = -1, max_i = palette.length - 1;

    for (var i = 0; i < palette.length; i++) {
        if (min_i == -1 && palette[i]) {
            min_i = i;
        }
        if (min_i != -1 && !palette[i]) {
            interp = true;
            break;
        }
    }

    if (interp) {
        var vArr = [];
        for (var i = min_i; i <= max_i; i++) {
            if (palette[i]) {
                vArr.push(i);
            }
        }

        function lerp(t, h1, h0) {
            return h0 + t * (h1 - h0);
        };

        var counter = 0;
        for (var i = min_i; i <= max_i; i++) {
            if (!palette[i]) {

                var c0, c1, t;

                var i0 = vArr[counter - 1],
                    i1 = vArr[counter];
                c0 = palette[i0];
                c1 = palette[i1];
                t = (i - i0) / (i1 - i0);

                //136 - 224 240 112

                var r = Math.round(lerp(t, c1.partRed, c0.partRed));
                var g = Math.round(lerp(t, c1.partGreen, c0.partGreen));
                var b = Math.round(lerp(t, c1.partBlue, c0.partBlue));

                palette[i] = { "partRed": r, "partGreen": g, "partBlue": b };
            } else {
                counter++;
            }
        }
    } else {
        palette[0] = { 'partRed': 0, 'partGreen': 0, 'partBlue': 0 };
    }
};

shared.loadPaletteSync = function (url, callback) {
    var def = new $.Deferred();
    $.ajax({
        url: url,
        type: 'GET',
        dataType: "xml"
    }).then(function (xml) {
        var palette = [];
        $(xml).find("ENTRY").each(function () {
            var code = $(this).find('Code').text(),
            partRed = $(this).find('Color > Part_Red').text(),
            partGreen = $(this).find('Color > Part_Green').text(),
            partBlue = $(this).find('Color > Part_Blue').text();
            palette[parseInt(code)] = { 'partRed': parseInt(partRed), 'partGreen': parseInt(partGreen), 'partBlue': parseInt(partBlue) };
        });
        shared.createPaletteHR(palette);
        if (callback) {
            callback(palette);
        }
        def.resolve(palette);
    });
    return def;
};

//Кеш загруженной геометрии
shared.GeometryCache = {};
shared.GeometryBounds = {};

shared.getFeatures = function (layerId, sender, callback, errorCallback) {
    if (shared.GeometryCache[layerId] && shared.GeometryBounds[layerId].equals(nsGmx.gmxMap.layersByID[layerId].getBounds())) {
        callback(shared.GeometryCache[layerId]);
    } else {
        var url = window.serverBase + "VectorLayer/Search.ashx?WrapStyle=func" +
                  "&layer=" + layerId +
                  "&geometry=true";

        var that = this;
        sendCrossDomainJSONRequest(url, function (response) {

            shared.GeometryBounds[layerId] = nsGmx.gmxMap.layersByID[layerId].getBounds();

            var res = response.Result;
            if (res.values.length < 250) {
                if (!response.Result.values.length) {
                    errorCallback && errorCallback({ "err": "There's no fields" });
                    return;
                }
                shared.GeometryCache[layerId] = res;
                if (callback)
                    callback.call(sender, res);
            } else {
                errorCallback && errorCallback({ "err": "Too much fields" });
                return;
            }
        });
    }
};

shared.VERYBIGNUMBER = 10000000000;

shared.getLayersGeometry = function (layersArr, sender, callback, errorCallback) {

    var maxX = -shared.VERYBIGNUMBER, minX = shared.VERYBIGNUMBER,
        maxY = -shared.VERYBIGNUMBER, minY = shared.VERYBIGNUMBER;

    var new_features = [];

    var id = 1;

    var defArr = [];
    for (var j = 0 ; j < layersArr.length; j++) {

        var layerId = layersArr[j];

        (function (g) {
            var _def = new $.Deferred();
            defArr.push(_def);
            shared.getFeatures(layerId, sender, function (features) {
                var nameIndex = features.fields.indexOf("NAME");
                if (nameIndex == -1) {
                    nameIndex = features.fields.indexOf("name");
                }

                //определяем границы(extent) полей, мультиполигоны
                //перегоняем в полигоны и сохраняем здесь.
                //var features = 
                var geom_index = features.fields.indexOf("geomixergeojson");
                var ogc_fid_index = features.fields.indexOf("ogc_fid");
                if (ogc_fid_index == -1) {
                    ogc_fid_index = features.fields.indexOf("gmx_id");
                }

                var f = features.values;
                new_features[g] = [];

                for (var i = 0; i < f.length; i++) {
                    var geom = f[i][geom_index];
                    var properties = { "ogc_fid": f[i][ogc_fid_index], "midndvi": -1, "name": f[i][nameIndex] };

                    if (geom.type === "POLYGON") {
                        var coords = geom.coordinates[0];
                        for (var j = 0; j < coords.length; j++) {
                            var p = coords[j];
                            if (p[0] < minX) minX = p[0];
                            if (p[0] > maxX) maxX = p[0];
                            if (p[1] < minY) minY = p[1];
                            if (p[1] > maxY) maxY = p[1];
                        }
                        new_features[g].push({ "id": id++, "properties": properties, "geometry": oldAPI.from_merc_geometry({ "type": "POLYGON", "coordinates": geom.coordinates }) });
                    } else if (geom.type === "MULTIPOLYGON") {
                        var poligons = geom.coordinates;
                        for (var j = 0; j < poligons.length; j++) {
                            //for (var l = 0; l < poligons[j].length; l++) {
                            //var coords = poligons[j][l];
                            var coords = poligons[j][0];
                            for (var k = 0; k < coords.length; k++) {
                                var p = coords[k];
                                if (p[0] < minX) minX = p[0];
                                if (p[0] > maxX) maxX = p[0];
                                if (p[1] < minY) minY = p[1];
                                if (p[1] > maxY) maxY = p[1];
                            }
                            //new_features.push({ "id": id++, "properties": properties, "geometry": gmxAPI.from_merc_geometry({ "type": "POLYGON", "coordinates": [coords] }) });
                            //}
                        }
                        new_features[g].push({ "id": id++, "properties": properties, "geometry": oldAPI.from_merc_geometry({ "type": "MULTIPOLYGON", "coordinates": poligons }) });
                    }
                }
                var extent = { "type": "POLYGON", "coordinates": [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]] };

                _def.resolve();
            }, errorCallback);
        }(j));
    }

    $.when.apply($, defArr).then(function () {
        var extent = { "type": "POLYGON", "coordinates": [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]] };
        var features = [];
        for (var i = 0; i < new_features.length; i++) {
            features.push.apply(features, new_features[i]);
        }
        if (callback)
            callback.call(sender, { "extent": extent, "features": features });
    });
};


//Эта функия есть в плагине таймлайна, ее бы надо вынести в утилиты
shared.isPointInPoly = function (poly, pt) {
    var l = poly.length;
    poly[0][0] == poly[l - 1][0] && poly[0][1] == poly[l - 1][1] && l--;
    for (var c = false, i = -1, j = l - 1; ++i < l; j = i)
        ((poly[i][1] <= pt.y && pt.y < poly[j][1]) || (poly[j][1] <= pt.y && pt.y < poly[i][1]))
        && (pt.x < (poly[j][0] - poly[i][0]) * (pt.y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])
        && (c = !c);
    return c;
};


shared.isPointInGeometry = function (geometry, point) {
    if (geometry.type.toUpperCase() == "POLYGON") {
        return shared.isPointInPoly(geometry.coordinates[0], point);
    } else {
        for (var i = 0; i < geometry.coordinates.length; i++) {
            if (shared.isPointInPoly(geometry.coordinates[i][0], point)) {
                return true;
            }
        }
    }
    return false;
};


/*
* Recursively merge properties of two objects
* http://stackoverflow.com/questions/171251/how-can-i-merge-properties-of-two-javascript-objects-dynamically
*/
shared.mergeRecursive = function (obj1, obj2) {

    for (var p in obj2) {
        try {
            // Property in destination object set; update its value.
            if (obj2[p].constructor == Object) {
                obj1[p] = MergeRecursive(obj1[p], obj2[p]);

            } else {
                obj1[p] = obj2[p];

            }

        } catch (e) {
            // Property in destination object not set; create it and set its value.
            obj1[p] = obj2[p];

        }
    }

    return obj1;
}

shared.disableHTMLSelection = function (selector) {
    $(selector).attr('unselectable', 'on')
     .css({
         '-moz-user-select': '-moz-none',
         '-moz-user-select': 'none',
         '-o-user-select': 'none',
         '-khtml-user-select': 'none',
         '-webkit-user-select': 'none',
         '-ms-user-select': 'none',
         'user-select': 'none'
     }).bind('selectstart', function () { return false; });
};

/*
=====================================
    старого апи функции
=====================================
*/
var oldAPI = {};

oldAPI.deg_rad = function (ang) {
    return ang * (Math.PI / 180.0);
}

oldAPI.merc_x = function (lon) {
    var r_major = 6378137.000;
    return r_major * oldAPI.deg_rad(lon);
}

oldAPI.merc_y = function (lat) {
    if (lat > 89.5)
        lat = 89.5;
    if (lat < -89.5)
        lat = -89.5;
    var r_major = 6378137.000;
    var r_minor = 6356752.3142;
    var temp = r_minor / r_major;
    var es = 1.0 - (temp * temp);
    var eccent = Math.sqrt(es);
    var phi = oldAPI.deg_rad(lat);
    var sinphi = Math.sin(phi);
    var con = eccent * sinphi;
    var com = .5 * eccent;
    con = Math.pow(((1.0 - con) / (1.0 + con)), com);
    var ts = Math.tan(.5 * ((Math.PI * 0.5) - phi)) / con;
    var y = 0 - r_major * Math.log(ts);
    return y;
}

oldAPI.deg_decimal = function (rad) {
    return (rad / Math.PI) * 180.0;
}

oldAPI.from_merc_y = function (y) {
    var r_major = 6378137.000;
    var r_minor = 6356752.3142;
    var temp = r_minor / r_major;
    var es = 1.0 - (temp * temp);
    var eccent = Math.sqrt(es);
    var ts = Math.exp(-y / r_major);
    var HALFPI = 1.5707963267948966;

    var eccnth, Phi, con, dphi;
    eccnth = 0.5 * eccent;

    Phi = HALFPI - 2.0 * Math.atan(ts);

    var N_ITER = 15;
    var TOL = 1e-7;
    var i = N_ITER;
    dphi = 0.1;
    while ((Math.abs(dphi) > TOL) && (--i > 0)) {
        con = eccent * Math.sin(Phi);
        dphi = HALFPI - 2.0 * Math.atan(ts * Math.pow((1.0 - con) / (1.0 + con), eccnth)) - Phi;
        Phi += dphi;
    }

    return oldAPI.deg_decimal(Phi);
};

oldAPI.from_merc_x = function (x) {
    var r_major = 6378137.000;
    return oldAPI.deg_decimal(x / r_major);
};

oldAPI.from_merc_geometry = function (geom) {
    return (geom ? oldAPI.transformGeometry(geom, oldAPI.from_merc_x, oldAPI.from_merc_y) : null);
};

oldAPI.transformGeometry = function (geom, callbackX, callbackY) {
    return !geom ? geom : {
        type: geom.type,
        coordinates: oldAPI.forEachPoint(geom.coordinates, function (p) {
            return [callbackX(p[0]), callbackY(p[1])];
        })
    }
};

oldAPI.forEachPoint = function (coords, callback) {
    if (!coords || coords.length == 0) return [];
    if (!coords[0].length) {
        if (coords.length == 2)
            return callback(coords);
        else {
            var ret = [];
            for (var i = 0; i < coords.length / 2; i++)
                ret.push(callback([coords[i * 2], coords[i * 2 + 1]]));
            return ret;
        }
    }
    else {
        var ret = [];
        for (var i = 0; i < coords.length; i++) {
            if (typeof (coords[i]) != 'string') ret.push(oldAPI.forEachPoint(coords[i], callback));
        }
        return ret;
    }
};

shared.clearDate = function (currentTime) {
    var millisInDay = 60 * 60 * 24 * 1000;
    var dateOnly = Math.floor(currentTime / millisInDay) * millisInDay;
    return dateOnly;
};;
var RequestsQueue = function () {
    this._requests = [];
    this._callback = null;
    this._sender = null;

    this.pendingsQueue = [];
    this.counter = 0;
    this.MAX_LOADING_REQUESTS = 3;

    this._id = RequestsQueue.ID++;
};

RequestsQueue.ID = 0;

RequestsQueue.prototype.initisalize = function (requests, sender, callback, successCallback) {
    this.clear();
    this._requests = requests.slice(0);
    this._callback = callback;
    this._successCallback = successCallback;
    this._sender = sender;
};

RequestsQueue.prototype.clear = function () {
    this._requests.length = 0;
    this.counter = 0;
    this.pendingsQueue.length = 0;
    this._callback = null;
    this._successCallback = null;
};

RequestsQueue.prototype.start = function () {
    for (var i = 0; i < this._requests.length; i++) {
        this.sendRequest(this._requests[i]);
    }
};

RequestsQueue.prototype.sendRequest = function (request) {
    if (this.counter >= this.MAX_LOADING_REQUESTS) {
        this.pendingsQueue.push(request);
    } else {
        this.loadRequestData(request);
    }
};

RequestsQueue.prototype.loadRequestData = function (request) {
    this.counter++;

    var that = this;
    sendCrossDomainPostRequest(window.serverBase + 'plugins/getrasterhist.ashx', {
        'WrapStyle': 'window',
        'Request': JSON.stringify(request)
    }, function (response) {
        if (response && response.Result) {

            if (that._callback)
                that._callback.call(that._sender, response.Result);

            that.dequeueRequest();
        }
    });
};

RequestsQueue.prototype.dequeueRequest = function () {
    this.counter--;
    if (this.pendingsQueue.length) {
        if (this.counter < this.MAX_LOADING_REQUESTS) {
            var req;
            if (req = this.whilePendings())
                this.loadRequestData.call(this, req);
        }
    } else if (this.counter == 0 && this._successCallback) {
        this._successCallback();
    }
};

RequestsQueue.prototype.whilePendings = function () {
    while (this.pendingsQueue.length) {
        var req = this.pendingsQueue.pop();
        if (req) {
            return req;
        }
    }
    return null;
};;
/*
====================================
    class ThematicStrategy
====================================
*/
var ThematicStrategy = function (url, colorCallback) {
    this.palette = [];
    url && this.loadPalette(url);
    this.colorCallback = colorCallback;

    //для последовательного вычисления
    this._requests = [];
    this._queue = new RequestsQueue();
    this.isClear = true;
    this._applyCallback = null;

    this.returnDataArr = ["Stat"];//["Hist"]
    this._requestValueCallback = ThematicStrategy.__ndviValue;//ThematicStrategy.__neodnrValue

    this._bagSize = 10;

    this.katalogName = "";
};

ThematicStrategy.prototype.clear = function () {
    this._queue.clear();
    this._requests = [];
    this.isClear = true;
};

ThematicStrategy.prototype.setRequestValue = function (callback) {
    this._requestValueCallback = callback;
};

ThematicStrategy.prototype.loadPalette = function (url) {
    var that = this;
    shared.loadPaletteSync(url, function (pal) {
        that.palette = pal;
    });
};

ThematicStrategy.prototype.startThemesThreadByIds = function (gmxRKIdArr, sceneIdArr, catalog, featuresArr, applyCallback, successCallback) {
    this._applyCallback = applyCallback;
    this.isClear = false;
    this._constuctRequestsArray(gmxRKIdArr, sceneIdArr, catalog, featuresArr, function () {
        this._queue.initisalize(this._requests, this, this.applyRequest, successCallback);
        this._queue.start();
    });
};

ThematicStrategy.prototype._constuctRequestsArray = function (GMX_RasterCatalogIDArr, sceneIdArr, catalog, featuresArr, proceedCallback) {

    var dArr = [];
    for (var i = 0; i < sceneIdArr.length; i++) {
        dArr[i] = new $.Deferred();
        if (ThematicHandler.shotsGeomeryCache[sceneIdArr[i]]) {
            dArr[i].resolve();
        } else {
            (function (ii) {
                var query = "[SCENEID]='" + sceneIdArr[ii] + "'";

                sendCrossDomainPostRequest(window.serverBase + "VectorLayer/Search.ashx", {
                    'query': query,
                    'geometry': true,
                    'layer': catalog,
                    'WrapStyle': "window"
                }, function (result) {
                    var res = result.Result;
                    var values = res.values;

                    var sid = res.fields.indexOf("sceneid");
                    if (sid == -1) {
                        sid = res.fields.indexOf("SCENEID");
                    }

                    var vi = values[0];
                    var gmxId = vi[res.fields.indexOf("GMX_RasterCatalogID")];
                    var sceneId = vi[sid];
                    var geom = vi[vi.length - 1];

                    ThematicHandler.shotsGeomeryCache[sceneId] = { "GMX_RasterCatalogID": gmxId, "geometry": geom };
                    dArr[ii].resolve();
                });
            }(i));
        }
    }

    var that = this;
    $.when.apply($, dArr).then(function () {

        that._requests.length = 0;

        var req = [];

        var iii = 1;

        for (var i = 1; i <= featuresArr.length; i++) {

            var fi = featuresArr[i - 1];

            var coords = fi.geometry.coordinates;

            var isInside = false;

            for (var j = 0; j < sceneIdArr.length; j++) {

                var shot = ThematicHandler.shotsGeomeryCache[sceneIdArr[j]];

                if (fi.geometry.type == "POLYGON") {
                    for (var k = 0; k < coords[0].length; k++) {
                        var ck = coords[0][k];
                        if (shared.isPointInGeometry(shot.geometry, { "x": oldAPI.merc_x(ck[0]), "y": oldAPI.merc_y(ck[1]) })) {
                            isInside = true;
                            break;
                        }
                    }
                } else {
                    for (var k = 0; k < coords.length; k++) {
                        var ck = coords[k][0];
                        for (var m = 0; m < ck.length; m++) {
                            var cm = ck[m];
                            if (shared.isPointInGeometry(shot.geometry, { "x": oldAPI.merc_x(cm[0]), "y": oldAPI.merc_y(cm[1]) })) {
                                isInside = true;
                                break;
                            }
                        }
                        if (isInside) {
                            break;
                        }
                    }
                }
            }

            if (isInside) {
                var item = {
                    "Border": fi.geometry,
                    "BorderSRS": "EPSG:4326",
                    "Items": [
                        {
                            "Name": (fi.properties.ogc_fid || fi.id),
                            "Layers": GMX_RasterCatalogIDArr,
                            "Bands": ["r", "g", "b"],
                            "Return": that.returnDataArr,
                            "NoData": [0, 0, 0]
                        }
                    ]
                };

                req.push(item);

                if (iii % that._bagSize == 0) {
                    that._requests.push(req.slice(0));
                    req.length = 0;
                    req = [];
                }

                iii++;
            }
        }



        if (req.length) {
            that._requests.push(req.slice(0));
        }

        proceedCallback.call(that);
    });
};

ThematicStrategy.__ndviValue = function (ri) {
    return Math.round(ri.Bands.b.Mean);
};

ThematicStrategy.__neodnrValue = function (ri) {
    var h = ri.Bands.b.Hist256;
    var u = ri.ValidPixels;
    var max = Math.max.apply(null, [h[0], h[1], h[2], h[3], h[4], h[5]]);
    return (max / u) * 100;
};

ThematicStrategy.prototype.getRequestValue = function (ri) {
    if (this._requestValueCallback)
        return this._requestValueCallback.call(this, ri);
};

ThematicStrategy.prototype.applyRequest = function (res) {
    for (var i = 0; i < res.length; i++) {
        var ri = res[i];
        if (ri.Bands.b) {
            var valid = ri.ValidPixels / (ri.NoDataPixels + ri.ValidPixels + ri.BackgroundPixels);
            var id = ri.Name;
            if (valid > 0.32) {
                var value = this.getRequestValue(ri);
                this.applyPalette(parseInt(id), value);
            } else {
                this.applyPalette(parseInt(id), -100);
            }
        }
    }
};

ThematicStrategy.prototype.getColor = function (value) {
    return this.colorCallback.call(this, value);
};

ThematicStrategy.prototype.applyPalette = function (id, value) {
    var color = this.getColor(value);
    this._applyCallback(id, color);
};

//NeodnrManager.checkGreyHisto = function (channels) {
//    for (var i = 0; i < 255; i++) {
//        var r = channels.r.Hist256[i],
//            g = channels.g.Hist256[i],
//            b = channels.b.Hist256[i];

//        if (!(r == g && r == b)) {
//            return false;
//        }
//    }
//    return true;
//};


/*
====================================
    class ThematicHandler
====================================
*/
var ThematicHandler = function (thematicStrategy) {
    //массив подключенных слоев
    this.sourceLayersArr = {};
    this._thematicStrategy = thematicStrategy;
    this._layersStyleData = {};

    //выбранная дата
    this._dateStr = null;

    //происходит раскраска(раскраска включена)
    this.activated = false;

    //флаг того, что нет возможности быстро получать данные по rest
    this.manualOnly = false;
    this._counter = 0;
    this._pendingsQueue = [];
    this.dataSource = "";
    this.layerCollection = null;

    //Вызывается если произошла ошибка, когда слишком много полей для раскраски в ручном режиме.
    this.errorCallback = null;
};

ThematicHandler.prototype.clearLayersStyleData = function () {
    this._layersStyleData = {};
};

ThematicHandler.prototype.removeStyleHooks = function () {
    for (var l in this.sourceLayersArr) {
        //this.sourceLayersArr[l].removeStyleHook();
        styleHookManager.removeStyleHook(this.sourceLayersArr[l], ThematicHandler.__hookId);
        this.sourceLayersArr[l].repaint();
    }
    this.sourceLayersArr = {};
};

ThematicHandler.prototype.addLayers = function (layersArr, alternativeGMX_RKArr, sceneIds) {
    if (this.activated) {
        this._alternativeGMX_RKArr = alternativeGMX_RKArr;
        this._sceneIds = sceneIds;
        for (var i = 0; i < layersArr.length; i++) {
            if (!this.sourceLayersArr[layersArr[i].getGmxProperties().LayerID]) {
                //var layer = gmxAPI.map.layers[layersArr[i]];
                var layer = layersArr[i];
                this._applyLayer(layer);
                this.sourceLayersArr[layersArr[i].getGmxProperties().LayerID] = layer;
            }
        }
    }
};

ThematicHandler.__hookId = "xxx5ge9iop1";
ThematicHandler.prototype.setLayerStyleHook = function (layer) {
    var that = this;
    var layerName = layer.getGmxProperties().LayerID;


    styleHookManager.addStyleHook(layer, ThematicHandler.__hookId, function (data) {
        if (that._layersStyleData[layerName] && that._layersStyleData[layerName][data.id]) {
            return that._layersStyleData[layerName][data.id];
        } else {
            return data.style;
        }
    }, 100);

    //layer.setStyleHook(function (data) {
    //    if (that._layersStyleData[layerName] && that._layersStyleData[layerName][data.id]) {
    //        return that._layersStyleData[layerName][data.id];
    //    } else {
    //        return data.style;
    //    }
    //});


};

ThematicHandler.shotsGeomeryCache = {};

ThematicHandler.prototype._applyLayer = function (layer) {

    this.setLayerStyleHook(layer);

    var identityField = "layer_gmx_id";//layer.properties.identityField;
    //var layerName = layer.properties.name;
    var layerName = layer.getGmxProperties().LayerID;

    this._layersStyleData[layerName] = {};
    var query = "";
    //проверяем пересечение геометрии слоя со снимками
    for (var i = 0; i < this._sceneIds.length; i++) {
        query += "[SCENEID]='" + this._sceneIds[i] + (i < this._sceneIds.length - 1 ? "' OR " : "'");
    }


    //var b = layer.getBoundsMerc();
    var b = layer.getBounds();
    var min = L.Projection.Mercator.project(b._southWest),
        max = L.Projection.Mercator.project(b._northEast);
    //var p = [{ "x": b.minX, "y": b.minY }, { "x": b.minX, "y": b.maxY },
    //    { "x": b.maxX, "y": b.maxY }, { "x": b.maxX, "y": b.minY }];

    var p = [{ "x": min.x, "y": min.y }, { "x": min.x, "y": max.y },
             { "x": max.x, "y": max.y }, { "x": max.x, "y": min.y }];

    var that = this;

    //геометрия снимков
    sendCrossDomainPostRequest(window.serverBase + "VectorLayer/Search.ashx", {
        'query': query,
        'geometry': true,
        'layer': this.katalogName,
        'WrapStyle': "window"
    }, function (result) {

        var res = result.Result;
        var values = res.values;

        var sid = res.fields.indexOf("sceneid");
        if (sid == -1) {
            sid = res.fields.indexOf("SCENEID");
        }

        var isInside = false;
        for (var i = 0; i < values.length; i++) {
            var vi = values[i];
            var gmxId = vi[res.fields.indexOf("GMX_RasterCatalogID")];
            var sceneId = vi[sid];
            var geom = vi[vi.length - 1];

            ThematicHandler.shotsGeomeryCache[sceneId] = { "GMX_RasterCatalogID": gmxId, "geometry": geom };

            var clips = L.gmxUtil.bounds([[min.x, min.y], [max.x, max.y]]).clipPolygon(geom.coordinates[0]);

            if (clips.length) {
                isInside = true;
                break;
            }
        }

        if (!isInside)
            return;

        if (!that.manualOnly) {
            var url = "http://maps.kosmosnimki.ru/rest/ver1/layers/~/search?api_key=BB3RFQQXTR";
            var tale = '&tables=[{"LayerName":"' + that.dataSource + '","Alias":"n"},{"LayerName":"88903D1BF4334AEBA79E1527EAD27F99","Alias":"f","Join":"Inner","On":"[n].[field_id] = [f].[gmx_id]"}]&columns=[{"Value":"[f].[Farm]"},{"Value":"[f].[Region]"},{"Value":"[f].[Subregion]"},{"Value":"[n].[Value]"},{"Value":"[n].[completeness]"},{"Value":"[f].[layer_id]"},{"Value":"[f].[' + identityField + ']"}]';
            url += "&query=[date]='" + that._dateStr + "' AND [layer_id]='" + layerName + "' AND [completeness]>=0.0" + tale;

            $.getJSON(url, function (response) {
                //раскраска по полученным с сервера данным
                if (!that.sourceLayersArr[layerName]) {
                    return;
                }
                var features = response.features;
                if (features.length) {
                    for (var i = 0; i < features.length; i++) {
                        var fi = features[i];
                        var prop = fi.properties;
                        var color = shared.RGB2HEX(0, 179, 255);
                        if (prop.completeness >= 33.3) {
                            color = that._thematicStrategy.getColor(prop.value);
                        }

                        that._layersStyleData[layerName][prop[identityField]] = {
                            fillStyle: shared.DEC2RGB(color),
                            fillOpacity: 1.0
                        };
                    }
                    layer.repaint();
                } else {
                    //рассчет вручную
                    that._manualLayerHandler(layer);
                }
            });
        } else {
            //рассчет вручную
            that._manualLayerHandler(layer);
        }
    });
};

ThematicHandler.prototype._manualLayerHandler = function (layer) {
    if (this._counter >= 1) {
        this._pendingsQueue.push(layer);
    } else {
        this._exec(layer);
    }
};

ThematicHandler.prototype._exec = function (layer) {

    if (!this.activated) {
        return;
    }

    this._counter++;
    var layerName = layer.getGmxProperties().LayerID;

    var that = this;
    shared.getLayersGeometry([layerName], null, function (result) {
        that._thematicStrategy.startThemesThreadByIds(that._alternativeGMX_RKArr, that._sceneIds, that.katalogName, result.features, function (id, color) {
            that._layersStyleData[layerName][id] = {
                //fillColor: color,
                fillStyle: shared.DEC2RGB(color),
                fillOpacity: 1.0
            };
            layer.repaint();
        }, function () {
            that._dequeueRequest();
        });
    }, this.errorCallback);
};

ThematicHandler.prototype._dequeueRequest = function () {
    this._counter--;
    if (this._pendingsQueue.length && this._counter < 1) {
        var req;
        if (req = this._whilePendings())
            this._exec(req);
    }
};

ThematicHandler.prototype._whilePendings = function () {
    while (this._pendingsQueue.length) {
        return this._pendingsQueue.pop();
    }
};

ThematicHandler.prototype.start = function (layersArr, date, alternativeGMX_RKArr, alternativeFilenames) {
    this._dateStr = date;
    this.clear();
    this.activated = true;
    this.addLayers(layersArr, alternativeGMX_RKArr, alternativeFilenames);
};

ThematicHandler.prototype.clear = function () {
    this._counter = 0;
    this._pendingsQueue = [];
    this._thematicStrategy.clear();
    this._alternativeGMX_RKArr = null;
    this._sceneIds = null;
    this.activated = false;
    this.clearLayersStyleData();
    this.removeStyleHooks();
};;
var StyleHookManager = function () {
    this.attachedLayers = {};
};

StyleHookManager.prototype._renderStyles = function (layerName, data) {
    var callbacks = this.attachedLayers[layerName].styleCallbacks;

    //объединение стилей
    var res = {};//data.style;
    for (var i = 0; i < callbacks.length; i++) {
        var s = callbacks[i].callback(data);
        res = shared.mergeRecursive(res, s);
    }

    return res;
};

StyleHookManager.prototype.addStyleHook = function (layer, id, callback, priority) {
    var layerID = layer.getGmxProperties().LayerID;

    if (!this.attachedLayers[layerID]) {
        this.attachedLayers[layerID] = {
            "layer": layer, "styleCallbacks": [
                { "id": id, "callback": callback, "priority": priority }]
        };
        var that = this;
        layer.setStyleHook(function (data) {
            return that._renderStyles(layerID, data);
        });
    } else {
        this.attachedLayers[layerID].styleCallbacks.push({ "id": id, "callback": callback, "priority": priority });
        this.attachedLayers[layerID].styleCallbacks.sort(function (a, b) {
            return a.priority - b.priority;
        });
    }
};

StyleHookManager.prototype.removeStyleHook = function (layer, id) {
    var layerID = layer.getGmxProperties().LayerID;
    var callbacks = this.attachedLayers[layerID].styleCallbacks;
    for (var i = 0; i < callbacks.length; i++) {
        if (callbacks[i].id == id) {
            callbacks.splice(i, 1);
            return;
        }
    }
};

//вообще должен быть сингелтон
var styleHookManager;
if (!styleHookManager)
    styleHookManager = new StyleHookManager();;
var timelineParams = {
    selectedCombo: 4,
    proxyUrl: '',
    exMap: { host: "maps.kosmosnimki.ru", name: "PLDYO" },
    layers: {
        "MODIS": {
            viewTimeline: true,
            name: "3AD0B4A220D349848A383D828781DF4C",
            dateColumnName: "lastday",
            palette: {
                ndvi: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/palettes/NDVI_interp_legend.icxleg.xml',
                    prodtype: "NDVI16"
                },
                quality: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/ndvipublic/legend/QC_grade_1-5.icxleg',
                    prodtype: "QUALITY16"
                }
            }
        },
        "HR": {
            name: "2E9D38607BB4456AB9C04E2248ED5015",
            dateColumnName: "acqdate",
            palette: {
                ndvi: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/palettes/NDVI_interp_legend.icxleg.xml',
                    prodtype: "NDVI"
                },
                quality: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/ndvipublic/legend/legend_class_1-5.icxleg',
                    prodtype: "FIELD"
                }
            }
        },
        "SENTINEL": {
            viewTimeline: true,
            name: "58A10C3522764BA69D2EA75B02E8A210",
            dateColumnName: "acqdate",
            showQuicklooks: false,
            cloudsField: "CLOUDS"
        },
        "SENTINEL_NDVI": {
            name: "2DFFD2B32C754770BD7D289AB8986CC4",
            dateColumnName: "acqdate",
            palette: {
                ndvi: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/palettes/NDVI_interp_legend.icxleg.xml',
                    prodtype: "NDVI"
                }
            }
        },
        "RGB": {
            viewTimeline: true,
            name: "04DDB23F49F84B9A9122CBA6BC26D3ED",
            dateColumnName: "ACQDATE",
            showQuicklooks: false,
            cloudsField: "CLOUDS"
        },
        "RGB2": {
            name: "47A9D4E5E5AE497A8A1A7EA49C7FC336",
            dateColumnName: "ACQDATE"
        },
        "CLASSIFICATION": {
            name: "0C94757D72C34876AD1CFEEE9FD8E902",
            dateColumnName: "acqdate",
            palette: {
                classification: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/ndvipublic/legend/CLASS_grade_1-5.icxleg',
                    prodtype: "CLASSIFICATION"
                }
            }
        },
        "FIRES": {
            name: "F2840D287CD943C4B1122882C5B92565",
            dateColumnName: "DateTime",
            timelineMode: "screen",
            viewTimeline: true
        },
        "OPERATIVE_MODIS_AQUA_NDVI": {
            viewTimeline: true,
            name: "D0EC9464BFBE4A09BA0EEDF983CBBA08",
            dateColumnName: "acqdate",
            palette: {
                ndvi: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/palettes/NDVI_interp_legend.icxleg.xml',
                }
            }
        },
        "OPERATIVE_MODIS_TERRA_NDVI": {
            viewTimeline: true,
            name: "6CCDFB87663D431CA0B22CCDE4892859",
            dateColumnName: "acqdate",
            palette: {
                ndvi: {
                    url: 'http://maps.kosmosnimki.ru/api/plugins/palettes/NDVI_interp_legend.icxleg.xml',
                }
            }
        },
        "LANDSAT": {
            viewTimeline: true,
            name: "7E81339914D54801A50DD986FD4333AC",
            dateColumnName: "ACQDATE",
            showQuicklooks: false,
            cloudsField: "CLOUDS"
        }
    },
    combo: [{
        hide: true,
        resolution: "modis",
        caption: "Композиты 16 дн",
        rk: ["MODIS"]
    }, {
        hide: true,
        resolution: "landsat",
        clouds: true,
        cloudsMin: 50,
        caption: "Космосъемка 10-30 м",
        rk: ["HR", "RGB", "RGB2", "CLASSIFICATION", "SENTINEL", "SENTINEL_NDVI"]
    }, {
        hide: true,
        caption: "Космосъемка 250 м",
        rk: ["OPERATIVE_MODIS_AQUA_NDVI", "OPERATIVE_MODIS_TERRA_NDVI"]
    }, {
        hide: false,
        caption: "Пожары",
        rk: ["FIRES"]
    }, {
        caption: "Landsat 8 (с 2013 г.)",
        clouds: true,
        cloudsMin: 50,
        resolution: "landsat",
        rk: ["LANDSAT"]
    }]
};;
var TimelineProxyLayer = function (agroTimeline, layer, lmap) {
    this._agroTimeline = agroTimeline;
    this.lmap = lmap;
    this.serverLayer = null;
    this.localLayer = null;
    this._observer = null;
    this._dataCache = {};
    this.dateColumnIndex = -1;
    this.name = null;

    layer && this.bindLayer(layer);
    this._init();
    this._prevBounds = null;
    this._bounds;
};

TimelineProxyLayer.cloneProperties = function (prop) {
    var mapName = "";
    if (nsGmx && nsGmx.gmxMap) {
        mapName = nsGmx.gmxMap.properties.name;
    }

    return {
        "DateBegin": prop.DateBegin,
        "DateEnd": prop.DateEnd,
        "GeometryType": prop.GeometryType,
        "LayerID": "proxy_" + prop.LayerID,
        "MaxZoom": prop.MaxZoom,
        "MinZoom": prop.MinZoom,
        "IsRasterCatalog": prop.IsRasterCatalog,
        "RCMinZoomForRasters": prop.RCMinZoomForRasters,
        "mapName": mapName,
        "Temporal": prop.Temporal,
        "TemporalColumnName": prop.TemporalColumnName,
        "ZeroDate": prop.ZeroDate,
        "attrTypes": [].concat(prop.attrTypes),
        "attributes": [].concat(prop.attributes),
        "hostName": prop.hostName,
        "identityField": prop.identityField,
        "name": "proxy_" + prop.name,
        "type": prop.type,
        "styles": prop.styles
    }
};

TimelineProxyLayer.prototype.delete = function () {
    this._dataCache = {};
    this.serverLayer.removeObserver(this._observer);
    this._observer = null;
    this.lmap.removeLayer(this.localLayer);
    this.localLayer = null;
};

TimelineProxyLayer.prototype._init = function () {
    var that = this;
    this.lmap.on("moveend", function () {
        that.serverLayer && that.update();
    });
};

TimelineProxyLayer.prototype.update = function () {
    NDVITimelineManager.fires_ht = {};
    this._prevBounds = this._bounds;
    this._bounds = this.lmap.getBounds();
    this._observer && this._observer.setBounds(this._bounds);
    this._dataCache = {};
};

TimelineProxyLayer.prototype.bindLayer = function (layer) {

    this._prevBounds = this._bounds = this.lmap.getBounds();

    this.serverLayer = layer;

    var prop = layer.getGmxProperties();
    prop = TimelineProxyLayer.cloneProperties(prop);
    this.name = prop.name;
    this.localLayer = L.gmx.createLayer({ "properties": prop });

    var that = this;

    var tcln = layer.getGmxProperties().TemporalColumnName;
    this.dateColumnIndex = layer._gmx.tileAttributeIndexes[tcln];
    var dm = layer._gmx.dataManager;

    dm.addFilter('myDateFilter', function (item) {
        if (that.lastTimeStamp !== item.properties[that.dateColumnIndex]) {
            that.lastTimeStamp = item.properties[that.dateColumnIndex];
            return item.properties;
        }
        return null;
    });

    this._observer = layer.addObserver({
        type: "update",
        bounds: this.lmap.getBounds(),
        dateInterval: [new Date(), new Date()],
        filters: ['clipFilter', 'TemporalFilter', 'myDateFilter'],
        callback: function (data) {
            var arr = data.added || [];
            var features = [];
            for (var i = 0; i < arr.length; i++) {
                var item = arr[i].properties;
                var dt = item[that.dateColumnIndex] * 1000;
                var date = new Date(dt);
                item[that.dateColumnIndex] = Math.round(shared.clearDate(dt) / 1000);
                var key = date.getDate() + "_" + (date.getMonth() + 1) + "_" + date.getFullYear();

                if (!that._dataCache[key]) {
                    that._dataCache[key] = item;
                    features.push(item);
                }
            }
            arr.length && that.localLayer.addData(features);
            NDVITimelineManager.fires_ht = {};
            setTimeout(function () {
                NDVITimelineManager.fires_ht = {};
                that._agroTimeline.timeLine.updateFilters();
                that._agroTimeline.refreshSelections();
            }, 300);
        }
    });
};

TimelineProxyLayer.prototype.setDateInterval = function (startDate, endDate) {
    this._observer && this._observer.setDateInterval(startDate, endDate);
};;
var SwitchControl = function (params) {
    this._element = null;

    this._onshow = params && params.onshow;
    this._onhide = params && params.onhide;
    this._parentId = params && params.parentId;

    this._isCollapsed = false;

    this.initialize();
};

SwitchControl.prototype.show = function (manually) {
    if (this._isCollapsed) {
        this._isCollapsed = false;
        this._onshow && this._onshow(manually);
        this._element.classList.remove("switcherButtonMaximize");
        this._element.classList.add("switcherButtonMinimize");
    }
};

SwitchControl.prototype.hide = function (manually) {
    if (!this._isCollapsed) {
        this._isCollapsed = true;
        this._onhide && this._onhide(manually);
        this._element.classList.remove("switcherButtonMinimize");
        this._element.classList.add("switcherButtonMaximize");
    }
};

SwitchControl.prototype.switch = function (manually) {
    if (this._isCollapsed) {
        this.show(manually);
    } else {
        this.hide(manually);
    }
};

SwitchControl.prototype.initialize = function () {
    this._element = document.createElement('div');

    if (this._parentId) {
        this.appendTo(document.getElementById(this._parentId));
    }

    this._element.classList.add("switcherControl");
    this._element.classList.add("switcherButtonMinimize");

    var that = this;
    this._element.onclick = function (e) {
        e.stopPropagation();
        that.switch(true);
    };

    this._element.ondblclick = function (e) {
        e.stopPropagation();
    };
    this._element.ontouchstart = function (e) {
        e.preventDefault();
        e.stopPropagation();
        that.switch(true);
    };
};

SwitchControl.prototype.appendTo = function (parent) {
    parent.appendChild(this._element);
};

SwitchControl.prototype.setStyle = function (attr, value) {
    this._element.style[attr] = value;
};

SwitchControl.prototype.onShow = function (callback) {
    this._onshow = callback;
};

SwitchControl.prototype.onHide = function (callback) {
    this._onhide = callback;
};

SwitchControl.prototype.isCollapsed = function () {
    return this._isCollapsed;
};;
/**
 params = {
  items:[{"type":"checkbox", 
 	"id"="chkQl", 
	"text":"Hello world", 
	"click":function(e){ console.log("Hello world"); }}]
 }
*/

var OptionsMenu = function (elementId, params) {

    var button = document.createElement("div");
    button.classList.add("ntBtnOptions");
    button.title = "Дополнительные настройки";
    button.tabIndex = "100";
    document.getElementById(elementId).appendChild(button);

    var _optionsMenu = document.createElement("div");
    _optionsMenu.classList.add("ntOptionsMenu");
    _optionsMenu.style.display = "none";
    _optionsMenu.innerHTML =
        '<div id="ntOptionsArrowDiv" class="ntOptionsArrowDiv">\
          <div id="ntOptionsHead">\
            <div id="ntOptionsHeadLabel">Дополнительные параметры</div>\
            <div id="ntOptionsCloseBtn">×</div>\
          </div>\
        <div>';
    document.body.appendChild(_optionsMenu);

    var that = this;

    document.getElementById("ntOptionsCloseBtn").onclick = function () {
        that.hide();
    };

    params = params || {};
    this.items = [];

    this.getMenuContainer = function () {
        return _optionsMenu;
    };

    this.show = function () {
        _optionsMenu.style.display = "block";
        that._isOpened = true;
        that._dontClose = true;
        setTimeout(function () {
            that._dontClose = false;
        }, 100);
    };

    this.hide = function () {
        that._isOpened = false;
        that._dontClose = false;
        _optionsMenu.style.display = "none";
    };

    this._dontClose = false;

    _optionsMenu.onmouseover = function () {
        this._dontClose = true;
    };

    this._isOpened = false;

    function focusOut() {
        setTimeout(function () {
            if (!that._dontClose) {
                that._isOpened = false;
                _optionsMenu.style.display = "none";
            }
        }, 100);
    };

    button.onclick = function () {
        if (that._isOpened) {
            that.hide();
        } else {
            that.show();
        }
    };

    this.getButtonElement = function () {
        return button;
    };

    this.getMenuElement = function () {
        return document.getElementById("ntOptionsArrowDiv");
    };

    if (params.items) {
        for (var i = 0; i < params.items.length; i++) {
            this.addItem(params.items[i]);
        }
    }
};

OptionsMenu.prototype.addItem = function (item) {
    this.items.push(item);
    var menu = this.getMenuElement();

    var itemDiv = document.createElement("div");
    itemDiv.classList.add("ntOptionsMenuItemLine");
    item.lineId && (itemDiv.id = item.lineId);
    item.class && itemDiv.classList.add(item.class);

    if (item.type == "checkbox") {
        var id = (item.id || "nt-menu-item_" + (this.items.length - 1));
        itemDiv.innerHTML = '<div class="ntOptionsMenuInput"> \
                              <input style="cursor:pointer" type="checkbox" id="' + id + '"></input> \
                            </div> \
                            <div class="ntOptionsMenuLabel" title="' + item.text + '">' + item.text + '</div>';
        menu.appendChild(itemDiv);
        var inp = document.getElementById(id);
        inp.onchange = function (e) {
            item.click(this);
        };
    }
};
;
var NDVITimelineSlider = function (id, events, lmap) {
    var element = document.getElementById(id);
    var mouseX;
    var mouseOver = false;
    var slide = false;
    var posX,
        clkX;

    var onmouseup = events.onmouseup;
    var onmove = events.onmove;
    var onclick = events.onclick;

    var pointerIndex = -1;

    var message = { "state": 0, "bag": {} };

    function _limit0(left) {
        if (left > parseInt(pointer1.style.left)) {
            return parseInt(pointer1.style.left);
        }
        return left;
    };

    function _limit1(left) {
        if (left < parseInt(pointer0.style.left)) {
            return parseInt(pointer0.style.left);
        }
        return left;
    };

    var limitCallback = null;

    //��� ��������
    var pointer0 = document.createElement("div");
    pointer0.style.display = "none";
    pointer0.classList.add("ntSliderPointer0");
    pointer0.classList.add("ntSliderPointerLight0");
    element.appendChild(pointer0);

    var caption0 = document.createElement("div");
    caption0.style.display = "none";
    caption0.classList.add("ntSliderCaption");
    caption0.classList.add("ntCaptionRight");
    caption0.innerHTML = "";
    element.appendChild(caption0);

    var pointer1 = document.createElement("div");
    pointer1.style.display = "none";
    pointer1.classList.add("ntSliderPointer1");
    pointer1.classList.add("ntSliderPointerLight1");
    element.appendChild(pointer1);

    var caption1 = document.createElement("div");
    caption1.style.display = "none";
    caption1.classList.add("ntSliderCaption");
    caption1.classList.add("ntCaptionRight");
    caption1.innerHTML = "";
    element.appendChild(caption1);

    //���� �������
    var pointer = document.createElement("div");
    pointer.classList.add("ntSliderPointer");
    pointer.classList.add("ntSliderPointerLight");
    element.appendChild(pointer);

    var caption = document.createElement("div");
    caption.classList.add("ntSliderCaption");
    caption.classList.add("ntCaptionRight");
    caption.innerHTML = "";
    element.appendChild(caption);

    var selectedCaption = caption,
        selectedPointer = pointer;


    this.getContainer = function () {
        return element;
    };

    this.getState = function () {
        return message;
    };

    this.getCaption = function () {
        return caption.innerHTML;
    };

    this.getCaption0 = function () {
        return caption0.innerHTML;
    };

    this.getCaption1 = function () {
        return caption1.innerHTML;
    };

    this.getOffsetLeft = function (index) {
        if (index == undefined || index == -1) {
            return pointer.offsetLeft - parseInt($(pointer).css("margin-left"));
        }
        if (index == 0) {
            return pointer0.offsetLeft - parseInt($(pointer0).css("margin-left"));
        }
        if (index == 1) {
            return pointer1.offsetLeft - parseInt($(pointer1).css("margin-left"));
        }
    };

    this.updatePositions = function (ratio) {
        pointer.style.left = (parseFloat(pointer.style.left) * ratio) + "px";
        pointer0.style.left = (parseFloat(pointer0.style.left) * ratio) + "px";
        pointer1.style.left = (parseFloat(pointer1.style.left) * ratio) + "px";

        caption.style.left = (parseFloat(caption.style.left) * ratio) + "px";
        caption0.style.left = (parseFloat(caption0.style.left) * ratio) + "px";
        caption1.style.left = (parseFloat(caption1.style.left) * ratio) + "px";
    };

    this.getOffsetLeft0 = function () {
        return pointer0.offsetLeft - parseInt($(pointer0).css("margin-left"));
    };

    this.getOffsetLeft1 = function () {
        return pointer1.offsetLeft - parseInt($(pointer1).css("margin-left"));
    };

    this.setCaption = function (text) {
        caption.innerHTML = text;
    };

    this.setCaption0 = function (text) {
        caption0.innerHTML = text;
    };

    this.setCaption1 = function (text) {
        caption1.innerHTML = text;
    };

    var that = this;

    //�������
    pointer.ontouchstart = function (e) {
        pointerIndex = -1;
        selectedPointer = pointer;
        selectedCaption = caption;
        limitCallback = null;
        lmap.dragging.disable();
        e.preventDefault();
        posX = e.changedTouches[0].pageX;
        onMouseDown();
    };

    pointer0.ontouchstart = function (e) {
        pointerIndex = 0;
        selectedPointer = pointer0;
        selectedCaption = caption0;
        limitCallback = _limit0;
        lmap.dragging.disable();
        e.preventDefault();
        posX = e.changedTouches[0].pageX;
        onMouseDown();
    };

    pointer1.ontouchstart = function (e) {
        pointerIndex = 1;
        selectedPointer = pointer1;
        selectedCaption = caption1;
        limitCallback = _limit1;
        lmap.dragging.disable();
        e.preventDefault();
        posX = e.changedTouches[0].pageX;
        onMouseDown();
    };

    //����0
    pointer0.onmousedown = function (e) {
        pointerIndex = 0;
        selectedPointer = pointer0;
        selectedCaption = caption0;
        limitCallback = _limit0;
        onMouseDown();
    };

    pointer0.onmouseup = function (e) {
        onMouseUp();
    };

    pointer0.onmouseover = function () {
        mouseOver = true;
    };

    pointer0.onmouseleave = function () {
        mouseOver = false;
    };

    //����1
    pointer1.onmousedown = function (e) {
        pointerIndex = 1;
        selectedPointer = pointer1;
        selectedCaption = caption1;
        limitCallback = _limit1;
        onMouseDown();
    };

    pointer1.onmouseup = function (e) {
        onMouseUp();
    };

    pointer1.onmouseover = function () {
        mouseOver = true;
    };

    pointer1.onmouseleave = function () {
        mouseOver = false;
    };

    //����
    pointer.onmousedown = function (e) {
        pointerIndex = -1;
        selectedPointer = pointer;
        selectedCaption = caption;
        limitCallback = null;
        onMouseDown();
    };

    pointer.onmouseup = function (e) {
        onMouseUp();
    };

    pointer.onmouseover = function () {
        mouseOver = true;
    };

    pointer.onmouseleave = function () {
        mouseOver = false;
    };

    this.setPeriodSelector = function (period) {
        if (period) {
            selectedPointer = pointer0;
            caption.style.display = "none";
            pointer.style.display = "none";
            caption0.style.display = "block";
            caption1.style.display = "block";
            pointer0.style.display = "block";
            pointer1.style.display = "block";
            pointer0.style.left = pointer.style.left;
            pointer1.style.left = pointer.style.left;
            caption0.style.left = caption.style.left;
            caption1.style.left = caption.style.left;
            caption0.innerHTML = caption.innerHTML;
            caption1.innerHTML = caption.innerHTML;
        } else {
            selectedPointer = pointer;
            selectedCaption = caption;
            caption.style.display = "block";
            caption.style.left = caption0.style.left;
            pointer.style.display = "block";
            pointer.style.left = pointer0.style.left;
            pointer0.style.display = "none";
            pointer1.style.display = "none";
            caption0.style.display = "none";
            caption1.style.display = "none";
            caption0.style.left = caption.style.left;
            caption1.style.left = caption.style.left;
            caption0.innerHTML = caption.innerHTML;
            caption1.innerHTML = caption.innerHTML;
            limitCallback = null;
        }
    };

    this.setActivePointer = function (index) {
        if (index == 0) {
            limitCallback = _limit0;
            selectedPointer = pointer0;
            selectedCaption = caption0;
        } else if (index == 1) {
            limitCallback = _limit1;
            selectedPointer = pointer1;
            selectedCaption = caption1;
        } else {
            limitCallback = null;
            selectedPointer = pointer;
            selectedCaption = caption;
        }
    };

    this.setValue = function (left, text) {

        if (limitCallback) {
            left = limitCallback(left);
        }

        if (left < 0) {
            left = 0;
        } else if (left > element.clientWidth) {
            left = element.clientWidth;
        }

        if (left >= element.clientWidth - 70) {
            if (selectedCaption.classList.contains("ntCaptionRight")) {
                selectedCaption.classList.add("ntCaptionLeft");
                selectedCaption.classList.remove("ntCaptionRight");
            }
        } else if (selectedCaption.classList.contains("ntCaptionLeft")) {
            selectedCaption.classList.add("ntCaptionRight");
            selectedCaption.classList.remove("ntCaptionLeft");
        }

        selectedPointer.style.left = left + "px";
        selectedCaption.style.left = left + "px";

        if (text) {
            selectedCaption.innerHTML = text;
        }
    };

    function onMouseMove() {
        if (slide) {
            var left = posX - clkX;
            if (onmove && parseInt(message.state) != left) {
                that.setValue(left);
                message.state = left;
                message.pointerIndex = pointerIndex;
                onmove.call(that, message, selectedCaption);
            }
        }
    };

    function onMouseUp() {
        if (slide) {
            document.onselectstart = function () { return true; };
            if (slide && onmouseup) {
                message.state = parseInt(selectedPointer.style.left);
                message.pointerIndex = pointerIndex;
                onmouseup.call(that, message);
            }
            slide = false;
        }
    };

    function onMouseDown() {
        document.onselectstart = function () { return false; };
        var currX = 0;
        if (selectedPointer.style.left.length > 0) {
            currX = parseInt(selectedPointer.style.left);
        }
        clkX = posX - currX;
        if (!slide) {
            if (onclick) {
                message.state = parseInt(selectedPointer.style.left || 0);
                message.pointerIndex = pointerIndex;
                onclick.call(that, message);
            }
        }
        slide = true;
    };

    //�������
    document.addEventListener('touchmove', function (e) {
        if (slide) {
            e.preventDefault();
        }
        posX = e.changedTouches[0].pageX;
        onMouseMove();
    }, false);

    document.addEventListener("touchend", function (e) {
        if (slide) {
            lmap.dragging.enable();
            e.preventDefault();
        }
        onMouseUp();
    }, false);

    //�����
    $(document.body).on("mousemove", function (e) {
        posX = e.screenX;
        onMouseMove();
    });

    $(document.body).on("mouseup", function (e) {
        onMouseUp();
    });
};;
var NDVITimelineManager = function (lmap, params, userRole, container) {

    //leaflet map
    this.lmap = lmap;

    this._container = container || document.getElementById("flash");

    //этот параметр не рассматривается с точки зрения безопасноти, 
    //только лишь изменяет функциональность
    this._userRole = userRole;

    this._exMap = params.exMap;
    this._layersLegend = params.layers;

    //добавочные слои с масками
    this._layersLegend["LANDSAT2016"] = {
        name: "8288D69C7C0040EFBB7B7EE6671052E3",
        mask: "A05BB0207AEE4CFD93C045BF71576FDE",
        palette: params.layers.HR.palette
    };
    this._layersLegend["SENTINEL2016"] = {
        name: "EC68D0C097BE4F0B9E9DE4A0B9F591A2",
        mask: "14A988CBC5FD424D9EBE23CEC8168150",
        palette: params.layers.HR.palette
    }

    this._combo = params.combo;

    //addCombo - [{ "caption": "LANDSAT-8", "rk": ["RGB753", "RGB432"] }]
    //addLayers - { "RGB753": { "viewTimeline": true, "name": "7E81339914D54801A50DD986FD4333AC", "dateColumnName": "ACQDATE" }, "RGB432": { "name": "47A9D4E5E5AE497A8A1A7EA49C7FC336", "dateColumnName": "ACQDATE" } }
    //disableOptions - true
    //selectedCombo - 4

    //дополнительные параметры
    params.addCombo && this._combo.push.apply(this._combo, JSON.parse(params.addCombo));
    if (params.addLayers) {
        var al = JSON.parse(params.addLayers);
        for (i in al) {
            params.layers[i] = al[i];
        }
    }

    if (params.disableOptions)
        this.disableOptions = true;

    this._layerConfigs = {};

    this._dateColumnNames = {};
    this._ndviProdtypes = [];
    for (var p in this._layersLegend) {
        this._dateColumnNames[this._layersLegend[p].name] = this._layersLegend[p].dateColumnName;
        var pp = this._layersLegend[p].palette;
        if (pp) {
            if (pp.ndvi) {
                this._ndviProdtypes.push(pp.ndvi.prodtype);
            }
        }
        this._layerConfigs[this._layersLegend[p].name] = this._layersLegend[p];
    }

    //к какому комбо принадлежит слой
    this._layerInCombo = {};
    //в каком комбо содержатся слои(их названия)
    this._comboAsLayers = [];
    for (var i = 0; i < this._combo.length; i++) {
        this._comboAsLayers[i] = [];
        var r = this._combo[i].rk;
        for (var j = 0; j < r.length; j++) {
            var n = this._layersLegend[r[j]].name;
            this._layerInCombo[n] = i;
            this._comboAsLayers[i][j] = n;
        }
    }

    //загруженные палитры по url'ам
    this._palettes = {};

    //текущий выбранный комбо слой
    this._selectedCombo = params.selectedCombo != undefined ? params.selectedCombo : 1;
    //this._comboSql = [];
    this._comboFilenames = [];

    this._radioButtonLabels = [];

    //текущий индекс увеличения
    this._currentZoom;

    //видимые текущие слои на экране(получаем из хука по стилям)
    this._visibleFieldsLayers = {};
    //this._visibleLayerOnTheDisplay = null;
    this._visibleLayersOnTheDisplay = [];
    this._visibleLayersOnTheDisplayPtr = [];

    //инициализация модуля посторения тематики по средним NDVI
    var ts = new ThematicStrategy(params.layers.HR.palette.ndvi.url, function (val) {
        var color;
        val = Math.round(val);
        if (val == 0 || val == -100) {
            color = shared.RGB2HEX(0, 179, 255);
        } else if (val < 101) {
            color = shared.RGB2HEX(0, 0, 0);
        } else if (val > 201) {
            color = shared.RGB2HEX(255, 255, 255);
        } else {
            var c = this.palette[val];
            color = shared.RGB2HEX(c.partRed, c.partGreen, c.partBlue);
        }
        return color;
    });

    this._themesHandler = new ThematicHandler(ts);
    this._themesHandler.manualOnly = false;
    this._themesHandler.dataSource = "F28D06701EF2432DB21BFDB4015EF9CE";
    this._themesHandler.dataSource2016 = "F7BF28C501264773B1E7C236D81E963C";
    this._themesHandler.katalogName = this._layersLegend.HR.name;
    var that = this;
    this._themesHandler.errorCallback = function (er) {
        that.meanNdviNoDataLabel.style.display = "block";
    };

    this._themesEnabled = false;
    this._showThemesNDVI = false;
    this._doubleClick = false;

    //инициализация тематического модуля посторения тематики неоднородности
    var tsneondn = new ThematicStrategy(null, function (val) {
        if (val >= 0) {
            var color = this.palette[10 * Math.floor(val / 10)];
            return shared.RGB2HEX(color.r, color.g, color.b);
        }
        return shared.RGB2HEX(0, 179, 255);
    });
    tsneondn._requestValueCallback = ThematicStrategy.__neodnrValue;
    tsneondn.returnDataArr = ["Hist"];
    tsneondn.palette = {
        "0": { "r": 0, "g": 0, "b": 0 },
        "10": { "r": 245, "g": 12, "b": 50 },
        "20": { "r": 245, "g": 12, "b": 50 },
        "30": { "r": 245, "g": 12, "b": 50 },
        "40": { "r": 227, "g": 145, "b": 57 },
        "50": { "r": 230, "g": 200, "b": 78 },
        "60": { "r": 240, "g": 240, "b": 24 },
        "70": { "r": 223, "g": 237, "b": 92 },
        "80": { "r": 179, "g": 214, "b": 109 },
        "90": { "r": 125, "g": 235, "b": 21 },
        "100": { "r": 30, "g": 163, "b": 18 }
    };
    this._neodnrHandler = new ThematicHandler(tsneondn);
    this._neodnrHandler.manualOnly = false;
    this._neodnrHandler.dataSource = "1F7E5026D73447D09897217CE737F565";
    this._neodnrHandler.katalogName = this._layersLegend.CLASSIFICATION.name;

    this._ratingHandler = new Rating();

    //раскрашиватель по уклонам
    //this._slopeManager = new SlopeManager();
    //this._slopeManager.initializeColouredLayer();

    this._currentRKIdArr = []; //для ndvi
    this._currentFnIdArr = []; //для ndvi
    this._currentClassificationFnIdArr = [];
    this._currentClassificationRKIdArr = []; //для неоднородности
    this._selectedDate = null;
    this._selectedDateStr = null;
    this._selectedDateL = null;
    this._selectedPath = null;
    this._selectedLayers = [];
    this._selectedOption = null;

    this._selectedDate0 = null;
    this._selectedDate1 = null;
    this._selectedPeriod = false;

    //указатель на функцию, которая будет вызываться 
    //при переключении снимков по кнопкам
    this._switchYearCallback = null;

    this.timeLine = null;
    //this._deffereds = [];

    this._selectedType = [
        NDVITimelineManager.NDVI16,
        NDVITimelineManager.RGB_HR,
        NDVITimelineManager.NDVI16,
        NDVITimelineManager.NDVI16,
        NDVITimelineManager.FIRES_POINTS,
        NDVITimelineManager.RGB753];

    //ассоциативный по годам массив в котором хранятся:
    //radio - указатель на элемент переключателя,
    //caption - просто указатель на идентификатор года
    //count - указатель на элемент идентификатор кол-ва снимков NDVI за этот год
    this._yearsPanel = [];

    //для каждого снимка по ogc_fid хранит состояние видимости на экране и дату
    //this._observedItems = [];

    //for (var i = 0; i < this._combo.length; i++) {
    //    this._observedItems[i] = [];
    //}
    //текущий год активный
    this.defaultYear = (new Date()).getFullYear();
    this._selectedYear = this.defaultYear;

    //кол-во пикселей указателя мышки до конца табло таймлыйна
    this._mouseTabloPosition;
    this._mouseTabloPosition_X;

    //имя выбранного файла, которое отображается в заголовке
    this.selectedShotFilename = "";
    this.hoverShotFilename = "";

    this.hoverDiv = null;

    //были нажаты кнопки переключения по снимкам
    this.shiftNext = false;
    this.shiftPrev = false;
    //или через слайдер
    this.shiftZero = false;

    //показывает или скрывает таймлайн
    this.switcher = null;
    this._manuallyCollapsed = false;
    this._manuallyUnfolded = false;
    this._attDiv = null;

    this._currentSelection = null;
    this.selectedDiv = null;
    this._selectedDiv = null;//Образовались два указателя, по сути они одинаковые, но где-то баг, который мешает их объединить.

    this._integralIndexes = null;

    //слой и стили которые будем раскрашивать по средним vci
    this._meanVCILayer = null;

    //выбран квиклук
    this._quicklookSelected = false;

    this._firstTimeCombo = [false, false];

    //списки проинициализированных хуков и кликов слоев
    this._layersHookList = {};
    this._layersDblClickList = {};

    this._cutOff = true;

    this.productsAvailability = {};

    this.zoomRestrictionLabel = null;
    this.meanNdviNoDataLabel = null;

    this.timelineItems = [];

    this.layerCollection = {};

    this.layerBounds = null;

    this._proxyOptions = ["F2840D287CD943C4B1122882C5B92565"];
    this._proxyLayers = {};
};

var AgroShared = {};
AgroShared._meanVCIStyleData = {};

NDVITimelineManager.NDVI_HR = 100;
NDVITimelineManager.NDVI16 = 101;
NDVITimelineManager.RGB_HR = 102;
NDVITimelineManager.RGB2_HR = 1021;
NDVITimelineManager.QUALITY16 = 103;
NDVITimelineManager.NDVI_MEAN = 104;
NDVITimelineManager.CLASSIFICATION = 105;
NDVITimelineManager.CONDITIONS_OF_VEGETATION = 106;
NDVITimelineManager.INHOMOGENUITY = 107;
NDVITimelineManager.MEAN_VCI = 108;
NDVITimelineManager.RATING = 109;
NDVITimelineManager.LANDSAT = 110;
NDVITimelineManager.RGB753 = 2000;
NDVITimelineManager.RGB432 = 2001;
NDVITimelineManager.FIRES_POINTS = 5000;

NDVITimelineManager.prodTypes = [];
NDVITimelineManager.prodTypes[NDVITimelineManager.LANDSAT] = "LANDSAT";
NDVITimelineManager.prodTypes[NDVITimelineManager.RGB753] = "RGB753";
NDVITimelineManager.prodTypes[NDVITimelineManager.RGB432] = "RGB432";

//поправка слайлера на рисочках, зависит от длинны слайдера и диапазона на таймлайне
NDVITimelineManager.SLIDER_EPSILON = 28;

//если выбранный год на таймлайне отображается больше или меньше заданного интервала
NDVITimelineManager.RANGE_CALIBRATION = -3;

NDVITimelineManager.getLayerBounds = function (layersArr) {
    var minLat = 100000000,
        minLng = 100000000,
        maxLat = -100000000,
        maxLng = -100000000;

    for (var i = 0; i < layersArr.length; i++) {
        var b = layersArr[i].getBounds();
        var ne = b.getNorthEast(),
            sw = b.getSouthWest();
        if (sw.lat < minLat) minLat = sw.lat;
        if (sw.lng < minLng) minLng = sw.lng;
        if (ne.lat > maxLat) maxLat = ne.lat;
        if (ne.lng > maxLng) maxLng = ne.lng;
    }

    return L.polygon([L.latLng(minLat, minLng), L.latLng(maxLat, minLng), L.latLng(maxLat, maxLng), L.latLng(minLat, maxLng), L.latLng(minLat, minLng)]);
};

NDVITimelineManager.prototype.repaintVisibleLayers = function (hash) {
    for (var i = 0; i < this._visibleLayersOnTheDisplayPtr.length; i++) {
        if (!$.isEmptyObject(hash)) {
            this._visibleLayersOnTheDisplayPtr[i].repaint(hash);
        }
    }
};

NDVITimelineManager.prototype.repaintAllVisibleLayers = function () {
    for (var i = 0; i < this._visibleLayersOnTheDisplayPtr.length; i++) {
        this._visibleLayersOnTheDisplayPtr[i].repaint();
    }
};

// это нужно для NDVITimelineManager._normalizeFilename
NDVITimelineManager._rkId = {
    "HR": NDVITimelineManager.NDVI_HR,
    "RGB": NDVITimelineManager.RGB_HR,
    "RGB2": NDVITimelineManager.RGB2_HR,
    "MODIS": NDVITimelineManager.QUALITY16,
    "CLASSIFICATION": NDVITimelineManager.CLASSIFICATION
};

NDVITimelineManager.prototype.setWidth = function (width, right) {
    var vis = !(this.timeLine.getContainer()[0].style.display == "none");

    var deltaWidth = (right || 20) + 100;
    //content width
    $(this.timeLine.getContainer()).attr("style", "width:" + width + "px !important");

    //frame width
    var frameWidth = width - deltaWidth;
    var t = this.timeLine.getTimelineController().getTimeline();
    $(t.dom.frame).attr("style", "width:" + frameWidth + "px !important");
    t.setSize(frameWidth, t.size.frameHeight);
    t.checkResize();

    var sliderRatio = frameWidth / this._slider.getContainer().clientWidth;
    //slider
    $("#ntSliderBar").attr("style", "width:" + frameWidth + "px !important");
    this._slider.updatePositions(sliderRatio);

    //background color    
    $(".ntTimelineBackground").attr("style", "width:" + frameWidth + "px !important");

    if (this.lmap.getZoom() <= NDVITimelineManager.MIN_ZOOM) {
        $(".leaflet-iconLayers.leaflet-iconLayers_bottomleft").css("margin-bottom", 10);
    } else {
        $(".leaflet-iconLayers.leaflet-iconLayers_bottomleft").css("margin-bottom", 125);
    }

    this.setTimeLineYear(this._selectedYear);

    $(".ntRightPanel").css("width", width - 422);

    $(".ntOptionsFieldset").css("width", $("#ntRightPanel").width());


    if (this.selectedDiv) {
        this._setSliderState(null, this._selectedDate);
    }

    if (!vis) {
        this.timeLine.toggleVisibility(false);
    } else {
        this.timeLine.toggleVisibility(true);
    }
};

//задаю соответствия слоя из this._layersLegend и радиокнопки вручную
NDVITimelineManager._comboRadios = [{
    "MODIS": "qualityRadio"
}, {
    "HR": "ndviRadio_hr",
    "RGB2": "rgbRadio2",
    "CLASSIFICATION": "classificationRadio",
    "SENTINEL_NDVI": "ndviRadio_hr"
}];

//соответсвия продукт - радиокнопка, нужно для пермалинков
//TODO: было бы хорошо сделать инициализацию панелей по этому дескриптору
NDVITimelineManager.radioProduct = {
    "rgbRadio": { "prodId": NDVITimelineManager.RGB_HR, "numCombo": 1 },
    "rgbRadio2": { "prodId": NDVITimelineManager.RGB2_HR, "numCombo": 1 },
    "ndviRadio_hr": { "prodId": NDVITimelineManager.NDVI_HR, "numCombo": 1 },
    "ndviMeanRadio": { "prodId": NDVITimelineManager.NDVI_MEAN, "numCombo": 1 },
    "inhomogenuityRadio": { "prodId": NDVITimelineManager.INHOMOGENUITY, "numCombo": 1 },
    "classificationRadio": { "prodId": NDVITimelineManager.CLASSIFICATION, "numCombo": 1 },
    "ratingRadio": { "prodId": NDVITimelineManager.RATING, "numCombo": 1 },
    "ndviRadio_modis": { "prodId": NDVITimelineManager.NDVI16, "numCombo": 0 },
    "qualityRadio": { "prodId": NDVITimelineManager.QUALITY16, "numCombo": 0 },
    "conditionsOfVegetationRadio": { "prodId": NDVITimelineManager.CONDITIONS_OF_VEGETATION, "numCombo": 0 },

    "rgbRadio753": { "prodId": NDVITimelineManager.RGB753, "numCombo": 4 },
    "rgbRadio432": { "prodId": NDVITimelineManager.RGB432, "numCombo": 4 },

    "firesPoints": { "prodId": NDVITimelineManager.FIRES_POINTS, "numCombo": 3 }
};

NDVITimelineManager.MIN_ZOOM = 7;
NDVITimelineManager.MIN_ZOOM_HR = 11;

NDVITimelineManager.minZoomOption = {};
NDVITimelineManager.minZoomOption[NDVITimelineManager.NDVI_HR] = NDVITimelineManager.MIN_ZOOM_HR;
NDVITimelineManager.minZoomOption[NDVITimelineManager.NDVI16] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.RGB_HR] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.LANDSAT] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.RGB2_HR] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.QUALITY16] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.NDVI_MEAN] = NDVITimelineManager.MIN_ZOOM_HR;
NDVITimelineManager.minZoomOption[NDVITimelineManager.CLASSIFICATION] = NDVITimelineManager.MIN_ZOOM_HR;
NDVITimelineManager.minZoomOption[NDVITimelineManager.RATING] = NDVITimelineManager.MIN_ZOOM_HR;
NDVITimelineManager.minZoomOption[NDVITimelineManager.CONDITIONS_OF_VEGETATION] = 0;
NDVITimelineManager.minZoomOption[NDVITimelineManager.INHOMOGENUITY] = NDVITimelineManager.MIN_ZOOM_HR;
NDVITimelineManager.minZoomOption[NDVITimelineManager.MEAN_VCI] = NDVITimelineManager.MIN_ZOOM_HR;
NDVITimelineManager.minZoomOption[NDVITimelineManager.RGB753] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.RGB432] = NDVITimelineManager.MIN_ZOOM + 1;
NDVITimelineManager.minZoomOption[NDVITimelineManager.FIRES_POINTS] = NDVITimelineManager.MIN_ZOOM + 1;

NDVITimelineManager.prototype.getMinZoomCurrentSelection = function (prod) {
    return NDVITimelineManager.minZoomOption[prod];
};

NDVITimelineManager.prototype.applyMinZoomCurrentSelection = function (prod) {
    var minZoom = ndviTimelineManager.getMinZoomCurrentSelection(prod);
    if (this.lmap.getZoom() < minZoom) {
        this.lmap.setZoom(minZoom);
        return true;
    }
    return false;
};

NDVITimelineManager.ATTENTION_DIV = '<div id="ntFilenameText">Приблизьте карту для загрузки данных на таймлайн</div>';
NDVITimelineManager.MEANNDVI_NODATA_ERROR = 'Нет данных по выбранному продукту';

NDVITimelineManager.addDays = function (date, days) {
    var result = new Date(date);
    result.setDate(date.getDate() + days);
    return result;
};

NDVITimelineManager.prototype.start = function () {

    this.listenForPeramlink();

    var that = this;
    this.showLoading();

    var p = L.gmx.loadMap(this._exMap.name);

    p.then(function (h) {

        var cr = h.layersByID["04DDB23F49F84B9A9122CBA6BC26D3ED"];
        var styles = cr.getStyles();
        styles.forEach(function (it) {
            it.HoverStyle = it.RenderStyle;
        });
        cr.setStyles(styles);

        //var layersTool = new LayersTool("Адм.границы", [h.layersByID["3BCCB0F1ACFB4A56BAC87ECA31ADA199"], h.layersByID["035A32EDA95D4D2BBBF6E44AF3FA21DD"]]);

        for (var i in h.layersByID) {
            if (nsGmx && nsGmx.widgets && nsGmx.widgets.commonCalendar) {
                nsGmx.widgets.commonCalendar.unbindLayer(i);
            }
            that.layerCollection[i] = h.layersByID[i];
        }

        that._main();
    });

};

NDVITimelineManager.prototype.listenForPeramlink = function () {
    var that = this;
    this._activatePermalink = null;
    window._mapHelper && _mapHelper.customParamsManager.addProvider({
        name: "AgroNDVITimelineProvider",
        saveState: function () {

            var optionsMenu = {};
            $(".ntOptionsMenu").find("input[type='checkbox']").each(function (e, v) {
                optionsMenu[v.id] = v.checked;
            });

            var rad = $('input[name=shotsOptions_' + that._selectedCombo + ']').filter(':checked');
            var radioId = null;
            if (rad.length) {
                radioId = rad[0].id;
            }

            var selectedDate0, selectedDate1;
            if (that._selectedDate0 && that._selectedDate1) {
                selectedDate0 = {
                    "d": that._selectedDate0.getDate(), "m": that._selectedDate0.getMonth() + 1,
                    "y": that._selectedDate1.getFullYear(), "dxdw": that._slider.getOffsetLeft0() / that._slider.getContainer().clientWidth
                }
                selectedDate1 = {
                    "d": that._selectedDate1.getDate(), "m": that._selectedDate1.getMonth() + 1,
                    "y": that._selectedDate0.getFullYear(), "dxdw": that._slider.getOffsetLeft1() / that._slider.getContainer().clientWidth
                }
            }
            var selectedDate = null;
            if (that._selectedDate) {
                selectedDate = { "d": that._selectedDate.getDate(), "m": that._selectedDate.getMonth() + 1, "y": that._selectedDate.getFullYear() }
            }
            return {
                "selectedYear": that._selectedYear,
                "selectedDate": selectedDate,
                "selectedDate0": selectedDate0,
                "selectedDate1": selectedDate1,
                "selectedDiv": (that.selectedDiv ? true : false),
                "selectedCombo": that._selectedCombo,
                "radioId": radioId,
                "chkQl": document.getElementById("chkQl").checked,
                "optionsMenu": optionsMenu
            };
        },
        loadState: function (data) {
            that.loadState(data);
        }
    });
};

NDVITimelineManager.prototype.loadState = function (data) {
    var that = this;

    function restoreOptionsMenu() {
        if (data.optionsMenu) {
            for (var i in data.optionsMenu) {
                document.getElementById(i).checked = data.optionsMenu[i];
            }
        }

        if (!document.getElementById("chkCut").checked) {
            that.setCutOff(document.getElementById("chkCut"));
        }

        if (document.getElementById("cloudMask").checked) {
            that._useCloudMask = true;
        }

        if (data.chkQl) {
            that.qlCheckClick(document.getElementById("chkQl"));
        }

        data.optionsMenu = null;
    };

    //эти параметры применяются до того как произойдет инициализация таймлайна
    that._selectedCombo = data.selectedCombo;
    that._selectedYear = data.selectedYear;
    that._selectedPeriod = false;
    if (data.selectedDate0 && data.selectedDate1) {
        that._selectedPeriod = true;
    }

    if (that._selectedPeriod) {
        that._selectedDate0 = new Date(data.selectedDate0.y, data.selectedDate0.m - 1, data.selectedDate0.d);
        that._selectedDate1 = new Date(data.selectedDate1.y, data.selectedDate1.m - 1, data.selectedDate1.d);
    }

    //по умолчанию ничего не выбрано
    that._activatePermalink = function () {
        restoreOptionsMenu();
        if (that._combo[data.selectedCombo].rk[0] == "FIRES") {
            document.getElementById("ntPeriodSelectOption").style.display = "block";
            $(".ntOptionsHR").css("display", "none");
            $(".ntOptionsMODIS").css("display", "none");
        }
    }

    //этот пермалинк активируется для периода, который доступен только для пожаров.
    if (data.selectedDate0 && data.selectedDate1) {
        that._activatePermalink = function () {
            restoreOptionsMenu();
            that._slider.setPeriodSelector(true);
            document.getElementById("ntPeriodSelectOption").style.display = "block";
            $(".ntOptionsHR").css("display", "none");
            $(".ntOptionsMODIS").css("display", "none");
            $(".ntYearSwitcher").css("display", "none");
            document.getElementById("setDoubleSlide").checked = true;

            that._slider.setActivePointer(1);
            that._slider.setValue(Math.round(data.selectedDate1.dxdw * that._slider.getContainer().clientWidth));

            that._slider.setActivePointer(0);
            that._slider.setValue(Math.round(data.selectedDate0.dxdw * that._slider.getContainer().clientWidth));

            that._slider.setCaption0(data.selectedDate0.d + "." + data.selectedDate0.m + "." + data.selectedDate0.y);
            that._slider.setCaption1(data.selectedDate1.d + "." + data.selectedDate1.m + "." + data.selectedDate1.y);

            that.refreshSliderPeriod();
        }
    }

    //выбрана одна риска
    if (data.selectedDate && data.selectedDiv) {
        that._selectedDate = new Date(data.selectedDate.y, data.selectedDate.m - 1, data.selectedDate.d);
        //...а эти после
        //отложенный вызов активации по пермалику, после загрузки снимков на таймлайн
        that._activatePermalink = function () {

            restoreOptionsMenu();

            if (that._combo[data.selectedCombo].rk[0] == "FIRES") {
                document.getElementById("ntPeriodSelectOption").style.display = "block";
                $(".ntOptionsHR").css("display", "none");
                $(".ntOptionsMODIS").css("display", "none");
            }

            if (data.radioId) {
                that.setActiveRadio(data.radioId);
            }

            var tl = this.timeLine.getTimelineController().getTimeline();
            var currItem = null;
            for (var i = 0; i < tl.items.length; i++) {
                var item = tl.items[i];
                var itemDate = new Date(item.center);

                if (itemDate.getDate() == that._selectedDate.getDate() &&
                itemDate.getFullYear() == that._selectedDate.getFullYear() &&
                itemDate.getMonth() == that._selectedDate.getMonth()) {
                    currItem = item;
                    break;
                }
            }

            if (currItem) {
                that.setTimeLineYear(that._selectedYear);
                if (data.chkQl) {
                    document.getElementById("chkQl").checked = true;
                    that.qlCheckClick(document.getElementById("chkQl"), data);
                } else {
                    tl.setSelection([{ "row": tl.getItemIndex(currItem.dom) }]);
                    that.timeLine.shiftActiveItem(0);
                    that.setTimeLineYear(that._selectedYear);
                }
            }
        };
    }
}

NDVITimelineManager.prototype.refreshOptionsDisplay = function () {
    var rkName = this._combo[this._selectedCombo].rk[0];
    if (rkName == "FIRES") {
        document.getElementById("ntPeriodSelectOption").style.display = "block";
        $(".ntOptionsHR").css("display", "none");
        $(".ntOptionsMODIS").css("display", "none");
    } else if (rkName == "MODIS") {
        $(".ntOptionsMODIS").css("display", "block");
        document.getElementById("ntPeriodSelectOption").style.display = "none";
        $(".ntOptionsHR").css("display", "none");
    } if (rkName == "HR") {
        $(".ntOptionsHR").css("display", "block");
        document.getElementById("ntPeriodSelectOption").style.display = "none";
        $(".ntOptionsMODIS").css("display", "none");
    } if (rkName == "LANDSAT" || rkName == "SENTINEL") {
        $(".ntOptionsHR").css("display", "none");
        $(".ntOptionsMODIS").css("display", "none");
        $("#chkQl").parent().parent().css("display", "block");
    }
};

/** Эта функция нужна для подгона периода таймлайна при изменении его размеров. */
NDVITimelineManager.getEpsilon = function (x) {
    return 176.657 - 0.352079 * x + 0.000235975 * x * x - 5.434100986316832 * Math.pow(10, -8) * x * x * x;
};

NDVITimelineManager.prototype.setTimeLineYear = function (year) {
    this.timeLine.setVisibleRange(new Date(year, 0, 2),
        new Date(year + 1, 1, NDVITimelineManager.getEpsilon(document.getElementById("ntSliderBar").clientWidth)));
    document.getElementById("ntYear").innerHTML = year;
};

NDVITimelineManager.prototype._main = function () {

    //сохраняем слои карты в общую коллекцию
    if (nsGmx && nsGmx.gmxMap) {
        for (var i in nsGmx.gmxMap.layersByID) {
            this.layerCollection[i] = nsGmx.gmxMap.layersByID[i];
        }
    } else if (window.cosmosagro && cosmosagro.layersHash) {
        //для проекта без редактора
        for (var i in cosmosagro.layersHash) {
            this.layerCollection[i] = cosmosagro.layersHash[i];
        }
    }

    this.hideLoading();

    if (!nsGmx.TimelineControl) {
        showErrorMessage("Для работы плагина NDVITimelinePlugin необходимо подключить плагин Timeline Rasters.");
        return;
    }

    this._initSwitcher();
    this.initializeTimeline(true);
    this.applyZoomHandler();

    //Слой на экране п промежутке, для таймлайна.
    this.layerCollection[this._layersLegend.RGB.name].setDateInterval(new Date(2000, 1, 1), new Date());

    //вначале выключаем выбор тематики по средним ndvi
    this.setRadioLabelActive("ndviMeanRadio", false);
    this.setRadioLabelActive("ratingRadio", false);

    //красная надпись при свернутом таймлайне
    this._attDiv = document.createElement('div');
    this._attDiv.style.display = "none";
    this._attDiv.classList.add("ntAttentionMessage");
    this._attDiv.innerHTML = NDVITimelineManager.ATTENTION_DIV;
    this._container.appendChild(this._attDiv);


    //баг не показываются деления при деволтном зумирвоании на хоз-ве
    setTimeout(function () { that.onMoveEnd(); }, 3000);

    //деактивация некоторых радиокнопок
    this.deactivateUnknownRadios();

    this._meanVCILayer = this.layerCollection["58B949C8E8454CF297184034DD8A62CD"];

    this._meanVCILayer.setZIndex(-1);
    AgroShared._meanVCIStyleData = {};
    var that = this;
    setTimeout(function () {
        var regionId = that._meanVCILayer._gmx.tileAttributeIndexes["Region"];
        var districtId = that._meanVCILayer._gmx.tileAttributeIndexes["District"];
        that._meanVCILayer.setStyleHook(function (data) {
            var nameId = data.properties[regionId] + ":" + data.properties[districtId];
            var s = AgroShared._meanVCIStyleData[nameId];
            if (s) {
                return s;
            } else {
                return null;
            }
        });
    }, 0);

    this.initializeLayersHooks();
    this._initLayersTreeDoubleClick();

    //инициализация слоев из внешних карт
    $(window._queryExternalMaps).bind('map_loaded', function (e) {
        for (var i in nsGmx.gmxMap.layersByID) {
            if (!that.layerCollection[i]) {
                that.layerCollection[i] = nsGmx.gmxMap.layersByID[i];
            }
        }
        that.initializeLayersHooks();
    });

    //проверяем ff
    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
        $(".ntTimelineBackground").css("height", "22px");
    }

    //выключим
    this.setRadioLabelActive_grey("rgbRadio", false);
    this.setRadioLabelActive_grey("ndviRadio_modis", false);

    document.getElementById("ntComboBox").disabled = true;
    document.getElementById("ntComboBox").classList.add("ntDisabledLabel");

    document.getElementById('ntComboBox').value = this._selectedCombo.toString();

    $(window).resize(function () {
        that.resize();
    });

    this.resize();

    var m = this.optionsMenu.getMenuContainer();

    m.style.right = 60 + "px";

    $('#leftCollapser').on("click", function (e) {
        $(".leaflet-iconLayers.leaflet-iconLayers_bottomleft").css("margin-bottom", 125);
        that.resize();
    });

    this.applyZoomRestriction(this.lmap.getZoom());

    this.startFinishLoading();

    this.refreshOptionsDisplay();
};

NDVITimelineManager.prototype.resize = function () {
    if (window.layersShown && !(navigator.userAgent.match(/iPad/i) != null)) {
        this.setWidth(document.documentElement.clientWidth - 360);
    } else {
        this.setWidth(document.documentElement.clientWidth - 12);
    }
};

NDVITimelineManager.prototype._initSwitcher = function () {
    var that = this;
    this.switcher = new SwitchControl({
        "parentId": this._container.id,
        "onshow": function (manually) {
            if (that.lmap.getZoom() <= NDVITimelineManager.MIN_ZOOM) {
                document.getElementById("ntLoading").style.display = "none";
                that._attDiv.style.bottom = "147px";
                that._attDiv.style.right = "310px";
                //that.optHelper.style.display = "none";
                $(".ntHelp").removeClass("ntHelpLightOn");
                document.getElementById("ntZoomRestrictionLabel").style.display = "none";
            } else {
                that._attDiv.style.display = "none";
            }

            if (manually) {
                that._manuallyCollapsed = false;
                that._manuallyUnfolded = true;
            }

            that.timeLine.toggleVisibility(true);

            setTimeout(function () {
                NDVITimelineManager.fires_ht = {};
                that.timeLine.updateFilters();
                window.resizeAll && resizeAll();
            }, 200);

            $(".leaflet-iconLayers.leaflet-iconLayers_bottomleft").css("margin-bottom", 135);

            window.resizeAll && resizeAll();
        },
        "onhide": function (manually) {
            that._attDiv.style.bottom = "34px";
            that._attDiv.style.right = "350px";

            if (manually) {
                that._manuallyCollapsed = true;
                that._manuallyUnfolded = false;
            }

            if (that.lmap.getZoom() <= NDVITimelineManager.MIN_ZOOM) {
                that._attDiv.style.display = "block";
            }

            that.timeLine.toggleVisibility(false);

            $(".leaflet-iconLayers.leaflet-iconLayers_bottomleft").css("margin-bottom", 10);

            window.resizeAll && resizeAll();
        }
    });
};

NDVITimelineManager.prototype.setCloudMaskRenderHook = function (layer, callback, callback2) {

    layer.addRenderHook(callback);

    for (var i = 0; i < this._visibleLayersOnTheDisplayPtr.length; i++) {

        var l = this._visibleLayersOnTheDisplayPtr[i];

        var styles = l.getStyles();
        styles[0].HoverStyle.weight = styles[0].RenderStyle.weight;
        l.setStyles(styles);

        this._visibleLayersOnTheDisplayPtr[i].addPreRenderHook(callback2);
    }
};

NDVITimelineManager.prototype.setRenderHook = function (layer, callback, callback2) {

    if (this._selectedOption == "CLASSIFICATION" || this._selectedOption == "HR") {
        this.layerBounds && layer.removeClipPolygon(this.layerBounds);
    }

    if (this._cutOff) {

        if (this._selectedOption == "CLASSIFICATION" || this._selectedOption == "HR") {
            this.layerBounds = NDVITimelineManager.getLayerBounds(this._visibleLayersOnTheDisplayPtr);
            layer.addClipPolygon(this.layerBounds);
        }

        layer.addRenderHook(callback);

        for (var i = 0; i < this._visibleLayersOnTheDisplayPtr.length; i++) {

            var l = this._visibleLayersOnTheDisplayPtr[i];

            var styles = l.getStyles();
            styles[0].HoverStyle.weight = styles[0].RenderStyle.weight;
            l.setStyles(styles);

            this._visibleLayersOnTheDisplayPtr[i].addPreRenderHook(callback2);
        }
    }
};

NDVITimelineManager.prototype.clearRenderHook = function () {
    var landsat2016Layer = this.layerCollection[this._layersLegend.LANDSAT2016.name];
    var sentinel2016Layer = this.layerCollection[this._layersLegend.SENTINEL2016.name];

    var ndviLayer = this.layerCollection[this._layersLegend.HR.name];
    var classLayer = this.layerCollection[this._layersLegend.CLASSIFICATION.name];
    var sentinelNdviLayer = this.layerCollection[this._layersLegend.SENTINEL_NDVI.name];

    landsat2016Layer.removeRenderHook(NDVITimelineManager.kr_hook);
    sentinel2016Layer.removeRenderHook(NDVITimelineManager.kr_hook);

    ndviLayer.removeRenderHook(NDVITimelineManager.kr_hook);
    classLayer.removeRenderHook(NDVITimelineManager.kr_hook);
    sentinelNdviLayer.removeRenderHook(NDVITimelineManager.kr_hook);

    NDVITimelineManager.tolesBG = {};

    for (var i = 0 ; i < this._visibleLayersOnTheDisplayPtr.length; i++) {
        this._visibleLayersOnTheDisplayPtr[i].removePreRenderHook(NDVITimelineManager.l_hook);
    }

    this.redrawSelectedLayers();
};

NDVITimelineManager.prototype.redrawSelectedLayers = function () {
    for (var i = 0; i < this._selectedLayers.length; i++) {
        this._selectedLayers[i].redraw();
    }
};

NDVITimelineManager.prototype.initializeLayersHooks = function () {
    var hozLayers = this.getHozLayers();
    for (var i = 0; i < hozLayers.length; i++) {
        this._setStyleHook(hozLayers[i]);
        this._setVisibilityChangingHook(hozLayers[i]);
    }
};

NDVITimelineManager.prototype._setVisibilityChangingHook = function (layer) {
    var that = this;

    layer.on("add", function () {
        that.refreshVisibleLayersOnDisplay();
    });

    layer.on("remove", function () {
        setTimeout(function () {
            that.refreshVisibleLayersOnDisplay();
        }, 100);
    });

};

NDVITimelineManager.prototype.getHozLayers = function () {
    var fieldLayers = [];
    var that = this;
    var layers = this.layerCollection;
    $.each(layers, function (i, l) {
        var v = l.getGmxProperties();
        if (!that._layersHookList[v.name]) {
            if (!($.isEmptyObject(v.MetaProperties)))
                if (!($.isEmptyObject(v.MetaProperties.product)))
                    if ($.trim(v.MetaProperties.product.Value) == "fields" || $.trim(v.MetaProperties.product.Value) == "fields_aggregation")
                        if (!($.isEmptyObject(v.MetaProperties.project)) && ($.trim(v.MetaProperties.project.Value) == "InsuranceGeo" ||
                            $.trim(v.MetaProperties.project.Value) == "cosmosagro")) {
                            that._layersHookList[v.name] = layers[v.name];
                            fieldLayers.push(layers[v.name]);
                        }
        }
    });
    return fieldLayers;
};

NDVITimelineManager.prototype._initLayersTreeDoubleClick = function () {
    if (window._layersTree) {
        var that = this;
        _layersTree.treeModel.forEachNode(function (node) {
            if (node.type === "layer") {
                if (!that._layersDblClickList[node.content.properties.name]) {
                    //var prop = gmxAPI.map.layers[node.content.properties.name].properties;
                    var prop = that.layerCollection[node.content.properties.name].getGmxProperties();
                    if (prop.type === "Vector" &&
                        prop.GeometryType === "polygon" &&
                        !prop.GMX_RasterCatalogID) {
                        that._layersDblClickList[node.content.properties.name] = that.layerCollection[node.content.properties.name];//gmxAPI.map.layers[node.content.properties.name];
                        $(node).on('dblclick', function () {
                            that._onLayerTreeDoubleClick(node.content.properties);
                        })
                    }
                }
            }
        });
    }
};

NDVITimelineManager.prototype._onLayerTreeDoubleClick = function (prop) {
    for (var i in this._visibleFieldsLayers) {
        this._visibleFieldsLayers[i].visible = false;
    }
    var layer = this.layerCollection[prop.name];
    var bounds = layer.getBounds();
    if (!this._visibleFieldsLayers[prop.name]) {
        this._visibleFieldsLayers[prop.name] = { "visible": false, "bounds": bounds, "layer": layer };
    }

    this.setVisibleYear(this._selectedYear);

    if (this._combo[this._selectedCombo].resolution == "landsat"/*this._selectedCombo == 1*/) {
        this._visibleFieldsLayers[prop.name].visible = true;
        this._doubleClick = true;
    }

    this.hoverDiv = null;
    this.hoverShotFilename = this.selectedShotFilename = "";
    this.setFilenameCaption("");

    this.switcher.show();
};

NDVITimelineManager.prototype.initializeIntegralScheme = function () {
    this._integralIndexes = new IntegralIndexes();
};

NDVITimelineManager.prototype.setVisibleYear = function (year) {

    function _normalTime(date) {
        return new Date("2000", date.getMonth(), date.getDate()).getTime();
    };

    this.setTimeLineYear(year);
    this._selectedYear = year;

    if (this._combo[this._selectedCombo].resolution == "modis" && this.selectedDiv) {
        var start = new Date(year, 0, 1);
        var end = new Date(year + 1, 1, 9);
        var tl = this.timeLine.getTimelineController().getTimeline();
        var currIndex = tl.getItemIndex(this.selectedDiv);
        var curr2000 = _normalTime(tl.items[currIndex].start);

        var minItem = null;
        var minDeltaTime = 100000000000;
        //выбираем items выбранного года и ближайщее расстояние от текущего выбранного
        for (var i = 0; i < tl.items.length; i++) {
            var item = tl.items[i];
            var itemDate = new Date(item.center);
            if (item.dom && itemDate >= start && itemDate <= end) {
                var idt = _normalTime(itemDate);
                var d = Math.abs(curr2000 - idt);
                if (d < minDeltaTime) {
                    minDeltaTime = d;
                    minItem = item;
                }
            }
        }

        tl.setSelection([{ "row": tl.getItemIndex(minItem.dom) }]);
        this.timeLine.shiftActiveItem(0);
        this.setTimeLineYear(year);

    }
    document.getElementById('ntYear').innerHTML = year;

    for (var l in this._proxyLayers) {
        this._proxyLayers[l].setDateInterval(new Date(this._selectedYear, 0, 1), new Date(this._selectedYear, 11, 31));
    }

    this.timeLine.updateFilters();
};

NDVITimelineManager.prototype.switchYear = function (year) {
    var ry = this._yearsPanel[year]
    if (ry) {
        ry.radio.checked = true;
    }
    this.setVisibleYear(year);
};

NDVITimelineManager.prototype._setStyleHook = function (layer) {
    var that = this;
    //var b = layer.getBoundsMerc();
    //var bounds = new gmxAPI.bounds([[gmxAPI.from_merc_x(b.minX), gmxAPI.from_merc_y(b.minY)], [gmxAPI.from_merc_x(b.maxX), gmxAPI.from_merc_y(b.maxY)]]);

    var bounds = layer.getBounds();

    this._visibleFieldsLayers[layer._gmx.layerID] = { "bounds": bounds, "visible": false, "layer": layer };
};

NDVITimelineManager.prototype.startFinishLoading = function () {
    var that = this;
    var intervalHandler = null;

    var success = function () {
        if ($(".timeline-event.timeline-event-line").length) {
            NDVITimelineManager.fires_ht = {};
            that.timeLine.updateFilters();
            that.hideLoadingSmall();
            document.getElementById("ntComboBox").disabled = false;
            document.getElementById("ntComboBox").classList.remove("ntDisabledLabel");

            if (that._activatePermalink) {
                setTimeout(function () {
                    that._activatePermalink();
                    that._activatePermalink = null;
                    that.refreshOptionsDisplay();
                }, 2000);
            }

            that._firstTimeCombo[that._selectedCombo] = true;

            clearInterval(intervalHandler);
        }
    };

    intervalHandler = setInterval(success, 500);
};

/*
 * ==================================================================
 * Блок панелей, и жесткая логика управления видимостью снимками
 * ==================================================================
 */

NDVITimelineManager.prototype.shadeTimeline = function () {
    $(".shadeTimeline").css("display", "block");
    $(".ntRightPanel").addClass("shadeBackground");
    $(".ntLblCombo").addClass("shadeBackground").addClass("shadeColor");
    $(".ntLblShotsType").addClass("shadeColor");
    $(".ntLblDataType").addClass("shadeColor");
    $(".layerInfoButton").addClass("shadeColor");
    $(".ntTimelineColor").addClass("shadeBackground").addClass("shadeColor");
    $(".timeline-container").addClass("shadeBackground");
    $(".timeline-axis-text-minor").addClass("shadeColor");
    $("#ntYear").addClass("shadeColor");
    $("#ntComboBox").addClass("shadeColor");
    $(".ntSliderCaption").addClass("shadeColor");
};

NDVITimelineManager.prototype.removeShading = function () {
    $(".shadeTimeline").css("display", "none");
    $(".ntRightPanel").removeClass("shadeBackground");
    $(".ntLblCombo").removeClass("shadeBackground").removeClass("shadeColor");
    $(".ntLblShotsType").removeClass("shadeColor");
    $(".ntLblDataType").removeClass("shadeColor");
    $(".layerInfoButton").removeClass("shadeColor");
    $(".ntTimelineColor").removeClass("shadeBackground").removeClass("shadeColor");
    $(".timeline-container").removeClass("shadeBackground");
    $(".timeline-axis-text-minor").removeClass("shadeColor");
    $("#ntYear").removeClass("shadeColor");
    $("#ntComboBox").removeClass("shadeColor");
    $(".ntSliderCaption").removeClass("shadeColor");
};

NDVITimelineManager.prototype.createOptionsPanel = function () {

    var fsComboOptions = document.getElementById("fsComboOptions");

    var html = "";
    for (var i = 0; i < this._combo.length; i++) {
        html += '<div id="optionsPanel_' + i + '" style="height:100%; display:none; white-space: nowrap;">' +
                    '<div id="firstPanel_' + i + '" class="comboOptionsPanel"></div>' +
                    '<div id="secondPanel_' + i + '" class="comboOptionsPanel"></div>' +
                    '<div id="thirdPanel_' + i + '" class="comboOptionsPanel"></div>' +
                    '</div>';

    }
    fsComboOptions.innerHTML += html;
};


NDVITimelineManager._legendCallback = {};
NDVITimelineManager._legendCallback["qualityRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendQuality);
};

NDVITimelineManager._legendCallback["classificationRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendClassification);
};

NDVITimelineManager._legendCallback["ndviRadio_modis"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendNdvi);
};

NDVITimelineManager._legendCallback["ndviRadio_hr"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendNdvi);
};

NDVITimelineManager._legendCallback["ratingRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendRating);
};

NDVITimelineManager._legendCallback["ndviMeanRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendNdvi);
};

NDVITimelineManager._legendCallback["conditionsOfVegetationRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendConditionsOfVegetation);
};

NDVITimelineManager._legendCallback["inhomogenuityRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendInhomogenuity);
};

NDVITimelineManager._legendCallback["meanVCIRadio"] = function () {
    AgroLegend.toggleLegend(AgroLegend.legendConditionsOfVegetation);
};

/**
 * text - текст радио кнопки
 * tag - название группы
 * id - идентификатор dom
 * comboIndex - индекс вклченного комбо при котором этот элемент активен(-1 - активен для всех)
 * comboVisibility - флаг того, что элемент для этого комбо будет отображаться или нет.
 * callback - событие припереключении
 * checkrd - значение по умолчанию
 */
NDVITimelineManager.prototype.addRadio = function (elementId, text, tag, id, comboIndex, comboVisibility, callback, light, checked) {

    var element = document.getElementById(elementId);
    var div0 = document.createElement('div');
    div0.style.marginBottom = "4px";
    div0.style.marginLeft = "4px";
    div0.style.float = "left";
    div0.displayCombo = comboVisibility;
    element.appendChild(div0);

    var div;
    if (light) {
        div = document.createElement('div');
        div0.classList.add("ntHelp");
        div0.id = "light_" + id;
        div0.appendChild(div);
    } else {
        div = div0;
        div0.style.marginTop = "3px";
        div0.style.marginRight = "8px";
        div0.style.marginLeft = "7px";
    }


    var overDiv1 = document.createElement('div');
    overDiv1.style.float = "left";
    var input = document.createElement('input');
    overDiv1.appendChild(input);
    div.appendChild(overDiv1);
    input["comboIndex"] = comboIndex;
    input.style.height = "18px";
    input.type = "radio";
    input.name = tag + "_" + comboIndex;
    input.id = id;
    input.checked = checked;
    var that = this;
    input.onchange = function () {
        callback.call(that, this);
    };

    var overDiv2 = document.createElement('div');
    overDiv2.style.float = "left";
    overDiv2.style.paddingLeft = "5px";

    var label = document.createElement('label');
    overDiv2.appendChild(label);
    div.appendChild(overDiv2);

    label.innerHTML = text;
    label.for = id;
    label["comboIndex"] = comboIndex;
    label.classList.add("ntLblShotsType");
    label.classList.add(id);

    label.onclick = function (e) {
        if (!(input.disabled || input.checked)) {
            input.checked = true;
            callback.call(that, input);
        }
    };

    label.ontouchstart = function (e) {
        if (!(input.disabled || input.checked)) {
            input.checked = true;
            callback.call(that, input);
        }
    };

    if (NDVITimelineManager._legendCallback[id]) {
        var btnLegend = document.createElement('span');
        div.appendChild(btnLegend);
        btnLegend.classList.add("layerInfoButton");
        btnLegend.style.color = "blue";
        btnLegend.style.fontWeight = "normal";
        btnLegend.style.fontFamily = "serif";
        btnLegend.onclick = NDVITimelineManager._legendCallback[id];
        btnLegend.ontouchstart = NDVITimelineManager._legendCallback[id];
        btnLegend.title = "Легенда";
        btnLegend.innerHTML = "i";
    }

    this._radioButtonLabels[id] = { "label": label, "parent": div };
};

NDVITimelineManager.prototype.setVisible = function (visibility) {
    for (var i in this._layersLegend) {
        gmxAPI.map.layers[this._layersLegend[i].name].setVisible(visibility);
    }
};

NDVITimelineManager.prototype.removeLayer = function (layerName) {
    this.layerCollection[layerName] && this.lmap.removeLayer(this.layerCollection[layerName]);
};

NDVITimelineManager.prototype.addLayer = function (layerName) {
    this.layerCollection[layerName] && this.lmap.addLayer(this.layerCollection[layerName]);
};

NDVITimelineManager.prototype.hideSelectedLayer = function () {
    this._selectedPeriod && $(".timeline-event").removeClass("timeline-event-selected");
    for (var i = 0; i < this._selectedLayers.length; i++) {
        this.lmap.removeLayer(this._selectedLayers[i]);
        this._selectedLayers[i].removeFilter();
    }
    this._selectedLayers = [];
    this._selectedOption = null;
};

NDVITimelineManager.prototype._hideLayers = function () {
    this.hideSelectedLayer();

    this._hideNDVI_MEAN();
    this._hideINHOMOGENUITY();
    this._hideSLOPE();

    this._ratingHandler.clear();
    if (window.fieldsTable2) {
        fieldsTable2.redraw();
    }

    this._meanVCILayer && this.lmap.removeLayer(this._meanVCILayer);

    this.clearRenderHook();

    this.hideCloudMask();
};

NDVITimelineManager.prototype._prepareRedraw = function () {

    //выключаем все слои
    this._hideLayers();
};

NDVITimelineManager.prototype._showRedraw = function () {

    if (this._selectedDiv) {
        if (this._selectedType[this._selectedCombo] == NDVITimelineManager.RATING) {
            this._showRATING();
        } else if (this.isSentinel) {
            this._showSENTINEL();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.NDVI16) {
            this._showNDVI16();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.NDVI_HR) {
            this._showNDVI_HR();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.RGB_HR) {
            this._showRGB_HR();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.RGB2_HR) {
            this._showRGB2_HR();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.QUALITY16) {
            this._showQUALITY16();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.NDVI_MEAN) {
            this._showNDVI_MEAN();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.INHOMOGENUITY) {
            this._showINHOMOGENUITY();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.CLASSIFICATION) {
            this._showCLASSIFICATION();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.CONDITIONS_OF_VEGETATION) {
            this._showCONDITIONS_OF_VEGETATION();
        } else if (this._selectedType[this._selectedCombo] == NDVITimelineManager.FIRES_POINTS) {
            this._showFIRES_POINTS();
        } else {
            this._showLayer(NDVITimelineManager.prodTypes[this._selectedType[this._selectedCombo]]);
        }
    }
};

NDVITimelineManager.prototype._redrawShots = function () {
    this._prepareRedraw();
    this._showRedraw();

    //эти продукты активны всегда
    this.setRadioLabelActive_grey("rgbRadio", true);
    this.setRadioLabelActive_grey("ndviRadio_modis", true);
    this.setRadioLabelActive_grey("conditionsOfVegetationRadio", true);
};

NDVITimelineManager._makeSqlFilenames = function (filenames, type) {
    var res = "";

    if (type == NDVITimelineManager.NDVI_HR) {
        for (var i = 0; i < filenames.length; i++) {
            res += (res ? ' OR ' : '') + '"sceneid"=' + "'" + filenames[i].substring(0, filenames[i].length - 5) + "'";
        }
    } else if (type == NDVITimelineManager.RGB_HR) {
        for (var i = 0; i < filenames.length; i++) {
            res += (res ? ' OR ' : '') + '"SCENEID"=' + "'" + filenames[i].substring(0, filenames[i].length - 5) + "'";
        }
    } else if (type == NDVITimelineManager.RGB2_HR) {
        for (var i = 0; i < filenames.length; i++) {
            res += (res ? ' OR ' : '') + '"SCENEID"=' + "'" + filenames[i].substring(0, filenames[i].length - 5) + "'";
        }
    } else if (type == NDVITimelineManager.CLASSIFICATION) {
        for (var i = 0; i < filenames.length; i++) {
            //res += (res ? ' OR ' : '') + '"filename"=' + "'" + filenames[i].substring(0, filenames[i].length - 5) + "_classification'";
            res += (res ? ' OR ' : '') + '"sceneid"=' + "'" + filenames[i].substring(0, filenames[i].length - 5) + "'";
        }
    } else if (type == NDVITimelineManager.NDVI16) {
        for (var i = 0; i < filenames.length; i++) {
            res += (res ? ' OR ' : '') + '"filename"=' + "'" + filenames[i] + "'";
        }
    } else if (type == NDVITimelineManager.QUALITY16) {
        for (var i = 0; i < filenames.length; i++) {
            res += (res ? ' OR ' : '') + '"filename"=' + "'" + filenames[i].substring(0, filenames[i].length - 7) + "_QUALITY16'";
        }
    }

    return res;
};

//вынести в shared
NDVITimelineManager.boundsToCoordsArray = function (bounds, offset) {
    var min_x = gmxAPI.from_merc_x(gmxAPI.merc_x(bounds.minX) - offset),
        min_y = gmxAPI.from_merc_y(gmxAPI.merc_y(bounds.minY) - offset),
        max_x = gmxAPI.from_merc_x(gmxAPI.merc_x(bounds.maxX) + offset),
        max_y = gmxAPI.from_merc_y(gmxAPI.merc_y(bounds.maxY) + offset);

    return [[min_x, min_y], [min_x, max_y], [max_x, max_y], [max_x, min_y]];
};

NDVITimelineManager.boundsToCoordsArrayMerc = function (bounds, offset) {
    var min_x = gmxAPI.merc_x(bounds.minX) - offset,
        min_y = gmxAPI.merc_y(bounds.minY) - offset,
        max_x = gmxAPI.merc_x(bounds.maxX) + offset,
        max_y = gmxAPI.merc_y(bounds.maxY) + offset;

    return [[min_x, min_y], [min_x, max_y], [max_x, max_y], [max_x, min_y]];
};

NDVITimelineManager.gmxCoordsToWKT = function (coords) {
    var l = coords.length;
    var WKTCoords = "POLYGON((";
    for (var i = 0; i < l; i++) {
        WKTCoords += coords[i][0] + " " + coords[i][1];
        if (i != l - 1) {
            WKTCoords += ",";
        } else {
            WKTCoords += "," + coords[0][0] + " " + coords[0][1] + "))";
        }
    }
    return WKTCoords;
};

//Это новый вариант визуализации условия вегетации
NDVITimelineManager.prototype._showCONDITIONS_OF_VEGETATION = function () {
    document.getElementById("chkVciType").disabled = true;
    this.hideSelectedLayer();
    var fns = this._comboFilenames[this._selectedCombo];

    if (fns) {
        var url = 'http://maps.kosmosnimki.ru/VectorLayer/Search.ashx?WrapStyle=func&geometry=false&tables=[{%22LayerName%22:%224B68E05D988E404D962F5CC79FFCE67F%22,%22Alias%22:%22v%22},{%22LayerName%22:%2258B949C8E8454CF297184034DD8A62CD%22,%22Alias%22:%22a%22,%22Join%22:%22Inner%22,%22On%22:%22[v].area_id%20=%20[a].ogc_fid%22}]&columns=[{%22Value%22:%22[a].[Region]%22},{%22Value%22:%22[a].[District]%22},{%22Value%22:%22[v].[Value]%22}]';
        var query = '&query="Type"=' + (document.getElementById("chkVciType").checked ? 1 : 0) +
            ' AND "date"=' + "'" + NDVITimelineManager.formatDate(this._selectedDate.getDate(),
            this._selectedDate.getMonth() + 1, this._selectedDate.getFullYear()) + "'";

        //делаем запрос и раскрашиваем
        var that = this;
        sendCrossDomainJSONRequest(url + query, function (res) {
            AgroShared._meanVCIStyleData = {};
            var data = res.Result;
            for (var i = 0; i < data.values.length; i++) {
                var VCI = data.values[i][2];
                var r = 0, g = 0, b = 0, a = 100;
                if (VCI <= 20) {
                    //красный
                    r = 255;
                    g = 0;
                    b = 0;
                } else if (VCI <= 40) {
                    //розовый
                    r = 255;
                    g = 127;
                    b = 127;
                } else if (VCI <= 60) {
                    //желтый
                    r = 255;
                    g = 255;
                    b = 0;
                } else if (VCI <= 80) {
                    //зеленый
                    r = 0;
                    g = 255;
                    b = 0;
                } else if (VCI <= 100) {
                    //темно зеленый
                    r = 0;
                    g = 128;
                    b = 0;
                } else {
                    //VCI > 100
                    r = 0;
                    g = 0;
                    b = 0;
                }

                var nameId = data.values[i][0] + ":" + data.values[i][1];

                AgroShared._meanVCIStyleData[nameId] = {
                    fillStyle: "rgb(" + r + "," + g + "," + b + ")",
                    fillOpacity: 1.0,
                    strokeStyle: "rgb(" + (r - (r > 0 ? 15 : 0)) + "," + (g - (g > 0 ? 15 : 0)) + "," + (b - (b > 0 ? 15 : 0)) + ")",
                    opacity: a,
                    weight: 1
                };
            }

            var typeId = that._meanVCILayer._gmx.tileAttributeIndexes["Type"];

            that._meanVCILayer.setFilter(function (item) {
                var p = item.properties;
                if (p[typeId] == 0) {
                    return true;
                }
                return false;
            });

            that.lmap.addLayer(that._meanVCILayer);
            that._selectedLayers.push(that._meanVCILayer);
            that._selectedOption = "VCI";
            document.getElementById("chkVciType").disabled = false;
        });
    }
};

NDVITimelineManager.prototype.setSelectedLayersDateInterval = function (date0, date1) {
    for (var i = 0; i < this._selectedLayers.length; i++) {
        this._selectedLayers[i].setDateInterval(date0, date1);
    }
};

NDVITimelineManager.prototype._showFIRES_POINTS = function () {

    if (this._selectedPeriod &&
        this._selectedDate0 &&
        this._selectedDate1) {
        if (this._selectedOption == "FIRES") {
            //this._selectedLayer.setDateInterval(this._selectedDate0, this._selectedDate1);
            this.setSelectedLayersDateInterval(this._selectedDate0, this._selectedDate1);
        } else {
            this.hideSelectedLayer();
            this._selectedOption = "FIRES";
            var layer = this.layerCollection[this._layersLegend.FIRES.name];
            layer.setDateInterval(this._selectedDate0, this._selectedDate1);
            this.lmap.addLayer(layer);
            this._selectedLayers.push(layer);
        }
    } else {
        this.hideSelectedLayer();
        this._selectedOption = "FIRES";
        var layer = this.layerCollection[this._layersLegend.FIRES.name];
        layer.removeFilter();

        var dateCn = this._layersLegend["FIRES"].dateColumnName;
        var dateId = layer._gmx.tileAttributeIndexes[dateCn];
        var that = this;
        layer.setFilter(function (item) {
            var p = item.properties;
            if (NDVITimelineManager.equalDates(new Date(p[dateId] * 1000), new Date(that._selectedDateL * 1000))) {
                return true;
            }
            return false;
        });
        layer.setDateInterval(NDVITimelineManager.addDays(this._selectedDate, -1), NDVITimelineManager.addDays(this._selectedDate, 1));
        this.lmap.addLayer(layer);
        layer.bringToFront();
        this._selectedLayers.push(layer);
    }
};

NDVITimelineManager.prototype._showLayer = function (layerTypeName) {

    this.hideSelectedLayer();

    this._selectedOption = layerTypeName;

    var layer = this.layerCollection[this._layersLegend[layerTypeName].name];
    layer.removeFilter();

    var dateCn = this._layersLegend[layerTypeName].dateColumnName;
    var pathCn = "PATH";
    var GMX_RasterCatalogIDCn = "GMX_RasterCatalogID";
    var ql = document.getElementById("chkQl").checked;

    var dateId = layer._gmx.tileAttributeIndexes[dateCn];
    var pathId = layer._gmx.tileAttributeIndexes[pathCn];
    var GMX_RasterCatalogIDId = layer._gmx.tileAttributeIndexes[GMX_RasterCatalogIDCn];

    var sceneidIndex = layer._gmx.tileAttributeIndexes["sceneid"];

    var that = this;
    layer.setFilter(function (item) {
        var p = item.properties;

        if (layerTypeName == "SENTINEL" || layerTypeName == "SENTINEL_NDVI") {
            var s = that._comboFilenames[that._selectedCombo];
            for (var i = 0; i < s.length; i++) {
                if (NDVITimelineManager._normalizeFilename(s[i]) == p[sceneidIndex]) {
                    return true;
                }
            }
        } else if (ql) {
            if (pathId && p[dateId] == that._selectedDateL && p[pathId] == that._selectedPath ||
                p[GMX_RasterCatalogIDId] == "" && p[dateId] == that._selectedDateL) {
                return true;
            }
        } else {
            if (pathId && p[dateId] == that._selectedDateL && p[pathId] == that._selectedPath && p[GMX_RasterCatalogIDId] != "" ||
                p[GMX_RasterCatalogIDId] == "" && p[dateId] == that._selectedDateL) {
                return true;
            }
            for (var i = 0; i < that._currentRKIdArr.length; i++) {
                if (that._currentRKIdArr[i] == p[GMX_RasterCatalogIDId]) {
                    return true;
                }
            }
        }

        return false;
    });
    layer.setDateInterval(NDVITimelineManager.addDays(this._selectedDate, -1), NDVITimelineManager.addDays(this._selectedDate, 1));
    this.lmap.addLayer(layer);
    //layer.setZIndex(0);
    this._selectedLayers.push(layer);

    this.showCloudMask(this._selectedDate);
};

NDVITimelineManager.prototype._showSENTINEL = function () {
    var sProd;
    this.setRadioLabelActive_grey("rgbRadio", false);
    this.setRadioLabelActive_grey("rgbRadio2", true);
    if (document.getElementById("rgbRadio").checked || document.getElementById("rgbRadio2").checked) {
        this._selectedType[this._selectedCombo] = NDVITimelineManager.RGB2_HR;
        if (document.getElementById("rgbRadio").checked) {
            document.getElementById("rgbRadio2").checked = true;
        }
        this._showLayer("SENTINEL");
    } else if (document.getElementById("ndviRadio_hr").checked) {
        this._showLayerNDVI_HR("SENTINEL_NDVI");
    } else if (document.getElementById("ndviMeanRadio").checked) {
        this._showNDVI_MEAN();
    }
};

NDVITimelineManager.prototype._showRGB_HR = function () {
    this._showLayer("RGB");
};

NDVITimelineManager.prototype._showRGB2_HR = function () {
    this._showLayer("RGB2");
};

NDVITimelineManager.tolesBG = {};
NDVITimelineManager.cloudMaskTolesBG = {};

NDVITimelineManager.cloudMaskKr_hook = function (tile, info) {
    var id = info.x + ':' + info.y + ':' + info.z;
    if (tile) {
        NDVITimelineManager.cloudMaskTolesBG[id] = tile;
        tile.style.display = 'none';
    }
};

NDVITimelineManager.kr_hook = function (tile, info) {
    var id = info.x + ':' + info.y + ':' + info.z;
    if (tile) {
        NDVITimelineManager.tolesBG[id] = tile;
        tile.style.display = 'none';
    }
};

NDVITimelineManager.l_hook = function (tile, info) {
    var id = info.x + ':' + info.y + ':' + info.z;
    if (NDVITimelineManager.tolesBG[id]) {
        tile.getContext('2d').drawImage(NDVITimelineManager.tolesBG[id], 0, 0, 256, 256);
    }
    if (NDVITimelineManager.cloudMaskTolesBG[id]) {
        tile.getContext('2d').drawImage(NDVITimelineManager.cloudMaskTolesBG[id], 0, 0, 256, 256);
    }
};

NDVITimelineManager.prototype._showLayerNDVI_HR = function (layerTypeName) {

    this.hideSelectedLayer();

    this._selectedOption = layerTypeName;

    var layer = this.layerCollection[this._layersLegend[layerTypeName].name];
    if (this._selectedYear == 2016) {
        layer = this.layerCollection[this._layersLegend.SENTINEL2016.name];
    }
    layer.removeFilter();

    this.setRenderHook(layer, NDVITimelineManager.kr_hook, NDVITimelineManager.l_hook);

    var dateCn = this._layersLegend[layerTypeName].dateColumnName;
    var dateId = layer._gmx.tileAttributeIndexes[dateCn];

    var that = this;
    layer.setFilter(function (item) {
        var p = item.properties;
        if (p[dateId] == that._selectedDateL) {
            return true;
        }
        return false;
    }).on('doneDraw', function () {
        ndviTimelineManager.repaintAllVisibleLayers();
    }).setDateInterval(
            NDVITimelineManager.addDays(this._selectedDate, -1),
            NDVITimelineManager.addDays(this._selectedDate, 1)
        );
    this.lmap.addLayer(layer);
    //layer.setZIndex(0);
    this._selectedLayers.push(layer);

    this.showCloudMask(this._selectedDate);
};

NDVITimelineManager.prototype._showNDVI_HR = function () {

    this.hideSelectedLayer();

    this._selectedOption = "HR";

    var layer = this.layerCollection[this._layersLegend.HR.name];

    if (this._selectedYear == 2016) {
        layer = this.layerCollection[this._layersLegend.LANDSAT2016.name];
    }
    layer.removeFilter();

    this.setRenderHook(layer, NDVITimelineManager.kr_hook, NDVITimelineManager.l_hook);

    var dateCn = this._layersLegend["HR"].dateColumnName;
    var dateId = layer._gmx.tileAttributeIndexes[dateCn];

    var that = this;
    layer.setFilter(function (item) {
        var p = item.properties;
        if (p[dateId] == that._selectedDateL) {
            return true;
        }
        return false;
    }).on('doneDraw', function () {
        ndviTimelineManager.repaintAllVisibleLayers();
    }).setDateInterval(
            NDVITimelineManager.addDays(this._selectedDate, -1),
            NDVITimelineManager.addDays(this._selectedDate, 1)
        );
    this.lmap.addLayer(layer);
    //layer.setZIndex(0);
    this._selectedLayers.push(layer);

    this.showCloudMask(this._selectedDate);
};

NDVITimelineManager.prototype._showCLASSIFICATION = function () {

    this.hideSelectedLayer();

    this._selectedOption = "CLASSIFICATION";

    var layer = this.layerCollection[this._layersLegend["CLASSIFICATION"].name];
    layer.removeFilter();

    this.setRenderHook(layer, NDVITimelineManager.kr_hook, NDVITimelineManager.l_hook);

    var dateCn = this._layersLegend["CLASSIFICATION"].dateColumnName;
    var dateId = layer._gmx.tileAttributeIndexes[dateCn];

    var that = this;
    layer.setFilter(function (item) {
        var p = item.properties;
        if (p[dateId] == that._selectedDateL) {
            return true;
        }
        return false;
    }).on('doneDraw', function () {
        ndviTimelineManager.repaintAllVisibleLayers();
    }).setDateInterval(
            NDVITimelineManager.addDays(this._selectedDate, -1),
            NDVITimelineManager.addDays(this._selectedDate, 1)
        );
    this.lmap.addLayer(layer);
    //layer.setZIndex(0);
    this._selectedLayers.push(layer);
};

NDVITimelineManager.prototype._showNDVI16 = function () {

    this.hideSelectedLayer();
    this._selectedOption = "NDVI16";
    var that = this;

    var rk = this._combo[this._selectedCombo].rk;

    for (var i = 0; i < rk.length; i++) {
        if (this._layersLegend[rk[i]].viewTimeline) {
            var name = this._layersLegend[rk[i]].name;
            var layer = this.layerCollection[name];

            layer.removeFilter();

            var dateCn = this._layersLegend[rk[i]].dateColumnName;
            var dateId = layer._gmx.tileAttributeIndexes[dateCn];
            var prodtypeId = layer._gmx.tileAttributeIndexes["prodtype"];

            layer.setFilter(function (item) {
                var p = item.properties;
                //КАК-ТО НАДДО ЭТО ВЫНЕСТИ В КОНФИГ!
                if (that._selectedCombo == 2 || that._selectedCombo == 4 || that._selectedCombo == 5) {
                    if (p[dateId] == that._selectedDateL) {
                        return true;
                    }
                } else {
                    if (p[dateId] == that._selectedDateL && p[prodtypeId] == "NDVI16") {
                        return true;
                    }
                }
                return false;
            });
            layer.setDateInterval(NDVITimelineManager.addDays(this._selectedDate, -1), NDVITimelineManager.addDays(this._selectedDate, 1));
            this.lmap.addLayer(layer);
            //layer.setZIndex(0);
            this._selectedLayers.push(layer);
        }
    }
};

NDVITimelineManager.prototype._showQUALITY16 = function () {

    var layer = this.layerCollection[this._layersLegend.MODIS.name];
    this.hideSelectedLayer();

    this._selectedOption = "QUALITY16";

    layer.removeFilter();

    var dateCn = this._layersLegend[this._combo[this._selectedCombo].rk[0]].dateColumnName;
    var dateId = layer._gmx.tileAttributeIndexes[dateCn];
    var prodtypeId = layer._gmx.tileAttributeIndexes["prodtype"];

    var that = this;
    layer.setFilter(function (item) {
        var p = item.properties;
        if (p[dateId] == that._selectedDateL && p[prodtypeId] == "QUALITY16") {
            return true;
        }
        return false;
    });
    layer.setDateInterval(NDVITimelineManager.addDays(this._selectedDate, -1), NDVITimelineManager.addDays(this._selectedDate, 1));
    this.lmap.addLayer(layer);
    //layer.setZIndex(0);
    this._selectedLayers.push(layer);
};

NDVITimelineManager.prototype._showRATING = function () {
    if (this.lmap.getZoom() >= NDVITimelineManager.MIN_ZOOM_HR) {
        this.hideSelectedLayer();
        this._selectedOption = "RATING";
        if (window.fieldsTable2) {
            fieldsTable2.startRating();
            if (fieldsTable2._selectedRows.length <= 1) {
                this._ratingHandler.start(this._visibleLayersOnTheDisplayPtr, shared.dateToString(this._selectedDate, true));
            }
        } else {
            this._ratingHandler.start(this._visibleLayersOnTheDisplayPtr, shared.dateToString(this._selectedDate, true));
        }
    }
};

NDVITimelineManager.prototype._showNDVI_MEAN = function () {
    if (this.lmap.getZoom() >= NDVITimelineManager.MIN_ZOOM_HR) {

        if (this.isSentinel) {
            this._themesHandler.katalogName = this._layersLegend.SENTINEL_NDVI.name;
        } else {
            this._themesHandler.katalogName = this._layersLegend.HR.name;
        }

        this.hideSelectedLayer();
        this._selectedOption = "MEAN_NDVI";
        this._themesHandler.start(this._visibleLayersOnTheDisplayPtr, shared.dateToString(this._selectedDate, true), this._currentRKIdArr, this._currentFnIdArr);
    }
};

NDVITimelineManager.prototype._hideNDVI_MEAN = function () {
    if (!this._currentRKIdArr.length) {
        this.setRadioLabelActive("ndviMeanRadio", false);
    }
    this._themesHandler.clear();
};

NDVITimelineManager.prototype._showINHOMOGENUITY = function () {
    if (this.lmap.getZoom() >= NDVITimelineManager.MIN_ZOOM_HR) {
        this.hideSelectedLayer();
        this._selectedOption = "INHOMOGENUITY";
        this._neodnrHandler.start(this._visibleLayersOnTheDisplayPtr, shared.dateToString(this._selectedDate, true), this._currentClassificationRKIdArr, this._currentClassificationFnIdArr);
    }
};

NDVITimelineManager.prototype._hideINHOMOGENUITY = function () {
    if (!this._currentClassificationRKIdArr.length) {
        this.setRadioLabelActive("inhomogenuityRadio", false)
    }
    this._neodnrHandler.clear();
};


NDVITimelineManager.prototype._showSLOPE = function () {
    if (!this._showSlope) {
        this._showSlope = true;
        var that = this;
        this._selectedOption = "SLOPE";
        ThemesManager.getLayersGeometry(this._visibleLayersOnTheDisplay, null, function (result) {
            that._slopeManager._colouredLayer.setZIndex(10000000);
            that._slopeManager.setFeatures(result.features);
            that._slopeManager.startThemesThread();
        });
    }
};

NDVITimelineManager.prototype._hideSLOPE = function () {
    if (this._slopeManager) {
        this._showSlope = false;
        this._slopeManager._colouredLayer && this.lmap.removeLayer(this._slopeManager._colouredLayer);
    }
};

NDVITimelineManager.prototype._refreshOptionsPanel = function () {
    //применяем стили активности
    var lbs = this._radioButtonLabels;
    for (var i in lbs) {
        if (lbs[i].label.comboIndex != -1) {
            this.setRadioLabelActive(i, this._selectedCombo == lbs[i].label.comboIndex);
        }
    }
};

NDVITimelineManager.prototype.hideLayers = function () {
    for (var i = 0; i < this._comboAsLayers.length; i++) {
        var c = this._comboAsLayers[i];
        for (var j = 0; j < c.length; j++) {
            var l = this.layerCollection[c[j]];
            l.setFilter(function (item) {
                return false;
            });
        }
    }
    this.setYearsPanelToZero();
};

NDVITimelineManager.prototype.refreshDateInterval_bug = function () {
    this.layerCollection[this._layersLegend.RGB.name].setDateInterval(new Date(2000, 1, 1), new Date());
};

NDVITimelineManager.prototype.showSelectedLayers = function () {
    for (var i = 0; i < this._selectedLayers.length; i++) {
        this.lmap.addLayer(this._selectedLayers[i]);
    }
};

NDVITimelineManager.prototype.hodeSelectedLayers = function () {
    for (var i = 0; i < this._selectedLayers.length; i++) {
        this.lmap.removeLayer(this._selectedLayers[i]);
    }
};

NDVITimelineManager.prototype.applyHRZoomREstriction = function (zoom) {
    this.meanNdviNoDataLabel.style.display = "none";

    if (this._combo[this._selectedCombo].resolution == "landsat"/*this._selectedCombo == 1*/) {
        if (zoom >= NDVITimelineManager.MIN_ZOOM_HR) {
            this.showSelectedLayers();

            this.zoomRestrictionLabel.style.display = "none";
            $(".ntHelp").removeClass("ntHelpLightOn")

            this.updateRadioLabelsActivity();

        } else {
            if (zoom >= NDVITimelineManager.MIN_ZOOM) {
                if (this.selectedDiv && this._combo[this._selectedCombo].rk.length > 1) {
                    this.zoomRestrictionLabel.style.display = "block";
                    $(".ntHelp").addClass("ntHelpLightOn")
                }
            } else {
                this.zoomRestrictionLabel.style.display = "none";
                $(".ntHelp").removeClass("ntHelpLightOn")
                if (this.selectedDiv) {
                    //this.hideSelectedLayers();

                    for (var l in this._visibleFieldsLayers) {
                        var ll = this.layerCollection[l];
                        if (ll.clearTilePattern) {
                            ll.clearTilePattern();
                        }
                    }
                }
            }
            this.setRadioLabelActive_grey("ratingRadio", false);
            this.setRadioLabelActive_grey("ndviRadio_hr", false);
            this.setRadioLabelActive_grey("ndviMeanRadio", false);
            this.setRadioLabelActive_grey("inhomogenuityRadio", false);
            this.setRadioLabelActive_grey("classificationRadio", false);
        }
    } else {
        this.zoomRestrictionLabel.style.display = "none";
        $(".ntHelp").removeClass("ntHelpLightOn")
    }
};

NDVITimelineManager.prototype.applyZoomRestriction = function (zoom) {

    this.applyHRZoomREstriction(zoom);

    if (zoom > NDVITimelineManager.MIN_ZOOM) {

        this.setFilenameCaption(this.selectedShotFilename);
        this.removeShading();

        this._attDiv.style.display = "none";

        if (!this._manuallyCollapsed || (this._prevZoom == NDVITimelineManager.MIN_ZOOM)) {
            this.switcher.show();
        }

        if (!this._firstTimeCombo[this._selectedCombo]) {
            this.showLoadingSmall();
        }

        if (this._prevZoom <= NDVITimelineManager.MIN_ZOOM) {
            this.bindTimelineCombo(this._selectedCombo);
        }

        return true;
    } else {
        this.setFilenameCaption(NDVITimelineManager.ATTENTION_DIV);
        this.shadeTimeline();

        if (this._manuallyCollapsed) {
            this._attDiv.style.display = "block";
        }

        this.switcher.hide();

        return false;
    }
};

NDVITimelineManager.prototype.refreshTimeline = function () {
    this._refreshOptionsPanel();
    this.hideLayers();
};

//params = [{"name":<имя слоя>,"filenames":[<имя файла>,...], "id":<radio element id>} ]
NDVITimelineManager.prototype._setExistentProds = function (params, success) {
    var defArr = [];
    var that = this;
    var rkArr = [];

    this.existentShots = {};

    function sendRequest(filenames, layerName, radioId, defIndex, sender) {
        var identField = ((radioId == "rgbRadio2" || radioId == "rgbRadio") ? "SCENEID" : "filename");
        identField = (radioId == "ndviRadio_hr" || radioId == "classificationRadio" ? "sceneid" : identField);

        var query = "";
        for (var i = 0; i < filenames.length; i++) {
            query += "[" + identField + "]='" + filenames[i] + (i < filenames.length - 1 ? "' OR " : "'");
        }

        var data = {
            query: query,
            geometry: false,
            layer: layerName,
        };

        function hoho(res) {
            alert(res);
        };

        sendCrossDomainPostRequest("http://maps.kosmosnimki.ru/VectorLayer/Search.ashx", {
            'query': query,
            'geometry': false,
            'layer': layerName,
            'WrapStyle': "message"
        }, function (result) {
            var res = result.Result;
            if (res && res.values.length > 0) {
                sender.existentShots[radioId] = true;
                var ind = res.fields.indexOf("GMX_RasterCatalogID");
                for (var i = 0; i < res.values.length; i++) {
                    if (!rkArr[radioId]) {
                        rkArr[radioId] = [];
                    }
                    rkArr[radioId].push(res.values[i][ind]);
                }
            }
            defArr[defIndex].resolve();
        });
    }

    for (var i = 0; i < params.length; i++) {
        defArr[i] = new $.Deferred();
        this.existentShots[params[i].radioId] = false;
        sendRequest(params[i].filenames, params[i].name, params[i].radioId, i, this);
    }

    $.when.apply($, defArr).then(function () {
        success.call(that, rkArr);
    });
};

NDVITimelineManager.prototype.getVisibility = function (l) {
    return this.lmap.hasLayer(this.layerCollection[l]);
};

NDVITimelineManager.prototype.refreshVisibleLayersOnDisplay = function () {
    var that = this;

    var prevLayers = [].concat(that._visibleLayersOnTheDisplay);

    that._visibleLayersOnTheDisplay = [];
    that._visibleLayersOnTheDisplayPtr = [];
    for (var l in that._visibleFieldsLayers) {
        var bb = this.layerCollection[l].getBounds();
        var bb2 = this.lmap.getBounds();
        if (bb2.intersects(bb) && this.getVisibility(l)) {
            that._visibleLayersOnTheDisplay.push(l);
            that._visibleLayersOnTheDisplayPtr.push(that.layerCollection[l]);
        }

        //это поле в центре
        if (bb.contains(that.lmap.getCenter())) {
            that._visibleFieldsLayers[l].visible = true;
        } else {
            that._visibleFieldsLayers[l].visible = false;
        }
    }

    if (this.lmap.getZoom() >= NDVITimelineManager.MIN_ZOOM_HR) {
        that._themesHandler.addLayers(that._visibleLayersOnTheDisplayPtr, that._currentRKIdArr, that._currentFnIdArr);
        that._neodnrHandler.addLayers(that._visibleLayersOnTheDisplayPtr, that._currentClassificationRKIdArr, that._currentClassificationFnIdArr);
    }

    if (this._selectedLayers.length && !NDVITimelineManager.equal(that._visibleLayersOnTheDisplay, prevLayers)) {
        if (this._selectedOption == "HR" || this._selectedOption == "CLASSIFICATION") {
            this.removeSelectedLayersClipPolygon();
            if (this._cutOff) {

                for (var i = 0 ; i < this._visibleLayersOnTheDisplayPtr.length; i++) {
                    this._visibleLayersOnTheDisplayPtr[i].removePreRenderHook(NDVITimelineManager.l_hook);
                }

                for (var i = 0 ; i < this._visibleLayersOnTheDisplayPtr.length; i++) {
                    this._visibleLayersOnTheDisplayPtr[i].addPreRenderHook(NDVITimelineManager.l_hook);
                }

                this.layerBounds = NDVITimelineManager.getLayerBounds(this._visibleLayersOnTheDisplayPtr);
                this.addSelectedLayersClipPolygon(this.layerBounds);
            }
        }
    }

    if (this._selectedOption == "RATING" && !NDVITimelineManager.equal(that._visibleLayersOnTheDisplay, prevLayers)) {
        this._ratingHandler.start(this._visibleLayersOnTheDisplayPtr, shared.dateToString(this._selectedDate, true));
    }

    this.updateRadioLabelsActivity();
};

NDVITimelineManager.prototype.addSelectedLayersClipPolygon = function (clipPolygon) {
    for (var i = 0; i < this._selectedLayers.length; i++) {
        this._selectedLayers[i].addClipPolygon(clipPolygon);
    }
};

NDVITimelineManager.prototype.removeSelectedLayersClipPolygon = function () {
    if (this.layerBounds) {
        for (var i = 0; i < this._selectedLayers.length; i++) {
            this._selectedLayers[i].removeClipPolygon(this.layerBounds);
        }
    }
};

NDVITimelineManager.equal = function (a, b) {

    a.sort();
    b.sort();

    if (a.length != b.length) {
        return false;
    }

    for (var i = 0; i < a.length; i++) {
        if (a[i] != b[i])
            return false;
    }

    return true;
};

NDVITimelineManager.prototype.updateRadioLabelsActivity = function () {

    this.radioActiveLabels.style.display = "none";

    if (this.selectedDiv && this._visibleLayersOnTheDisplay.length) {
        if (this.lmap.getZoom() >= NDVITimelineManager.MIN_ZOOM_HR) {
            this.getProductAvailability("ndviRadio_hr") && this.setRadioLabelActive_grey("ndviRadio_hr", true);
            this.getProductAvailability("classificationRadio") && this.setRadioLabelActive_grey("classificationRadio", true);
            if (this.getProductAvailability("ndviMeanRadio")) {
                this.setRadioLabelActive_grey("ndviMeanRadio", true);
                this.setRadioLabelActive_grey("ratingRadio", true);
            }
            this.getProductAvailability("inhomogenuityRadio") && this.setRadioLabelActive_grey("inhomogenuityRadio", true);
            $(".ntHelp").removeClass("ntHelpLightOn");
        }
    } else {

        if (this._combo[this._selectedCombo].rk.length > 1 && this._combo[this._selectedCombo].resolution == "landsat"/*this._selectedCombo == 1*/ && this.selectedDiv && this.zoomRestrictionLabel.style.display == "none") {
            this.radioActiveLabels.style.display = "block";
            $(".ntHelp").addClass("ntHelpLightOn");
        }

        this.setRadioLabelActive_grey("ndviRadio_hr", false);
        this.setRadioLabelActive_grey("classificationRadio", false);

        this.setRadioLabelActive_grey("ratingRadio", false);
        this.setRadioLabelActive_grey("ndviMeanRadio", false);
        this.setRadioLabelActive_grey("inhomogenuityRadio", false);
    }

    if (!this._cutOff) {
        this.getProductAvailability("ndviRadio_hr") && this.setRadioLabelActive_grey("ndviRadio_hr", true);
        this.getProductAvailability("classificationRadio") && this.setRadioLabelActive_grey("classificationRadio", true);
        $("#light_ndviRadio_hr").removeClass("ntHelpLightOn");
        $("#light_classificationRadio").removeClass("ntHelpLightOn");
    }
};

NDVITimelineManager.prototype.onMoveEnd = function () {

    NDVITimelineManager.fires_ht = {};

    var that = this;

    if (!that._doubleClick) {
        that.refreshVisibleLayersOnDisplay();
    } else {
        setTimeout(function () {
            that.refreshVisibleLayersOnDisplay();
        }, 200);
    }
    that._doubleClick = false;

    //специально для ndviMean
    that.applyHRZoomREstriction(that.lmap.getZoom());

    that.setDatesStickHoverCallback();

    setTimeout(function () {
        that.refreshSelections();
    }, 500);
};

//кеш геометрий слоев
NDVITimelineManager.geomCache = [];

//Эта функция возвращает массив полигонов
NDVITimelineManager.inverseMercatorGeometry = function (geometry) {
    var res = [];
    if (geometry.type === "POLYGON") {
        res.push(gmxAPI.from_merc_geometry({ "type": "POLYGON", "coordinates": geometry.coordinates }));
    } else if (geometry.type === "MULTIPOLYGON") {
        var poligons = geometry.coordinates;
        for (var i = 0; i < poligons.length; i++) {
            res.push(gmxAPI.from_merc_geometry({ "type": "POLYGON", "coordinates": poligons[i] }));
        }
    }
    return res;
};

NDVITimelineManager.prototype.getLayersCommonGeometry = function (layersArr, callback) {

    if (gmxAPI.map.getZ() < NDVITimelineManager.MIN_ZOOM) {
        return;
    }

    var that = this;
    var defArr = [];
    var geometryArray = [];
    var equalLayers = [];

    for (var i = 0; i < layersArr.length; i++) {
        (function (index) {
            var layerName = layersArr[index];
            if (!equalLayers[layerName]) {
                equalLayers[layerName] = true;
                defArr[index] = new $.Deferred();
                if (!NDVITimelineManager.geomCache[layerName]) {
                    NDVITimelineManager.geomCache[layerName] = [];
                    //Получаем геометрию полей с сервера
                    var url = "http://maps.kosmosnimki.ru/VectorLayer/Search.ashx?WrapStyle=func" +
                              "&layer=" + layerName +
                              "&geometry=true";

                    sendCrossDomainJSONRequest(url, function (response) {
                        var res = response.Result;
                        var geom_index = res.fields.indexOf("geomixergeojson");
                        for (var j = 0; j < res.values.length; j++) {
                            var geom = NDVITimelineManager.inverseMercatorGeometry(res.values[j][geom_index]);
                            NDVITimelineManager.geomCache[layerName].push.apply(NDVITimelineManager.geomCache[layerName], geom);
                        }
                        geometryArray[index] = NDVITimelineManager.geomCache[layerName];
                        defArr[index].resolve();
                    });
                } else {
                    geometryArray[index] = NDVITimelineManager.geomCache[layerName];
                    defArr[index].resolve();
                }
            }
        }(i));
    }

    $.when.apply($, defArr).then(function () {
        var commonGeometry = { "type": "MULTIPOLYGON", "coordinates": [] };
        //делаем общую геометрию
        for (var i = 0; i < geometryArray.length; i++) {
            var geom = geometryArray[i];
            for (var j = 0; j < geom.length; j++) {
                var gj = geom[j];
                if (gj.type == "POLYGON") {
                    commonGeometry.coordinates.push(gj.coordinates);
                } else {
                    //MULTYPOLYGON
                    for (var k = 0; k < gj.coordinates.length; k++) {
                        commonGeometry.coordinates.push(gj.coordinates[k]);
                    }
                }
            }
        }

        callback && callback.call(that, commonGeometry);
    });
};

NDVITimelineManager.prototype.applyZoomHandler = function () {
    var that = this;

    this.lmap.on("moveend", function (arg) {
        that._prevZoom = that._currentZoom;
        var z = that.lmap.getZoom();
        if (that.applyZoomRestriction(z)) {

            if (z != that._currentZoom && that._currentZoom <= NDVITimelineManager.MIN_ZOOM) {
                that.refreshDateInterval_bug();
            }

            that.onMoveEnd();
        }
        that._currentZoom = z;
    });
};

NDVITimelineManager.prototype.setDatesStickHoverCallback = function () {
    var that = this;
    var dateDivs = $(".timeline-event.timeline-event-line");
    dateDivs.off("mouseover").on("mouseover", function (e) {
        that.dateDivHoverCallback.call(that, e);
    });
};

NDVITimelineManager.isPointInGeometry = function (geometry, point) {
    if (geometry.type.toUpperCase() == "POLYGON") {
        return NDVITimelineManager.isPointInPoly(geometry.coordinates[0], point);
    } else {
        for (var i = 0; i < geometry.coordinates.length; i++) {
            if (NDVITimelineManager.isPointInPoly(geometry.coordinates[i][0], point)) {
                return true;
            }
        }
    }
    return false;
};

NDVITimelineManager.prototype.dateDivHoverCallback = function (e) {

    if (this._combo[this._selectedCombo].rk[0] == "FIRES") {
        // попап для пожарных рисок точек
        //...
    } else {

        var selectedLayers = this.getViewTimelineLayers(this._selectedCombo);

        var selectedItems = [];
        for (var k = 0; k < selectedLayers.length; k++) {
            var l = selectedLayers[k];
            var ll = this.layerCollection[l];
            var items = this.timeLine.data.attributes.items[l];
            var dateColumnName = this._dateColumnNames[l];
            dateColumnName = ll._gmx.tileAttributeIndexes[dateColumnName];

            //собираем риски сосредоточенные в одном месте
            var center = L.Projection.Mercator.project(this.lmap.getCenter());
            for (var i in items) {
                var ii = items[i];
                var d0 = e.currentTarget.tip.textContent.substring(0, 10);
                var d1 = (ii.timelineItem ? ii.timelineItem.content : "xxx");
                if (d0 == d1 && NDVITimelineManager.isPointInGeometry(ii.obj.properties[ii.obj.properties.length - 1], center)) {
                    selectedItems.push({ item: ii, layer: ll });
                }
            }
        }

        if (selectedItems.length == 0)
            return;

        //иногда в одной дате несколько снимков
        var str = "";
        var clouds = 100;
        var cloudsHere = false;
        for (var i = 0; i < selectedItems.length; i++) {
            var prop = selectedItems[i].item.obj.properties;
            var ll = selectedItems[i].layer;
            var CLOUDS = ll._gmx.tileAttributeIndexes['CLOUDS'] || ll._gmx.tileAttributeIndexes['clouds'];
            if (prop[CLOUDS]) {
                var c = parseFloat(prop[CLOUDS]);
                //Общую облачность показываем минимальную
                if (c < clouds)
                    clouds = c;
                cloudsHere = true;
            }
        }

        this.hoverShotFilename = selectedItems[0].item.timelineItem.content;
        e.currentTarget.tip.children[0].textContent = this.hoverShotFilename;

        this.hoverDiv = e.currentTarget;

        if (cloudsHere) {
            e.currentTarget.tip.children[0].textContent = this.hoverShotFilename + ", облачность: " + Math.round(clouds) + "%";
        }

        var tipWidth = $(e.currentTarget.tip).width();
        if (this._mouseTabloPosition < tipWidth + 75) {
            var x = this._mouseTabloPosition_X - tipWidth;
            e.currentTarget.tip.style.left = (x < 0 ? 0 : x) + "px";
        }
    }
};

NDVITimelineManager.prototype.showLoading = function () {
    var el = document.getElementById("loading");
    if (el) {
        el.style.display = "block";
    } else {
        $('<div id="loading" class="timeline-container" style="width:42px; height:42px"></div>').appendTo($(this._container));
        $("#loading").append(
            '<div style="float: right;"> \
            <div id="floatingCirclesG"> \
            <div class="f_circleG" id="frotateG_01"></div><div class="f_circleG" id="frotateG_02"></div><div class="f_circleG" id="frotateG_03"></div><div class="f_circleG" id="frotateG_04"></div><div class="f_circleG" id="frotateG_05"></div><div class="f_circleG" id="frotateG_06"></div><div class="f_circleG" id="frotateG_07"></div><div class="f_circleG" id="frotateG_08"></div> \
            </div> \
            </div>');
    }
};

NDVITimelineManager.prototype.hideLoading = function () {
    var el = document.getElementById("loading");
    if (el) {
        el.style.display = "none";
    }
};

NDVITimelineManager.prototype.getSliderDate = function () {
    if (this._slider.getCaption().length) {
        return NDVITimelineManager.serverDateToDate(this._slider.getCaption(), true);
    } else {
        return new Date(this._selectedYear, 0, 1);
    }
};

NDVITimelineManager.serverDateToDate = function (dateStr, order) {
    var arr = dateStr.split(".");
    arr.forEach(function (el, i) { arr[i] = parseInt(el); });
    if (order) {
        return new Date(arr[2], arr[1] - 1, arr[0]);
    } else {
        return new Date(arr[0], arr[1] - 1, arr[2]);
    }
};

NDVITimelineManager.prototype.applyActiveYears = function (yearsList) {
    for (var y in this._yearsPanel) {
        var pan = this._yearsPanel[y];
        if (yearsList[y]) {
            pan.radio.disabled = false;
            pan.radio.style.cursor = "pointer";
            pan.caption.classList.remove("ntDisabledLabel");
            pan.count.classList.remove("ntDisabledLabel");
            pan.count.innerHTML = yearsList[y].toString();
        } else {
            pan.radio.disabled = true;
            pan.radio.style.cursor = "default !important";
            pan.caption.classList.add("ntDisabledLabel");
            pan.count.classList.add("ntDisabledLabel");
            pan.count.innerHTML = "(0)";
            pan.title = "";
        }
    }
};

NDVITimelineManager.prototype.setYearsPanelToZero = function () {
    for (var y in this._yearsPanel) {
        var pan = this._yearsPanel[y];
        pan.radio.disabled = true;
        pan.caption.classList.add("ntDisabledLabel");
        pan.count.classList.add("ntDisabledLabel");
        pan.count.innerHTML = "(0)";
        pan.title = "";
    }
};

//Эта функия есть в плагине таймлайна, ее бы надо вынести в утилиты
NDVITimelineManager.isPointInPoly = function (poly, pt) {
    var l = poly.length;
    poly[0][0] == poly[l - 1][0] && poly[0][1] == poly[l - 1][1] && l--;
    for (var c = false, i = -1, j = l - 1; ++i < l; j = i)
        ((poly[i][1] <= pt.y && pt.y < poly[j][1]) || (poly[j][1] <= pt.y && pt.y < poly[i][1]))
        && (pt.x < (poly[j][0] - poly[i][0]) * (pt.y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])
        && (c = !c);
    return c;
}

NDVITimelineManager.prototype.initializeImageProcessor = function () {
    for (var i = 0; i < this._combo.length; i++) {
        var r = this._combo[i].rk;
        for (var j = 0; j < r.length; j++) {
            var rj = r[j];
            var lrj = this._layersLegend[rj];
            if (lrj.palette && (lrj.palette.ndvi || lrj.palette.classification)) {
                var n = lrj.name;
                this._setLayerImageProcessing(this.layerCollection[n], rj);
                var layer = this.layerCollection[n];
                var styles = layer.getStyles();
                styles[0].HoverStyle.weight = styles[0].RenderStyle.weight;
                layer.setStyles(styles);
            }
        }
    }

    this._setLayerImageProcessing(this.layerCollection[this._layersLegend.LANDSAT2016.name], "LANDSAT2016");
    this._setLayerImageProcessing(this.layerCollection[this._layersLegend.SENTINEL2016.name], "SENTINEL2016");

    this.landsatCloudMask = this.layerCollection["A05BB0207AEE4CFD93C045BF71576FDE"];
    this.landsatCloudMask.disable
    this.sentinelCloudMask = this.layerCollection["14A988CBC5FD424D9EBE23CEC8168150"];
    this.landsatCloudMask.setRasterHook(function (dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info) {
        applyMask(dstCanvas, srcImage, info);
    });
    this.sentinelCloudMask.setRasterHook(function (dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info) {
        applyMask(dstCanvas, srcImage, info);
    });

    var that = this;
    function applyMask(dstCanvas, srcCanvas, info) {
        shared.zoomTile(srcCanvas, info.source.x, info.source.y, info.source.z,
                   info.destination.x, info.destination.y, that.lmap.getZoom(),
                   dstCanvas,
                   function (r, g, b, a) {
                       if (r === 0 || r === 1) {
                           return [r, g, b, 0];
                       } else {
                           return [r, g, b, a];
                       }
                   }, shared.NEAREST);
    }
};

NDVITimelineManager.prototype.initializeRGBImagePrrocessing = function () {
    var layer = this.layerCollection[this._layersLegend.RGB.name];
};

NDVITimelineManager.prototype.initializeRGB2ImagePrrocessing = function () {
    var layer = this.layerCollection[this._layersLegend.RGB2.name];
    var that = this;
    layer.setRasterHook(function (dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info) {
        shared.zoomTile(srcImage, info.source.x, info.source.y, info.source.z,
            info.destination.x, info.destination.y, that.lmap.getZoom(), dstCanvas, null, shared.LINEAR);

    });
};

NDVITimelineManager.prototype.initializeShotsObserver = function () {
    for (var i = 0; i < this._combo.length; i++) {
        var r = this._combo[i].rk;
        for (var j = 0; j < r.length; j++) {
            var rj = r[j];
            var lrj = this._layersLegend[rj];
            if (this._layersLegend[rj].viewTimeline) {
                var n = lrj.name;
            }
        }
    }

    this.bindTimelineCombo(this._selectedCombo);
};

NDVITimelineManager.prototype.unbindLayersTimeline = function () {
    this._lockUnbind = true;
    var layers = [].concat(this.timeLine.data.attributes.layers);
    for (var i = 0; i < layers.length; i++) {
        this.timeLine.unbindLayer(layers[i].layer);
    }
    this._lockUnbind = false;
};

NDVITimelineManager.prototype.getViewTimelineLayers = function (selectedCombo) {
    var res = [];
    var rkArr = this._combo[selectedCombo].rk;
    var viewTimelineLayer = 0
    for (var i = 0; i < rkArr.length; i++) {
        if (this._layersLegend[rkArr[i]].viewTimeline) {
            res.push(this._layersLegend[rkArr[i]].name);
        }
    }
    return res;
};

NDVITimelineManager.prototype.bindTimelineCombo = function (selectedCombo) {
    this.unbindLayersTimeline();
    var timelineLayerNames = this.getViewTimelineLayers(selectedCombo);

    var timelineMode = this._layersLegend[this._combo[selectedCombo].rk[0]].timelineMode || "center";
    this.timeLine.setTimelineMode(timelineMode);

    for (var l in this._proxyLayers) {
        this._proxyLayers[l].delete();
        delete this._proxyLayers[l];
    }

    for (var i = 0; i < timelineLayerNames.length; i++) {
        var timelineLayerName = timelineLayerNames[i];
        //Вобщем такая бага, приходится все время создавать прокси слой при переключении, если использовать 
        //один и тот же такое ощущение, что теряются риски на таймлайне.
        if (this.isProxyLayer(timelineLayerName) /*&& !this._proxyLayers[timelineLayerName]*/) {
            this._proxyLayers[timelineLayerName] = new TimelineProxyLayer(this, this.layerCollection[timelineLayerName], this.lmap);
            this._proxyLayers[timelineLayerName].setDateInterval(new Date(this._selectedYear, 0, 1), new Date(this._selectedYear, 11, 31));
            this.timeLine.bindLayer(this._proxyLayers[timelineLayerName].localLayer, { trackVisibility: false });
            this.layerCollection[this._proxyLayers[timelineLayerName].name] = this._proxyLayers[timelineLayerName].localLayer;
            //} else if (this.isProxyLayer(timelineLayerName) && this._proxyLayers[timelineLayerName]) {
            //    this._proxyLayers[timelineLayerName].setDateInterval(new Date(this._selectedYear, 0, 1), new Date(this._selectedYear, 11, 31));
            //    this.timeLine.bindLayer(this._proxyLayers[timelineLayerName].localLayer, { trackVisibility: false });
        } else {
            this.timeLine.bindLayer(this.layerCollection[timelineLayerName], { trackVisibility: false });
        }
    }
};

NDVITimelineManager.prototype.isProxyLayer = function (name) {
    return this._proxyOptions.indexOf(name) != -1;
};

NDVITimelineManager._normalizeFilename = function (filename, type) {
    var res = "";

    if (type == NDVITimelineManager.NDVI_HR) {
        res = filename.substring(0, filename.length - 5);
    } else if (type == NDVITimelineManager.RGB_HR) {
        res = filename.substring(0, filename.length - 5);
    } else if (type == NDVITimelineManager.RGB2_HR) {
        res = filename.substring(0, filename.length - 5);
    } else if (type == NDVITimelineManager.CLASSIFICATION) {
        //res = filename.substring(0, filename.length - 5) + "_classification";
        res = filename.substring(0, filename.length - 5);
    } else if (type == NDVITimelineManager.QUALITY16) {
        res = filename.substring(0, filename.length - 7) + "_QUALITY16";
    } else if (!type) {
        res = filename.substring(0, filename.length - 5);
    }

    return res;
};

NDVITimelineManager.prototype.deactivateUnknownRadios = function () {

    var donttouchArray = null;

    if (document.getElementById("chkQl").checked) {
        donttouchArray = ["rgbRadio"];
    }

    for (var c in NDVITimelineManager._comboRadios[this._selectedCombo]) {
        var r = NDVITimelineManager._comboRadios[this._selectedCombo][c];
        if (!donttouchArray) {
            this.setRadioLabelActive_grey(r, false);
        } else if (donttouchArray.indexOf(r) == -1) {
            this.setRadioLabelActive_grey(r, false);
        }
    }

    this.setRadioLabelActive_grey("ratingRadio", false);
    this.setRadioLabelActive_grey("ndviMeanRadio", false);
    this.setRadioLabelActive_grey("inhomogenuityRadio", false);
};

NDVITimelineManager.prototype.refreshSelections = function () {

    var layerNames = this.getViewTimelineLayers(this._selectedCombo);

    if (this._combo[this._selectedCombo].resolution == "landsat"/*this._selectedCombo == 1*/ && this._currentSelection) {

        this.selectedDiv = null;

        for (var k = 0; k < layerNames.length; k++) {
            var layerName = layerNames[k];
            var l = this.layerCollection[layerName];
            var PATHId = l._gmx.tileAttributeIndexes["PATH"];
            var ACQDATEId = l._gmx.tileAttributeIndexes["ACQDATE"] || l._gmx.tileAttributeIndexes["acqdate"];

            var done = false;
            for (var s in this._currentSelection) {
                var items = this.timeLine.data.attributes.items[s];
                for (i in items) {
                    var item = items[i];
                    if (item.timelineItem && item.obj.properties[ACQDATEId] == this._selectedDateL && item.obj.properties[PATHId] == this._selectedPath) {
                        item.timelineItem.select();
                        this.selectedDiv = item.timelineItem.dom;
                        done = true;
                        break;
                    }
                }
                if (done) {
                    break;
                }
            }
        }
    } else if (this.selectedDiv) {
        var start = new Date(this._selectedYear, 0, 1);
        var end = new Date(this._selectedYear + 1, 1, 9);
        var tl = this.timeLine.getTimelineController().getTimeline();
        var currIndex = tl.getItemIndex(this.selectedDiv);

        if (!tl.items[currIndex]) {

            var currTime = this._selectedDate.getTime();

            var minItem = null;
            var minDeltaTime = 100000000000;
            //выбираем items выбранного года и ближайщее расстояние от текущего выбранного
            for (var i = 0; i < tl.items.length; i++) {
                var item = tl.items[i];
                var itemDate = new Date(item.center);
                if (item.dom && itemDate >= start && itemDate <= end) {
                    var idt = itemDate.getTime();
                    var d = Math.abs(currTime - idt);
                    if (d < minDeltaTime) {
                        minDeltaTime = d;
                        minItem = item;
                    }
                }
            }

            if (minItem) {

                function daydiff(first, second) {
                    return (second - first) / (1000 * 60 * 60 * 24);
                }

                $(".timeline-event.timeline-event-line").removeClass("timeline-event-selected");

                if (document.getElementById("conditionsOfVegetationRadio").checked &&
                    this._selectedDate == new Date(minItem.center)) {
                    item.timelineItem.select();
                } else if (this._combo[this._selectedCombo].rk[0] == "FIRES") {
                    if (NDVITimelineManager.equalDates(this._selectedDate, new Date(minItem.center))) {
                        minItem.dom.classList.add("timeline-event-selected");
                    }
                } else if (daydiff(this._selectedDate, new Date(minItem.center)) <= 3) {
                    minItem.dom.classList.add("timeline-event-selected");
                }
            }
        }
    } else if (this._selectedPeriod && this._selectedDate0 && this._selectedDate1) {
        var tl = this.timeLine.getTimelineController().getTimeline();
        var range = tl.getVisibleChartRange();
        var sortedItems = [];
        for (var i = 0; i < tl.items.length; i++) {
            var item = tl.items[i];
            var itemDate = new Date(item.center);
            if (item.dom && itemDate >= range.start && itemDate <= range.end) {
                sortedItems.push({ "center": item.center, "dom": item.dom });
            }
        }

        sortedItems.sort(function (a, b) {
            return b.center - a.center;
        });

        this.selectPeriodItems(this._selectedDate0, this._selectedDate1, sortedItems);
    } else {
        //здесь происходит выделение риски
        for (var s in this._currentSelection) {
            var css = this._currentSelection[s];
            for (var i = 0; i < css.length; i++) {
                var item = this.timeLine.data.attributes.items[s][css[i].id];
                if (item && item.timelineItem) {
                    item.timelineItem.select();
                    this.selectedDiv = item.timelineItem.dom;
                }
            }
        }
    }
};

NDVITimelineManager.prototype.initializeTimeline = function (show) {
    if (this.timeLine) {
        this.timeLine.toggleVisibility(show);
    } else {
        var lmap = this.lmap;
        this.timeLine = new nsGmx.TimelineControl(lmap, { position: "bottomright" });
        this.timeLine.setMapMode("selected");
        this.timeLine.setTimelineMode("center");
        if (lmap.getZoom() > NDVITimelineManager.MIN_ZOOM)
            this.timeLine.toggleVisibility(true);
        else
            this.timeLine.toggleVisibility(false);
        this.timeLine.setControlsVisibility({
            "showModeControl": false,
            "showSelectionControl": false,
            "showCalendar": false
        });

        //связываем слои NDVI с таймлайном и обработку(раскраску) тайлов этих слоев
        //я не зря разбил эти циклы на отдельные, онипригадятся в будущем кажый в отдельности
        this.initializeImageProcessor();

        //сделаем обработку для раззумливания снимков отдельным обработчиком
        this.initializeRGBImagePrrocessing();
        this.initializeRGB2ImagePrrocessing();

        //обсерверы на КР, нужно для определения кол-ва снимков,  и окончания загрузки на таймлайн
        this.initializeShotsObserver();

        var that = this;
        this.timeLine.addFilter(function (elem, a, b, layer) {
            return that._filterTimeline(elem, layer);
        });

        $(this.timeLine.getTimelineController()).on("reflow", function () {
            that.redrawTimelineLinks();
        });

        $(this.timeLine.getTimelineController()).on('reflow', function () {
            that.setDatesStickHoverCallback();
        });

        this.timeLine.data.on('change:selection', function (x) {
            that.onChangeSelection.call(that, x);
        });

        this.initTimelineFooter();

        var that = this;
        var tablo = $(".timeline-container");
        var tabloWidth = tablo.width();
        tablo.bind("mousemove", function (e) {
            that._mouseTabloPosition = tabloWidth - e.offsetX;
            that._mouseTabloPosition_X = e.offsetX;
        });

        $(".timeline-container").prepend('<div class="shadeTimeline">')
    }

    //останавливаем перемещение таймлайна мышкой
    this.timeLine.getTimelineController().getTimeline().setOptions({ "moveable": false, "zoomable": false });

    //помещаем контрол в такой zIndex, чтобы он отображался под другими контролами
    $(".leaflet-bottom.leaflet-right.gmx-bottom-shift").css("z-index", 0);

    $(this.timeLine.getContainer()).on('click', function (event) {
        if (that.optionsMenu._isOpened && !that.optionsMenu._dontClose) {
            that.optionsMenu.hide();
        }
        event.stopPropagation();
    });

    $(this.timeLine.getContainer()).on('dblclick', function (event) {
        event.stopPropagation();
    });

    bindScrollControl("ntRightPanel", this.lmap);

    $("#ntComboBox > option").each(function (e, n) {
        if (that._combo[parseInt(n.value)].hide) {
            $(n).remove();
        }
    });
};

NDVITimelineManager.prototype.redrawTimelineLinks = function () {
    var that = this;
    if (that._lockUnbind) return;

    var layerNames = that.getViewTimelineLayers(that._selectedCombo);

    if (that._combo[that._selectedCombo].clouds/*that._combo[that._selectedCombo].rk[0] == "HR" ||
        that._combo[that._selectedCombo].rk[0] == "RGB753"*/) {

        var isQl = $("#chkQl").is(':checked');

        setTimeout(function () {
            for (var k = 0; k < layerNames.length; k++) {
                var l = layerNames[k];

                that.isProxyLayer(l) && (l = "proxy_" + l);
                var items = that.timeLine.data.attributes.items[l];

                var layer = that.layerCollection[l];

                var gmxRKid = layer._gmx.tileAttributeIndexes['GMX_RasterCatalogID'];

                for (var i in items) {
                    var ii = items[i];
                    if (ii.timelineItem && ii.timelineItem.dom) {
                        var dom = ii.timelineItem.dom;
                        var prop = ii.obj.properties;

                        if (dom && dom.childNodes.length == 0) {
                            if (!prop[gmxRKid].length && isQl) {
                                dom.classList.add("ntQl");
                            }

                            var CLOUDSid = layer._gmx.tileAttributeIndexes['CLOUDS'] || layer._gmx.tileAttributeIndexes['clouds'];

                            if (CLOUDSid) {

                                var clouds = parseInt(prop[CLOUDSid]);

                                var div1 = document.createElement("div");
                                div1.style.width = "100%";
                                div1.style.backgroundColor = "rgb(131, 132, 134)";
                                div1.style.height = (100 - clouds) + "%";

                                var div2 = document.createElement("div");
                                div2.style.width = "100%";
                                div2.style.backgroundColor = "white";
                                div2.style.height = clouds + "%";

                                dom.appendChild(div1);
                                dom.appendChild(div2);
                            }
                        }
                    }
                }
            }
        });
    } else {
        setTimeout(function () {
            for (var k = 0; k < layerNames.length; k++) {
                var l = layerNames[k];

                that.isProxyLayer(l) && (l = "proxy_" + l);
                var items = that.timeLine.data.attributes.items[l];

                var layer = that.layerCollection[l];

                var gmxRKid = layer._gmx.tileAttributeIndexes['GMX_RasterCatalogID'];

                for (var i in items) {
                    var ii = items[i];
                    if (ii.timelineItem && ii.timelineItem.dom) {
                        var dom = ii.timelineItem.dom;
                        if (dom && dom.childNodes.length == 0) {
                            var div1 = document.createElement("div");
                            div1.style.width = "100%";
                            div1.style.backgroundColor = "rgb(131, 132, 134)";
                            div1.style.height = "100%";

                            if (that._selectedPeriod && that._selectedDate0 && that._selectedDate1) {
                                var d = new Date(ii.timelineItem.center);
                                if (d >= that._selectedDate0 && d <= that._selectedDate1) {
                                    dom.classList.add("timeline-event-selected");
                                }
                            }

                            dom.appendChild(div1);
                        }
                    }
                }
            }
        });
    }

};

NDVITimelineManager.prototype.onChangeSelection = function (x) {

    this.isSentinel = false;

    this.meanNdviNoDataLabel.style.display = "none";

    this.optionsMenu.hide();

    this.setRadioLabelActive_grey("rgbRadio", false);
    this.setRadioLabelActive_grey("ndviRadio_modis", false);
    this.setRadioLabelActive_grey("conditionsOfVegetationRadio", false);

    this.zoomRestrictionLabel.style.display = "none";
    $(".ntHelp").removeClass("ntHelpLightOn");

    this.clearProductAvailability();

    function getFilename(properties, layer) {
        var sceneid = properties[layer._gmx.tileAttributeIndexes["sceneid"]] || properties[layer._gmx.tileAttributeIndexes["SCENEID"]];
        if (sceneid) {
            return sceneid + "_NDVI";
        } else {
            var filename = layer._gmx.tileAttributeIndexes["filename"];
            return properties[filename];
        }
    };

    var that = this;

    that._quicklookSelected = false;

    //снимаем выделения
    $(".timeline-event.timeline-event-line").removeClass("timeline-event-selected");

    that.selectedDiv = null;

    that._currentSelection = x.changed.selection;

    var selection = x.changed.selection;
    var selectedLayer;
    for (var sel in selection) {
        selectedLayer = sel;
    }

    var selectedItems = selection[selectedLayer];

    that._comboFilenames.length = 0;

    this.setProductAvailability("rgbRadio", true);

    this.updateRadioLabelsActivity();

    if (!selectedItems) {

        !that._dontTouchEmptyClick && window.ndviGraphicsManager && ndviGraphicsManager.graphDialog.onEmptyClick(null, true);

        that._hideLayers();
        that._currentRKIdArr = [];
        if (!that._showThemesNDVI) {
            that.setRadioLabelActive("ratingRadio", false);
            that.setRadioLabelActive("ndviMeanRadio", false);
            that.setProductAvailability("ndviMeanRadio", false);
        }
        //выключаем "неопознанные" продукты
        that.deactivateUnknownRadios();
        that._currentSelection = null;
        that._selectedPath = null;
        this._selectedDates = [];
        that._selectedDate0 = null;
        that._SelectedDate1 = null;
    } else {

        var c = this.timeLine.getTimelineController();
        var t = c.getTimeline();
        this._selectedDiv = t.selection[0].item;

        if (this._combo[this._selectedCombo].rk[0] == "FIRES") {

            NDVITimelineManager.fires_ht = {};

            var comboArr = that._combo[that._selectedCombo].rk;

            this._selectedDates = [];

            for (var u = 0; u < selectedItems.length; u++) {
                var layerItems = x.attributes.items[selectedLayer];
                var prop = layerItems[selectedItems[u].id].obj.properties;

                var qrk = comboArr[0];
                var dcln = that._layersLegend[qrk].dateColumnName;
                var date = prop[this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes[dcln]];

                this._selectedDates.push(date);

            }

            this._selectedDateL = this._selectedDates[0];
            this._selectedDate = new Date(date * 1000);
            this._selectedDateStr = shared.dateToString(new Date(date * 1000));

            this._selectedType[this._selectedCombo] = NDVITimelineManager.FIRES_POINTS;

            this._prepareRedraw();
            this._showRedraw();
        } else {

            //здесь хранится имя облачного снимка
            var ql = null;
            var clouds = null;
            var qldate = "";
            var date = "";

            if (selectedLayer == "58A10C3522764BA69D2EA75B02E8A210") {
                this.isSentinel = true;
            }
            var comboArr = that._combo[that._selectedCombo].rk;
            var q;
            //TODO: вынести индекс слоя в группе в какой нибудь параметр.
            if (comboArr.length != 1 && that._combo[that._selectedCombo].resolution != "modis") {
                if (this.isSentinel) {
                    q = 4;
                } else {
                    q = 1;
                }
            } else {
                q = 0;
            }

            var qrk = comboArr[q];
            var dcln = that._layersLegend[qrk].dateColumnName;
            var filenames = [];

            for (var u = 0; u < selectedItems.length; u++) {
                var layerItems = x.attributes.items[selectedLayer];
                var prop = layerItems[selectedItems[u].id].obj.properties;

                var _GMX_RasterCatalogID = this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes["GMX_RasterCatalogID"];
                //это облачныйснимок
                if (!this.isSentinel && !prop[_GMX_RasterCatalogID].length) {
                    var _CLOUDS = this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes["CLOUDS"];
                    clouds = prop[_CLOUDS];
                    that._selectedType[that._selectedCombo] = NDVITimelineManager.RGB_HR;
                    document.getElementById("rgbRadio").checked = true;
                    this.setRadioLabelActive_grey("ndviRadio_hr", false);
                    this.setRadioLabelActive_grey("ratingRadio", false);
                    this.setRadioLabelActive_grey("ndviMeanRadio", false);
                    this.setRadioLabelActive_grey("inhomogenuityRadio", false);
                    this.setRadioLabelActive_grey("classificationRadio", false);

                    this.setProductAvailability("ndviRadio_hr", false);
                    this.setProductAvailability("ratingRadio", false);
                    this.setProductAvailability("ndviMeanRadio", false);
                    this.setProductAvailability("inhomogenuityRadio", false);
                    this.setProductAvailability("classificationRadio", false);
                }

                date = prop[this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes[dcln]] ||
                    prop[this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes["ACQDATE"]];

                if (date) {
                    that._selectedDateL = date;
                    that._selectedDate = new Date(date * 1000);
                    that._selectedDateStr = shared.dateToString(new Date(date * 1000));
                    var _PATH = this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes["PATH"];
                    that._selectedPath = prop[_PATH];
                    if (that._switchYearCallback)
                        that._switchYearCallback(that._selectedDate);

                    if (that._combo[that._selectedCombo].resolution != "modis"/*that._selectedCombo == 1*/) {
                        for (var i in layerItems) {
                            var lip = layerItems[i].obj.properties;

                            var lip_dcln = lip[this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes[dcln]] ||
                                           lip[this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes["ACQDATE"]] ||
                                           lip[this.layerCollection[selectedLayer]._gmx.tileAttributeIndexes["acqdate"]];

                            if (lip_dcln == date) {
                                var center = L.Projection.Mercator.project(that.lmap.getCenter());
                                var geom = lip[lip.length - 1];
                                if (NDVITimelineManager.isPointInGeometry(geom, center)) {
                                    if (document.getElementById("chkQl").checked ||
                                        !document.getElementById("chkQl").checked && lip[_GMX_RasterCatalogID].length) {
                                        filenames.push(getFilename(lip, this.layerCollection[selectedLayer]));
                                        that._currentRKIdArr.push(lip[_GMX_RasterCatalogID]);
                                    }
                                }
                            }
                        }
                    } else {
                        filenames.push(getFilename(prop, this.layerCollection[selectedLayer]));
                    }
                }
            }
            that._comboFilenames[that._selectedCombo] = filenames;

            //Показать снимок
            that._prepareRedraw();
            var selType = that._selectedType[that._selectedCombo];
            var isDefault = (selType == NDVITimelineManager.RGB_HR || selType == NDVITimelineManager.NDVI16 || selType == NDVITimelineManager.LANDSAT);

            if (isDefault || this._activatePermalink) {
                that._showRedraw();
            }

            //выключаем "неопознанные" продукты
            that.deactivateUnknownRadios();

            //и включаем снимки
            this.setRadioLabelActive_grey("rgbRadio", true);
            this.setRadioLabelActive_grey("ndviRadio_modis", true);
            this.setRadioLabelActive_grey("qualityRadio", true);

            this.setRadioLabelActive_grey("conditionsOfVegetationRadio", true);

            //params = [{"name":<имя слоя>,"filename":<имя файла>, "id":<radio element id>} ]
            var params = [];
            var rk = that._combo[that._selectedCombo].rk;
            for (var i = 0; i < rk.length; i++) {
                var rki = rk[i];
                //пропускаем каталог RGB high resolution
                if (!this._layersLegend[rki].viewTimeline) {
                    if (NDVITimelineManager._comboRadios[that._selectedCombo]) {

                        var filenames = [];
                        var sceneids = [];

                        for (var j = 0; j < that._comboFilenames[that._selectedCombo].length; j++) {
                            filenames.push(NDVITimelineManager._normalizeFilename(that._comboFilenames[that._selectedCombo][j], NDVITimelineManager._rkId[rki]));
                            sceneids.push(NDVITimelineManager._normalizeFilename(that._comboFilenames[that._selectedCombo][j], NDVITimelineManager._rkId["HR"]));
                        }

                        params.push({
                            "name": that._layersLegend[rki].name,
                            "filenames": filenames,
                            "radioId": NDVITimelineManager._comboRadios[that._selectedCombo][rki]
                        });

                        //запоминаем filenames(sceneid) для снимков ndvi
                        if (rki == "HR") {
                            that._currentFnIdArr.length = 0;
                            that._currentFnIdArr = [];
                            that._currentFnIdArr.push.apply(that._currentFnIdArr, filenames);
                        }
                        if (rki == "CLASSIFICATION") {
                            that._currentClassificationFnIdArr.length = 0;
                            that._currentClassificationFnIdArr = [];
                            that._currentClassificationFnIdArr.push.apply(that._currentClassificationFnIdArr, sceneids);
                        }
                    }
                }
            }

            //that._currentRKIdArr = [];
            that._setExistentProds(params, function (rkArr) {
                for (var i in that.existentShots) {

                    if (i == "classificationRadio" && that._selectedDate >= new Date(2015, 10, 1)) {
                        continue;
                    }

                    that.setRadioLabelActive_grey(i, that.existentShots[i]);
                    that.setProductAvailability(i, that.existentShots[i]);

                    if (i == "classificationRadio") {
                        that.setRadioLabelActive_grey("inhomogenuityRadio", that.existentShots[i] && that.existentShots["ndviRadio_hr"]);
                        that.setRadioLabelActive_grey("classificationRadio", that.existentShots[i] && that.existentShots["ndviRadio_hr"]);

                        that.setProductAvailability("inhomogenuityRadio", that.existentShots[i] && that.existentShots["ndviRadio_hr"]);
                        that.setProductAvailability("classificationRadio", that.existentShots[i] && that.existentShots["ndviRadio_hr"]);

                        that._currentClassificationRKIdArr = [].concat(rkArr["classificationRadio"]);
                    }

                    if (i == "ndviRadio_hr" && that.existentShots["ndviRadio_hr"]) {
                        that.setRadioLabelActive("ndviMeanRadio", that.existentShots[i]);
                        that.setProductAvailability("ndviMeanRadio", that.existentShots[i]);
                        that.setRadioLabelActive("ratingRadio", that.existentShots[i]);
                        that.setProductAvailability("ratingRadio", that.existentShots[i]);

                        that._currentRKIdArr = [].concat(rkArr["ndviRadio_hr"]);
                    }
                }

                if (!isDefault) {
                    that._showRedraw();
                }

                if (that.lmap.getZoom() >= NDVITimelineManager.MIN_ZOOM_HR) {
                    that._themesHandler.addLayers(that._visibleLayersOnTheDisplayPtr, that._currentRKIdArr, that._currentFnIdArr);
                    that._neodnrHandler.addLayers(that._visibleLayersOnTheDisplayPtr, that._currentClassificationRKIdArr, that._currentClassificationFnIdArr);
                }

                if (that.isSentinel) {
                    that.setRadioLabelActive_grey("rgbRadio", false);
                    that.setRadioLabelActive_grey("rgbRadio2", true);
                    if (document.getElementById("rgbRadio").checked || document.getElementById("rgbRadio2").checked) {
                        if (document.getElementById("rgbRadio").checked) {
                            document.getElementById("rgbRadio2").checked = true;
                        }
                    }
                }

                that.applyHRZoomREstriction(that.lmap.getZoom());
            });
        }

        if (that._selectedPeriod) {
            var date = new Date(that._selectedDate);
            var div = that._selectedDiv;
            that.clearSelection();

            that._selectedDate0 = that.stringToDate(that._slider.getCaption0());
            if (date > that._selectedDate0) {
                that._selectedDate1 = date;
                that._slider.setActivePointer(1);
            } else {
                that._selectedDate0 = date;
                that._selectedDate1 = that.stringToDate(that._slider.getCaption1());
                that._slider.setActivePointer(0);
            }

            div.classList.add("timeline-event-selected");
            that._setSliderState(null, date);

            that.refreshSelections();
            that._hideLayers();
            that._showFIRES_POINTS();
            return;
        }

        that.selectedShotFilename = "";
        if (!(that.shiftNext || that.shiftPrev || that.shiftZero)) {
            if (selectedItems && selectedItems.length == 1 && that._combo[that._selectedCombo].resolution == "landsat"/* that._selectedCombo == 1*/) {
                that.selectedShotFilename = that.hoverShotFilename.substr(0, that.hoverShotFilename.length - 0);//а было - 5 потому что _NDVI
            }
        } else {
            if (that.shiftZero) {
                that.selectedShotFilename = $("#ntFilenameCaption").text();
            } else {
                var files = that._comboFilenames[that._selectedCombo];
                if (files && selectedItems && selectedItems.length == 1 && that._combo[that._selectedCombo].resolution == "landsat"/*that._selectedCombo == 1*/) {
                    var fn = files[0];
                    that.selectedShotFilename = date + " - " + fn.substr(0, fn.length - 5);//а было - 5 потому что _NDVI
                    that._setSliderState(x.attributes.range, that._selectedDate, true);
                }
            }
        }
    }


    if (that._currentSelection && (that.shiftNext || that.shiftPrev || !that.shiftZero)) {
        that._setSliderState(x.attributes.range, that._selectedDate, true);
    }

    that.shiftZero = false;
    that.shiftNext = false;
    that.shiftPrev = false;

    //привязываем событие на случай повторного нажатия
    if (that._clickForUnselect) {
        that._clickForUnselect.off("click");
    }
    that._clickForUnselect = $(".timeline-event.timeline-event-line.timeline-event-selected");
    that._clickForUnselect.on("click", function (e) {
        if (!selectedItems) {
            that.timeLine.getTimelineController().getTimeline().setSelection([]);
            that.timeLine.shiftActiveItem(0);
            that._clickForUnselect.off("click");
        }
        selectedItems = null;
    });

    this.setTimeLineYear(this._selectedYear);

    document.getElementById("ntYear").innerHTML = that._selectedYear;

    that.extractTimelineItems();

    that.refreshSelections();
};

NDVITimelineManager.prototype.extractTimelineItems = function () {
    this.timelineItems = [];
    //сохраняю риски
    for (var s in this._currentSelection) {
        var items = this.timeLine.data.attributes.items[s];
        for (i in items) {
            var item = items[i];
            this.timelineItems.push(item);
        }
    }
};


NDVITimelineManager.prototype._setSliderState = function (range, date, async) {

    var that = this;
    var f = function () {
        var s = $(".timeline-event-selected")[0];
        if (s) {
            var b = $("#ntSliderBar")[0];
            //var bb = b.clientWidth;
            //var ss = parseFloat(s.style.left.substr(0, s.style.left.length - 2));
            //var l = ss * 100 / bb;
            l = parseFloat(s.style.left);
            that._slider.setValue(l, NDVITimelineManager.formatDate(date.getDate(),
                date.getMonth() + 1, date.getFullYear()));
        }
    };

    if (!async) {
        f();
    } else {
        setTimeout(f, 10);
    }
};

NDVITimelineManager.prototype.setRadioLabelActive = function (id, active) {
    var lbl = this._radioButtonLabels[id].label;
    var div = this._radioButtonLabels[id].parent;
    if (active) {
        lbl.classList.remove("ntDisabledLabel");
        document.getElementById(lbl.for).disabled = false;
        if (div.displayCombo)
            div.style.display = "block";
    } else {
        lbl.classList.add("ntDisabledLabel");
        document.getElementById(lbl.for).disabled = true;
        if (this._selectedCombo != 1 || (id != "ndviMeanRadio" && id != "inhomogenuityRadio")) {
            if (div.displayCombo)
                div.style.display = "none";
        }
    }
};

NDVITimelineManager.prototype.setRadioLabelActive_grey = function (id, active) {
    if (!this._radioButtonLabels[id]) {
        console.log(id);
    }
    var lbl = this._radioButtonLabels[id].label;
    var div = this._radioButtonLabels[id].parent;
    if (active) {
        lbl.classList.remove("ntDisabledLabel");
        document.getElementById(lbl.for).disabled = false;
    } else {
        lbl.classList.add("ntDisabledLabel");
        document.getElementById(lbl.for).disabled = true;
    }
};

NDVITimelineManager.prototype.setProductAvailability = function (id, active) {
    this.productsAvailability[id] = active;
};

NDVITimelineManager.prototype.getProductAvailability = function (id) {
    return this.productsAvailability[id];
};

NDVITimelineManager.prototype.clearProductAvailability = function () {
    for (var i in this.productsAvailability) {
        this.productsAvailability[i] = false;
    }
    this.productsAvailability = {};
};

NDVITimelineManager.prototype.createYearsPanel = function () {
    var pan = document.getElementById("ntYearsPanel");

    for (var year = 2015; year >= 2000; year--) {
        var yearDiv = document.createElement('div');
        yearDiv.classList.add("ntYearDiv");
        pan.appendChild(yearDiv);

        var radioDiv = document.createElement('div');
        radioDiv.classList.add("ntYearRadioDiv");
        var radio = document.createElement('input');
        radio.year = year;
        radio.type = "radio";
        radio.name = "years";
        radio.id = "radioYear_" + year;
        radio.style.cursor = "pointer";
        radioDiv.appendChild(radio);
        if (year == this.defaultYear) {
            radio.checked = true;
        }
        var that = this;
        radio.onchange = function () {
            that.setVisibleYear(this.year);
        }
        yearDiv.appendChild(radioDiv);

        var labelDiv = document.createElement('div');
        labelDiv.classList.add("ntYearLabel");
        labelDiv.innerHTML = year;
        labelDiv.radioPtr = radio;
        labelDiv.onclick = function () {
            if (!this.radioPtr.disabled) {
                that.setVisibleYear(this.radioPtr.year);
                this.radioPtr.checked = true;
            }
        };
        yearDiv.appendChild(labelDiv);

        var count = document.createElement('div');
        count.classList.add("ntYearCount");
        count.innerHTML = "(0)";
        yearDiv.appendChild(count);

        this._yearsPanel[year] = { "radio": radio, "caption": labelDiv, "count": count };
    }
};

NDVITimelineManager.prototype.setFilenameCaption = function (caption) {
    //document.getElementById("ntFilenameCaption").innerHTML = caption;
};

NDVITimelineManager.formatDate = function (d, m, y) {
    return NDVITimelineManager.strpad(d.toString(), 2) + '.' +
        NDVITimelineManager.strpad(m.toString(), 2) + '.' +
        NDVITimelineManager.strpad(y.toString(), 4);
}

NDVITimelineManager.strpad = function (str, len) {
    if (typeof (len) == "undefined") { var len = 0; }
    if (len + 1 >= str.length) {
        str = Array(len + 1 - str.length).join("0") + str;
    }
    return str;
};

NDVITimelineManager.prototype.showLoadingSmall = function () {
    document.getElementById("ntLoading").style.display = "block";
    var that = this;
    setTimeout(function () {
        that.hideLoadingSmall();
    }, 3000);
};

NDVITimelineManager.prototype.hideLoadingSmall = function () {
    document.getElementById("ntLoading").style.display = "none";
};

NDVITimelineManager.equalDates = function (d1, d2) {
    return d1.getDate() == d2.getDate() && d1.getMonth() == d2.getMonth() && d1.getFullYear() == d2.getFullYear();
};

NDVITimelineManager.prototype.stringToDate = function (str) {
    var a = str.split('.');
    return (a.length == 3 ? new Date(parseInt(a[2]), parseInt(a[1]) - 1, parseInt(a[0])) : new Date(this._selectedYear));
};

NDVITimelineManager.prototype.initSlider = function () {
    var that = this;

    var tl = this.timeLine.getTimelineController().getTimeline();

    var _moved = false;

    //прикручиваем слайдер снимков
    this._slider = new NDVITimelineSlider("ntShotsSlider", {
        "onmouseup": function (e) {
            if (that._selectedPeriod) {

                if (!_moved) {
                    if (that._selectedDate0) {
                        that.unselectPeriod();
                    } else {
                        that.selectPeriod(this, e.bag.sortedItems);
                    }
                }

            } else {
                if (!_moved && that.selectedDiv) {
                    tl.setSelection([]);
                    that.timeLine.shiftActiveItem(0);
                    e.bag.currIndex = -1;
                    return;
                }

                if (e.bag.currIndex != -1) {
                    that.shiftZero = true;
                    tl.setSelection([{ "row": e.bag.currIndex }]);
                    that.timeLine.shiftActiveItem(0);
                    that.setTimeLineYear(that._selectedYear);

                    var range = tl.getVisibleChartRange();
                    that._setSliderState(range, that._selectedDate);
                } else {
                    var items = e.bag.sortedItems;
                    var range = tl.getVisibleChartRange();
                    var size = document.getElementById("ntSliderBar").clientWidth;
                    var offset = this.getOffsetLeft();
                    var daysRange = 365;//(range.end - range.start) / (1000 * 60 * 60 * 24) - NDVITimelineManager.SLIDER_EPSILON;
                    var daysFrom = daysRange * offset / size;;//Math.round(daysRange * e.state / 100.0);
                    var slideDate = new Date(range.start.getTime() + 86400000 * daysFrom);
                    var minDelta = 100000000000000;
                    var curr_i;
                    for (var i = 0; i < items.length; i++) {
                        var ii = items[i];
                        var iiDate = new Date(ii.center);
                        var deltaTime = Math.abs(iiDate.getTime() - slideDate.getTime());
                        if (deltaTime <= minDelta) {
                            curr_i = i;
                            minDelta = deltaTime;
                        }
                    }

                    var tItem = items[curr_i];
                    if (!tItem) {
                        tItem = items[items.length - 1];
                    }
                    e.bag.currIndex = tl.getItemIndex(tItem.dom);

                    that.shiftZero = true;
                    tl.setSelection([{ "row": e.bag.currIndex }]);
                    that.timeLine.shiftActiveItem(0);
                    that.setTimeLineYear(that._selectedYear);

                    that._setSliderState(range, that._selectedDate);
                }
            }
        },
        "onmove": function (e, caption) {

            _moved = true;

            var range = tl.getVisibleChartRange();

            var size = document.getElementById("ntSliderBar").clientWidth;
            var offset = this.getOffsetLeft(e.pointerIndex);

            var daysRange = 365;

            var daysFrom = daysRange * offset / size;

            var slideDate = new Date(range.start.getTime() + 86400000 * daysFrom);
            caption.innerHTML = NDVITimelineManager.formatDate(slideDate.getDate(), slideDate.getMonth() + 1, slideDate.getFullYear());

            if (that._selectedPeriod) {
                that.selectPeriod(this, e.bag.sortedItems);
            } else {

                var curr_i;
                var notFound = true;
                var items = e.bag.sortedItems;
                for (var i = 0; i < items.length; i++) {
                    var ii = items[i];
                    var iiDate = new Date(ii.center);
                    ii.dom.classList.remove("timeline-event-selected");

                    if (notFound) {
                        if (iiDate <= slideDate || NDVITimelineManager.equalDates(iiDate, slideDate)) {
                            curr_i = i;
                            notFound = false;
                        }
                    }
                }

                if (notFound) {
                    curr_i = items.length - 1;
                    notFound = false;
                }

                //значит нашли ближайший левый
                if (items[curr_i - 1]) {
                    //проверяем который ближе, того делаем curr_i
                    var rCounter = 1;
                    var lItem = items[curr_i];
                    var rItem = items[curr_i - rCounter];
                    while (items[curr_i - rCounter] && rItem.center == lItem.center) {
                        rCounter++;
                        rItem = items[curr_i - rCounter];
                    }

                    var rItemDate = new Date(rItem.center),
                        lItemDate = new Date(lItem.center);
                    if (rItem.dom && rItemDate <= new Date(that._selectedYear, 11, 31)/*range.end*/ && lItem.dom && lItemDate >= range.start) {
                        var r = slideDate - rItemDate,
                            l = lItemDate - slideDate;
                        if (r > l) {
                            curr_i -= rCounter;
                        }
                    }
                }

                e.bag.currIndex = -1;
                if (!notFound) {
                    //зажигаем рисочку
                    var tItem = items[curr_i];
                    if (tItem && tItem.dom && new Date(tItem.center) >= range.start) {
                        e.bag.currIndex = tl.getItemIndex(tItem.dom);
                        tItem.dom.classList.add("timeline-event-selected");
                    }

                    //показываем название снимка в заголовке только для landsat
                    if (that._combo[that._selectedCombo].resolution == "landsat"/*that._selectedCombo == 1*/) {
                        var tItemDate = shared.dateToString(new Date(tItem.center));
                        var timelineItems = that.timeLine.data.attributes.items[that._comboAsLayers[that._selectedCombo][1]];
                        var filenames = [];
                        var dates = [];
                        var chkQl = document.getElementById("chkQl").checked;
                        for (var ii in timelineItems) {
                            var item = timelineItems[ii];
                            var date = item.obj.properties['ACQDATE'];
                            if (tItemDate === date && (chkQl || !chkQl && item.obj.properties.GMX_RasterCatalogID.length) &&
                                NDVITimelineManager.isPointInGeometry(item.obj.geometry, { "x": gmxAPI.map.getX(), "y": gmxAPI.map.getY() })) {
                                var prop = item.obj.properties;
                                filenames.push(prop["sceneid"] || prop["SCENEID"]);
                                dates.push(date);
                            }
                        }

                        var str = "";
                        for (var j = 0; j < filenames.length; j++) {
                            str += filenames[j] + ", ";
                        }
                        str = str.substring(0, str.length - 2);
                        that.setFilenameCaption(dates[dates.length - 1] + " - " + str);
                    }
                }
            }
        },
        "onclick": function (e) {

            _moved = false;

            var range = tl.getVisibleChartRange();
            var sortedItems = [];
            for (var i = 0; i < tl.items.length; i++) {
                var item = tl.items[i];
                var itemDate = new Date(item.center);
                if (item.dom && itemDate >= range.start && itemDate <= range.end) {
                    sortedItems.push({ "center": item.center, "dom": item.dom });
                }
            }

            sortedItems.sort(function (a, b) {
                return b.center - a.center;
            });

            e.bag.sortedItems = sortedItems;
            e.bag.currIndex = -1;
        }
    }, this.lmap);

    $(".timeline-axis").parent().on("click", function () {
        if (that._selectedPeriod) {
            if (that._selectedDate0) {
                that.unselectPeriod();
            }
        }
    });
};

NDVITimelineManager.prototype.unselectPeriod = function () {
    this._selectedDate0 = null;
    this._selectedDate1 = null;
    this._hideLayers();
};


NDVITimelineManager.prototype.refreshSliderPeriod = function () {

    //Это непонтяный баг, почему то надо дважды очищать включенные слои.
    for (var b = 0; b < 2; b++) {
        this.unselectPeriod();

        var tl = this.timeLine.getTimelineController().getTimeline();
        var range = tl.getVisibleChartRange();
        var sortedItems = [];
        for (var i = 0; i < tl.items.length; i++) {
            var item = tl.items[i];
            var itemDate = new Date(item.center);
            if (item.dom && itemDate >= range.start && itemDate <= range.end) {
                sortedItems.push({ "center": item.center, "dom": item.dom });
            }
        }

        sortedItems.sort(function (a, b) {
            return b.center - a.center;
        });

        this.selectPeriod(this._slider, sortedItems);
    }
};

NDVITimelineManager.prototype.selectPeriod = function (slider, items) {
    this._selectedDate0 = this.stringToDate(slider.getCaption0());
    this._selectedDate1 = this.stringToDate(slider.getCaption1());
    this._selectedType[this._selectedCombo] = NDVITimelineManager.FIRES_POINTS;
    this._showFIRES_POINTS();
    this.selectPeriodItems(this._selectedDate0, this._selectedDate1, items);
};

NDVITimelineManager.prototype.selectPeriodItems = function (date0, date1, items) {
    for (var i = 0; i < items.length; i++) {
        var ii = items[i];
        var iiDate = new Date(ii.center);
        if (iiDate >= date0 && iiDate <= date1) {
            ii.dom.classList.add("timeline-event-selected");
        } else {
            ii.dom.classList.remove("timeline-event-selected");
        }
    }
};

NDVITimelineManager.prototype.initTimelineFooter = function () {

    var that = this;

    var getComboRadios = function () {

        return '<select id="ntComboBox">' +
        '<option value="' + 1 + '">' + this._combo[1].caption + '</option>' +
        '<option value="' + 0 + '">' + this._combo[0].caption + '</option>' +
        '<option value="' + 2 + '">' + this._combo[2].caption + '</option>' +
        '<option value="' + 3 + '">' + this._combo[3].caption + '</option>' +
        ((this._combo[4] && '<option value="' + 4 + '" selected>' + this._combo[4].caption + '</option>') || "") +
        ((this._combo[5] && '<option value="' + 5 + '">' + this._combo[5].caption + '</option>') || "") +
        '</select>';
    }

    var htmlTxt = '<div class="ntFooter">' +
        '<div class="ntLeftPanel">' +
        '</div>' +
                getComboRadios.call(this) +
        '<div class="ntRightPanel" id="ntRightPanel">' +
        '<div class="ntOptionsFieldset">' +
        '<div id="fsComboOptions"></div>' +
        '</div>' +
        '</div>' +
        '</div>';


    this.loadingDiv = '<div id="ntLoading">Загрузка...</div>';

    this.timeLine.getFooterContainer().html(htmlTxt + this.loadingDiv);

    this.zoomRestrictionLabel = document.createElement("div");
    this.zoomRestrictionLabel.id = "ntZoomRestrictionLabel";
    this.zoomRestrictionLabel.innerHTML = "Приблизьте карту для доступа к опциям";
    this.zoomRestrictionLabel.style.display = "none";
    this.timeLine.getFooterContainer()[0].appendChild(this.zoomRestrictionLabel);

    this.radioActiveLabels = document.createElement("div");
    this.radioActiveLabels.id = "ntRadioActiveLabels";
    this.radioActiveLabels.innerHTML = "Для активации опций, наведите карту на контуры полей";
    this.radioActiveLabels.style.display = "none";
    this.timeLine.getFooterContainer()[0].appendChild(this.radioActiveLabels);

    this.meanNdviNoDataLabel = document.createElement("div");
    this.meanNdviNoDataLabel.id = "ntMeanNdviNoDataLabel";
    this.meanNdviNoDataLabel.innerHTML = NDVITimelineManager.MEANNDVI_NODATA_ERROR;
    this.meanNdviNoDataLabel.style.display = "none";
    this.timeLine.getFooterContainer()[0].appendChild(this.meanNdviNoDataLabel);

    document.getElementById("ntComboBox").ontouchstart = function (e) {
        e.stopPropagation();
    };

    document.getElementById("ntComboBox").onchange = function (e) {

        e.stopPropagation();

        var index = parseInt(this.value);
        that.setTimelineCombo(index);
    };

    var visQl = '<div><div id="qlVis" style="float:left;display: block;"></div></div>';

    var filenameCaption = '<div id="ntFilenameCaption"></div>';
    var datelineHtml = '<div class="ntDatesLine">' +
          '<div id="ntYearsScrollPanel"><div id="ntYearsPanel"></div></div>' +
        '</div>';
    var shotsSlider = '<div id=ntSliderBar><div id="ntShotsSlider" style="width:100%; height:100%;"></div></div>';

    this.timeLine.getHeaderContainer().html(filenameCaption + visQl + shotsSlider);

    var tl = this.timeLine.getTimelineController().getTimeline();

    this.initSlider();

    var panels = this.createOptionsPanel();

    this.addRadio("secondPanel_1", "NDVI", "shotsOptions", "ndviRadio_hr", 1, false, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.NDVI_HR;
        that._redrawShots();
    }, true);

    this.addRadio("firstPanel_0", "Композит NDVI", "shotsOptions", "ndviRadio_modis", 0, false, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.NDVI16;
        that._redrawShots();
    }, false, true);

    this.addRadio("secondPanel_1", "NDVI - среднее", "shotsOptions", "ndviMeanRadio", 1, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.NDVI_MEAN;
        that._redrawShots();
    }, true);

    this.addRadio("thirdPanel_1", "Рейтинг", "shotsOptions", "ratingRadio", 1, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.RATING;
        that._redrawShots();
    }, true);

    this.addRadio("thirdPanel_1", "Состояние полей", "shotsOptions", "classificationRadio", 1, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.CLASSIFICATION;
        that._redrawShots();
    }, true);

    this.addRadio("thirdPanel_1", "Однородность", "shotsOptions", "inhomogenuityRadio", 1, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.INHOMOGENUITY;
        that._redrawShots();
    }, true);

    this.addRadio("firstPanel_0", "Оценка качества", "shotsOptions", "qualityRadio", 0, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.QUALITY16;
        that._redrawShots();
    });

    this.addRadio("secondPanel_0", "Условия вегетации", "shotsOptions", "conditionsOfVegetationRadio", 0, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.CONDITIONS_OF_VEGETATION;
        that._redrawShots();
    });

    this.addRadio("firstPanel_1", "Снимок-ИК", "shotsOptions", "rgbRadio", 1, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.RGB_HR;
        that._redrawShots();
    }, false, true);

    this.addRadio("firstPanel_1", "Снимок", "shotsOptions", "rgbRadio2", 1, true, function (r) {
        that._selectedType[that._selectedCombo] = NDVITimelineManager.RGB2_HR;
        that._redrawShots();
    });

    if (this._combo[2] && this._combo[2].rk[0] == "MOD098DT-test") {
        that._selectedType[2] = NDVITimelineManager.NDVI16;
    }

    if (this._combo[3] && this._combo[3].rk[0] == "FIRES") {
        this.addRadio("firstPanel_3", "Термоточки", "shotsOptions", "firesPoints", 3, true, function (r) {
            that._selectedType[that._selectedCombo] = NDVITimelineManager.FIRES_POINTS;
            that._redrawShots();
        }, false, true);
    }

    if (this._combo[4] && this._combo[4].rk[0] == "MOD098DT-test") {
        that._selectedType[4] = NDVITimelineManager.NDVI16;
    }

    if (this._combo[5] && this._combo[5].rk[0] == "MOD098DAq-test") {
        that._selectedType[5] = NDVITimelineManager.NDVI16;
    }

    if (this._combo[4] && this._combo[4].rk[0] == "RGB753") {
        this.addRadio("firstPanel_5", "7-5-3", "shotsOptions", "rgbRadio753", 5, true, function (r) {
            that._selectedType[that._selectedCombo] = NDVITimelineManager.RGB753;
            that._redrawShots();
        }, false, true);

        this.addRadio("firstPanel_5", "4-3-2", "shotsOptions", "rgbRadio432", 5, true, function (r) {
            that._selectedType[that._selectedCombo] = NDVITimelineManager.RGB432;
            that._redrawShots();
        });
    }

    if (this._combo[4] && this._combo[4].rk[0] == "LANDSAT") {
        that._selectedType[4] = NDVITimelineManager.LANDSAT;
    }

    if (this._combo[5] && this._combo[5].rk[0] == "SENTINEL") {
        that._selectedType[5] = NDVITimelineManager.RGB_HR;
    }

    for (var i = 0; i < this._combo.length; i++) {
        document.getElementById("optionsPanel_" + i).style.display = (i == this._selectedCombo ? "block" : "none");
    }

    this.refreshTimeline();

    //добавим фон на циферблат
    $(".timeline-frame").prepend('<div class="ntTimelineBackground"><div class="ntTimelineColor"></div></div>');

    //переключатель годов
    $(this.timeLine.getContainer()).append('<div id="ntYearChanger"><div id="ntYearUp"></div><div id="ntYear">' + this._selectedYear +
        '</div><div id="ntYearDown"></div></div>');

    this.setVisibleYear(this._selectedYear);

    var yearUp = function () {
        var yearDiv = document.getElementById("ntYear");
        var year = parseInt(yearDiv.innerHTML) + 1;
        if (year <= new Date().getFullYear()) {
            yearDiv.innerHTML = year;
            var sDate = that._slider.getCaption();
            sDate.length && that._slider.setCaption(sDate.substr(0, sDate.length - 4) + year);
            that.setVisibleYear(year);
            that._updateFiresSelection(false);
        }
    };

    var yearDown = function () {
        var yearDiv = document.getElementById("ntYear");
        var year = parseInt(yearDiv.innerHTML) - 1;
        yearDiv.innerHTML = year;
        var sDate = that._slider.getCaption();
        sDate.length && that._slider.setCaption(sDate.substr(0, sDate.length - 4) + year);
        that.setVisibleYear(year);
        that._updateFiresSelection(false);
    };

    shared.disableHTMLSelection("#ntYearUp");
    shared.disableHTMLSelection("#ntYearDown");

    document.getElementById("ntYearUp").onclick = function () {
        yearUp();
    };

    if (!shared.isTablet()) {
        document.getElementById("ntYearUp").onmouseover = function () {
            this.classList.add("ntYearUp_hover");
        };

        document.getElementById("ntYearUp").onmouseleave = function () {
            this.classList.remove("ntYearUp_hover");
        };
    } else {
        document.getElementById("ntYearUp").ontouchend = function () {
            this.classList.remove("ntYearUp_hover");
        };

        document.getElementById("ntYearUp").ontouchstart = function (e) {
            this.classList.add("ntYearUp_hover");
            e.preventDefault();
            yearUp();
        };
    }

    document.getElementById("ntYearDown").onclick = function () {
        yearDown();
    };

    if (!shared.isTablet()) {
        document.getElementById("ntYearDown").onmouseover = function () {
            this.classList.add("ntYearDown_hover");
        };

        document.getElementById("ntYearDown").onmouseleave = function () {
            this.classList.remove("ntYearDown_hover");
        };
    } else {
        document.getElementById("ntYearDown").ontouchend = function () {
            this.classList.remove("ntYearDown_hover");
        };

        document.getElementById("ntYearDown").ontouchstart = function (e) {
            this.classList.add("ntYearDown_hover");
            e.preventDefault();
            yearDown();
        };
    }


    //переключатель снимков
    $(this.timeLine.getContainer()).append('<div class="ntShotsChanger"></div>');

    $(".ntShotsChanger").append(
        '<div style="float:left; margin-top: 4px;">' +
        '<div id="ntPrevYear" class="ntYearSwitcher"></div>' +
        '<div id="ntNextYear" class="ntYearSwitcher"></div>' +
        '</div>');

    function switchShot(dir) {
        that._switchYearCallback = that._switchYear;
        that.shiftPrev = true;

        if (that.selectedDiv && that._selectedDate.getFullYear() == that._selectedYear) {

            var tl = that.timeLine.getTimelineController().getTimeline();
            var rangeStart = new Date(that._selectedYear - 1, 0, 1),
                rangeEnd = new Date(that._selectedYear + 1, 11, 31);
            var datesCounter = 0;
            //снимки в одной дате(в одной риске)
            var itemsArr = [];
            //смотрим сколько снимков за одну дату, а заодно ближайшую слева и справа ищем дату
            var minPlus = 99999999999999;
            var minMinus = -99999999999999;
            var t = that._selectedDate.getTime();
            var minItemMinus,
                minItemPlus;
            for (var i = 0; i < tl.items.length; i++) {
                var item = tl.items[i];
                var itemDate = new Date(item.center);
                if (item.dom && itemDate >= rangeStart && itemDate <= rangeEnd) {
                    if (NDVITimelineManager.equalDates(that._selectedDate, itemDate)) {
                        datesCounter++;
                        itemsArr.push(item);
                    } else {
                        var it = itemDate.getTime();
                        var dit = t - it;
                        if (dit < minPlus && dit > 0) {
                            minPlus = dit;
                            minItemPlus = item;
                        }
                        if (dit > minMinus && dit < 0) {
                            minMinus = dit;
                            minItemMinus = item;
                        }
                    }
                }
            }

            var index = null;
            var date;
            if (dir == 1) {
                if (minItemMinus && minItemMinus.dom) {
                    index = tl.getItemIndex(minItemMinus.dom);
                    date = new Date(minItemMinus.center);
                }
            } else {
                if (minItemPlus && minItemPlus.dom) {
                    index = tl.getItemIndex(minItemPlus.dom);
                    date = new Date(minItemPlus.center);
                }
            }

            if (index != null) {
                $(".timeline-event.timeline-event-line").removeClass("timeline-event-selected");
                tl.setSelection([{ "row": index }]);
                that.setTimeLineYear(that._selectedYear);
                that._setSliderState(tl.getVisibleChartRange(), date, true);
                setTimeout(function () {
                    that.timeLine.shiftActiveItem(0);
                    that.setTimeLineYear(that._selectedYear);
                }, 50);
            }

        } else {
            that.shiftFromEmpty(dir);
        }
    };

    shared.disableHTMLSelection("#ntPrevYear");

    shared.disableHTMLSelection("#ntNextYear");

    var _lock = false;

    document.getElementById("ntPrevYear").onclick = function () {
        if (!_lock) {
            _lock = true;
            switchShot(-1);
            setTimeout(function () {
                _lock = false;
            }, 100);
        }
    };

    if (!shared.isTablet()) {
        document.getElementById("ntPrevYear").onmouseover = function () {
            this.classList.add("ntPrevYear_hover");
        };

        document.getElementById("ntPrevYear").onmouseleave = function () {
            this.classList.remove("ntPrevYear_hover");
        };
    } else {
        document.getElementById("ntPrevYear").ontouchend = function () {
            this.classList.remove("ntPrevYear_hover");
        };

        document.getElementById("ntPrevYear").ontouchstart = function (e) {
            this.classList.add("ntPrevYear_hover");
            e.preventDefault();
            switchShot(-1);
        };
    }

    document.getElementById("ntNextYear").onclick = function () {
        if (!_lock) {
            _lock = true;
            switchShot(1);
            setTimeout(function () {
                _lock = false;
            }, 100);
        }
    };

    if (!shared.isTablet()) {
        document.getElementById("ntNextYear").onmouseover = function () {
            this.classList.add("ntNextYear_hover");
        };

        document.getElementById("ntNextYear").onmouseleave = function () {
            this.classList.remove("ntNextYear_hover");
        };
    } else {
        document.getElementById("ntNextYear").ontouchend = function () {
            this.classList.remove("ntNextYear_hover");
        };

        document.getElementById("ntNextYear").ontouchstart = function (e) {
            this.classList.add("ntNextYear_hover");
            e.preventDefault();
            switchShot(1);
        };
    }

    //выключим гомогенность на время
    NDVITimelineManager.disableHomogenuity();

    var items =
    [{
        "id": "chkVciType",
        "type": "checkbox",
        "class": "ntOptionsMODIS",
        "text": "Условия вегетации по маске с\х угодий",
        "click": function (e) {
            if (document.getElementById("conditionsOfVegetationRadio").checked) {
                that._redrawShots();
            }
        }
    }, {
        "id": "chkQl",
        "class": "ntOptionsHR",
        "type": "checkbox",
        "text": "Показать превью облачных снимков (облачность>50%)",
        "click": function (e) {
            that.qlCheckClick(e);
        }
    }, {
        "id": "setDoubleSlide",
        "type": "checkbox",
        "text": "Включить выборку данных за период",
        "lineId": "ntPeriodSelectOption",
        "click": function (e) {
            if (e.checked) {
                $(".ntYearSwitcher").css("display", "none");
            } else {
                $(".ntYearSwitcher").css("display", "block");
            }
            that._selectedPeriod = e.checked;
            that.clearSelection();
            that._hideLayers();
            that._slider.setPeriodSelector(e.checked);
        }
    }, {
        "id": "cloudMask",
        "class": "ntOptionsHR",
        "type": "checkbox",
        "text": "Маска облачности и теней",
        "click": function (e) {
            that._useCloudMask = e.checked;
            if (e.checked) {
                that.showCloudMask(that._selectedDate);
            } else {
                that.hideCloudMask(true);
                if (that._cutOff && (that._selectedOption === "SENTINEL_NDVI" || that._selectedOption === "HR")) {
                    that._redrawShots();
                }
            }
        }
    }];


    if (!this._userRole) {
        items.push({
            "id": "chkCut",
            "class": "ntOptionsHR",
            "type": "checkbox",
            "text": "Обрезать по маске полей",
            "click": function (e) {
                that.setCutOff(e);
            }
        });
    }

    this.optionsMenu = new OptionsMenu("qlVis", {
        "items": items
    });

    document.getElementById("ntPeriodSelectOption").style.display = "none";

    //if (document.getElementById("cloudMask")) {
    document.getElementById("cloudMask").checked = false;
    this._useCloudMask = false;
    //}

    if (document.getElementById("chkCut")) {
        document.getElementById("chkCut").checked = true;
    }

    if (this.disableOptions) {
        document.getElementById("qlVis").style.display = "none";
    }

    $(document).click(function (event) {
        if (!$(event.target).closest('.ntOptionsMenu').length) {
            if ($('.ntOptionsMenu').is(":visible")) {
                that.optionsMenu.hide();
            }
        }
    });
};

NDVITimelineManager.prototype.showCloudMask = function (date) {

    var that = this;

    function showCloudLayer(layer, cutOff) {
        layer.removeFilter();

        if (cutOff) {
            that.setCloudMaskRenderHook(layer, NDVITimelineManager.cloudMaskKr_hook, NDVITimelineManager.l_hook);
        } else {
            //that.sentinelCloudMask.removeRenderHook(NDVITimelineManager.cloudMaskKr_hook);
            //that.landsatCloudMask.removeRenderHook(NDVITimelineManager.cloudMaskKr_hook);
            //NDVITimelineManager.cloudMaksTolesBG = {};
            //that.redrawSelectedLayers();
        }

        var dateCn = "acqdate";
        var dateId = layer._gmx.tileAttributeIndexes[dateCn];

        layer.setFilter(function (item) {
            var p = item.properties;
            if (p[dateId] == that._selectedDateL) {
                return true;
            }
            return false;
        })
        .on('doneDraw', function () {
            ndviTimelineManager.repaintAllVisibleLayers();
        })
        .setDateInterval(
                NDVITimelineManager.addDays(that._selectedDate, -1),
                NDVITimelineManager.addDays(that._selectedDate, 1)
            );
        layer.setZIndex(1);
        that.lmap.addLayer(layer);
    };

    if (this._useCloudMask && this._selectedDiv) {
        if (this._selectedOption === "SENTINEL_NDVI") {
            showCloudLayer(this.sentinelCloudMask, this._cutOff);
        } else if (this._selectedOption === "RGB" || this._selectedOption === "RGB2") {
            showCloudLayer(this.landsatCloudMask);
        } else if (this._selectedOption === "SENTINEL") {
            showCloudLayer(this.sentinelCloudMask);
        } else if (this._selectedOption === "HR") {
            showCloudLayer(this.landsatCloudMask, this._cutOff);
        }
    }
};

NDVITimelineManager.prototype.hideCloudMask = function (force) {
    if (!this.selectedDiv || force) {
        this.lmap.removeLayer(this.landsatCloudMask);
        this.lmap.removeLayer(this.sentinelCloudMask);

        this.sentinelCloudMask.removeRenderHook(NDVITimelineManager.cloudMaskKr_hook);
        this.landsatCloudMask.removeRenderHook(NDVITimelineManager.cloudMaskKr_hook);
        NDVITimelineManager.cloudMaskTolesBG = {};
    }
};

NDVITimelineManager.prototype.setTimelineCombo = function (index) {

    $("#ntComboBox > option").each(function (e, x) {
        (x.value == index && (x.selected = true));
    });

    that = this;
    that.selectedShotFilename = "";
    that.setFilenameCaption("");

    var timelineMode = that._layersLegend[that._combo[index].rk[0]].timelineMode || "center";

    that.timeLine.setTimelineMode(timelineMode);

    //при переключении сбрасываем опции в ndvi
    that._selectedType[0] = NDVITimelineManager.NDVI16;
    that._selectedType[1] = NDVITimelineManager.RGB_HR;

    document.getElementById("rgbRadio").checked = true;
    document.getElementById("ndviRadio_modis").checked = true;

    document.getElementById("optionsPanel_" + that._selectedCombo).style.display = "none";

    that._selectedCombo = index;
    document.getElementById("optionsPanel_" + index).style.display = "block";
    that.bindTimelineCombo(index);

    that.refreshTimeline();
    that._hideLayers();
    that.setRadioLabelActive("ndviMeanRadio", false);
    that.setRadioLabelActive("ratingRadio", false);

    that.setDatesStickHoverCallback();

    that.selectedDiv = null;
    that._currentZoom = that.lmap.getZoom();
    that.applyZoomRestriction(that._currentZoom);

    //выключим гомогенность на время
    if (index) {
        NDVITimelineManager.disableHomogenuity();
    }

    //выключаем "неопознанные" продукты
    that.deactivateUnknownRadios();

    //выключеам кнопки
    that.setRadioLabelActive_grey("rgbRadio", false);
    that.setRadioLabelActive_grey("ndviRadio_modis", false);
    that.setRadioLabelActive_grey("conditionsOfVegetationRadio", false);

    NDVITimelineManager.fires_ht = {};
    that.timeLine.updateFilters();

    if (!that._firstTimeCombo[index]) {
        that.showLoadingSmall();
    }

    //снимаем выделение
    that._dontTouchEmptyClick = true;
    that.clearSelection();
    that._dontTouchEmptyClick = false;

    that.startFinishLoading();

    document.getElementById("ntRightPanel").scrollLeft = 0;

    that.resetFireOption();

    that.refreshOptionsDisplay();
};

NDVITimelineManager.prototype.resetFireOption = function () {
    if (this._combo[this._selectedCombo].rk[0] != "FIRES") {
        $(".ntYearSwitcher").css("display", "block");
        document.getElementById("ntPeriodSelectOption").style.display = "none";
        this._slider.setPeriodSelector(false);
        this._hideLayers();
        this._slider.setActivePointer(-1);
        this._selectedDate0 = null;
        this._selectedDate1 = null;
        this._selectedPeriod = false;
        if (this._combo[this._selectedCombo].rk[0] == "HR") {
            $(".ntOptionsHR").css("display", "block");
        } else {
            $(".ntOptionsHR").css("display", "none");
            $(".ntOptionsMODIS").css("display", "block");
        }
    } else {
        $(".ntOptionsMODIS").css("display", "none");
        $(".ntOptionsHR").css("display", "none");
        $(".ntYearSwitcher").css("display", "none");
        document.getElementById("setDoubleSlide").checked = true;
        document.getElementById("ntPeriodSelectOption").style.display = "block";
        this._selectedDate0 = this._selectedDate0 || new Date(this._selectedYear, 0, 1);
        this._selectedDate1 = this._selectedDate1 || new Date(this._selectedYear, 11, 31);
        this._selectedPeriod = true;

        this._slider.setPeriodSelector(true);

        this._slider.setActivePointer(1);
        var c = this._slider.getContainer();
        this._slider.setValue(c.clientWidth - 2, NDVITimelineManager.formatDate(this._selectedDate1.getDate(),
            this._selectedDate1.getMonth() + 1, this._selectedDate1.getFullYear()));

        this._slider.setActivePointer(0);
        this._slider.setValue(0, NDVITimelineManager.formatDate(this._selectedDate0.getDate(),
            this._selectedDate0.getMonth() + 1, this._selectedDate0.getFullYear()));

        this.refreshSelections();
        var that = this;
        that._hideLayers();
        that._showFIRES_POINTS();
        //вот тут тоже странный баг надо дважды включить и выключить слой.
        that._hideLayers();
        that._showFIRES_POINTS();
    }
};

NDVITimelineManager.prototype._updateFiresSelection = function (forced) {

    var d = this._slider.getCaption0();
    d = d.split(".");
    this._slider.setCaption0(d[0] + "." + d[1] + "." + this._selectedYear);

    d = this._slider.getCaption1();
    d = d.split(".");
    this._slider.setCaption1(d[0] + "." + d[1] + "." + this._selectedYear);

    if (this._selectedPeriod && this._selectedDate0 && this._selectedDate0 || forced) {
        this._selectedDate0 = new Date(this._selectedYear, this._selectedDate0.getMonth(), this._selectedDate0.getDate());
        this._selectedDate1 = new Date(this._selectedYear, this._selectedDate1.getMonth(), this._selectedDate1.getDate());

        this.refreshSelections();
        this._hideLayers();
        this._showFIRES_POINTS();
    }
};

NDVITimelineManager.prototype.clearSelection = function () {
    //this.onChangeSelection({ changed: { selection: {} } });
    this.timeLine.getTimelineController().getTimeline().setSelection([]);
    this.timeLine.shiftActiveItem(0);
};

NDVITimelineManager.prototype.setCutOff = function (e) {
    this._cutOff = e.checked;
    if (this.selectedDiv) {
        if (!e.checked) {
            this.hideCloudMask(true);
        }
        this._prepareRedraw();
        this._showRedraw();
    }

    this.applyHRZoomREstriction(this.lmap.getZoom());
};

NDVITimelineManager.prototype.setActiveRadio = function (radioId) {
    var prod = NDVITimelineManager.radioProduct[radioId].prodId;
    var selectedCombo = NDVITimelineManager.radioProduct[radioId].numCombo;
    this._selectedType[selectedCombo] = prod;
    document.getElementById(radioId).checked = true;
};

NDVITimelineManager.prototype.qlCheckClick = function (e, data) {

    NDVITimelineManager.fires_ht = {};
    this.timeLine.updateFilters();

    NDVITimelineManager.fires_ht = {};
    this.timeLine.updateFilters();

    if (this.selectedDiv) {
        this._showRedraw();
    }

    //запуск из пермалинка
    if (data) {
        var tl = this.timeLine.getTimelineController().getTimeline();
        var currItem = null;
        for (var i = 0; i < tl.items.length; i++) {
            var item = tl.items[i];
            var itemDate = new Date(item.center);

            if (itemDate.getDate() == this._selectedDate.getDate() &&
                itemDate.getFullYear() == this._selectedDate.getFullYear() &&
                itemDate.getMonth() == this._selectedDate.getMonth()) {
                currItem = item;
                break;

            }
        }

        tl.setSelection([{ "row": tl.getItemIndex(currItem.dom) }]);
        this.timeLine.shiftActiveItem(0);
        this.setTimeLineYear(this._selectedYear);
    }
};

NDVITimelineManager.prototype.shiftFromEmpty = function (dir) {
    var tl = this.timeLine.getTimelineController().getTimeline();
    var range = tl.getVisibleChartRange();
    var sortedItems = [];
    //var minDate = range.end;
    var nearItem = null;
    var minNegItem = null;
    var minPosItem = null;

    var rangeStart = new Date(this._selectedYear - 1, 0, 1),
        rangeEnd = new Date(this._selectedYear + 1, 11, 31),
        minDate = new Date(this._selectedYear - 1, 0, 1);

    var sDate = this.getSliderDate();

    if (sDate) {

        var minArr = [];

        var sDate_ms = sDate.getTime();

        var minNeg = -1000000000000;
        var minPos = 1000000000000;
        var date;

        for (var i = 0; i < tl.items.length; i++) {
            var item = tl.items[i];
            var itemDate = new Date(item.center);
            var itemDate_ms = itemDate.getTime();

            var distance = sDate_ms - itemDate_ms;

            if (item.dom && itemDate >= rangeStart && itemDate <= rangeEnd) {
                if (distance >= 0) {
                    if (distance <= minPos) {
                        minPos = distance;
                        minPosItem = item;
                        date = new Date(item.center);
                    }
                } else {
                    if (distance >= minNeg) {
                        minNeg = distance;
                        minNegItem = item;
                        date = new Date(item.center);
                    }
                }
            }
        }

        if (!dir || dir == -1) {
            nearItem = minPosItem;
        } else if (dir == 1) {
            nearItem = minNegItem;
        }

    }

    if (nearItem) {
        $(".timeline-event.timeline-event-line").removeClass("timeline-event-selected");
        var index = tl.getItemIndex(nearItem.dom);
        tl.setSelection([{ "row": index }]);
        this.setTimeLineYear(date.getFullYear());
        this._setSliderState(tl.getVisibleChartRange(), date, true);
        var that = this;
        setTimeout(function () {
            that.timeLine.shiftActiveItem(0);
            that.setTimeLineYear(that._selectedYear);
        }, 50);
    }
};


NDVITimelineManager.disableHomogenuity = function () {
    document.getElementById("inhomogenuityRadio").disabled = true;
    $(".inhomogenuityRadio").addClass("ntDisabledLabel");
};

NDVITimelineManager.prototype._switchYear = function (date) {
    this._selectedDate = date;
    this.switchYear(date.getFullYear());
    this._switchYearCallback = null;
};

NDVITimelineManager.fires_ht = {};

NDVITimelineManager.prototype._filterTimeline = function (elem, layer) {

    var prop = elem.obj.properties;

    if (this._combo[this._selectedCombo].rk[0] == "FIRES") {
        var dateCn = this._layersLegend["FIRES"].dateColumnName;
        var date = prop[layer._gmx.tileAttributeIndexes[dateCn]];
        var d = new Date(date * 1000);
        var y = d.getFullYear();
        var name = d.getDate() + "_" + d.getMonth() + "_" + y;
        if (this._selectedYear != y || NDVITimelineManager.fires_ht[name]) {
            return false;
        } else {
            NDVITimelineManager.fires_ht[name] = elem;
            return true;
        }
    } else {
        if (this._combo[this._selectedCombo].resolution === "landsat") {
            var isQl = $("#chkQl").is(':checked');
            var gmxRKid = layer._gmx.tileAttributeIndexes['GMX_RasterCatalogID'];

            if (isQl && this._layerConfigs[layer.options.layerID].showQuicklooks && prop[gmxRKid].length == 0) {
                return true;
            }

            var cloudsId = layer._gmx.tileAttributeIndexes[this._layerConfigs[layer.options.layerID].cloudsField];
            if (cloudsId) {
                if (isQl && !this._layerConfigs[layer.options.layerID].showQuicklooks && prop[gmxRKid].length != 0) {
                    return true;
                } else if (prop[cloudsId] <= this._combo[this._selectedCombo].cloudsMin) {
                    return true;
                } else {
                    return false;
                }
            } else {
                return true;
            }
        } else {
            var prodtypeId = layer._gmx.tileAttributeIndexes['prodtype'];
            if (!prodtypeId || this._ndviProdtypes.indexOf(prop[prodtypeId]) != -1) {
                return true;
            }
        }

        return false;
    }
};

/* 
 =====================================================
 * Блок инициализации палитр и расскраски тайлов
 =====================================================
 */
NDVITimelineManager.prototype._setLayerImageProcessing = function (layer, shotType) {
    if (this._layersLegend[shotType].palette) {
        var layerPalette = this._layersLegend[shotType].palette;
        var q = layerPalette.quality,
            n = layerPalette.ndvi,
            c = layerPalette.classification;
        n && (this._palettes[n.url] = this._palettes[n.url] || shared.loadPaletteSync(n.url));
        q && (this._palettes[q.url] = this._palettes[q.url] || shared.loadPaletteSync(q.url));
        c && (this._palettes[c.url] = this._palettes[c.url] || shared.loadPaletteSync(c.url));
        var that = this;
        layer.setRasterHook(
            function (dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info) {
                that._tileImageProcessing(dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info, shotType, layer);
            });
    }
};

NDVITimelineManager.prototype._tileImageProcessing = function (dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info, shotType, layer) {

    var prodType = info.geoItem.properties[layer._gmx.tileAttributeIndexes["prodtype"]],
        layerPalette = this._layersLegend[shotType].palette,
        url;

    if (shotType === "CLASSIFICATION") {
        var n = layerPalette.classification;
        var url = n.url;
        this._applyClassificationPalette(url, dstCanvas, srcImage, info);
    } else {
        if (layerPalette) {
            var q = layerPalette.quality,
                n = layerPalette.ndvi;

            if (q && prodType === q.prodtype) {
                url = q.url
            } else {
                url = n.url
            }
        }

        this._applyPalette(url, dstCanvas, srcImage, shotType, info);
    }
};

NDVITimelineManager.checkGreyImageData = function (data) {
    for (var i = 0; i < data.length; i += 4) {
        if (((data[i] & data[i + 1]) ^ data[i + 2])) {
            return false;
        }
    }
    return true;
};

NDVITimelineManager.prototype._applyClassificationPalette = function (url, dstCanvas, srcCanvas, info) {
    var that = this;
    this._palettes[url] = this._palettes[url] || shared.loadPaletteSync(url);
    this._palettes[url].then(function (palette) {
        var canvas = document.createElement("canvas");
        var w = 256,
            h = 256;
        canvas.width = w;
        canvas.height = h;
        var context = canvas.getContext('2d');
        context.drawImage(srcCanvas, 0, 0, w, h);
        var imgd = context.getImageData(0, 0, w, h);
        var pix = imgd.data;

        if (NDVITimelineManager.checkGreyImageData(pix)) {
            shared.zoomTile(srcCanvas, info.source.x, info.source.y, info.source.z,
               info.destination.x, info.destination.y, that.lmap.getZoom(),
               dstCanvas,
               function (r, g, b, a) {
                   var px = r;
                   var pal = palette[px];
                   if (pal !== undefined) {
                       if (r == 0 && g == 0 && b == 0) {
                           return [0, 179, 255, 255];
                       } else {
                           return [pal.partRed, pal.partGreen, pal.partBlue, 255];
                       }
                   }
                   return [0, 0, 0, 255];
               }, shared.NEAREST);

        } else {
            shared.zoomTile(srcCanvas, info.source.x, info.source.y, info.source.z,
               info.destination.x, info.destination.y, that.lmap.getZoom(),
               dstCanvas, null, shared.NEAREST);
        }
    });
};

NDVITimelineManager.prototype._applyPalette = function (url, dstCanvas, srcCanvas, shotType, info) {
    //если есть url, значит есть палитра.
    var that = this;
    if (url) {
        this._palettes[url] = this._palettes[url] || shared.loadPaletteSync(url);
        this._palettes[url].then(function (palette) {
            shared.zoomTile(srcCanvas, info.source.x, info.source.y, info.source.z,
               info.destination.x, info.destination.y, that.lmap.getZoom(),
               dstCanvas,
               function (r, g, b, a) {

                   if (shotType === "MODIS" && that._selectedType[that._selectedCombo] != NDVITimelineManager.QUALITY16) {
                       r += 101;
                   }

                   var pal = palette[r];
                   if (pal) {
                       return [pal.partRed, pal.partGreen, pal.partBlue, 255];
                   } else {
                       if (r == 0 && g == 0 && b == 0) {
                           return [0, 179, 255, 255];
                       }
                       if (r < 101) {
                           return [0, 0, 0, 255];
                       }
                       if (r > 201) {
                           return [255, 255, 255, 255];
                       }
                       return [0, 0, 0, 255];
                   }
               }, shared.NEAREST);
        });
    } else {
        dstCanvas = srcCanvas;
    }
};;
MeanVCIManager = function () {

    this._featuresArray;

    this._colouredLayer = null;
    this._requests = [];
    this._stylesData = [];
    this._itemsIDToRemove = [];

    this.isClear = true;

    this.datedYear = 2000;
    this.currentYear = 2014;
    this.day = 10;
    this.month = 9;

    this._currentFilename = "";

    //на получение текущей даты выбранного снимка;
    this._defFn = null;

    this._currentRK = "";


    //синхро-очередь
    this._pendingsQueue = [];
    this._counter = 0;

    //This is rule for integral indexes building
    this.MAX_LOADING_REQUESTS = 3;

    this.featureIdName = [];
    this.vciData = {};
};

// максимальный разброс дней даты снимка
MeanVCIManager.dayAccuracy = 4;
MeanVCIManager.ndviLayer = { "name": "3AD0B4A220D349848A383D828781DF4C", "dateColumnName": "ninthday", "prodtypeColumnName": "prodtype", "prodtype": "NDVI16" };

MeanVCIManager.addDaysToDate = function (date, days) {
    var dateOffset = (24 * 60 * 60 * 1000) * days;
    var myDate = new Date();
    myDate.setTime(date.getTime() + dateOffset);
    return myDate;
};

MeanVCIManager.dateToString = function (date) {
    return date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear();
};

// Получает список GMX_RasterCatalogId в слое модис в границах border. 
// По завершению запускает _sendRequest
MeanVCIManager.prototype.startQueue = function (feature) {
    if (this._counter >= this.MAX_LOADING_REQUESTS) {
        this._pendingsQueue.push(feature);
    } else {
        this.loadBorderFeature(feature);
    }
};

MeanVCIManager.prototype.loadBorderFeature = function (feature) {
    this._counter++;

    var that = this;

    var startDay = this.day - MeanVCIManager.dayAccuracy,
        endDay = this.day + MeanVCIManager.dayAccuracy;

    this.datedYear = 2000;

    var q = ("(year([" + MeanVCIManager.ndviLayer.dateColumnName + "])>='" + this.datedYear.toString() +
    "')AND(year([" + MeanVCIManager.ndviLayer.dateColumnName + "])<='" + "2014" +
    "')AND(day([" + MeanVCIManager.ndviLayer.dateColumnName + "])>='" + startDay.toString() +
    "')AND(day([" + MeanVCIManager.ndviLayer.dateColumnName + "])<='" + endDay.toString() +
    "')AND(month([" + MeanVCIManager.ndviLayer.dateColumnName + "])='" + this.month.toString() + "')" +
    (MeanVCIManager.ndviLayer.prodtypeColumnName ? ("AND([" + MeanVCIManager.ndviLayer.prodtypeColumnName + "]='" + MeanVCIManager.ndviLayer.prodtype + "')") : ""));


    sendCrossDomainPostRequest(window.serverBase + "VectorLayer/Search.ashx", {
        'border': JSON.stringify(gmxAPI.merc_geometry(feature.geometry)),
        'query': q,
        'geometry': false,
        'layer': MeanVCIManager.ndviLayer.name,
        'WrapStyle': "window"
    }, function (result) {
        var res = result.Result;
        var index = res.fields.indexOf("GMX_RasterCatalogID"),
            //fnIndex = res.fields.indexOf("filename"),
            dtIndex = res.fields.indexOf(MeanVCIManager.ndviLayer.dateColumnName);

        //группируем слои по годам
        var groupedLayers = [];

        for (var i = 0; i < res.values.length; i++) {

            var date = new Date(res.values[i][dtIndex] * 1000),
                gmxId = res.values[i][index];

            var itemYear = date.getFullYear().toString();

            if (!groupedLayers[itemYear]) {
                groupedLayers[itemYear] = [];
            }
            groupedLayers[itemYear].push(gmxId);

        }

        var items = [];

        //готовим запросы
        for (var i in groupedLayers) {

            var item = {
                "Layers": groupedLayers[i],
                "Bands": ["r", "g", "b"],
                "Return": ["Stat"],
                "NoData": [0, 0, 0]
            };

            if (parseInt(i) == that.currentYear) {
                item["Name"] = "curr_" + feature.id + "_" + i;
            } else {
                item["Name"] = "prev_" + feature.id + "_" + i;
            }

            items.push(item);
        }

        //запомним имя по id
        that.featureIdName[feature.id] = feature.properties.name;
        that.vciData[feature.properties.name] = { "vci": 0, "ndvi": {} };

        var request = {
            "Border": feature.geometry,
            "BorderSRS": "EPSG:4326",
            "Items": items
        };

        that._sendRequest.call(that, request);

    });
};

MeanVCIManager.prototype.setCurrentDate = function (day, month, currYear) {
    this.day = day;
    this.month = month;
    this.currentYear = currYear;
};

MeanVCIManager.prototype.setDatedYear = function (datedYear) {
    this.datedYear = datedYear;
};

MeanVCIManager.prototype.setCurrentDateByFilename = function (filename) {
    this._currentFilename = filename;

    if (filename.length) {

        this._defFn = new $.Deferred();

        var that = this;

        var q = ("[filename]='" + filename + "'");
        sendCrossDomainPostRequest(window.serverBase + "VectorLayer/Search.ashx", {
            'query': q,
            'geometry': false,
            'layer': MeanVCIManager.ndviLayer.name,
            'WrapStyle': "window"
        }, function (result) {
            var res = result.Result;
            var dateIndex = res.fields.indexOf(MeanVCIManager.ndviLayer.dateColumnName);
            var date = new Date(res.values[0][dateIndex] * 1000);

            var gmxIDindex = res.fields.indexOf("GMX_RasterCatalogID");
            that._currentRK = res.values[0][gmxIDindex];

            that.setCurrentDate(date.getDate(), date.getMonth() + 1, date.getFullYear());

            that._defFn.resolve();
        });
    }
};

MeanVCIManager.prototype.show = function (modisFilename, layerId) {
    var that = this;
    this._counter = 0;

    this.setCurrentDateByFilename(modisFilename);
    this._defFn.then(function () {
        ThemesManager.getLayerGeometry(layerId, that, that._startThreads);
    });
};

MeanVCIManager.prototype._startThreads = function (features) {
    this.setFeatures(features.features);

    for (var i = 0; i < this._featuresArray.length; i++) {
        this.startQueue(this._featuresArray[i]);
    }

    this._colouredLayer.setVisible(true);
};

MeanVCIManager.prototype._sendRequest = function (request) {
    var that = this;
    sendCrossDomainPostRequest(window.serverBase + 'plugins/getrasterhist.ashx', {
        'WrapStyle': 'window',
        'Request': JSON.stringify(request)
    }, function (response) {
        if (response && response.Result) {
            that.applyRequest.call(that, response.Result);
            that.dequeueRequest();

            //завершение
            //if (that._itemsIDToRemove.length == that._featuresArray.length) {
            //    that.saveCSV();
            //}
        }
    });
};

//MeanVCIManager.prototype.saveCSV = function () {
//    var str = "Район;VCI;2014;2013;2012;2011;2010;2009;2008;2007;2006;2005;2004;2003;2002;2001;2000%0A";

//    for (var r in this.vciData) {
//        var datar = this.vciData[r];
//        str += r + ";" + datar.vci + ";";
//        for (var i = 2014; i >= 2000; i--) {
//            str += datar.ndvi[i] + (i == 2000 ? "%0A" : ";");
//        }
//    }

//    var a = document.createElement('a');
//    a.href = 'data:attachment/csv,' + str;
//    a.target = '_blank';
//    a.download = this.day + '.' + this.month + '.' + this.currentYear + '.csv';
//    document.body.appendChild(a);
//    a.click();
//};

MeanVCIManager.prototype.dequeueRequest = function () {
    this._counter--;
    if (this._pendingsQueue.length) {
        if (this._counter < this.MAX_LOADING_REQUESTS) {
            var feature;
            if (feature = this.whilePendings())
                this.loadBorderFeature.call(this, feature);
        }
    }
};

MeanVCIManager.prototype.whilePendings = function () {
    while (this._pendingsQueue.length) {
        var req = this._pendingsQueue.pop();
        if (req) {
            return req;
        }
    }
    return null;
};


MeanVCIManager.prototype.applyRequest = function (res) {
    //var r = res[0];

    //if (r.Bands.b) {
    //u = r.ValidPixels;
    //if (u > 0) {

    var yearsNdvi = {};
    for (var i = 2005; i <= 2014; i++) {
        yearsNdvi[i] = 0;
    };

    var minMean = 100000000,
        maxMean = -100000000;

    var currMean = 0;

    var id = res[0].Name.split("_")[1];
    var name = this.featureIdName[id];

    for (var i = 0; i < res.length; i++) {
        var meani = res[i].Bands.b.Mean;
        if (res[i].ValidPixels > 0) {
            if (meani > 0) {
                if (meani > maxMean) {
                    maxMean = meani;
                }
                if (meani < minMean) {
                    minMean = meani;
                }
            } else {
                console.log("Error: NDVI==" + meani);
            }
            var namei = res[i].Name.split("_");
            if (namei[0] == "curr") {
                currMean = meani;
            }
            res[i].Name = namei[1];
            yearsNdvi[namei[2]] = (meani > 0 ? meani : "-");
        }
    }

    currMean = (currMean - 1) * 0.01;
    minMean = (minMean - 1) * 0.01;
    maxMean = (maxMean - 1) * 0.01;

    var vci = ((currMean - minMean) / (maxMean - minMean)) * 100;

    this.vciData[name].ndvi = yearsNdvi;
    this.vciData[name].vci = vci;

    this.applyPalette(parseInt(res[0].Name), vci);
    //}
    //}
};

MeanVCIManager.prototype.applyPalette = function (id, VCI) {

    var r = 0, g = 0, b = 0, a = 100;

    if (VCI <= 20) {
        //красный
        r = 255;
        g = 0;
        b = 0;
    } else if (VCI <= 40) {
        //розовый
        r = 255;
        g = 127;
        b = 127;
    } else if (VCI <= 60) {
        //желтый
        r = 255;
        g = 255;
        b = 0;
    } else if (VCI <= 80) {
        //зеленый
        r = 0;
        g = 255;
        b = 0;
    } else if (VCI <= 100) {
        //темно зеленый
        r = 0;
        g = 128;
        b = 0;
    } else {
        //VCI > 100
        r = 0;
        g = 0;
        b = 0;
    }

    this._stylesData[id] = {
        fill: { color: RGB2HEX(r, g, b), opacity: a },
        outline: { color: RGB2HEX(r, g, b), opacity: a, thickness: 1 }
    };

    this._colouredLayer.addItems([this._featuresArray[id - 1]]);
    this._itemsIDToRemove.push(id);
    this._colouredLayer.repaint();
};

MeanVCIManager.prototype.clear = function () {
    this.isClear = true;
    this.removeItems();
    this._stylesData.length = 0;
    this._pendingsQueue.length = 0;
    this._pendingsQueue = [];
};

MeanVCIManager.prototype.initializeColouredLayer = function () {
    var prop = {
        'properties': {
            'Temporal': true
            , 'TemporalColumnName': "acqdate"
        }
    };
    this._colouredLayer = gmxAPI.map.addLayer(prop);

    this._colouredLayer.filters[0].setStyle({
        fill: { color: 0x0, opacity: 0 },
        outline: { color: 0x0, thickness: 4, opacity: 0 }
    });
    this._colouredLayer.bringToBottom();
    this._colouredLayer.disableHoverBalloon();
    this._colouredLayer.setVisible(true);

    var that = this;
    setTimeout(function () {
        that._colouredLayer.setStyleHook(function (data) {
            if (that._stylesData[data.id]) {
                return that._stylesData[data.id];
            } else {
                return data.style;
            }
        });
    }, 0);
};

MeanVCIManager.prototype.setFeatures = function (features) {
    this._featuresArray = features;
};

MeanVCIManager.prototype.removeItems = function () {
    if (this._itemsIDToRemove.length) {
        this._colouredLayer.removeItems(this._itemsIDToRemove);
        this._itemsIDToRemove.length = 0;
    }
};;
/**
 * <div id="mainId" width="100px">
 *   <div width="100px">
 *     <div width = "20000px">
 *     </div>
 *   </div>
 * </div>
 */
function bindScrollControl(id, lmap) {
    var element = document.getElementById(id);
    var mouseX;
    var mouseOver;
    var scroll = false;

    element.onmousedown = function (e) {
        if (mouseOver) {
            currScroll = element.scrollLeft;
            mouseX = e.clientX;
            scroll = true;
            document.body.classList.add("ntDisselect");
        }
    };

    var currScroll = 0;

    element.onmouseup = function () {
        scroll = false;
        document.body.classList.remove("ntDisselect");
    };

    element.onmouseover = function () {
        mouseOver = true;
    };

    element.onmouseleave = function () {
        mouseOver = false;
    };

    $(document.body).on("mousemove", function (e) {
        if (scroll) {
            element.scrollLeft = currScroll - e.clientX + mouseX;
        }
    });

    $(document.body).on("mouseup", function (e) {
        if (scroll) {
            scroll = false;
        }
    });

    /**
    ===================
        Touchable
    ===================
    **/
    document.addEventListener('touchmove', function (e) {
        if (scroll) {
            e.preventDefault();
            element.scrollLeft = currScroll - e.changedTouches[0].pageX + mouseX;
        }
    }, false);

    document.addEventListener("touchend", function (e) {
        if (scroll) {
            scroll = false;
        }
        lmap && lmap.dragging.enable();
    });

    element.ontouchstart = function (e) {
        currScroll = element.scrollLeft;
        lmap && lmap.dragging.disable();
        e.preventDefault();
        mouseX = e.changedTouches[0].pageX;
        scroll = true;
        document.body.classList.add("ntDisselect");
    };

};

;
var WarningDialog = function () {
    this.dialog = null;
    this.dialogContent = null;
    this.__dialogClass = "dlgAgroWarning";
    this._createDialog("Предупреждение", 680, 100);
};

WarningDialog.prototype.setPosition = function (x, y) {
    $(this.dialog).dialog('option', 'position', [x, y]);
};

WarningDialog.prototype.show = function () {
    $("." + this.__dialogClass).show();
    $(this.dialog).dialog();
};

WarningDialog.prototype.hide = function () {
    $("." + this.__dialogClass).hide();
};

WarningDialog.prototype.closeDialog = function () {
    //...
};

WarningDialog.prototype._createDialog = function (caption, width, height) {
    if (this.dialog)
        return;

    this.dialogContent = $("<div></div>");

    $(this.dialogContent.get(0)).empty();

    var that = this;

    this.dialog = showDialog("", this.dialogContent.get(0), 0, 0, false, false, null,
        function () {
            that.closeDialog();
        });

    this.dialog.style.display = "block";

    $(this.dialog).dialog({ dialogClass: this.__dialogClass });
    $("." + this.__dialogClass + " .ui-dialog-titlebar .ui-dialog-title").append(caption);
    $("." + this.__dialogClass + " .ui-dialog").css({ "float": "none", "font-size": "12px", "font-family": "Tahoma", "background-color": "#FFFFFF", "border-color": "#e7e7e7" });
    $(this.dialog).dialog('option', 'zIndex', 20001);
    $(this.dialog).dialog('option', 'height', height || 139);
    $(this.dialog).dialog('option', 'width', width || 256);
    $(this.dialog).dialog('moveToTop');
};

WarningDialog.prototype.appendHTML = function (html) {
    $(this.dialogContent.get(0)).empty();
    $(this.dialogContent.get(0)).append(html);
};

var AgroWarning = (function () {
    var instance;

    function createInstance() {
        var object = new WarningDialog();
        return object;
    }

    return {
        getInstance: function () {
            if (!instance) {
                instance = createInstance();
            }
            return instance;
        }
    };
})();;
var Rating = function (dataSource) {
    this.dataSource = dataSource || "F28D06701EF2432DB21BFDB4015EF9CE";
    this._layers = [];
    this._layersStyleData = {};
};

Rating.__hookId = "ratingXXXab345pp";

Rating.palette = {
    "0": { "r": 0, "g": 0, "b": 0 },
    "10": { "r": 245, "g": 12, "b": 50 },
    "20": { "r": 245, "g": 12, "b": 50 },
    "30": { "r": 245, "g": 12, "b": 50 },
    "40": { "r": 227, "g": 145, "b": 57 },
    "50": { "r": 230, "g": 200, "b": 78 },
    "60": { "r": 240, "g": 240, "b": 24 },
    "70": { "r": 223, "g": 237, "b": 92 },
    "80": { "r": 179, "g": 214, "b": 109 },
    "90": { "r": 125, "g": 235, "b": 21 },
    "100": { "r": 30, "g": 163, "b": 18 }
};

Rating.prototype.clear = function () {
    for (var i = 0; i < this._layers.length; i++) {
        styleHookManager.removeStyleHook(this._layers[i], Rating.__hookId);
    }
    this._layersStyleData = {};
    this.redraw();
    this._layers = [];
};

Rating.prototype.setLayerStyleHook = function (layer) {
    var that = this;
    var layerName = layer.getGmxProperties().LayerID;
    this._layersStyleData[layerName] = {};

    styleHookManager.addStyleHook(layer, Rating.__hookId, function (data) {
        if (that._layersStyleData[layerName] && that._layersStyleData[layerName][data.id]) {
            return that._layersStyleData[layerName][data.id];
        } else {
            return data.style;
        }
    }, 100);
};

Rating.prototype.redraw = function () {
    for (var i = 0; i < this._layers.length; i++) {
        this._layers[i].repaint();
    }
};

Rating.prototype.start = function (layersArr, dateStr) {

    this.clear();

    var layersStr = "[layer_id] in (";
    for (var i = 0; i < layersArr.length; i++) {
        var layer = layersArr[i];
        this._layers.push(layer);
        this.setLayerStyleHook(layer);
        layersStr += "'" + layer.getGmxProperties().LayerID + "',";
    }
    layersStr = layersStr.substr(0, layersStr.length - 1) + ")";

    var that = this;

    var url = "http://maps.kosmosnimki.ru/rest/ver1/layers/~/search?api_key=BB3RFQQXTR";
    var tale = '&tables=[{"LayerName":"' + that.dataSource + '","Alias":"n"},{"LayerName":"88903D1BF4334AEBA79E1527EAD27F99","Alias":"f","Join":"Inner","On":"[n].[field_id] = [f].[gmx_id]"}]&columns=[{"Value":"[n].[Value]"},{"Value":"[f].[layer_id]"},{"Value":"[f].[layer_gmx_id]"}]';
    url += "&query=[date]='" + dateStr + "' AND (" + layersStr + ") AND [completeness]>=50.0" + tale;

    $.getJSON(url, function (response) {
        var features = response.features;

        features.sort(function (a, b) {
            return a.properties.value - b.properties.value;
        });

        var ratingFeatures = {};
        var maxValue = -1000000,
            minValue = 1000000;
        for (var i = 0; i < features.length; i++) {
            var fi = features[i];
            if (fi.properties.value > maxValue)
                maxValue = fi.properties.value;
            if (fi.properties.value < minValue)
                minValue = fi.properties.value;
            if (!ratingFeatures[fi.properties.layer_id]) {
                ratingFeatures[fi.properties.layer_id] = {};
            }
            ratingFeatures[fi.properties.layer_id][fi.properties.layer_gmx_id] = fi.properties;
        }

        if (maxValue == minValue) {
            minValue = 0;
        }

        for (var i = 0; i < features.length; i++) {
            var fi = features[i];
            var k = (Math.floor((ratingFeatures[fi.properties.layer_id][fi.properties.layer_gmx_id].value - minValue) / (maxValue - minValue) * 10) * 10).toString();
            var color = Rating.palette[k];
            that._layersStyleData[fi.properties.layer_id][fi.properties.layer_gmx_id] = {
                "fillOpacity": 1,
                "fillStyle": "rgb(" + color.r + "," + color.g + "," + color.b + ")"
            };
        }

        //for (var i = 0; i < features.length; i++) {
        //    var fi = features[i];
        //    var k = (Math.floor(Math.floor(i * 100 / features.length) / 10.0) * 10.0).toString();
        //    var color = Rating.palette[k];
        //    that._layersStyleData[fi.properties.layer_id][fi.properties.layer_gmx_id] = {
        //        "fillOpacity": 1,
        //        "fillStyle": "rgb(" + color.r + "," + color.g + "," + color.b + ")"
        //    };
        //}

        that.redraw();
    });
};
;
var uniqueGlobalName = (function () {
    var freeid = 0;
    return function (thing) {
        var id = 'gmx_unique_' + freeid++;
        window[id] = thing;
        return id;
    }
})();

/** �������� �����-�������� GET ������ � ������� � �������������� ���������� JSONP.
 * 
 * @param {String} url URL �������.
 * @param {Function} callback �-���, ������� ����� ������� ��� ��������� �� ������� ����������.
 * @param {String} [callbackParamName=CallbackName] ��� ��������� ��� ������� ����� �-��� ������.
 * @param {Function} [errorCallback] �-���, ������� ����� ������� � ������ ������ ������� � �������
 */
var sendCrossDomainJSONRequest = function (url, callback, callbackParamName, errorCallback) {
    callbackParamName = callbackParamName || 'CallbackName';

    var script = document.createElement("script");
    script.setAttribute("charset", "UTF-8");
    var callbackName = uniqueGlobalName(function (obj) {
        callback && callback(obj);
        window[callbackName] = false;
        document.getElementsByTagName("head").item(0).removeChild(script);
    });

    var sepSym = url.indexOf('?') == -1 ? '?' : '&';

    if (errorCallback) {
        script.onerror = errorCallback;
    }

    script.setAttribute("src", url + sepSym + callbackParamName + "=" + callbackName + "&" + Math.random());
    document.getElementsByTagName("head").item(0).appendChild(script);
};

/** �������� ������������� POST ������
*
* @param {String} url URL �������
* @param {Object} params ��� ����������-��������
* @param {Function} [callback] Callback, ������� ���������� ��� ������� ������ � �������. ������������ �������� �-��� - ���������� ������
* @param {DOMElement} [baseForm] ������� ����� �������. ������������, ����� ����� ��������� �� ������ ����. 
*                                � ������� ��� ����� ����� ����������������, �� ����� ����������� ������� ����� ��������� � ��������� ����.
*/
var sendCrossDomainPostRequest = function (url, params, callback, baseForm) {
    var form,
		rnd = String(Math.random()),
		id = '$$iframe_' + url + rnd;

    var iframe = createPostIframe2(id, callback, url),
        originalFormAction;

    if (baseForm) {
        form = baseForm;
        originalFormAction = form.getAttribute('action');
        form.setAttribute('action', url);
        form.target = id;

    }
    else {
        try {
            form = document.createElement('<form id=' + id + '" enctype="multipart/form-data" style="display:none" target="' + id + '" action="' + url + '" method="post"></form>');
        }
        catch (e) {
            form = document.createElement("form");
            form.style.display = 'none';
            form.setAttribute('enctype', 'multipart/form-data');
            form.target = id;
            form.setAttribute('method', 'POST');
            form.setAttribute('action', url);
            form.id = id;
        }
    }

    var hiddenParamsDiv = document.createElement("div");
    hiddenParamsDiv.style.display = 'none';

    if (params.WrapStyle === 'window') {
        params.WrapStyle = 'message';
    }

    if (params.WrapStyle === 'message') {
        params.CallbackName = iframe.callbackName;
    }

    for (var paramName in params) {
        var input = document.createElement("input");

        var value = typeof params[paramName] !== 'undefined' ? params[paramName] : '';

        input.setAttribute('type', 'hidden');
        input.setAttribute('name', paramName);
        input.setAttribute('value', value);

        hiddenParamsDiv.appendChild(input)
    }

    form.appendChild(hiddenParamsDiv);

    if (!baseForm)
        document.body.appendChild(form);

    document.body.appendChild(iframe);

    form.submit();

    if (baseForm) {
        form.removeChild(hiddenParamsDiv);
        if (originalFormAction !== null)
            form.setAttribute('action', originalFormAction);
        else
            form.removeAttribute('action');
    }
    else {
        form.parentNode.removeChild(form);
    }
};

var parseUri = function (str) {

    var o = {
        strictMode: false,
        key: ['source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'],
        q: {
            name: 'queryKey',
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
        }
    };

    var m = o.parser[o.strictMode ? 'strict' : 'loose'].exec(str),
        uri = {},
        i = 14;

    while (i--) {
        uri[o.key[i]] = m[i] || '';
    }

    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
        if ($1) { uri[o.q.name][$1] = $2; }
    });

    uri.hostOnly = uri.host;
    uri.host = uri.authority; // HACK

    return uri;
};

var createPostIframe2 = function (id, callback, url) {
    var uniqueId = uniquePrefix + (lastRequestId++);

    iframe = document.createElement("iframe");
    iframe.style.display = 'none';
    iframe.setAttribute('id', id);
    iframe.setAttribute('name', id);
    iframe.src = 'javascript:true';
    iframe.callbackName = uniqueId;
    //iframe.onload = window[callbackName];

    var parsedURL = parseUri(url);
    var origin = (parsedURL.protocol ? (parsedURL.protocol + ':') : window.location.protocol) + '//' + (parsedURL.host || window.location.host);

    requests[origin] = requests[origin] || {};
    requests[origin][uniqueId] = { callback: callback, iframe: iframe };

    return iframe;
};

var requests = {},
    lastRequestId = 0,
    uniquePrefix = 'id' + Math.random();

var processMessage = function (e) {
    if (!(e.origin in requests)) {
        return;
    }

    var dataStr = decodeURIComponent(e.data.replace(/\n/g, '\n\\'));
    try {
        var dataObj = JSON.parse(dataStr);
    } catch (e) {
        request.callback && request.callback({ Status: "error", ErrorInfo: { ErrorMessage: "JSON.parse exeption", ExceptionType: "JSON.parse", StackTrace: dataStr } });
    }
    var request = requests[e.origin][dataObj.CallbackName];
    if (!request) return;    // message �� ������ ��������

    delete requests[e.origin][dataObj.CallbackName];
    delete dataObj.CallbackName;

    request.iframe.parentNode.removeChild(request.iframe);
    request.callback && request.callback(dataObj);
}

//������������� � IE8
if (window.addEventListener) {
    window.addEventListener('message', processMessage);
} else {
    window.attachEvent('onmessage', processMessage);
};
L.Control.gmxAgroTimeline = L.Control.extend({
    includes: L.Mixin.Events,
    options: {
        position: 'bottomright',
        isActive: true
    },

    onAdd: function (map) {
        var container = L.DomUtil.create('div','agrotimeline');
        container.id = "agrotimeline";
        container.style.position = "absolute";
        container.style.bottom = "0px";
        container.style.zIndex = "200000";
        container.style.right = "0px";

        this.manager = new NDVITimelineManager(map, timelineParams, false, container);
        this.manager.start();
        return container;
    },

    getManager: function () {
        return this.manager;
    }
});

L.control.gmxAgroTimeline = function (options) {
    return new L.Control.gmxAgroTimeline(options);
};
;
