'use strict';

angular.module('Iguana.Adapters.RestfulIdStyle', ['Iguana', 'ngResource'])
    .factory('Iguana.Adapters.RestfulIdStyle', ['Iguana.Adapters.AdapterBase', '$resource', '$q',
        function(AdapterBase, $resource, $q) {

            // based on the id-style described at https://gist.github.com/wycats/5500104

            return AdapterBase.subclass(function() {

                return {

                    name: 'Iguana.Adapters.RestfulIdStyle',

                    index: function(collection, params, options) {
                        return this._makeApiCall(collection, 'index', params, options);
                    },

                    show: function(collection, id, params, options) {
                        if (!id) {
                            throw new Error('No id provided');
                        }
                        params = params || {};
                        params[this.idProperty] = id;
                        return this._makeApiCall(collection, 'show', params, options);
                    },

                    create: function(collection, obj, metadata, options) {
                        return this._makeApiCall(collection, 'create', {
                            record: obj,
                            meta: metadata
                        }, options);
                    },

                    update: function(collection, obj, metadata, options) {
                        return this._makeApiCall(collection, 'update', {
                            record: obj,
                            meta: metadata
                        }, options);
                    },

                    destroy: function(collection, id, metadata, options) {
                        if (!id) {
                            throw new Error('No id provided');
                        }
                        var params = {
                            meta: metadata
                        };
                        params[this.idProperty] = id;
                        return this._makeApiCall(collection, 'destroy', params, options);
                    },

                    _makeApiCall: function(collectionName, meth, params, options) {
                        var deferred = $q.defer();
                        var resource = this._getResource(collectionName, options);
                        var collection = this.iguanaKlass.collection;
                        if (!collection) {
                            throw new Error('No collection defined on iguana class.');
                        }
                        var func = resource[meth];
                        if (!func) {
                            var props = {
                                collectionName: collectionName,
                                meth: meth
                            };
                            throw new Error('No func available for "' + meth + '": ' + angular.toJson(props));
                        }
                        func(
                            params,
                            function(response) {
                                var contents = response.contents;
                                if (!contents) {
                                    throw new Error('Malformed response: "' + angular.toJson(response) + '"');
                                }
                                deferred.resolve({
                                    result: contents[collection] || [],
                                    meta: response.meta
                                });
                            },
                            function(error) {
                                deferred.reject(error);
                            });
                        return deferred.promise;
                    },

                    _getResource: function(collection, options) {

                        // http://hostname.com/collection/:path/:id.json
                        // :path is generally not used, unless _actionOverrides below
                        var url = [this.iguanaKlass.baseUrl, collection, ':path', ':' + this.idProperty].join('/') + '.json';

                        options = angular.extend({}, this.iguanaKlass.defaultRequestOptions(), options || {});

                        var actions = {
                            'index': angular.extend({}, options, {
                                method: 'GET'
                            }),
                            'show': angular.extend({}, options, {
                                method: 'GET'
                            }),
                            'create': angular.extend({}, options, {
                                method: 'POST'
                            }),
                            'update': angular.extend({}, options, {
                                method: 'PUT'
                            }),
                            'destroy': angular.extend({}, options, {
                                method: 'DELETE'
                            })
                        };

                        // see overrideAction class method
                        if (this.iguanaKlass._actionOverrides) {
                            for (var actionName in this.iguanaKlass._actionOverrides) {
                                var override = this.iguanaKlass._actionOverrides[actionName];
                                var action = actions[actionName];
                                if (!action) {
                                    throw new Error('No action "' + actionName + '"');
                                }
                                if (override.path) {
                                    override.params = override.params || {};
                                    override.params.path = override.path;
                                }
                                angular.extend(action, override);
                            }
                        }

                        return $resource(url, {}, actions);
                    }

                };

            });

        }
    ]);