define([
    'text!../res/widgetTemplate.html',
    './Rule',
    './ConditionManager',
    './TestDataManager',
    './WidgetDnD',
    'lodash',
    'zepto'
], function (
    widgetTemplate,
    Rule,
    ConditionManager,
    TestDataManager,
    WidgetDnD,
    _,
    $
) {

    //default css configuration for new rules
    var DEFAULT_PROPS = {
        'color': '#000000',
        'background-color': '#00ff00',
        'border-color': '#666666'
    };

    /**
     * A Summary Widget object, which allows a user to configure rules based
     * on telemetry producing domain objects, and update a compact display
     * accordingly.
     * @constructor
     * @param {Object} domainObject The domain Object represented by this Widget
     * @param {MCT} openmct An MCT instance
     */
    function SummaryWidget(domainObject, openmct) {
        this.domainObject = domainObject;
        this.openmct = openmct;

        this.domainObject.configuration = this.domainObject.configuration || {};
        this.domainObject.configuration.ruleConfigById = this.domainObject.configuration.ruleConfigById || {};
        this.domainObject.configuration.ruleOrder = this.domainObject.configuration.ruleOrder || ['default'];
        this.domainObject.configuration.testDataConfig = this.domainObject.configuration.testDataConfig || [{
            object: '',
            key: '',
            value: ''
        }];

        this.activeId = 'default';
        this.rulesById = {};
        this.domElement = $(widgetTemplate);
        this.editing = false;
        this.container = '';
        this.editListenerUnsubscribe = $.noop;

        this.ruleArea = $('#ruleArea', this.domElement);
        this.testDataArea = $('.widget-test-data', this.domElement);
        this.addRuleButton = $('#addRule', this.domElement);

        this.conditionManager = new ConditionManager(this.domainObject, this.openmct);
        this.testDataManager = new TestDataManager(this.domainObject, this.conditionManager, this.openmct);

        this.show = this.show.bind(this);
        this.destroy = this.destroy.bind(this);
        this.addRule = this.addRule.bind(this);
        this.onEdit = this.onEdit.bind(this);

        var id = this.domainObject.identifier.key,
            self = this,
            oldDomainObject,
            statusCapability;

        openmct.$injector.get('objectService')
            .getObjects([id])
            .then(function (objs) {
                oldDomainObject = objs[id];
                statusCapability = oldDomainObject.getCapability('status');
                self.editListenerUnsubscribe = statusCapability.listen(self.onEdit);
                if (statusCapability.get('editing')) {
                    self.onEdit(['editing']);
                } else {
                    self.onEdit([]);
                }
            });
    }

    /**
     * Builds the Summary Widget's DOM, performs other necessary setup, and attaches
     * this Summary Widget's view to the supplied container.
     * @param {element} container The DOM element that will contain this Summary
     *                            Widget's view.
     */
    SummaryWidget.prototype.show = function (container) {
        var self = this;
        this.container = container;
        $(container).append(this.domElement);
        $('.widget-test-data', this.domElement).append(this.testDataManager.getDOM());
        this.widgetDnD = new WidgetDnD(this.domElement, this.domainObject.configuration.ruleOrder, this.rulesById);
        this.initRule('default', 'Default');
        this.domainObject.configuration.ruleOrder.forEach(function (ruleId) {
            self.initRule(ruleId);
        });
        this.refreshRules();
        this.updateWidget();
        this.updateView();

        this.addRuleButton.on('click', this.addRule);
        this.conditionManager.on('receiveTelemetry', this.executeRules, this);
        this.widgetDnD.on('drop', this.reorder, this);
    };

    /**
     * Unregister event listeners with the Open MCT APIs, unsubscribe from telemetry,
     * and clean up event handlers
     */
    SummaryWidget.prototype.destroy = function (container) {
        this.editListenerUnsubscribe();
        this.conditionManager.destroy();
        this.widgetDnD.destroy();
        Object.values(this.rulesById).forEach(function (rule) {
            rule.destroy();
        });
    };

    /**
     * A callback function for the Open MCT status capability listener. If the
     * view representing the domain object is in edit mode, update the internal
     * state and widget view accordingly.
     * @param {string[]} status an array containing the domain object's current status
     */
    SummaryWidget.prototype.onEdit = function (status) {
        if (status && status.includes('editing')) {
            this.editing = true;
        } else {
            this.editing = false;
        }
        this.updateView();
    };

    /**
     * If this view is currently in edit mode, show all rule configuration interfaces.
     * Otherwise, hide them.
     */
    SummaryWidget.prototype.updateView = function () {
        if (this.editing) {
            this.ruleArea.show();
            this.testDataArea.show();
            this.addRuleButton.show();
        } else {
            this.ruleArea.hide();
            this.testDataArea.hide();
            this.addRuleButton.hide();
        }
    };

    /**
     * Update the view from the current rule configuration and order
     */
    SummaryWidget.prototype.refreshRules = function () {
        var self = this,
            ruleOrder = self.domainObject.configuration.ruleOrder,
            rules = self.rulesById;

        self.ruleArea.html('');
        Object.values(ruleOrder).forEach(function (ruleId) {
            self.ruleArea.append(rules[ruleId].getDOM());
        });

        this.executeRules();
    };

    /**
     * Update the widget's appearance from the configuration of the active rule
     */
    SummaryWidget.prototype.updateWidget = function () {
        var activeRule = this.rulesById[this.activeId];
        this.applyStyle($('#widget', this.domElement), activeRule.getProperty('style'));
        $('#widget', this.domElement).prop('title', activeRule.getProperty('message'));
        $('#widgetLabel', this.domElement).html(activeRule.getProperty('label'));
        $('#widgetLabel', this.domElement).removeClass().addClass('label widget-label ' + activeRule.getProperty('icon'));
    };

    /**
     * Get the active rule and update the Widget's appearance.
     */
    SummaryWidget.prototype.executeRules = function () {
        this.activeId = this.conditionManager.executeRules(
            this.domainObject.configuration.ruleOrder,
            this.rulesById
        );
        this.updateWidget();
    };

    /**
     * Add a new rule to this widget
     */
    SummaryWidget.prototype.addRule = function () {
        var ruleCount = 0,
            ruleId,
            ruleOrder = this.domainObject.configuration.ruleOrder;

        while (Object.keys(this.rulesById).includes('rule' + ruleCount)) {
            ruleCount = ++ruleCount;
        }

        ruleId = 'rule' + ruleCount;
        ruleOrder.push(ruleId);
        this.domainObject.configuration.ruleOrder = ruleOrder;
        this.updateDomainObject();
        this.initRule(ruleId, 'Rule');
        this.refreshRules();
    };


    /**
     * Duplicate an existing widget rule from its configuration and splice it in
     * after the rule it duplicates
     * @param {Object} sourceConfig The configuration properties of the rule to be
     *                              instantiated
     */
    SummaryWidget.prototype.duplicateRule = function (sourceConfig) {
        var ruleCount = 0,
            ruleId,
            sourceRuleId = sourceConfig.id,
            ruleOrder = this.domainObject.configuration.ruleOrder,
            ruleIds = Object.keys(this.rulesById);

        while (ruleIds.includes('rule' + ruleCount)) {
            ruleCount = ++ruleCount;
        }

        ruleId = 'rule' + ruleCount;
        sourceConfig.id = ruleId;
        sourceConfig.name += ' Copy';
        ruleOrder.splice(ruleOrder.indexOf(sourceRuleId) + 1, 0, ruleId);
        this.domainObject.configuration.ruleOrder = ruleOrder;
        this.domainObject.configuration.ruleConfigById[ruleId] = sourceConfig;
        this.updateDomainObject();
        this.initRule(ruleId, sourceConfig.name);
        this.refreshRules();
    };

    /**
     * Initialze a new rule from a default configuration, or build a {Rule} object
     * from it if already exists
     * @param {string} ruleId An key to be used to identify this ruleId, or the key
                              of the rule to be instantiated
     * @param {string} ruleName The initial human-readable name of this rule
     */
    SummaryWidget.prototype.initRule = function (ruleId, ruleName) {
        var ruleConfig,
            styleObj = {};

        Object.assign(styleObj, DEFAULT_PROPS);
        if (!this.domainObject.configuration.ruleConfigById[ruleId]) {
            this.domainObject.configuration.ruleConfigById[ruleId] = {
                name: ruleName || 'Rule',
                label: this.domainObject.name,
                message: '',
                id: ruleId,
                icon: 'icon-alert-rect',
                style: styleObj,
                description: ruleId === 'default' ? 'Default appearance for the widget' : 'A new rule',
                conditions: [{
                    object: '',
                    key: '',
                    operation: '',
                    values: []
                }],
                jsCondition: '',
                trigger: 'any',
                expanded: 'true'
            };

        }
        ruleConfig = this.domainObject.configuration.ruleConfigById[ruleId];
        this.rulesById[ruleId] = new Rule(ruleConfig, this.domainObject, this.openmct,
                                          this.conditionManager, this.widgetDnD, this.container);
        this.rulesById[ruleId].on('remove', this.refreshRules, this);
        this.rulesById[ruleId].on('duplicate', this.duplicateRule, this);
        this.rulesById[ruleId].on('change', this.updateWidget, this);
        this.rulesById[ruleId].on('conditionChange', this.executeRules, this);
    };

    /**
     * Given two ruleIds, move the source rule after the target rule and update
     * the view.
     * @param {Object} event An event object representing this drop with draggingId
     *                       and dropTarget fields
     */
    SummaryWidget.prototype.reorder = function (event) {
        var ruleOrder = this.domainObject.configuration.ruleOrder,
            sourceIndex = ruleOrder.indexOf(event.draggingId),
            targetIndex;

        if (event.draggingId !== event.dropTarget) {
            ruleOrder.splice(sourceIndex, 1);
            targetIndex = ruleOrder.indexOf(event.dropTarget);
            ruleOrder.splice(targetIndex + 1, 0, event.draggingId);
            this.domainObject.configuration.ruleOrder = ruleOrder;
            this.updateDomainObject();
        }
        this.refreshRules();
    };

    /**
     * Apply a list of css properties to an element
     * @param {element} elem The DOM element to which the rules will be applied
     * @param {object} style an object representing the style
     */
    SummaryWidget.prototype.applyStyle = function (elem, style) {
        Object.keys(style).forEach(function (propId) {
            elem.css(propId, style[propId]);
        });
    };

    /**
     * Mutate this domain object's configuration with the current local configuration
     */
    SummaryWidget.prototype.updateDomainObject = function () {
        this.openmct.objects.mutate(this.domainObject, 'configuration', this.domainObject.configuration);
    };

    return SummaryWidget;
});