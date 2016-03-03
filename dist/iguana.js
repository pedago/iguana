angular.module('Iguana', ['SuperModel', 'ngResource'])
    .provider('Iguana', function() {

        this._defaultBaseUrl = '';

        this.setAdapter = function(adapterName) {
            this._defaultAdapterName = adapterName;
        };

        this.setBaseUrl = function(baseUrl) {
            this._defaultBaseUrl = baseUrl;
        };

        this.setDefaultRequestOptions = function(opts) {
            this._defaultRequestOptions = opts;
        };


        this.$get = [
            'SuperModel',
            'Iguana.Alias',
            'Iguana.Callbacks',
            'Iguana.Crud',
            'Iguana.Embeds',
            'Iguana.Keys',
            'Iguana.Serializers',
            'Iguana.SingleCollectionInheritance',

            function(SuperModel, Alias, Callbacks, Crud, Embeds, Serializers, SingleCollectionInheritance) {

                var plugins = Array.prototype.slice.call(arguments, 1);

                var Iguana = SuperModel.subclass(function() {

                    angular.forEach(plugins, function(mixins) {
                        this.extend(mixins.classMixin || {});
                        this.include(mixins.instanceMixin || {});
                        if (mixins.included) {
                            mixins.included(this);
                        }
                    }.bind(this));

                    this.extendableObject('defaultRequestOptions');

                    this.extend({
                        expect: function() {
                            throw new Error("There is no 'expect' method.  Make sure to include iguana-mock.js and inject MockIguana.")
                        },
                    });

                    return {
                        initialize: function(attrs) {
                            if (attrs === undefined) {
                                attrs = {};
                            }

                            if (typeof attrs !== 'object' || Object.prototype.toString.call(attrs) === '[object Array]') {
                                throw new Error("Expecting to instantiate Iguana class with object, got '" + attrs + "'");
                            }

                            this.copyAttrsOnInitialize(attrs);
                        },

                        copyAttrsOnInitialize: function(attrs) {
                            this.$$sourceAttrs = attrs;
                            this.runCallbacks('copyAttrsOnInitialize', function() {
                                this.copyAttrs();
                            });
                        },

                        copyAttrs: function(attrs) {
                            if (attrs) {
                                this.$$sourceAttrs = attrs;
                            }
                            this.runCallbacks('copyAttrs', function() {
                                angular.extend(this, this.$$sourceAttrs);
                            });
                        }
                    }

                });

                if (this._defaultAdapterName) Iguana.setAdapter(this._defaultAdapterName);
                Iguana.setBaseUrl(this._defaultBaseUrl);

                if (this._defaultRequestOptions) {
                    angular.forEach(this._defaultRequestOptions, function(v, k) {
                        Iguana.defaultRequestOptions().set(k, v);
                    });
                }

                return Iguana;
            }
        ];

    });
angular.module('Iguana')
.factory('Iguana.Adapters.AdapterBase', ['$q', 'SuperModel', function($q, SuperModel){

    /**
    # Creating adapters
    To create a new adapter, you will need to create a new service that
    subclasses Iguana.Adapters.AdapterBase.  
    For an example, see [Iguana.Adapters.RestfulIdStyle](restful_id_style.html)

    Your subclass should define some or all of the methods described below.    

    All methods should return a promise which will be resolved with an 
    object that has the following two properties:

    **result** - an array of documents.  
    **metadata** - anything you want it to be.
    */
        
        return SuperModel.subclass(function() {
           
            return {
                initialize: function(iguanaKlass) {
                    this.iguanaKlass = iguanaKlass;
                },
                
                // ### show
                // Any arguments passed to Iguana.show will be passed through to 
                // the adapter, allowing the adapter to support any kind of 
                // querying functionality.  
                //  
                // The 'result' array should have only a single document.  Any 
                // subsequent documents will be ignored.
                show: function(collection, arg1, arg2) {
                    throw new Error("Adapter does not support show method");
                },
                
                // ### index
                // Any arguments passed to Iguana.index will be passed through to 
                // the adapter, allowing the adapter to support any kind of 
                // querying functionality.
                //  
                // The 'result' array can have any number of documents
                index: function(collection, arg1, arg2) {
                    throw new Error("Adapter does not support index method");
                },
                
                // ### create
                // A document will be passed to create
                //  
                // The 'result' array should have only a single document.  Any 
                // subsequent documents will be ignored.
                create: function(collection, obj) {
                    throw new Error("Adapter does not support create method");
                },
                
                // ### update
                // A document will be passed to update
                //  
                // The 'result' array should have only a single document.  Any 
                // subsequent documents will be ignored.
                update: function(collection, obj) {
                    throw new Error("Adapter does not support update method");
                },
                
                // ### destroy
                // An id will be passed to destroy.  (Maybe we need to support other
                // querying functionality here as well?)  
                //   
                // The 'result' array should be empty.  Any contents will be ignored.
                destroy: function(collection, id) {
                    throw new Error("Adapter does not support destroy method");
                }
            };
        })
        
    }]);
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

                    destroy: function(collection, id, options) {
                        if (!id) {
                            throw new Error('No id provided');
                        }
                        var params = {};
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
                        var url = [this.iguanaKlass.baseUrl, collection, ':' + this.idProperty].join('/') + '.json';
                        options = angular.extend({}, this.iguanaKlass.defaultRequestOptions(), options || {});
                        
                        return $resource(url, {}, {
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
                        });
                    }

                };

            });

        }
    ]);
angular.module('Iguana')
    .factory('Iguana.Alias', ['$injector',
        function($injector) {

            return {
                classMixin: {

                    injectablesMap: {},

                    alias: function(value) {
                        if (value) {
                            this._alias = value;
                            if (this._aliasedKlasses[value]) {
                                throw new Error('A klass has already been aliased to "' + value + '".  Cannot alias another to the same name.');
                            }
                            this._aliasedKlasses[value] = this;
                        }
                        return this._alias;
                    },

                    getAliasedKlass: function(alias, throwIfUnfound) {
                        if (angular.isUndefined(throwIfUnfound)) {
                            throwIfUnfound = true;
                        }
                        
                        if (!this._aliasedKlasses[alias]) {
                            // Check the injectables map for the alias.
                            var path = this.injectablesMap[alias];


                            // try using the alias itself as the path
                            if (!path || !$injector.has(path)) {
                                path = alias;
                            }

                            if (path && $injector.has(path)) {
                                var klass;
                                klass = $injector.get(path);
                                this._aliasedKlasses[alias] = klass;
                                if (alias !== klass.alias()) {
                                    var message = 'Iguana class does not have the expected alias: "' + klass.alias() + '" != "' + alias + '"';
                                    throw new Error(message);
                                }
                            }
                        }

                        if (!this._aliasedKlasses[alias] && throwIfUnfound) {
                            throw new Error('No class aliased to "' + alias + '".');
                        }
                        return this._aliasedKlasses[alias];
                    },

                    mapInjectables: function(obj) {
                        angular.extend(this.injectablesMap, obj);
                    },

                    // this same object will be shared between all subclasses of Iguana, 
                    // so any class can access any aliased class
                    _aliasedKlasses: {}
                }
            };
        }
    ]);
angular.module('Iguana')
    .factory('Iguana.Callbacks', [

        function() {


            return {
                included: function(Iguana) {
                    Iguana.defineCallbacks('copyAttrs');
                    Iguana.defineCallbacks('copyAttrsOnInitialize');
                    Iguana.defineCallbacks('save');
                    Iguana.defineCallbacks('processEmbeds');
                }
            };

        }
    ]);
'use strict';

angular.module('Iguana')
    .factory('Iguana.Crud', ['$injector',
        function($injector) {

            var $q = $injector.get('$q');

            return {

                included: function(Iguana) {
                    Iguana.setIdProperty('id');
                },

                classMixin: {

                    setCollection: function(collection) {
                        this.extend({
                            collection: collection
                        });
                    },

                    setAdapter: function(adapterName) {
                        var adapterKlass;
                        try {
                            adapterKlass = $injector.get(adapterName);
                        } catch (e) {
                            throw new Error('Cannot find adapter "' + adapterName + '"');
                        }

                        this.extend({
                            adapterKlass: adapterKlass
                        });
                    },

                    setBaseUrl: function(url) {
                        //remove trailing slash
                        url = url.replace(/\/$/, '');
                        this.extend({
                            baseUrl: url
                        });
                    },

                    setIdProperty: function(idProperty) {
                        this.extend({
                            idProperty: idProperty
                        });
                    },

                    adapter: function() {
                        if (!this._adapter) {
                            if (!this.adapterKlass) {
                                throw new Error('No adapter set.  You need to call setAdapter()');
                            }
                            this._adapter = new this.adapterKlass(this);
                        }
                        return this._adapter;
                    },

                    show: function() {
                        return this._callAdapterMethAndInstantiateResult('show', true, arguments);
                    },

                    index: function() {
                        return this._callAdapterMethAndInstantiateResult('index', false, arguments);
                    },

                    create: function(obj, metadata, options) {
                        var instance = this.new(obj);
                        if (!instance.isNew()) {
                            throw new Error('Cannot call create on instance that is already saved.');
                        }
                        return instance.save(metadata, options);
                    },

                    update: function(obj, metadata, options) {
                        var instance = this.new(obj);
                        if (instance.isNew()) {
                            throw new Error('Cannot call update on instance that is not already saved.');
                        }
                        return instance.save(metadata, options);
                    },

                    destroy: function(id, options) {
                        var args = [id];
                        if (options) {
                            args.push(options);
                        }
                        return this._callAdapterMeth('destroy', args).then(function(response) {
                            return this._prepareEmptyResponse(response);
                        }.bind(this));
                    },

                    saveWithoutInstantiating: function(meth, obj, metadata, options) {
                        var args = [obj];
                        if (metadata) {
                            args.push(metadata);
                        }
                        if (options) {
                            args.push(options);
                        }
                        return this._callAdapterMeth(meth, args).then(function(response) {
                            return {
                                result: response.result[0],
                                meta: response.meta
                            };
                        });
                    },

                    _prepareEmptyResponse: function(response) {
                        return {
                            result: null,
                            meta: response.meta
                        };
                    },

                    _callAdapterMethAndInstantiateResult: function(meth, singlify, args) {
                        return this._callAdapterMeth(meth, args).then(function(response) {
                            return this._instantiateFromResponse(singlify, response);
                        }.bind(this));
                    },

                    _instantiateFromResponse: function(singlify, response) {
                        var instances = this._instantiateFromResult(response.result);
                        var result = singlify ? instances[0] : instances;
                        return {
                            result: result,
                            meta: response.meta
                        };
                    },

                    _instantiateFromResult: function(result) {
                        if (!result) {
                            return [];
                        }
                        var instances = [];
                        angular.forEach(result, function(attrs) {
                            instances.push(this.new(attrs));
                        }.bind(this));
                        return instances;
                    },

                    _callAdapterMeth: function(meth, args) {
                        if (!this.collection) {
                            throw new Error('Cannot make an api call because collection has not been set.  You need to call setCollection().');
                        }
                        args = Array.prototype.slice.call(args, 0);
                        args.unshift(this.collection);
                        return this.adapter()[meth].apply(this.adapter(), args);
                    }
                },

                instanceMixin: {

                    save: function(metadata, options) {
                        var action = this.isNew() ? 'create' : 'update';
                        return this._createOrUpdate(action, metadata, options);
                    },

                    create: function(metadata, options) {
                        return this._createOrUpdate('create', metadata, options);
                    },

                    isNew: function() {
                        var id = this[this.idProperty()];
                        return !id;
                    },

                    _createOrUpdate: function(action, metadata, options) {
                        var promise;
                        this.runCallbacks('save', function() {
                            var publicPromise;
                            this.$$saving = true;
                            promise = this._save(action, metadata, options);
                            var requestId = new Date().getTime() + ':' + Math.random();

                            // if saving is not in progress already, then
                            // create a new $$savePromise (this check allows
                            // us to support concurrent saves of the same
                            // object)
                            if (!this.$$savePromise) {
                                // create the promise
                                var _resolve;
                                var _reject;
                                publicPromise = $q(function(resolve, reject) {
                                    _resolve = resolve;
                                    _reject = reject;
                                });
                                publicPromise.resolve = _resolve;
                                publicPromise.reject = _reject;
                                publicPromise.savePromises = {};
                                publicPromise.errors = [];

                                publicPromise.finally(function() {
                                    this.$$saving = false;
                                    this.$$savePromise = undefined;
                                }.bind(this));
                                this.$$savePromise = publicPromise;
                            }
                            publicPromise = this.$$savePromise;
                            publicPromise.savePromises[requestId] = promise;

                            promise.then(
                                function() {
                                    delete publicPromise.savePromises[requestId];
                                    if (Object.keys(publicPromise.savePromises).length === 0) {
                                        if (publicPromise.errors.length === 0) {
                                            publicPromise.resolve();
                                        } else {
                                            publicPromise.reject({
                                                errors: publicPromise.errors
                                            });
                                        }

                                    }
                                },
                                function(err) {
                                    publicPromise.errors.push(err);
                                    delete publicPromise.savePromises[requestId];
                                    if (Object.keys(publicPromise.savePromises).length === 0) {
                                        publicPromise.reject({
                                            errors: publicPromise.errors
                                        });
                                    }
                                });
                        });
                        return promise;
                    },

                    _save: function(action, metadata, options) {
                        return this.constructor.saveWithoutInstantiating(action, this.asJson(), metadata, options).then(function(response) {
                            var attrs = angular.extend({}, response.result);

                            this.copyAttrs(attrs);
                            return {
                                result: this,
                                meta: response.meta
                            };
                        }.bind(this));
                    },

                    destroy: function(options) {
                        this.$$destroying = true;
                        this.$$saving = true;
                        var returnValue = this.constructor.destroy(this[this.idProperty()], options);
                        this.$$savePromise = returnValue;
                        returnValue.finally(function() {
                            this.$$destroying = false;
                            this.$$saving = false;
                            this.$$savePromise = undefined;
                        }.bind(this));
                        return returnValue;
                    },

                    idProperty: function() {
                        return this.constructor.idProperty;
                    }

                }
            };

        }
    ]);
 angular.module('Iguana')
     .factory('Iguana.Embeds', ['AClassAbove',
         function(Class) {

             var EmbedRelationship = Class.subclass({
                 initialize: function(propName, klassFetcher) {
                     // We don't want to worry about whether the class has been aliased or
                     // yet when the relationship is set up.  So long as it has been aliased by the
                     // time we try to process a relationship, that's good enough.  So we take
                     // a function that will let us fetch the klass just in time.
                     this.propName = propName;
                     this.klassFetcher = klassFetcher;
                 },

                 process: function(parent, attrs) {
                     var sourceValue = attrs[this.propName];
                     if (!sourceValue) return;
                     attrs[this.propName] = this._instantiate(parent, sourceValue);
                 }
             });

             var EmbedManyRelationship = EmbedRelationship.subclass({

                 _instantiate: function(parent, sourceValue) {
                     var target;

                     // figure out if we are dealing with an array or an object
                     if (Object.prototype.toString.call(sourceValue) === '[object Array]') {
                         target = [];
                     } else if (typeof sourceValue === 'object') {
                         target = {};
                     } else {
                         throw new Error('Expecting array or object for embedsMany relationship "' + this.propName + '". Got ' + sourceValue);
                     }

                     angular.forEach(sourceValue, function(val, key) {
                         var instance = this.klassFetcher().new(val);
                         instance.$$embeddedIn = parent;
                         target[key] = instance;
                     }.bind(this));

                     return target;
                 }

             });

             var EmbedOneRelationship = EmbedRelationship.subclass({

                 _instantiate: function(parent, sourceValue) {
                     var instance = this.klassFetcher().new(sourceValue);
                     instance.$$embeddedIn = parent;
                     return instance;
                 }

             });

             return {

                 included: function(Iguana) {
                     Iguana.extendableObject('embedRelationships');
                     Iguana.setCallback('before', 'copyAttrs', 'processEmbeds');

                     // // We would like to bring this back, but it can
                     // // case MaxCallStack errors in Chrome.  Maybe
                     // // we can eventually find a solution
                     // Iguana.setCallback('around', 'save', function(save) {
                     //     var wrapped = save;
                     // 
                     //     
                     //     
                     //     // var relationships = this.embedRelationships();
                     //     // for (var propName in relationships) {
                     //     //     if (!relationships.hasOwnProperty(propName)) { 
                     //     //         continue
                     //     //     }
                     //     //     var relationship = relationships[propName];
                     //     //     var value = this[propName];
                     //     //     if (value) {
                     //     //         var isArray = (Object.prototype.toString.call(value) === '[object Array]');
                     //     //         var values = isArray ? value : [value];
                     //     //         values.forEach(function(item) {
                     //     //             var reWrapped = function(wrapped) {
                     //     //                 item.runCallbacks('save', wrapped);
                     //     //             }.bind(item, wrapped);
                     //     //             wrapped = reWrapped;
                     //     //         });
                     //     //     }
                     //     // }
                     // 
                     //     wrapped();
                     // });
                 },

                 classMixin: {

                     embedsMany: function(propName, classAlias) {
                         this.embedRelationships().set(propName, new EmbedManyRelationship(
                             propName,
                             this.getAliasedKlass.bind(this, classAlias)
                         ));
                     },

                     embedsOne: function(propName, classAlias) {
                         this.embedRelationships().set(propName, new EmbedOneRelationship(
                             propName,
                             this.getAliasedKlass.bind(this, classAlias)
                         ));
                     },

                     embeddedIn: function(propName) {
                         this.extend({
                             '_embeddedIn': propName
                         });
                         var obj = {};
                         obj[propName] = function() {
                             return this.$$embeddedIn;
                         };
                         this.include(obj);
                     }
                 },

                 instanceMixin: {
                     embedRelationships: function() {
                         return this.constructor.embedRelationships.apply(this.constructor);
                     },

                     processEmbeds: function() {
                         this.runCallbacks('processEmbeds', function() {
                             angular.forEach(this.embedRelationships(), function(relationship) {
                                 relationship.process(this, this.$$sourceAttrs);
                             }.bind(this));
                         });
                     }
                 }
             };
         }
     ]);
'use strict';

angular.module('Iguana')
    .factory('Iguana.Keys', ['$injector',
        function() {

            return {

                classMixin: {
                    defineSetter: function(key, setter) {
                        var internalKey = this.internalKeyFor(key);

                        this.setCallback('after', 'copyAttrsOnInitialize', function() {

                            // if this property already exists, copy it to the internal key
                            if (this.hasOwnProperty(key)) {
                                this[internalKey] = this[key];
                            }

                            Object.defineProperty(this, key, {
                                get: function() {
                                    return this.readKey(key);
                                },
                                set: setter,
                                enumerable: true,
                                configurable: true // let developers mess with this if they want to
                            });
                        });
                    },

                    internalKeyFor: function(key) {
                        return '$$___' + key;
                    }
                },

                instanceMixin: {

                    readKey: function(key) {
                        var internalKey = this.constructor.internalKeyFor(key);
                        return this[internalKey];
                    },

                    writeKey: function(key, val) {
                        var internalKey = this.constructor.internalKeyFor(key);
                        this[internalKey] = val;
                        return val;
                    }

                }
            };

        }
    ]);
angular.module('Iguana')
.factory('Iguana.Serializers', [function(){
        
        
        return {
            instanceMixin: {
                asJson: function() {
                    return angular.fromJson(angular.toJson(this));
                },
                
                toJson: function() {
                    return angular.toJson(this);
                }
            }
        };
        
    }]);
angular.module('Iguana')
    .factory('Iguana.SingleCollectionInheritance', function() {

        return {

            included: function(Iguana) {
                // if the class has an alias, but the type property is 
                // not set, then set it to the alias.
                Iguana.setCallback('after', 'copyAttrs', function() {
                    var sciProperty = this.constructor.sciProperty;
                    if (this.constructor.alias() && !this.hasOwnProperty(sciProperty)) {
                        this[sciProperty] = this.constructor.alias();
                    }
                });

                Iguana.setCallback('before', 'copyAttrsOnInitialize', function() {
                    var attrs = this.$$sourceAttrs;
                    if (!attrs || !attrs.$$instantiatedWithNew) {
                        throw new Error("Iguana classes must be instantiated with MyKlass.new() rather that new MyKlass()");
                    }

                    delete attrs.$$instantiatedWithNew;
                });
            },

            classMixin: {

                sciProperty: '__iguana_type',

                setSciProperty: function(prop) {
                    this.extend({
                        sciProperty: prop
                    });
                },

                new: function(attrs, raiseOnFailure) {
                    //clone the provided attrs object
                    attrs = angular.extend({}, attrs);

                    if (raiseOnFailure !== false) {
                        raiseOnFailure = true;
                    }
                    if (attrs === undefined) {
                        attrs = {};
                    }

                    if (typeof attrs !== 'object' || Object.prototype.toString.call(attrs) === '[object Array]') {
                        throw new Error("Expecting to instantiate Iguana class with object, got '" + attrs + "'");
                    }

                    //Ensure that all instances are created with Iguana.new rather than 'new Iguana'
                    //See after copyAttrs callback above
                    attrs.$$instantiatedWithNew = true;

                    var instance;

                    // Since the lazy-loading relies on sciProperty, it can only work on subclasses. I guess this makes
                    // sense, since we'll always be loading things from the db with SomeItem.show() or 
                    // whatever.
                    if (!attrs.hasOwnProperty(this.sciProperty)) {
                        instance = new this(attrs);
                    } else if (attrs[this.sciProperty] && attrs[this.sciProperty] === this.alias()) {
                        instance = new this(attrs);
                    } else {
                        var klass
                        klass = this.getAliasedKlass(attrs[this.sciProperty], false);

                        if (klass && !klass.inheritsFrom(this)) {
                            throw new Error('Cannot instantiate because class "' + klass.alias() + '" does not inherit from "' + this.alias() + '."');
                        }

                        if (klass) {
                            instance = klass.new(attrs, false);
                        }

                    }

                    if (instance) {
                        return instance;
                    } else if (raiseOnFailure) {
                        throw new Error('No class could be found for ' + this.sciProperty + '="' + attrs[this.sciProperty] + '".');
                    }
                }
            }
        };
    });