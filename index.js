(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var adapter = require('webrtc-adapter-test');
module.exports = function (stream, el, options) {
    var item;
    var URL = window.URL;
    var element = el;
    var opts = {
        autoplay: true,
        mirror: false,
        muted: false,
        audio: false,
        disableContextMenu: false
    };

    if (options) {
        for (item in options) {
            opts[item] = options[item];
        }
    }

    if (!element) {
        element = document.createElement(opts.audio ? 'audio' : 'video');
    } else if (element.tagName.toLowerCase() === 'audio') {
        opts.audio = true;
    }

    if (opts.disableContextMenu) {
        element.oncontextmenu = function (e) {
            e.preventDefault();
        };
    }

    if (opts.autoplay) element.autoplay = 'autoplay';
    if (opts.muted) element.muted = true;
    if (!opts.audio && opts.mirror) {
        ['', 'moz', 'webkit', 'o', 'ms'].forEach(function (prefix) {
            var styleName = prefix ? prefix + 'Transform' : 'transform';
            element.style[styleName] = 'scaleX(-1)';
        });
    }

    adapter.attachMediaStream(element, stream);
    return element;
};

},{"webrtc-adapter-test":2}],2:[function(require,module,exports){
/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */
/* jshint browser: true, camelcase: true, curly: true, devel: true,
   eqeqeq: true, forin: false, globalstrict: true, node: true,
   quotmark: single, undef: true, unused: strict */
/* global mozRTCIceCandidate, mozRTCPeerConnection, Promise,
mozRTCSessionDescription, webkitRTCPeerConnection, MediaStreamTrack */
/* exported trace,requestUserMedia */

'use strict';

var getUserMedia = null;
var attachMediaStream = null;
var reattachMediaStream = null;
var webrtcDetectedBrowser = null;
var webrtcDetectedVersion = null;
var webrtcMinimumVersion = null;
var webrtcUtils = {
  log: function() {
    // suppress console.log output when being included as a module.
    if (!(typeof module !== 'undefined' ||
        typeof require === 'function') && (typeof define === 'function')) {
      console.log.apply(console, arguments);
    }
  }
};

function trace(text) {
  // This function is used for logging.
  if (text[text.length - 1] === '\n') {
    text = text.substring(0, text.length - 1);
  }
  if (window.performance) {
    var now = (window.performance.now() / 1000).toFixed(3);
    webrtcUtils.log(now + ': ' + text);
  } else {
    webrtcUtils.log(text);
  }
}

if (typeof window === 'undefined' || !window.navigator) {
  webrtcUtils.log('This does not appear to be a browser');
  webrtcDetectedBrowser = 'not a browser';
} else if (navigator.mozGetUserMedia) {
  webrtcUtils.log('This appears to be Firefox');

  webrtcDetectedBrowser = 'firefox';

  // the detected firefox version.
  webrtcDetectedVersion =
    parseInt(navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);

  // the minimum firefox version still supported by adapter.
  webrtcMinimumVersion = 31;

  // The RTCPeerConnection object.
  window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    if (webrtcDetectedVersion < 38) {
      // .urls is not supported in FF < 38.
      // create RTCIceServers with a single url.
      if (pcConfig && pcConfig.iceServers) {
        var newIceServers = [];
        for (var i = 0; i < pcConfig.iceServers.length; i++) {
          var server = pcConfig.iceServers[i];
          if (server.hasOwnProperty('urls')) {
            for (var j = 0; j < server.urls.length; j++) {
              var newServer = {
                url: server.urls[j]
              };
              if (server.urls[j].indexOf('turn') === 0) {
                newServer.username = server.username;
                newServer.credential = server.credential;
              }
              newIceServers.push(newServer);
            }
          } else {
            newIceServers.push(pcConfig.iceServers[i]);
          }
        }
        pcConfig.iceServers = newIceServers;
      }
    }
    return new mozRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
  };

  // The RTCSessionDescription object.
  window.RTCSessionDescription = mozRTCSessionDescription;

  // The RTCIceCandidate object.
  window.RTCIceCandidate = mozRTCIceCandidate;

  // getUserMedia constraints shim.
  getUserMedia = function(constraints, onSuccess, onError) {
    var constraintsToFF37 = function(c) {
      if (typeof c !== 'object' || c.require) {
        return c;
      }
      var require = [];
      Object.keys(c).forEach(function(key) {
        if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
          return;
        }
        var r = c[key] = (typeof c[key] === 'object') ?
            c[key] : {ideal: c[key]};
        if (r.min !== undefined ||
            r.max !== undefined || r.exact !== undefined) {
          require.push(key);
        }
        if (r.exact !== undefined) {
          if (typeof r.exact === 'number') {
            r.min = r.max = r.exact;
          } else {
            c[key] = r.exact;
          }
          delete r.exact;
        }
        if (r.ideal !== undefined) {
          c.advanced = c.advanced || [];
          var oc = {};
          if (typeof r.ideal === 'number') {
            oc[key] = {min: r.ideal, max: r.ideal};
          } else {
            oc[key] = r.ideal;
          }
          c.advanced.push(oc);
          delete r.ideal;
          if (!Object.keys(r).length) {
            delete c[key];
          }
        }
      });
      if (require.length) {
        c.require = require;
      }
      return c;
    };
    if (webrtcDetectedVersion < 38) {
      webrtcUtils.log('spec: ' + JSON.stringify(constraints));
      if (constraints.audio) {
        constraints.audio = constraintsToFF37(constraints.audio);
      }
      if (constraints.video) {
        constraints.video = constraintsToFF37(constraints.video);
      }
      webrtcUtils.log('ff37: ' + JSON.stringify(constraints));
    }
    return navigator.mozGetUserMedia(constraints, onSuccess, onError);
  };

  navigator.getUserMedia = getUserMedia;

  // Shim for mediaDevices on older versions.
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {getUserMedia: requestUserMedia,
      addEventListener: function() { },
      removeEventListener: function() { }
    };
  }
  navigator.mediaDevices.enumerateDevices =
      navigator.mediaDevices.enumerateDevices || function() {
    return new Promise(function(resolve) {
      var infos = [
        {kind: 'audioinput', deviceId: 'default', label: '', groupId: ''},
        {kind: 'videoinput', deviceId: 'default', label: '', groupId: ''}
      ];
      resolve(infos);
    });
  };

  if (webrtcDetectedVersion < 41) {
    // Work around http://bugzil.la/1169665
    var orgEnumerateDevices =
        navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = function() {
      return orgEnumerateDevices().catch(function(e) {
        if (e.name === 'NotFoundError') {
          return [];
        }
        throw e;
      });
    };
  }
  // Attach a media stream to an element.
  attachMediaStream = function(element, stream) {
    element.mozSrcObject = stream;
  };

  reattachMediaStream = function(to, from) {
    to.mozSrcObject = from.mozSrcObject;
  };

} else if (navigator.webkitGetUserMedia) {
  webrtcUtils.log('This appears to be Chrome');

  webrtcDetectedBrowser = 'chrome';

  // the detected chrome version.
  webrtcDetectedVersion =
    parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2], 10);

  // the minimum chrome version still supported by adapter.
  webrtcMinimumVersion = 38;

  // The RTCPeerConnection object.
  window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    // Translate iceTransportPolicy to iceTransports,
    // see https://code.google.com/p/webrtc/issues/detail?id=4869
    if (pcConfig && pcConfig.iceTransportPolicy) {
      pcConfig.iceTransports = pcConfig.iceTransportPolicy;
    }

    var pc = new webkitRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
    var origGetStats = pc.getStats.bind(pc);
    pc.getStats = function(selector, successCallback, errorCallback) { // jshint ignore: line
      var self = this;
      var args = arguments;

      // If selector is a function then we are in the old style stats so just
      // pass back the original getStats format to avoid breaking old users.
      if (arguments.length > 0 && typeof selector === 'function') {
        return origGetStats(selector, successCallback);
      }

      var fixChromeStats = function(response) {
        var standardReport = {};
        var reports = response.result();
        reports.forEach(function(report) {
          var standardStats = {
            id: report.id,
            timestamp: report.timestamp,
            type: report.type
          };
          report.names().forEach(function(name) {
            standardStats[name] = report.stat(name);
          });
          standardReport[standardStats.id] = standardStats;
        });

        return standardReport;
      };

      if (arguments.length >= 2) {
        var successCallbackWrapper = function(response) {
          args[1](fixChromeStats(response));
        };

        return origGetStats.apply(this, [successCallbackWrapper, arguments[0]]);
      }

      // promise-support
      return new Promise(function(resolve, reject) {
        origGetStats.apply(self, [resolve, reject]);
      });
    };

    return pc;
  };

  // add promise support
  ['createOffer', 'createAnswer'].forEach(function(method) {
    var nativeMethod = webkitRTCPeerConnection.prototype[method];
    webkitRTCPeerConnection.prototype[method] = function() {
      var self = this;
      if (arguments.length < 1 || (arguments.length === 1 &&
          typeof(arguments[0]) === 'object')) {
        var opts = arguments.length === 1 ? arguments[0] : undefined;
        return new Promise(function(resolve, reject) {
          nativeMethod.apply(self, [resolve, reject, opts]);
        });
      } else {
        return nativeMethod.apply(this, arguments);
      }
    };
  });

  ['setLocalDescription', 'setRemoteDescription',
      'addIceCandidate'].forEach(function(method) {
    var nativeMethod = webkitRTCPeerConnection.prototype[method];
    webkitRTCPeerConnection.prototype[method] = function() {
      var args = arguments;
      var self = this;
      return new Promise(function(resolve, reject) {
        nativeMethod.apply(self, [args[0],
            function() {
              resolve();
              if (args.length >= 2) {
                args[1].apply(null, []);
              }
            },
            function(err) {
              reject(err);
              if (args.length >= 3) {
                args[2].apply(null, [err]);
              }
            }]
          );
      });
    };
  });

  // getUserMedia constraints shim.
  var constraintsToChrome = function(c) {
    if (typeof c !== 'object' || c.mandatory || c.optional) {
      return c;
    }
    var cc = {};
    Object.keys(c).forEach(function(key) {
      if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
        return;
      }
      var r = (typeof c[key] === 'object') ? c[key] : {ideal: c[key]};
      if (r.exact !== undefined && typeof r.exact === 'number') {
        r.min = r.max = r.exact;
      }
      var oldname = function(prefix, name) {
        if (prefix) {
          return prefix + name.charAt(0).toUpperCase() + name.slice(1);
        }
        return (name === 'deviceId') ? 'sourceId' : name;
      };
      if (r.ideal !== undefined) {
        cc.optional = cc.optional || [];
        var oc = {};
        if (typeof r.ideal === 'number') {
          oc[oldname('min', key)] = r.ideal;
          cc.optional.push(oc);
          oc = {};
          oc[oldname('max', key)] = r.ideal;
          cc.optional.push(oc);
        } else {
          oc[oldname('', key)] = r.ideal;
          cc.optional.push(oc);
        }
      }
      if (r.exact !== undefined && typeof r.exact !== 'number') {
        cc.mandatory = cc.mandatory || {};
        cc.mandatory[oldname('', key)] = r.exact;
      } else {
        ['min', 'max'].forEach(function(mix) {
          if (r[mix] !== undefined) {
            cc.mandatory = cc.mandatory || {};
            cc.mandatory[oldname(mix, key)] = r[mix];
          }
        });
      }
    });
    if (c.advanced) {
      cc.optional = (cc.optional || []).concat(c.advanced);
    }
    return cc;
  };

  getUserMedia = function(constraints, onSuccess, onError) {
    if (constraints.audio) {
      constraints.audio = constraintsToChrome(constraints.audio);
    }
    if (constraints.video) {
      constraints.video = constraintsToChrome(constraints.video);
    }
    webrtcUtils.log('chrome: ' + JSON.stringify(constraints));
    return navigator.webkitGetUserMedia(constraints, onSuccess, onError);
  };
  navigator.getUserMedia = getUserMedia;

  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {getUserMedia: requestUserMedia,
                              enumerateDevices: function() {
      return new Promise(function(resolve) {
        var kinds = {audio: 'audioinput', video: 'videoinput'};
        return MediaStreamTrack.getSources(function(devices) {
          resolve(devices.map(function(device) {
            return {label: device.label,
                    kind: kinds[device.kind],
                    deviceId: device.id,
                    groupId: ''};
          }));
        });
      });
    }};
  }

  // A shim for getUserMedia method on the mediaDevices object.
  // TODO(KaptenJansson) remove once implemented in Chrome stable.
  if (!navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      return requestUserMedia(constraints);
    };
  } else {
    // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
    // function which returns a Promise, it does not accept spec-style
    // constraints.
    var origGetUserMedia = navigator.mediaDevices.getUserMedia.
        bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function(c) {
      webrtcUtils.log('spec:   ' + JSON.stringify(c)); // whitespace for alignment
      c.audio = constraintsToChrome(c.audio);
      c.video = constraintsToChrome(c.video);
      webrtcUtils.log('chrome: ' + JSON.stringify(c));
      return origGetUserMedia(c);
    };
  }

  // Dummy devicechange event methods.
  // TODO(KaptenJansson) remove once implemented in Chrome stable.
  if (typeof navigator.mediaDevices.addEventListener === 'undefined') {
    navigator.mediaDevices.addEventListener = function() {
      webrtcUtils.log('Dummy mediaDevices.addEventListener called.');
    };
  }
  if (typeof navigator.mediaDevices.removeEventListener === 'undefined') {
    navigator.mediaDevices.removeEventListener = function() {
      webrtcUtils.log('Dummy mediaDevices.removeEventListener called.');
    };
  }

  // Attach a media stream to an element.
  attachMediaStream = function(element, stream) {
    if (typeof element.srcObject !== 'undefined') {
      element.srcObject = stream;
    } else if (typeof element.src !== 'undefined') {
      element.src = URL.createObjectURL(stream);
    } else {
      webrtcUtils.log('Error attaching stream to element.');
    }
  };

  reattachMediaStream = function(to, from) {
    to.src = from.src;
  };

} else if (navigator.mediaDevices && navigator.userAgent.match(
    /Edge\/(\d+).(\d+)$/)) {
  webrtcUtils.log('This appears to be Edge');
  webrtcDetectedBrowser = 'edge';

  webrtcDetectedVersion =
    parseInt(navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)[2], 10);

  // the minimum version still supported by adapter.
  webrtcMinimumVersion = 12;

  getUserMedia = navigator.getUserMedia;

  attachMediaStream = function(element, stream) {
    element.srcObject = stream;
  };
  reattachMediaStream = function(to, from) {
    to.srcObject = from.srcObject;
  };
} else {
  webrtcUtils.log('Browser does not appear to be WebRTC-capable');
}

// Returns the result of getUserMedia as a Promise.
function requestUserMedia(constraints) {
  return new Promise(function(resolve, reject) {
    getUserMedia(constraints, resolve, reject);
  });
}

var webrtcTesting = {};
Object.defineProperty(webrtcTesting, 'version', {
  set: function(version) {
    webrtcDetectedVersion = version;
  }
});

if (typeof module !== 'undefined') {
  var RTCPeerConnection;
  if (typeof window !== 'undefined') {
    RTCPeerConnection = window.RTCPeerConnection;
  }
  module.exports = {
    RTCPeerConnection: RTCPeerConnection,
    getUserMedia: getUserMedia,
    attachMediaStream: attachMediaStream,
    reattachMediaStream: reattachMediaStream,
    webrtcDetectedBrowser: webrtcDetectedBrowser,
    webrtcDetectedVersion: webrtcDetectedVersion,
    webrtcMinimumVersion: webrtcMinimumVersion,
    webrtcTesting: webrtcTesting
    //requestUserMedia: not exposed on purpose.
    //trace: not exposed on purpose.
  };
} else if ((typeof require === 'function') && (typeof define === 'function')) {
  // Expose objects and functions when RequireJS is doing the loading.
  define([], function() {
    return {
      RTCPeerConnection: window.RTCPeerConnection,
      getUserMedia: getUserMedia,
      attachMediaStream: attachMediaStream,
      reattachMediaStream: reattachMediaStream,
      webrtcDetectedBrowser: webrtcDetectedBrowser,
      webrtcDetectedVersion: webrtcDetectedVersion,
      webrtcMinimumVersion: webrtcMinimumVersion,
      webrtcTesting: webrtcTesting
      //requestUserMedia: not exposed on purpose.
      //trace: not exposed on purpose.
    };
  });
}

},{}],3:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":4}],4:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":5}],5:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = '' + str;
  if (str.length > 10000) return;
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],6:[function(require,module,exports){
/*!
 * EventEmitter2
 * https://github.com/hij1nx/EventEmitter2
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
;!function(undefined) {

  var isArray = Array.isArray ? Array.isArray : function _isArray(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
  var defaultMaxListeners = 10;

  function init() {
    this._events = {};
    if (this._conf) {
      configure.call(this, this._conf);
    }
  }

  function configure(conf) {
    if (conf) {

      this._conf = conf;

      conf.delimiter && (this.delimiter = conf.delimiter);
      conf.maxListeners && (this._events.maxListeners = conf.maxListeners);
      conf.wildcard && (this.wildcard = conf.wildcard);
      conf.newListener && (this.newListener = conf.newListener);

      if (this.wildcard) {
        this.listenerTree = {};
      }
    }
  }

  function EventEmitter(conf) {
    this._events = {};
    this.newListener = false;
    configure.call(this, conf);
  }

  //
  // Attention, function return type now is array, always !
  // It has zero elements if no any matches found and one or more
  // elements (leafs) if there are matches
  //
  function searchListenerTree(handlers, type, tree, i) {
    if (!tree) {
      return [];
    }
    var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached,
        typeLength = type.length, currentType = type[i], nextType = type[i+1];
    if (i === typeLength && tree._listeners) {
      //
      // If at the end of the event(s) list and the tree has listeners
      // invoke those listeners.
      //
      if (typeof tree._listeners === 'function') {
        handlers && handlers.push(tree._listeners);
        return [tree];
      } else {
        for (leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {
          handlers && handlers.push(tree._listeners[leaf]);
        }
        return [tree];
      }
    }

    if ((currentType === '*' || currentType === '**') || tree[currentType]) {
      //
      // If the event emitted is '*' at this part
      // or there is a concrete match at this patch
      //
      if (currentType === '*') {
        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+1));
          }
        }
        return listeners;
      } else if(currentType === '**') {
        endReached = (i+1 === typeLength || (i+2 === typeLength && nextType === '*'));
        if(endReached && tree._listeners) {
          // The next element has a _listeners, add it to the handlers.
          listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));
        }

        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            if(branch === '*' || branch === '**') {
              if(tree[branch]._listeners && !endReached) {
                listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));
              }
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            } else if(branch === nextType) {
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+2));
            } else {
              // No match on this one, shift into the tree but not in the type array.
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            }
          }
        }
        return listeners;
      }

      listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i+1));
    }

    xTree = tree['*'];
    if (xTree) {
      //
      // If the listener tree will allow any match for this part,
      // then recursively explore all branches of the tree
      //
      searchListenerTree(handlers, type, xTree, i+1);
    }

    xxTree = tree['**'];
    if(xxTree) {
      if(i < typeLength) {
        if(xxTree._listeners) {
          // If we have a listener on a '**', it will catch all, so add its handler.
          searchListenerTree(handlers, type, xxTree, typeLength);
        }

        // Build arrays of matching next branches and others.
        for(branch in xxTree) {
          if(branch !== '_listeners' && xxTree.hasOwnProperty(branch)) {
            if(branch === nextType) {
              // We know the next element will match, so jump twice.
              searchListenerTree(handlers, type, xxTree[branch], i+2);
            } else if(branch === currentType) {
              // Current node matches, move into the tree.
              searchListenerTree(handlers, type, xxTree[branch], i+1);
            } else {
              isolatedBranch = {};
              isolatedBranch[branch] = xxTree[branch];
              searchListenerTree(handlers, type, { '**': isolatedBranch }, i+1);
            }
          }
        }
      } else if(xxTree._listeners) {
        // We have reached the end and still on a '**'
        searchListenerTree(handlers, type, xxTree, typeLength);
      } else if(xxTree['*'] && xxTree['*']._listeners) {
        searchListenerTree(handlers, type, xxTree['*'], typeLength);
      }
    }

    return listeners;
  }

  function growListenerTree(type, listener) {

    type = typeof type === 'string' ? type.split(this.delimiter) : type.slice();

    //
    // Looks for two consecutive '**', if so, don't add the event at all.
    //
    for(var i = 0, len = type.length; i+1 < len; i++) {
      if(type[i] === '**' && type[i+1] === '**') {
        return;
      }
    }

    var tree = this.listenerTree;
    var name = type.shift();

    while (name) {

      if (!tree[name]) {
        tree[name] = {};
      }

      tree = tree[name];

      if (type.length === 0) {

        if (!tree._listeners) {
          tree._listeners = listener;
        }
        else if(typeof tree._listeners === 'function') {
          tree._listeners = [tree._listeners, listener];
        }
        else if (isArray(tree._listeners)) {

          tree._listeners.push(listener);

          if (!tree._listeners.warned) {

            var m = defaultMaxListeners;

            if (typeof this._events.maxListeners !== 'undefined') {
              m = this._events.maxListeners;
            }

            if (m > 0 && tree._listeners.length > m) {

              tree._listeners.warned = true;
              console.error('(node) warning: possible EventEmitter memory ' +
                            'leak detected. %d listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit.',
                            tree._listeners.length);
              console.trace();
            }
          }
        }
        return true;
      }
      name = type.shift();
    }
    return true;
  }

  // By default EventEmitters will print a warning if more than
  // 10 listeners are added to it. This is a useful default which
  // helps finding memory leaks.
  //
  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.

  EventEmitter.prototype.delimiter = '.';

  EventEmitter.prototype.setMaxListeners = function(n) {
    this._events || init.call(this);
    this._events.maxListeners = n;
    if (!this._conf) this._conf = {};
    this._conf.maxListeners = n;
  };

  EventEmitter.prototype.event = '';

  EventEmitter.prototype.once = function(event, fn) {
    this.many(event, 1, fn);
    return this;
  };

  EventEmitter.prototype.many = function(event, ttl, fn) {
    var self = this;

    if (typeof fn !== 'function') {
      throw new Error('many only accepts instances of Function');
    }

    function listener() {
      if (--ttl === 0) {
        self.off(event, listener);
      }
      fn.apply(this, arguments);
    }

    listener._origin = fn;

    this.on(event, listener);

    return self;
  };

  EventEmitter.prototype.emit = function() {

    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener' && !this.newListener) {
      if (!this._events.newListener) { return false; }
    }

    // Loop through the *_all* functions and invoke them.
    if (this._all) {
      var l = arguments.length;
      var args = new Array(l - 1);
      for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
      for (i = 0, l = this._all.length; i < l; i++) {
        this.event = type;
        this._all[i].apply(this, args);
      }
    }

    // If there is no 'error' event listener then throw.
    if (type === 'error') {

      if (!this._all &&
        !this._events.error &&
        !(this.wildcard && this.listenerTree.error)) {

        if (arguments[1] instanceof Error) {
          throw arguments[1]; // Unhandled 'error' event
        } else {
          throw new Error("Uncaught, unspecified 'error' event.");
        }
        return false;
      }
    }

    var handler;

    if(this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    }
    else {
      handler = this._events[type];
    }

    if (typeof handler === 'function') {
      this.event = type;
      if (arguments.length === 1) {
        handler.call(this);
      }
      else if (arguments.length > 1)
        switch (arguments.length) {
          case 2:
            handler.call(this, arguments[1]);
            break;
          case 3:
            handler.call(this, arguments[1], arguments[2]);
            break;
          // slower
          default:
            var l = arguments.length;
            var args = new Array(l - 1);
            for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
            handler.apply(this, args);
        }
      return true;
    }
    else if (handler) {
      var l = arguments.length;
      var args = new Array(l - 1);
      for (var i = 1; i < l; i++) args[i - 1] = arguments[i];

      var listeners = handler.slice();
      for (var i = 0, l = listeners.length; i < l; i++) {
        this.event = type;
        listeners[i].apply(this, args);
      }
      return (listeners.length > 0) || !!this._all;
    }
    else {
      return !!this._all;
    }

  };

  EventEmitter.prototype.on = function(type, listener) {

    if (typeof type === 'function') {
      this.onAny(type);
      return this;
    }

    if (typeof listener !== 'function') {
      throw new Error('on only accepts instances of Function');
    }
    this._events || init.call(this);

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    this.emit('newListener', type, listener);

    if(this.wildcard) {
      growListenerTree.call(this, type, listener);
      return this;
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    }
    else if(typeof this._events[type] === 'function') {
      // Adding the second element, need to change to array.
      this._events[type] = [this._events[type], listener];
    }
    else if (isArray(this._events[type])) {
      // If we've already got an array, just append.
      this._events[type].push(listener);

      // Check for listener leak
      if (!this._events[type].warned) {

        var m = defaultMaxListeners;

        if (typeof this._events.maxListeners !== 'undefined') {
          m = this._events.maxListeners;
        }

        if (m > 0 && this._events[type].length > m) {

          this._events[type].warned = true;
          console.error('(node) warning: possible EventEmitter memory ' +
                        'leak detected. %d listeners added. ' +
                        'Use emitter.setMaxListeners() to increase limit.',
                        this._events[type].length);
          console.trace();
        }
      }
    }
    return this;
  };

  EventEmitter.prototype.onAny = function(fn) {

    if (typeof fn !== 'function') {
      throw new Error('onAny only accepts instances of Function');
    }

    if(!this._all) {
      this._all = [];
    }

    // Add the function to the event listener collection.
    this._all.push(fn);
    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype.off = function(type, listener) {
    if (typeof listener !== 'function') {
      throw new Error('removeListener only takes instances of Function');
    }

    var handlers,leafs=[];

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);
    }
    else {
      // does not use listeners(), so no side effect of creating _events[type]
      if (!this._events[type]) return this;
      handlers = this._events[type];
      leafs.push({_listeners:handlers});
    }

    for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
      var leaf = leafs[iLeaf];
      handlers = leaf._listeners;
      if (isArray(handlers)) {

        var position = -1;

        for (var i = 0, length = handlers.length; i < length; i++) {
          if (handlers[i] === listener ||
            (handlers[i].listener && handlers[i].listener === listener) ||
            (handlers[i]._origin && handlers[i]._origin === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0) {
          continue;
        }

        if(this.wildcard) {
          leaf._listeners.splice(position, 1);
        }
        else {
          this._events[type].splice(position, 1);
        }

        if (handlers.length === 0) {
          if(this.wildcard) {
            delete leaf._listeners;
          }
          else {
            delete this._events[type];
          }
        }
        return this;
      }
      else if (handlers === listener ||
        (handlers.listener && handlers.listener === listener) ||
        (handlers._origin && handlers._origin === listener)) {
        if(this.wildcard) {
          delete leaf._listeners;
        }
        else {
          delete this._events[type];
        }
      }
    }

    return this;
  };

  EventEmitter.prototype.offAny = function(fn) {
    var i = 0, l = 0, fns;
    if (fn && this._all && this._all.length > 0) {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++) {
        if(fn === fns[i]) {
          fns.splice(i, 1);
          return this;
        }
      }
    } else {
      this._all = [];
    }
    return this;
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function(type) {
    if (arguments.length === 0) {
      !this._events || init.call(this);
      return this;
    }

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      var leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);

      for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
        var leaf = leafs[iLeaf];
        leaf._listeners = null;
      }
    }
    else {
      if (!this._events[type]) return this;
      this._events[type] = null;
    }
    return this;
  };

  EventEmitter.prototype.listeners = function(type) {
    if(this.wildcard) {
      var handlers = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handlers, ns, this.listenerTree, 0);
      return handlers;
    }

    this._events || init.call(this);

    if (!this._events[type]) this._events[type] = [];
    if (!isArray(this._events[type])) {
      this._events[type] = [this._events[type]];
    }
    return this._events[type];
  };

  EventEmitter.prototype.listenersAny = function() {

    if(this._all) {
      return this._all;
    }
    else {
      return [];
    }

  };

  if (typeof define === 'function' && define.amd) {
     // AMD. Register as an anonymous module.
    define(function() {
      return EventEmitter;
    });
  } else if (typeof exports === 'object') {
    // CommonJS
    exports.EventEmitter2 = EventEmitter;
  }
  else {
    // Browser global.
    window.EventEmitter2 = EventEmitter;
  }
}();

},{}],7:[function(require,module,exports){
/* globals define */
;(function(define){'use strict';define(function(require,exports,module){
/**
 * Locals
 */
var textContent = Object.getOwnPropertyDescriptor(Node.prototype,
    'textContent');
var innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
var removeAttribute = Element.prototype.removeAttribute;
var setAttribute = Element.prototype.setAttribute;
var noop  = function() {};

/**
 * Register a new component.
 *
 * @param  {String} name
 * @param  {Object} props
 * @return {constructor}
 * @public
 */
exports.register = function(name, props) {
  var baseProto = getBaseProto(props.extends);
  var template = props.template || baseProto.templateString;

  // Components are extensible by default but can be declared
  // as non extensible as an optimization to avoid
  // storing the template strings
  var extensible = props.extensible = props.hasOwnProperty('extensible')?
    props.extensible : true;

  // Clean up
  delete props.extends;

  // Pull out CSS that needs to be in the light-dom
  if (template) {
    // Stores the string to be reprocessed when
    // a new component extends this one
    if (extensible && props.template) {
      props.templateString = props.template;
    }

    var output = processCss(template, name);

    props.template = document.createElement('template');
    props.template.innerHTML = output.template;
    props.lightCss = output.lightCss;

    props.globalCss = props.globalCss || '';
    props.globalCss += output.globalCss;
  }

  // Inject global CSS into the document,
  // and delete as no longer needed
  injectGlobalCss(props.globalCss);
  delete props.globalCss;

  // Merge base getter/setter attributes with the user's,
  // then define the property descriptors on the prototype.
  var descriptors = mixin(props.attrs || {}, base.descriptors);

  // Store the orginal descriptors somewhere
  // a little more private and delete the original
  props._attrs = props.attrs;
  delete props.attrs;

  // Create the prototype, extended from base and
  // define the descriptors directly on the prototype
  var proto = createProto(baseProto, props);
  Object.defineProperties(proto, descriptors);

  // Register the custom-element and return the constructor
  try {
    return document.registerElement(name, { prototype: proto });
  } catch (e) {
    if (e.name !== 'NotSupportedError') {
      throw e;
    }
  }
};

var base = {
  properties: {
    GaiaComponent: true,
    attributeChanged: noop,
    attached: noop,
    detached: noop,
    created: noop,

    createdCallback: function() {
      if (this.rtl) { addDirObserver(); }
      injectLightCss(this);
      this.created();
    },

    /**
     * It is very common to want to keep object
     * properties in-sync with attributes,
     * for example:
     *
     *   el.value = 'foo';
     *   el.setAttribute('value', 'foo');
     *
     * So we support an object on the prototype
     * named 'attrs' to provide a consistent
     * way for component authors to define
     * these properties. When an attribute
     * changes we keep the attr[name]
     * up-to-date.
     *
     * @param  {String} name
     * @param  {String||null} from
     * @param  {String||null} to
     */
    attributeChangedCallback: function(name, from, to) {
      var prop = toCamelCase(name);
      if (this._attrs && this._attrs[prop]) { this[prop] = to; }
      this.attributeChanged(name, from, to);
    },

    attachedCallback: function() { this.attached(); },
    detachedCallback: function() { this.detached(); },

    /**
     * A convenient method for setting up
     * a shadow-root using the defined template.
     *
     * @return {ShadowRoot}
     */
    setupShadowRoot: function() {
      if (!this.template) { return; }
      var node = document.importNode(this.template.content, true);
      this.createShadowRoot().appendChild(node);
      return this.shadowRoot;
    },

    /**
     * Sets an attribute internally
     * and externally. This is so that
     * we can style internal shadow-dom
     * content.
     *
     * @param {String} name
     * @param {String} value
     */
    setAttr: function(name, value) {
      var internal = this.shadowRoot.firstElementChild;
      setAttribute.call(internal, name, value);
      setAttribute.call(this, name, value);
    },

    /**
     * Removes an attribute internally
     * and externally. This is so that
     * we can style internal shadow-dom
     * content.
     *
     * @param {String} name
     * @param {String} value
     */
    removeAttr: function(name) {
      var internal = this.shadowRoot.firstElementChild;
      removeAttribute.call(internal, name);
      removeAttribute.call(this, name);
    }
  },

  descriptors: {
    textContent: {
      set: function(value) {
        textContent.set.call(this, value);
        if (this.lightStyle) { this.appendChild(this.lightStyle); }
      },

      get: function() {
        return textContent.get();
      }
    },

    innerHTML: {
      set: function(value) {
        innerHTML.set.call(this, value);
        if (this.lightStyle) { this.appendChild(this.lightStyle); }
      },

      get: innerHTML.get
    }
  }
};

/**
 * The default base prototype to use
 * when `extends` is undefined.
 *
 * @type {Object}
 */
var defaultPrototype = createProto(HTMLElement.prototype, base.properties);

/**
 * Returns a suitable prototype based
 * on the object passed.
 *
 * @private
 * @param  {HTMLElementPrototype|undefined} proto
 * @return {HTMLElementPrototype}
 */
function getBaseProto(proto) {
  if (!proto) { return defaultPrototype; }
  proto = proto.prototype || proto;
  return !proto.GaiaComponent ?
    createProto(proto, base.properties) : proto;
}

/**
 * Extends the given proto and mixes
 * in the given properties.
 *
 * @private
 * @param  {Object} proto
 * @param  {Object} props
 * @return {Object}
 */
function createProto(proto, props) {
  return mixin(Object.create(proto), props);
}

/**
 * Detects presence of shadow-dom
 * CSS selectors.
 *
 * @private
 * @return {Boolean}
 */
var hasShadowCSS = (function() {
  var div = document.createElement('div');
  try { div.querySelector(':host'); return true; }
  catch (e) { return false; }
})();

/**
 * Regexs used to extract shadow-css
 *
 * @type {Object}
 */
var regex = {
  shadowCss: /(?:\:host|\:\:content)[^{]*\{[^}]*\}/g,
  ':host': /(?:\:host)/g,
  ':host()': /\:host\((.+)\)(?: \:\:content)?/g,
  ':host-context': /\:host-context\((.+)\)([^{,]+)?/g,
  '::content': /(?:\:\:content)/g
};

/**
 * Extracts the :host and ::content rules
 * from the shadow-dom CSS and rewrites
 * them to work from the <style scoped>
 * injected at the root of the component.
 *
 * @private
 * @return {String}
 */
function processCss(template, name) {
  var globalCss = '';
  var lightCss = '';

  if (!hasShadowCSS) {
    template = template.replace(regex.shadowCss, function(match) {
      var hostContext = regex[':host-context'].exec(match);

      if (hostContext) {
        globalCss += match
          .replace(regex['::content'], '')
          .replace(regex[':host-context'], '$1 ' + name + '$2')
          .replace(/ +/g, ' '); // excess whitespace
      } else {
        lightCss += match
          .replace(regex[':host()'], name + '$1')
          .replace(regex[':host'], name)
          .replace(regex['::content'], name);
      }

      return '';
    });
  }

  return {
    template: template,
    lightCss: lightCss,
    globalCss: globalCss
  };
}

/**
 * Some CSS rules, such as @keyframes
 * and @font-face don't work inside
 * scoped or shadow <style>. So we
 * have to put them into 'global'
 * <style> in the head of the
 * document.
 *
 * @private
 * @param  {String} css
 */
function injectGlobalCss(css) {
  if (!css) {return;}
  var style = document.createElement('style');
  style.innerHTML = css.trim();
  headReady().then(function() {
    document.head.appendChild(style);
  });
}


/**
 * Resolves a promise once document.head is ready.
 *
 * @private
 */
function headReady() {
  return new Promise(function(resolve) {
    if (document.head) { return resolve(); }
    window.addEventListener('load', function fn() {
      window.removeEventListener('load', fn);
      resolve();
    });
  });
}


/**
 * The Gecko platform doesn't yet have
 * `::content` or `:host`, selectors,
 * without these we are unable to style
 * user-content in the light-dom from
 * within our shadow-dom style-sheet.
 *
 * To workaround this, we clone the <style>
 * node into the root of the component,
 * so our selectors are able to target
 * light-dom content.
 *
 * @private
 */
function injectLightCss(el) {
  if (hasShadowCSS) { return; }
  el.lightStyle = document.createElement('style');
  el.lightStyle.setAttribute('scoped', '');
  el.lightStyle.innerHTML = el.lightCss;
  el.appendChild(el.lightStyle);
}

/**
 * Convert hyphen separated
 * string to camel-case.
 *
 * Example:
 *
 *   toCamelCase('foo-bar'); //=> 'fooBar'
 *
 * @private
 * @param  {Sring} string
 * @return {String}
 */
function toCamelCase(string) {
  return string.replace(/-(.)/g, function replacer(string, p1) {
    return p1.toUpperCase();
  });
}

/**
 * Observer (singleton)
 *
 * @type {MutationObserver|undefined}
 */
var dirObserver;

/**
 * Observes the document `dir` (direction)
 * attribute and dispatches a global event
 * when it changes.
 *
 * Components can listen to this event and
 * make internal changes if need be.
 *
 * @private
 */
function addDirObserver() {
  if (dirObserver) { return; }

  dirObserver = new MutationObserver(onChanged);
  dirObserver.observe(document.documentElement, {
    attributeFilter: ['dir'],
    attributes: true
  });

  function onChanged(mutations) {
    document.dispatchEvent(new Event('dirchanged'));
  }
}

/**
 * Copy the values of all properties from
 * source object `target` to a target object `source`.
 * It will return the target object.
 *
 * @private
 * @param   {Object} target
 * @param   {Object} source
 * @returns {Object}
 */
function mixin(target, source) {
  for (var key in source) {
    target[key] = source[key];
  }
  return target;
}

});})(typeof define=='function'&&define.amd?define
:(function(n,w){'use strict';return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('gaia-component',this));

},{}],8:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],9:[function(require,module,exports){
/* global define */
;(function(define){'use strict';define(function(require,exports,module){

/**
 * Dependencies
 */

var GaiaDialogProto = require('gaia-dialog').prototype;
var component = require('gaia-component');

/**
 * Exports
 */
module.exports = component.register('gaia-dialog-alert', {
  created: function() {
    this.setupShadowRoot();
    this.els = {
      dialog: this.shadowRoot.querySelector('gaia-dialog')
    };
    this.els.dialog.addEventListener('closed',
      GaiaDialogProto.hide.bind(this));
  },

  open: function(e) {
    return GaiaDialogProto.show.call(this)
      .then(() => this.els.dialog.open(e));
  },

  close: function() {
    return this.els.dialog.close()
      .then(GaiaDialogProto.hide.bind(this));
  },

  template: `
    <gaia-dialog>
      <section>
        <p><content></content></p>
      </section>
      <div>
        <button class="submit primary" on-click="close">Ok</button>
      </div>
    </gaia-dialog>

    <style>

    :host {
      display: none;
      position: fixed;
      width: 100%;
      height: 100%;
    }

    </style>`
});

});})(typeof define=='function'&&define.amd?define
:(function(n,w){'use strict';return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('gaia-dialog-alert',this));

},{"gaia-component":8,"gaia-dialog":10}],10:[function(require,module,exports){
;(function(define){'use strict';define((require,exports,module) => {

/**
 * Dependencies
 */
var component = require('gaia-component');

/**
 * Simple logger (toggle 0)
 *
 * @type {Function}
 */
var debug = 0 ? console.log.bind(console) : () => {};

/**
 * Use the dom-scheduler if it's around,
 * else fallback to fake shim.
 *
 * @type {Object}
 */
var schedule = window.scheduler || {
  mutation: block => Promise.resolve(block()),
  transition: (block, el, event, timeout) => {
    block();
    return after(el, event, timeout || 500);
  }
};

/**
 * Exports
 */

module.exports = component.register('gaia-dialog', {
  created() {
    this.setupShadowRoot();

    this.els = {
      inner: this.shadowRoot.querySelector('.dialog-inner'),
      background: this.shadowRoot.querySelector('.background'),
      window: this.shadowRoot.querySelector('.window')
    };

    this.shadowRoot.addEventListener('click', e => this.onClick(e));
  },

  onClick(e) {
    var el = e.target.closest('[on-click]');
    if (!el) { return; }
    debug('onClick');
    var method = el.getAttribute('on-click');
    if (typeof this[method] == 'function') { this[method](); }
  },

  open(options) {
    if (this.isOpen) { return; }
    debug('open dialog');
    this.isOpen = true;

    this.show()
      .then(() => this.animateBackgroundIn(options))
      .then(() => this.animateWindowIn())
      .then(() => this.dispatch('opened'));
  },

  close(options) {
    if (!this.isOpen) { return; }
    debug('close dialog');
    this.isOpen = false;

    this.animateWindowOut()
      .then(() => this.animateBackgroundOut())
      .then(() => this.hide())
      .then(() => this.dispatch('closed'));
  },

  animateBackgroundIn(options) {
    if (options) { return this.animateBackgroundInFrom(options); }

    var el = this.els.background;
    return schedule.transition(() => {
      debug('animate background in');
      el.classList.remove('animate-out');
      el.classList.add('animate-in');
    }, el, 'animationend');
  },

  animateBackgroundOut() {
    var el = this.els.background;
    return schedule.transition(() => {
      debug('animate background out');
      el.classList.add('animate-out');
      el.classList.remove('animate-in');
    }, el, 'animationend')
      .then(() => el.style = '');
  },

  animateBackgroundInFrom(pos) {
    var el = this.els.background;
    var scale = Math.sqrt(window.innerWidth * window.innerHeight) / 15;
    var duration = scale * 9;

    return schedule.mutation(() => {
        el.classList.add('circular');
        el.classList.remove('animate-out');
        el.style.transform = `translate(${pos.clientX}px, ${pos.clientY}px)`;
        el.style.transitionDuration = duration + 'ms';
        el.offsetTop; // Hack, any ideas?
      })

      .then(() => {
        return schedule.transition(() => {
          debug('animate background in from', pos);
          el.style.transform += ` scale(${scale})`;
          el.style.opacity = 1;
        }, el, 'transitionend', duration * 1.5);
      });
  },

  show() {
    return schedule.mutation(() => {
      debug('show');
      this.style.display = 'block';
    });
  },

  hide() {
    return schedule.mutation(() => {
      debug('hide');
      this.style.display = 'none';
    });
  },

  animateWindowIn() {
    var el = this.els.window;
    return schedule.transition(() => {
      debug('animate window in');
      el.classList.add('animate-in');
      el.classList.remove('animate-out');
    }, el, 'animationend');
  },

  animateWindowOut() {
    var el = this.els.window;
    return schedule.transition(() => {
      debug('animate window out');
      el.classList.add('animate-out');
      el.classList.remove('animate-in');
    }, el, 'animationend');
  },

  dispatch(name) {
    this.dispatchEvent(new CustomEvent(name));
  },

  attrs: {
    opened: {
      get: function() { return !!this.isOpen; },
      set: function(value) {
        value = value === '' || value;
        if (!value) { this.close(); }
        else { this.open(); }
      }
    }
  },

  template: `
    <div class="dialog-inner">
      <div class="background" on-click="close"></div>
      <div class="window"><content></content></div>
    </div>

    <style>

    ::content * {
      box-sizing: border-box;
      font-weight: inherit;
      font-size: inherit;
    }

    ::content p,
    ::content h1,
    ::content h2,
    ::content h3,
    ::content h4,
    ::content button,
    ::content fieldset {
      padding: 0;
      margin: 0;
      border: 0;
    }

    :host {
      display: none;
      position: fixed;
      top: 0px; left: 0px;
      width: 100%;
      height: 100%;
      z-index: 200;
      font-style: italic;
      text-align: center;

      overflow: hidden;
    }

    /** Inner
     ---------------------------------------------------------*/

    .dialog-inner {
      display: flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
    }

    /** Background
     ---------------------------------------------------------*/

    .background {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      background: rgba(199,199,199,0.85);
    }

    /**
     * .circular
     */

    .background.circular {
      width: 40px;
      height: 40px;
      margin: -20px;
      border-radius: 50%;
      will-change: transform, opacity;
      transition-property: opacity, transform;
      transition-timing-function: linear;
    }

    /**
     * .animate-in
     */

    .background.animate-in {
      animation-name: gaia-dialog-fade-in;
      animation-duration: 260ms;
      animation-fill-mode: forwards;
    }

    /**
     * .animate-out
     */

    .background.animate-out {
      animation-name: gaia-dialog-fade-out;
      animation-duration: 260ms;
      animation-fill-mode: forwards;
      opacity: 1;
    }

    /** Window
     ---------------------------------------------------------*/

    .window {
      position: relative;
      width: 90%;
      max-width: 350px;
      margin: auto;
      box-shadow: 0 1px 0 0px rgba(0,0,0,0.15);
      background: var(--color-iota);
      transition: opacity 300ms;
      opacity: 0;
    }

    .window.animate-in {
      animation-name: gaia-dialog-entrance;
      animation-duration: 300ms;
      animation-timing-function: cubic-bezier(0.175, 0.885, 0.320, 1.275);
      animation-fill-mode: forwards;
      opacity: 1;
    }

    .window.animate-out {
      animation-name: gaia-dialog-fade-out;
      animation-duration: 150ms;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
      opacity: 1;
    }

    /** Title
     ---------------------------------------------------------*/

    ::content h1 {
      padding: 16px;
      font-size: 23px;
      line-height: 26px;
      font-weight: 200;
      font-style: italic;
      color: #858585;
    }

    ::content strong {
      font-weight: 700;
    }

    ::content small {
      font-size: 0.8em;
    }

    /** Section
     ---------------------------------------------------------*/

    ::content section {
      padding: 33px 18px;
      color: #858585;
    }

    ::content section > *:not(:last-child) {
      margin-bottom: 13px;
    }

    /** Paragraphs
     ---------------------------------------------------------*/

    ::content p {
      text-align: -moz-start;
    }

    /** Buttons
     ---------------------------------------------------------*/

    ::content button {
      position: relative;
      display: block;
      width: 100%;
      height: 50px;
      margin: 0;
      border: 0;
      padding: 0rem 16px;
      cursor: pointer;
      font: inherit;
      background: var(--color-beta);
      color: var(--color-epsilon);
      transition: all 200ms;
      transition-delay: 300ms;
      border-radius: 0;
    }

    /**
     * .primary
     */

    ::content button.primary {
      color: var(--highlight-color);
    }

    /**
     * .danger
     */

    ::content button.danger {
      color: var(--color-destructive);
    }

    /**
     * Disabled buttons
     */

    ::content button[disabled] {
      color: var(--color-zeta);
    }

    /** Button Divider Line
     ---------------------------------------------------------*/

    ::content button:after {
      content: '';
      display: block;
      position: absolute;
      height: 1px;
      left: 6px;
      right: 6px;
      top: 49px;
      background: #E7E7E7;
    }

    ::content button:last-of-type:after {
      display: none;
    }

    ::content button:active {
      background-color: var(--highlight-color);
      color: #fff;
      transition: none;
    }

    ::content button:active:after {
      background: var(--highlight-color);
      transition: none;
    }

    ::content button[data-icon]:before {
      float: left;
    }

    /** Fieldset (button group)
     ---------------------------------------------------------*/

    ::content fieldset {
      overflow: hidden;
    }

    ::content fieldset button {
      position: relative;
      float: left;
      width: 50%;
    }

    ::content fieldset button:after {
      content: '';
      display: block;
      position: absolute;
      top: 6px;
      bottom: 6px;
      right: 0px;
      left: auto;
      width: 1px;
      height: calc(100% - 12px);
      background: #e7e7e7;
      transition: all 200ms;
      transition-delay: 200ms;
    }

    </style>`,

  globalCss: `
    @keyframes gaia-dialog-entrance {
      0% { transform: translateY(100px); }
      100% { transform: translateY(0px); }
    }

    @keyframes gaia-dialog-fade-in {
      0% { opacity: 0 }
      100% { opacity: 1 }
    }

    @keyframes gaia-dialog-fade-out {
      0% { opacity: 1 }
      100% { opacity: 0 }
    }`
});

/**
 * Utils
 */

function after(target, event, timeout) {
  return new Promise(resolve => {
    var timer = timeout && setTimeout(cb, timeout);
    target.addEventListener(event, cb);
    function cb() {
      target.removeEventListener(event, cb);
      clearTimeout(timer);
      resolve();
    }
  });
}

});})(typeof define=='function'&&define.amd?define
:(function(n,w){'use strict';return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('gaia-dialog',this));

},{"gaia-component":8}],11:[function(require,module,exports){
// getUserMedia helper by @HenrikJoreteg
var adapter = require('webrtc-adapter-test');

module.exports = function (constraints, cb) {
    var options, error;
    var haveOpts = arguments.length === 2;
    var defaultOpts = {video: true, audio: true};

    var denied = 'PermissionDeniedError';
    var altDenied = 'PERMISSION_DENIED';
    var notSatisfied = 'ConstraintNotSatisfiedError';

    // make constraints optional
    if (!haveOpts) {
        cb = constraints;
        constraints = defaultOpts;
    }

    // treat lack of browser support like an error
    if (!navigator.getUserMedia) {
        // throw proper error per spec
        error = new Error('MediaStreamError');
        error.name = 'NotSupportedError';

        // keep all callbacks async
        return window.setTimeout(function () {
            cb(error);
        }, 0);
    }

    // normalize error handling when no media types are requested
    if (!constraints.audio && !constraints.video) {
        error = new Error('MediaStreamError');
        error.name = 'NoMediaRequestedError';

        // keep all callbacks async
        return window.setTimeout(function () {
            cb(error);
        }, 0);
    }

    if (localStorage && localStorage.useFirefoxFakeDevice === "true") {
        constraints.fake = true;
    }

    navigator.getUserMedia(constraints, function (stream) {
        cb(null, stream);
    }, function (err) {
        var error;
        // coerce into an error object since FF gives us a string
        // there are only two valid names according to the spec
        // we coerce all non-denied to "constraint not satisfied".
        if (typeof err === 'string') {
            error = new Error('MediaStreamError');
            if (err === denied || err === altDenied) {
                error.name = denied;
            } else {
                error.name = notSatisfied;
            }
        } else {
            // if we get an error object make sure '.name' property is set
            // according to spec: http://dev.w3.org/2011/webrtc/editor/getusermedia.html#navigatorusermediaerror-and-navigatorusermediaerrorcallback
            error = err;
            if (!error.name) {
                // this is likely chrome which
                // sets a property called "ERROR_DENIED" on the error object
                // if so we make sure to set a name
                if (error[denied]) {
                    err.name = denied;
                } else {
                    err.name = notSatisfied;
                }
            }
        }

        cb(error);
    });
};

},{"webrtc-adapter-test":12}],12:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"dup":2}],13:[function(require,module,exports){
var WildEmitter = require('wildemitter');

function getMaxVolume (analyser, fftBins) {
  var maxVolume = -Infinity;
  analyser.getFloatFrequencyData(fftBins);

  for(var i=4, ii=fftBins.length; i < ii; i++) {
    if (fftBins[i] > maxVolume && fftBins[i] < 0) {
      maxVolume = fftBins[i];
    }
  };

  return maxVolume;
}


var audioContextType = window.AudioContext || window.webkitAudioContext;
// use a single audio context due to hardware limits
var audioContext = null;
module.exports = function(stream, options) {
  var harker = new WildEmitter();


  // make it not break in non-supported browsers
  if (!audioContextType) return harker;

  //Config
  var options = options || {},
      smoothing = (options.smoothing || 0.1),
      interval = (options.interval || 50),
      threshold = options.threshold,
      play = options.play,
      history = options.history || 10,
      running = true;

  //Setup Audio Context
  if (!audioContext) {
    audioContext = new audioContextType();
  }
  var sourceNode, fftBins, analyser;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = smoothing;
  fftBins = new Float32Array(analyser.fftSize);

  if (stream.jquery) stream = stream[0];
  if (stream instanceof HTMLAudioElement || stream instanceof HTMLVideoElement) {
    //Audio Tag
    sourceNode = audioContext.createMediaElementSource(stream);
    if (typeof play === 'undefined') play = true;
    threshold = threshold || -50;
  } else {
    //WebRTC Stream
    sourceNode = audioContext.createMediaStreamSource(stream);
    threshold = threshold || -50;
  }

  sourceNode.connect(analyser);
  if (play) analyser.connect(audioContext.destination);

  harker.speaking = false;

  harker.setThreshold = function(t) {
    threshold = t;
  };

  harker.setInterval = function(i) {
    interval = i;
  };
  
  harker.stop = function() {
    running = false;
    harker.emit('volume_change', -100, threshold);
    if (harker.speaking) {
      harker.speaking = false;
      harker.emit('stopped_speaking');
    }
  };
  harker.speakingHistory = [];
  for (var i = 0; i < history; i++) {
      harker.speakingHistory.push(0);
  }

  // Poll the analyser node to determine if speaking
  // and emit events if changed
  var looper = function() {
    setTimeout(function() {
    
      //check if stop has been called
      if(!running) {
        return;
      }
      
      var currentVolume = getMaxVolume(analyser, fftBins);

      harker.emit('volume_change', currentVolume, threshold);

      var history = 0;
      if (currentVolume > threshold && !harker.speaking) {
        // trigger quickly, short history
        for (var i = harker.speakingHistory.length - 3; i < harker.speakingHistory.length; i++) {
          history += harker.speakingHistory[i];
        }
        if (history >= 2) {
          harker.speaking = true;
          harker.emit('speaking');
        }
      } else if (currentVolume < threshold && harker.speaking) {
        for (var i = 0; i < harker.speakingHistory.length; i++) {
          history += harker.speakingHistory[i];
        }
        if (history == 0) {
          harker.speaking = false;
          harker.emit('stopped_speaking');
        }
      }
      harker.speakingHistory.shift();
      harker.speakingHistory.push(0 + (currentVolume > threshold));

      looper();
    }, interval);
  };
  looper();


  return harker;
}

},{"wildemitter":14}],14:[function(require,module,exports){
/*
WildEmitter.js is a slim little event emitter by @henrikjoreteg largely based 
on @visionmedia's Emitter from UI Kit.

Why? I wanted it standalone.

I also wanted support for wildcard emitters like this:

emitter.on('*', function (eventName, other, event, payloads) {
    
});

emitter.on('somenamespace*', function (eventName, payloads) {
    
});

Please note that callbacks triggered by wildcard registered events also get 
the event name as the first argument.
*/
module.exports = WildEmitter;

function WildEmitter() {
    this.callbacks = {};
}

// Listen on the given `event` with `fn`. Store a group name if present.
WildEmitter.prototype.on = function (event, groupName, fn) {
    var hasGroup = (arguments.length === 3),
        group = hasGroup ? arguments[1] : undefined,
        func = hasGroup ? arguments[2] : arguments[1];
    func._groupName = group;
    (this.callbacks[event] = this.callbacks[event] || []).push(func);
    return this;
};

// Adds an `event` listener that will be invoked a single
// time then automatically removed.
WildEmitter.prototype.once = function (event, groupName, fn) {
    var self = this,
        hasGroup = (arguments.length === 3),
        group = hasGroup ? arguments[1] : undefined,
        func = hasGroup ? arguments[2] : arguments[1];
    function on() {
        self.off(event, on);
        func.apply(this, arguments);
    }
    this.on(event, group, on);
    return this;
};

// Unbinds an entire group
WildEmitter.prototype.releaseGroup = function (groupName) {
    var item, i, len, handlers;
    for (item in this.callbacks) {
        handlers = this.callbacks[item];
        for (i = 0, len = handlers.length; i < len; i++) {
            if (handlers[i]._groupName === groupName) {
                //console.log('removing');
                // remove it and shorten the array we're looping through
                handlers.splice(i, 1);
                i--;
                len--;
            }
        }
    }
    return this;
};

// Remove the given callback for `event` or all
// registered callbacks.
WildEmitter.prototype.off = function (event, fn) {
    var callbacks = this.callbacks[event],
        i;

    if (!callbacks) return this;

    // remove all handlers
    if (arguments.length === 1) {
        delete this.callbacks[event];
        return this;
    }

    // remove specific handler
    i = callbacks.indexOf(fn);
    callbacks.splice(i, 1);
    if (callbacks.length === 0) {
        delete this.callbacks[event];
    }
    return this;
};

/// Emit `event` with the given args.
// also calls any `*` handlers
WildEmitter.prototype.emit = function (event) {
    var args = [].slice.call(arguments, 1),
        callbacks = this.callbacks[event],
        specialCallbacks = this.getWildcardCallbacks(event),
        i,
        len,
        item,
        listeners;

    if (callbacks) {
        listeners = callbacks.slice();
        for (i = 0, len = listeners.length; i < len; ++i) {
            if (listeners[i]) {
                listeners[i].apply(this, args);
            } else {
                break;
            }
        }
    }

    if (specialCallbacks) {
        len = specialCallbacks.length;
        listeners = specialCallbacks.slice();
        for (i = 0, len = listeners.length; i < len; ++i) {
            if (listeners[i]) {
                listeners[i].apply(this, [event].concat(args));
            } else {
                break;
            }
        }
    }

    return this;
};

// Helper for for finding special wildcard event handlers that match the event
WildEmitter.prototype.getWildcardCallbacks = function (eventName) {
    var item,
        split,
        result = [];

    for (item in this.callbacks) {
        split = item.split('*');
        if (item === '*' || (split.length === 2 && eventName.slice(0, split[0].length) === split[0])) {
            result = result.concat(this.callbacks[item]);
        }
    }
    return result;
};

},{}],15:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _libVaani = require('../lib/vaani');

var _libVaani2 = _interopRequireDefault(_libVaani);

var _libDialer = require('../lib/dialer');

var _libDialer2 = _interopRequireDefault(_libDialer);

var _display = require('./display');

var _display2 = _interopRequireDefault(_display);

var _talkie = require('./talkie');

var _talkie2 = _interopRequireDefault(_talkie);

var debug = (0, _debug2['default'])('CallNumberActions');

var CallNumberActions = (function () {
  function CallNumberActions() {
    _classCallCheck(this, CallNumberActions);
  }

  _createClass(CallNumberActions, null, [{
    key: 'setupSpeech',

    /**
     * Initializes a Vaani instance
     */
    value: function setupSpeech() {
      debug('setupSpeech');

      this.vaani = new _libVaani2['default']({
        grammar: '\n        #JSGF v1.0;\n        grammar fxosVoiceCommands;\n        public <simple> =\n          yes | no\n        ;\n      ',
        interpreter: this._interpreter.bind(this),
        onSay: this._onSay.bind(this),
        onSayDone: this._onSayDone.bind(this),
        onListen: this._onListen.bind(this),
        onListenDone: this._onListenDone.bind(this)
      });
    }

    /**
     * Asks the user to confirm the number and waits for a response
     */
  }, {
    key: 'confirmNumber',
    value: function confirmNumber() {
      debug('confirmNumber');

      var phoneNumber = _storesApp2['default'].state.callNumber.phoneNumber;

      _storesApp2['default'].state.callNumber.text = 'Do you want to call ' + phoneNumber + '? Yes/No';
      _storesApp2['default'].emitChange();

      phoneNumber = phoneNumber.replace(/(\d)(?=\d)/g, '$1 ');

      this.vaani.say('Do you want me to call ' + phoneNumber + '?', true);
    }

    /**
     * Interprets the result of speech recognition
     * @param err {Error|null} An error if speech was not understood
     * @param command {String} Text returned from the speech recognition
     */
  }, {
    key: '_interpreter',
    value: function _interpreter(err, command) {
      var _this = this;

      debug('_interpreter', arguments);

      _talkie2['default'].setActiveAnimation('none');

      if (err) {
        debug('_interpreter error', err);

        this.vaani.say('I didn\'t understand, say again.', true);

        return;
      }

      if (command.indexOf('yes') > -1) {
        var phoneNumber = _storesApp2['default'].state.callNumber.phoneNumber;

        debug('dialing', phoneNumber);

        _libDialer2['default'].dial(phoneNumber, function (err, call) {
          if (err) {
            debug('Dialer error', err);

            _this.vaani.say('I\'m sorry, I wasn\'t able to make the call.');

            return;
          }

          call.onstatechange = function (event) {
            debug('call state changed', event);

            if (call.state === 'disconnected') {
              _display2['default'].changeViews(null);
            }
          };
        });
      } else if (command.indexOf('no') > -1) {
        this.vaani.say('Ok');

        _display2['default'].changeViews(null);
      } else {
        debug('Unable to match interpretation');

        this.vaani.say('I\'m sorry, I wasn\'t able to understand.');
      }
    }

    /**
     * A hook that's fired when Vaani's say function is called
     * @param sentence {String} The sentence to be spoken
     * @param waitForResponse {Boolean} Indicates if we will wait
     *        for a response after the sentence has been said
     */
  }, {
    key: '_onSay',
    value: function _onSay(sentence, waitForResponse) {
      debug('_onSay', arguments);

      _talkie2['default'].setActiveAnimation('sending');
      _talkie2['default'].setMode('none');
    }

    /**
     * A hook that's fired when Vaani's say function is finished
     * @param sentence {String} The sentence to be spoken
     * @param waitForResponse {Boolean} Indicates if we will wait
     *        for a response after the sentence has been said
     */
  }, {
    key: '_onSayDone',
    value: function _onSayDone(sentence, waitForResponse) {
      if (!waitForResponse) {
        _talkie2['default'].setActiveAnimation('none');
      }
    }

    /**
     * A hook that's fired when Vaani's listen function is called
     */
  }, {
    key: '_onListen',
    value: function _onListen() {
      debug('_onListen');

      _talkie2['default'].setActiveAnimation('receiving');
    }

    /**
     * A hook that's fired when Vaani's listen function is finished
     */
  }, {
    key: '_onListenDone',
    value: function _onListenDone() {}

    /**
     * The action that handles mic toggles
     */
  }, {
    key: 'toggleMic',
    value: function toggleMic() {
      debug('toggleMic');

      if (this.vaani.isSpeaking || this.vaani.isListening) {
        this.vaani.cancel();

        _storesApp2['default'].state.callNumber.phoneNumber = '';
        _storesApp2['default'].state.callNumber.text = '';

        _talkie2['default'].setActiveAnimation('none');
        _talkie2['default'].setMode('none');

        _display2['default'].changeViews(null);

        return;
      }

      this.confirmNumber();
    }
  }]);

  return CallNumberActions;
})();

exports['default'] = CallNumberActions;
module.exports = exports['default'];

},{"../lib/dialer":31,"../lib/vaani":32,"../stores/app":33,"./display":16,"./talkie":19,"debug":3}],16:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var debug = (0, _debug2['default'])('DisplayActions');

var DisplayActions = (function () {
  function DisplayActions() {
    _classCallCheck(this, DisplayActions);
  }

  _createClass(DisplayActions, null, [{
    key: 'changeViews',

    /**
     * Changes the current view
     * @param {String} (optional) The name of the comoponent to create
     */
    value: function changeViews(componentName) {
      debug('changeViews', arguments);

      var display = document.querySelector('vaani-display');
      var newView;

      if (componentName) {
        newView = document.createElement(componentName);
      }

      display.changeViews(newView);

      _storesApp2['default'].state.display.activeView = newView;
      _storesApp2['default'].emitChange();
    }
  }]);

  return DisplayActions;
})();

exports['default'] = DisplayActions;
module.exports = exports['default'];

},{"../stores/app":33,"debug":3}],17:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _talkie = require('./talkie');

var _talkie2 = _interopRequireDefault(_talkie);

var _toolbar = require('./toolbar');

var _toolbar2 = _interopRequireDefault(_toolbar);

var debug = (0, _debug2['default'])('FirstTimeUseActions');

var FirstTimeUseActions = (function () {
  function FirstTimeUseActions() {
    _classCallCheck(this, FirstTimeUseActions);
  }

  _createClass(FirstTimeUseActions, null, [{
    key: 'advanceTour',

    /**
     * Advances the tour
     */
    value: function advanceTour() {
      debug('advanceTour');

      var currentStep = _storesApp2['default'].state.firstTimeUse.tour.current;
      var totalSteps = _storesApp2['default'].state.firstTimeUse.tour.total;
      var toolbarActiveItem = 'none';

      if (currentStep === 1) {
        toolbarActiveItem = 'community';
      }
      if (currentStep === 2) {
        toolbarActiveItem = 'help';
      }

      if (currentStep === totalSteps) {
        _storesApp2['default'].state.firstTimeUse.tour.current = 0;
        _storesApp2['default'].state.firstTimeUse.tour.inFlight = false;

        _talkie2['default'].setMode('idle');
      } else {
        currentStep += 1;
        _storesApp2['default'].state.firstTimeUse.tour.current = currentStep;
        _storesApp2['default'].state.firstTimeUse.tour.inFlight = true;
      }

      _toolbar2['default'].setActiveItem(toolbarActiveItem);

      _storesApp2['default'].emitChange();
    }
  }]);

  return FirstTimeUseActions;
})();

exports['default'] = FirstTimeUseActions;
module.exports = exports['default'];

},{"../stores/app":33,"./talkie":19,"./toolbar":20,"debug":3}],18:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _libVaani = require('../lib/vaani');

var _libVaani2 = _interopRequireDefault(_libVaani);

var _libAppLauncher = require('../lib/app-launcher');

var _libAppLauncher2 = _interopRequireDefault(_libAppLauncher);

var _libDialer = require('../lib/dialer');

var _libDialer2 = _interopRequireDefault(_libDialer);

var _display = require('./display');

var _display2 = _interopRequireDefault(_display);

var _talkie = require('./talkie');

var _talkie2 = _interopRequireDefault(_talkie);

var debug = (0, _debug2['default'])('StandingByActions');

var StandingByActions = (function () {
  function StandingByActions() {
    _classCallCheck(this, StandingByActions);
  }

  _createClass(StandingByActions, null, [{
    key: 'setupSpeech',

    /**
     * Initializes a Vaani instance
     */
    value: function setupSpeech() {
      debug('setupSpeech');

      this.vaani = new _libVaani2['default']({
        grammar: '\n        #JSGF v1.0;\n        grammar fxosVoiceCommands;\n        <app> =\n          phone |\n          messages |\n          email |\n          contacts |\n          browser |\n          gallery |\n          camera |\n          marketplace |\n          clock |\n          settings |\n          calendar |\n          music |\n          video |\n          calculator\n        ;\n        <digit> =\n          zero |\n          o |\n          one |\n          two |\n          three |\n          four |\n          five |\n          six |\n          seven |\n          eight |\n          nine\n        ;\n        public <simple> =\n          open <app> |\n          call <digit>+\n        ;\n      ',
        interpreter: this._interpreter.bind(this),
        onSay: this._onSay.bind(this),
        onSayDone: this._onSayDone.bind(this),
        onListen: this._onListen.bind(this),
        onListenDone: this._onListenDone.bind(this)
      });
    }

    /**
     * Greets the user and waits for a response
     */
  }, {
    key: 'greetUser',
    value: function greetUser() {
      debug('greetUser');

      _storesApp2['default'].state.standingBy.text = 'How may I help you?';
      _storesApp2['default'].emitChange();

      this.vaani.listen();
    }

    /**
     * Interprets the result of speech recognition
     * @param err {Error|null} An error if speech was not understood
     * @param command {String} Text returned from the speech recognition
     */
  }, {
    key: '_interpreter',
    value: function _interpreter(err, command) {
      var _this = this;

      debug('_interpreter', arguments);

      _talkie2['default'].setActiveAnimation('none');

      if (err) {
        debug('_interpreter error', err);

        this.vaani.say('I didn\'t understand, say again.', true);

        return;
      }

      if (command.indexOf('call') > -1) {
        var phoneNumber = _libDialer2['default'].wordsToDigits(command);

        _storesApp2['default'].state.callNumber.phoneNumber = phoneNumber;

        _display2['default'].changeViews('vaani-call-number');
      } else if (command.indexOf('open') > -1) {
        var appRequested, appToLaunch, entryPoint;

        if (command.indexOf('phone') > -1) {
          appRequested = 'phone';
          appToLaunch = 'communications';
          entryPoint = 'dialer';
        } else if (command.indexOf('messages') > -1) {
          appToLaunch = 'messages';
        } else if (command.indexOf('email') > -1) {
          appToLaunch = 'e-mail';
        } else if (command.indexOf('contacts') > -1) {
          appRequested = 'contacts';
          appToLaunch = 'communications';
          entryPoint = 'contacts';
        } else if (command.indexOf('browser') > -1) {
          appToLaunch = 'browser';
        } else if (command.indexOf('gallery') > -1) {
          appToLaunch = 'gallery';
        } else if (command.indexOf('camera') > -1) {
          appToLaunch = 'camera';
        } else if (command.indexOf('marketplace') > -1) {
          appToLaunch = 'marketplace';
        } else if (command.indexOf('clock') > -1) {
          appToLaunch = 'clock';
        } else if (command.indexOf('settings') > -1) {
          appToLaunch = 'settings';
        } else if (command.indexOf('calendar') > -1) {
          appToLaunch = 'calendar';
        } else if (command.indexOf('music') > -1) {
          appToLaunch = 'music';
        } else if (command.indexOf('video') > -1) {
          appToLaunch = 'video';
        } else if (command.indexOf('calculator') > -1) {
          appToLaunch = 'calculator';
        } else {
          debug('Unable to interpret open command.', command);

          this.vaani.say('I could not find that app.');

          return;
        }

        appRequested = appRequested || appToLaunch;

        _libAppLauncher2['default'].launch(appToLaunch, entryPoint, function (err) {
          if (err) {
            debug('AppLauncher error', err);

            _this.vaani.say('I was not able to find ' + appRequested + '.');

            return;
          }

          _storesApp2['default'].state.standingBy.text = '';
          _storesApp2['default'].emitChange();
        });
      } else {
        debug('Unable to match interpretation');

        this.vaani.say('I\'m sorry, I wasn\'t able to understand.');
      }
    }

    /**
     * A hook that's fired when Vaani's say function is called
     * @param sentence {String} The sentence to be spoken
     * @param waitForResponse {Boolean} Indicates if we will wait
     *        for a response after the sentence has been said
     */
  }, {
    key: '_onSay',
    value: function _onSay(sentence, waitForResponse) {
      debug('_onSay', arguments);

      _storesApp2['default'].state.standingBy.text = sentence;

      _talkie2['default'].setActiveAnimation('sending');
      _talkie2['default'].setMode('none');
    }

    /**
     * A hook that's fired when Vaani's say function is finished
     * @param sentence {String} The sentence to be spoken
     * @param waitForResponse {Boolean} Indicates if we will wait
     *        for a response after the sentence has been said
     */
  }, {
    key: '_onSayDone',
    value: function _onSayDone(sentence, waitForResponse) {
      if (!waitForResponse) {
        _talkie2['default'].setActiveAnimation('none');
      }
    }

    /**
     * A hook that's fired when Vaani's listen function is called
     */
  }, {
    key: '_onListen',
    value: function _onListen() {
      debug('_onListen');

      _talkie2['default'].setActiveAnimation('receiving');
    }

    /**
     * A hook that's fired when Vaani's listen function is finished
     */
  }, {
    key: '_onListenDone',
    value: function _onListenDone() {}

    /**
     * The action that handles mic toggles
     */
  }, {
    key: 'toggleMic',
    value: function toggleMic() {
      debug('toggleMic');

      if (this.vaani.isSpeaking || this.vaani.isListening) {
        this.vaani.cancel();

        _storesApp2['default'].state.standingBy.text = '';

        _talkie2['default'].setActiveAnimation('none');
        _talkie2['default'].setMode('none');

        return;
      }

      this.greetUser();
    }
  }]);

  return StandingByActions;
})();

exports['default'] = StandingByActions;
module.exports = exports['default'];

},{"../lib/app-launcher":30,"../lib/dialer":31,"../lib/vaani":32,"../stores/app":33,"./display":16,"./talkie":19,"debug":3}],19:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _display = require('./display');

var _display2 = _interopRequireDefault(_display);

var debug = (0, _debug2['default'])('TalkieActions');

var TalkieActions = (function () {
  function TalkieActions() {
    _classCallCheck(this, TalkieActions);
  }

  _createClass(TalkieActions, null, [{
    key: 'toggleMic',

    /**
     * Delegates to the active view's toggleMic function or
     * changes to view to vaani-standing-by
     */
    value: function toggleMic() {
      debug('toggleMic');

      if (_storesApp2['default'].state.display.activeView && _storesApp2['default'].state.display.activeView.toggleMic) {

        _storesApp2['default'].state.display.activeView.toggleMic();
        return;
      }

      _display2['default'].changeViews('vaani-standing-by');
    }

    /**
     * Sets the active animation
     * @param value {String} the name of the animation
     */
  }, {
    key: 'setActiveAnimation',
    value: function setActiveAnimation(value) {
      debug('setActiveAnimation', arguments);

      _storesApp2['default'].state.talkie.activeAnimation = value;
      _storesApp2['default'].emitChange();
    }

    /**
     * Sets the mode
     * @param value {String} the mode
     */
  }, {
    key: 'setMode',
    value: function setMode(value) {
      debug('setMode', arguments);

      _storesApp2['default'].state.talkie.mode = value;
      _storesApp2['default'].emitChange();
    }
  }]);

  return TalkieActions;
})();

exports['default'] = TalkieActions;
module.exports = exports['default'];

},{"../stores/app":33,"./display":16,"debug":3}],20:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var debug = (0, _debug2['default'])('ToolbarActions');

var ToolbarActions = (function () {
  function ToolbarActions() {
    _classCallCheck(this, ToolbarActions);
  }

  _createClass(ToolbarActions, null, [{
    key: 'setActiveItem',

    /**
     * Sets the active item
     * @param value {String} The active item
     */
    value: function setActiveItem(value) {
      debug('setActiveItem', arguments);

      _storesApp2['default'].state.toolbar.activeItem = value;
      _storesApp2['default'].emitChange();
    }
  }]);

  return ToolbarActions;
})();

exports['default'] = ToolbarActions;
module.exports = exports['default'];

},{"../stores/app":33,"debug":3}],21:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _actionsCallNumber = require('../actions/call-number');

var _actionsCallNumber2 = _interopRequireDefault(_actionsCallNumber);

var CallNumber = _gaiaComponent2['default'].register('vaani-call-number', {
  created: function created() {
    this.setupShadowRoot();

    this.els = {};
    this.els.text = this.shadowRoot.querySelector('.text');

    _actionsCallNumber2['default'].setupSpeech();
  },
  attached: function attached() {
    _storesApp2['default'].addChangeListener(this.render.bind(this));

    _actionsCallNumber2['default'].confirmNumber();

    this.render();
  },
  detached: function detached() {
    _storesApp2['default'].removeChangeListener(this.render.bind(this));
  },
  render: function render() {
    this.els.text.textContent = _storesApp2['default'].state.callNumber.text;
  },
  toggleMic: function toggleMic() {
    _actionsCallNumber2['default'].toggleMic();
  },
  template: '\n    <div id="call-number">\n      <p class="text"></p>\n    </div>\n\n    <style>\n      #call-number {\n        display: flex;\n        align-items: center;\n        width: 100%;\n        min-height: 24.3rem;\n      }\n      #call-number .text {\n        width: 100%;\n        font-size: 2.1rem;\n        text-align: center;\n        margin: 0 3rem;\n      }\n    </style>\n  '
});

exports['default'] = CallNumber;
module.exports = exports['default'];

},{"../actions/call-number":15,"../stores/app":33,"gaia-component":7}],22:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

require('gaia-dialog/gaia-dialog-alert');

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _actionsToolbar = require('../actions/toolbar');

var _actionsToolbar2 = _interopRequireDefault(_actionsToolbar);

var _actionsDisplay = require('../actions/display');

var _actionsDisplay2 = _interopRequireDefault(_actionsDisplay);

var Community = _gaiaComponent2['default'].register('vaani-community', {
  created: function created() {
    this.setupShadowRoot();

    this.dialog = this.shadowRoot.querySelector('gaia-dialog-alert');
  },
  attached: function attached() {
    this.dialog.open();
    this.dialog.addEventListener('closed', this.onClose.bind(this));
  },
  detached: function detached() {
    this.dialog.removeEventListener('closed', this.onClose.bind(this));
  },
  onClose: function onClose() {
    _actionsToolbar2['default'].setActiveItem('none');
    _actionsDisplay2['default'].changeViews(null);
  },
  template: '\n    <div id="help">\n      <gaia-dialog-alert>\n        <h3>Help the Community</h3>\n        <p>You can help us improve Vaani\'s speech recognition by reading sentences.</p>\n        <p>Record yourself reading a sentence. The recording will then be submitted over wifi.</p>\n        <p>That\'s it! We appreciate the help!</p>\n        <p>(coming soon)</p>\n      </gaia-dialog-alert>\n    </div>\n  '
});

exports['default'] = Community;
module.exports = exports['default'];

},{"../actions/display":16,"../actions/toolbar":20,"gaia-component":7,"gaia-dialog/gaia-dialog-alert":9}],23:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var Display = _gaiaComponent2['default'].register('vaani-display', {
  created: function created() {
    this.setupShadowRoot();
  },
  attached: function attached() {},
  detached: function detached() {},
  changeViews: function changeViews(newView) {
    var contentEl = this.shadowRoot.querySelector('.content');

    if (_storesApp2['default'].state.display.activeView) {
      contentEl.removeChild(_storesApp2['default'].state.display.activeView);
    }

    if (newView) {
      contentEl.appendChild(newView);
    }
  },
  template: '\n    <div id="display">\n      <div class="content"></div>\n    </div>\n\n    <style>\n      #display {\n        width: 100%;\n      }\n    </style>\n  '
});

exports['default'] = Display;
module.exports = exports['default'];

},{"../stores/app":33,"gaia-component":7}],24:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _actionsFirstTimeUse = require('../actions/first-time-use');

var _actionsFirstTimeUse2 = _interopRequireDefault(_actionsFirstTimeUse);

var FirstTimeUse = _gaiaComponent2['default'].register('vaani-first-time-use', {
  created: function created() {
    this.setupShadowRoot();

    this.els = {};
    this.els.arrowUp = this.shadowRoot.querySelector('.arrow-up');
    this.els.arrowDown = this.shadowRoot.querySelector('.arrow-down');
    this.els.step1 = this.shadowRoot.querySelector('.step-1');
    this.els.step2 = this.shadowRoot.querySelector('.step-2');
    this.els.step3 = this.shadowRoot.querySelector('.step-3');
    this.els.btns = this.shadowRoot.querySelectorAll('.btn');
  },
  attached: function attached() {
    for (var i = 0; i < this.els.btns.length; ++i) {
      var btn = this.els.btns[i];
      btn.addEventListener('click', this.nextStep.bind(this));
    }

    _storesApp2['default'].addChangeListener(this.render.bind(this));

    this.isAttached = true;

    this.render();
  },
  detached: function detached() {
    for (var i = 0; i < this.els.btns.length; ++i) {
      var btn = this.els.btns[i];
      btn.removeEventListener('click', this.nextStep.bind(this));
    }

    _storesApp2['default'].removeChangeListener(this.render.bind(this));
  },
  render: function render() {
    var currentStep = _storesApp2['default'].state.firstTimeUse.tour.current;

    this.els.step1.style.display = currentStep === 1 ? 'block' : 'none';
    this.els.step2.style.display = currentStep === 2 ? 'block' : 'none';
    this.els.step3.style.display = currentStep === 3 ? 'block' : 'none';

    this.els.arrowUp.classList.remove('arrow-up-left');
    this.els.arrowUp.classList.remove('arrow-up-right');
    this.els.arrowDown.classList.remove('arrow-down-center');

    if (currentStep === 2) {
      this.els.arrowUp.classList.remove('arrow-up-right');
      this.els.arrowUp.classList.add('arrow-up-left');
    }

    if (currentStep === 3) {
      this.els.arrowUp.classList.remove('arrow-up-left');
      this.els.arrowUp.classList.add('arrow-up-right');
    }
  },
  nextStep: function nextStep() {
    _actionsFirstTimeUse2['default'].advanceTour();
  },
  template: '\n    <div id="first-time-use">\n      <div class="arrow-up"></div>\n      <div class="container">\n        <div class="step-1">\n          <h3 class="title">What is Vaani?</h3>\n          <p class="message">Vaani is the voice recognition system that can do things for you.</p>\n          <hr />\n          <button class="btn">Ok</button>\n        </div>\n        <div class="step-2">\n          <h3 class="title">Help the Community!</h3>\n          <p class="message">You can help us improve Vaani\'s speech recognition by reading sentences.</p>\n          <hr />\n          <button class="btn">Ok</button>\n        </div>\n        <div class="step-3">\n          <h3 class="title">Not sure what to ask Vaani?</h3>\n          <p class="message">Find a list of everything you can say to Vaani here.</p>\n          <hr />\n          <button class="btn">Ok</button>\n        </div>\n      </div>\n      <div class="arrow-down"></div>\n    </div>\n\n    <style>\n      #first-time-use {\n        position: relative;\n        margin: 0 1.5rem;\n      }\n      #first-time-use .arrow-up {\n        display: none;\n        position: absolute;\n        top: -1.2rem;\n        width: 0;\n        height: 0;\n        border-left: 1.2rem solid transparent;\n        border-right: 1.2rem solid transparent;\n        border-bottom: 1.2rem solid rgba(201, 228, 253, 0.75);\n      }\n      #first-time-use .arrow-up-left {\n        display: block;\n        left: 0;\n      }\n      #first-time-use .arrow-up-right {\n        display: block;\n        right: 0;\n      }\n      #first-time-use .container {\n        padding: 0 1.5rem;\n        border-radius: 2px;\n        background-color: #c9e4fd;\n        background-color: rgba(201, 228, 253, 0.75);\n      }\n      #first-time-use .title {\n        color: #4d4d4d;\n        font-size: 1.7rem;\n        font-weight: 600;\n        text-align: center;\n        margin: 0;\n        padding: 1.5rem 0 0 0;\n      }\n      #first-time-use .message {\n        color: #4d4d4d;\n        font-size: 1.5rem;\n        line-height: 1.9rem;\n      }\n      #first-time-use .message-only {\n        padding: 1.5rem 0;\n      }\n      #first-time-use hr {\n        border: 0;\n        height: 0.1rem;\n        background-color: #000;\n        opacity: 0.2;\n        margin: 0;\n      }\n      #first-time-use .btn {\n        color: #00aacc;\n        font-weight: normal;\n        font-style: italic;\n        font-size: 1.7rem;\n        display: block;\n        height: 4rem;\n        width: 100%;\n        text-align: center;\n        background: none;\n        border: none;\n      }\n      #first-time-use .step-1,\n      #first-time-use .step-2,\n      #first-time-use .step-3 {\n        display: none;\n      }\n    </style>\n  '
});

exports['default'] = FirstTimeUse;
module.exports = exports['default'];

},{"../actions/first-time-use":17,"../stores/app":33,"gaia-component":7}],25:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

require('gaia-dialog/gaia-dialog-alert');

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _actionsToolbar = require('../actions/toolbar');

var _actionsToolbar2 = _interopRequireDefault(_actionsToolbar);

var _actionsDisplay = require('../actions/display');

var _actionsDisplay2 = _interopRequireDefault(_actionsDisplay);

var Help = _gaiaComponent2['default'].register('vaani-help', {
  created: function created() {
    this.setupShadowRoot();

    this.dialog = this.shadowRoot.querySelector('gaia-dialog-alert');
  },
  attached: function attached() {
    window.dialog = this.dialog;
    this.dialog.open();
    this.dialog.addEventListener('closed', this.onClose.bind(this));
  },
  detached: function detached() {
    this.dialog.removeEventListener('closed', this.onClose.bind(this));
  },
  onClose: function onClose() {
    _actionsToolbar2['default'].setActiveItem('none');
    _actionsDisplay2['default'].changeViews(null);
  },
  template: '\n    <div id="help">\n      <gaia-dialog-alert>\n        <h3>What can I ask Vaani?</h3>\n        <p>Open &lt;App&gt;</p>\n        <p>Call &lt;Number&gt;</p>\n      </gaia-dialog-alert>\n    </div>\n  '
});

exports['default'] = Help;
module.exports = exports['default'];

},{"../actions/display":16,"../actions/toolbar":20,"gaia-component":7,"gaia-dialog/gaia-dialog-alert":9}],26:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _actionsStandingBy = require('../actions/standing-by');

var _actionsStandingBy2 = _interopRequireDefault(_actionsStandingBy);

var StandingBy = _gaiaComponent2['default'].register('vaani-standing-by', {
  created: function created() {
    this.setupShadowRoot();

    this.els = {};
    this.els.text = this.shadowRoot.querySelector('.text');

    _actionsStandingBy2['default'].setupSpeech();
  },
  attached: function attached() {
    _storesApp2['default'].addChangeListener(this.render.bind(this));

    _actionsStandingBy2['default'].greetUser();

    this.render();
  },
  detached: function detached() {
    _storesApp2['default'].removeChangeListener(this.render.bind(this));
  },
  render: function render() {
    this.els.text.textContent = _storesApp2['default'].state.standingBy.text;
  },
  toggleMic: function toggleMic() {
    _actionsStandingBy2['default'].toggleMic();
  },
  template: '\n    <div id="standing-by">\n      <p class="text"></p>\n    </div>\n\n    <style>\n      #standing-by {\n        display: flex;\n        align-items: center;\n        width: 100%;\n        min-height: 24.3rem;\n      }\n      #standing-by .text {\n        width: 100%;\n        font-size: 2.1rem;\n        text-align: center;\n        margin: 0 3rem;\n      }\n    </style>\n  '
});

exports['default'] = StandingBy;
module.exports = exports['default'];

},{"../actions/standing-by":18,"../stores/app":33,"gaia-component":7}],27:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _getusermedia = require('getusermedia');

var _getusermedia2 = _interopRequireDefault(_getusermedia);

var _attachmediastream = require('attachmediastream');

var _attachmediastream2 = _interopRequireDefault(_attachmediastream);

var _hark = require('hark');

var _hark2 = _interopRequireDefault(_hark);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _actionsTalkie = require('../actions/talkie');

var _actionsTalkie2 = _interopRequireDefault(_actionsTalkie);

var Talkie = _gaiaComponent2['default'].register('vaani-talkie', {
  created: function created() {
    this.setupShadowRoot();

    this.els = {};
    this.els.video = this.shadowRoot.querySelector('video');
    this.els.video.muted = true;
    this.els.mic = this.shadowRoot.querySelector('.mic');
    this.els.sending = this.shadowRoot.querySelector('.sending');
    this.els.receiving = this.shadowRoot.querySelector('#receiving');
    this.els.dots = this.shadowRoot.querySelector('#dots');
    this.els.idlePopup = this.shadowRoot.querySelector('.idle-popup');
  },
  attached: function attached() {
    var _this = this;

    this.els.mic.addEventListener('touchend', this.tapMic.bind(this));
    this.els.mic.addEventListener('click', this.toggleMic.bind(this));

    _storesApp2['default'].addChangeListener(this.render.bind(this));

    (0, _getusermedia2['default'])({ audio: true, video: false }, function (err, stream) {
      if (err) {
        throw err;
      }

      // Reza: if we don't attach the media stream to something,
      // the volume_change event will stop working after some time
      // and just emit `-100 -50`.
      (0, _attachmediastream2['default'])(stream, _this.els.video);

      _this.speechEvents = (0, _hark2['default'])(stream);
      _this.speechEvents.on('volume_change', _this._onVolumeChange.bind(_this));
    });

    this.render();
  },
  detached: function detached() {
    this.els.mic.removeEventListener('touchend', this.tapMic.bind(this));
    this.els.mic.removeEventListener('click', this.toggleMic.bind(this));

    _storesApp2['default'].removeChangeListener(this.render.bind(this));

    this.speechEvents.off('volume_change', this._onVolumeChange.bind(this));
  },
  _onVolumeChange: function _onVolumeChange(volume, threshold) {
    if (_storesApp2['default'].state.talkie.activeAnimation !== 'receiving') {
      return;
    }

    volume *= -1;

    if (volume < 30) {
      this.els.dots.className = '';
      this.els.dots.classList.add('show-5');
    } else if (volume > 30 && volume < 40) {
      this.els.dots.className = '';
      this.els.dots.classList.add('show-4');
    } else if (volume > 40 && volume < 50) {
      this.els.dots.className = '';
      this.els.dots.classList.add('show-3');
    } else if (volume > 50 && volume < 60) {
      this.els.dots.className = '';
      this.els.dots.classList.add('show-2');
    } else if (volume > 60 && volume < 70) {
      this.els.dots.className = '';
      this.els.dots.classList.add('show-1');
    } else {
      this.els.dots.className = '';
    }
  },
  _showHideRing: function _showHideRing(ring, show) {
    for (var i = 0; i < ring.length; i++) {
      if (show) {
        ring[i].style.display = 'block';
      } else {
        ring[i].style.display = 'none';
      }
    }
  },
  render: function render() {
    if (_storesApp2['default'].state.talkie.mode === 'idle') {
      this.els.idlePopup.style.display = 'block';
    } else {
      this.els.idlePopup.style.display = 'none';
    }

    if (_storesApp2['default'].state.talkie.activeAnimation === 'receiving') {
      this.els.sending.style.display = 'none';
      this.els.receiving.style.display = 'block';
    } else if (_storesApp2['default'].state.talkie.activeAnimation === 'sending') {
      this.els.sending.style.display = 'block';
      this.els.receiving.style.display = 'none';
    } else {
      this.els.sending.style.display = 'none';
      this.els.receiving.style.display = 'none';
    }
  },
  tapMic: function tapMic(e) {
    e.preventDefault();
    e.target.click();
  },
  toggleMic: function toggleMic() {
    if (_storesApp2['default'].state.firstTimeUse.tour.inFlight) {
      return;
    }

    _actionsTalkie2['default'].toggleMic();
  },
  template: '\n    <div id="talkie">\n      <div class="content">\n        <div class="idle-popup">\n          <div class="idle-popup-container">\n            <p class="message">Tap or say "Yo Vaani" to get started.</p>\n          </div>\n          <div class="arrow-down"></div>\n        </div>\n\n        <div id="receiving">\n          <!--dots go here, see create method above-->\n          <div id="dots"></div>\n        </div>\n\n        <div class="sending"></div>\n\n        <div class="mic">\n          <img alt="tap to talk" src="/assets/images/mic.png" />\n        </div>\n      </div>\n      <video width="0" height="0"></video>\n    </div>\n\n    <style>\n      #talkie {\n        position: absolute;\n        bottom: 0;\n        width: 100%;\n        height: 23.8rem;\n      }\n      #talkie .content {\n        position: relative;\n        width: 100%;\n        height: 100%;\n      }\n      #talkie .mic {\n        position: absolute;\n        top: 50%;\n        left: 50%;\n        transform: translate(-50%, -50%);\n        height: 6.8rem;\n        width: 6.8rem;\n      }\n      #talkie .idle-popup {\n        display: none;\n        position: absolute;\n        margin: 0 auto;\n        width: 100%;\n      }\n      #talkie .idle-popup .idle-popup-container {\n        text-align: center;\n        margin: 0 1.5rem;\n        border-radius: 2px;\n        background-color: #c9e4fd;\n        background-color: rgba(201, 228, 253, 0.75);\n      }\n      #talkie .idle-popup .message {\n        color: #4d4d4d;\n        font-size: 1.5rem;\n        line-height: 1.9rem;\n        padding: 1.5rem;\n      }\n      #talkie .idle-popup .arrow-down {\n        width: 0;\n        height: 0;\n        margin: -1.5rem auto auto auto;\n        border-left: 1.2rem solid transparent;\n        border-right: 1.2rem solid transparent;\n        border-top: 1.2rem solid rgba(201, 228, 253, 0.75);\n      }\n      #talkie .sending {\n        display: none;\n        position: absolute;\n        top: 50%;\n        left: 50%;\n        height: 6.8rem;\n        width: 6.8rem;\n        transform: translate(-50%, -50%);\n      }\n      #talkie .sending:before,\n      #talkie .sending:after {\n        content: \'\';\n        position: absolute;\n        top: 50%;\n        left: 50%;\n        width: 6.8rem;\n        height: 6.8rem;\n        margin: -3.5rem 0 0 -3.4rem;\n        border-radius: 50%;\n        background-color: #6c3fff;\n        animation-name: sending;\n        animation-duration: 1s;\n        animation-iteration-count: 100;\n        animation-timing-function: linear;\n        pointer-events: none;\n      }\n      #talkie .sending:after {\n        animation-delay: 0.5s;\n      }\n      #receiving {\n        justify-content: center;\n        align-items: center;\n        position: absolute;\n        height: 100%;\n        width: 100%;\n      }\n      #dots {\n        display: none;\n        position: absolute;\n        top: 50%;\n        left: 50%;\n        width: 22.4rem;\n        height: 22.4rem;\n        border-radius: 50%;\n        background: url(\'/assets/images/dots.png\') no-repeat 50% 50% / 22.4rem;\n        transform: translate(-50%, -50%);\n        transition-property: width, height;\n        transition-duration: 30ms;\n        transition-timing-function: linear;\n        pointer-events: none;\n      }\n\n      #dots.show-5 {\n        display: block;\n        width: 22.4rem;\n        height: 22.4rem;\n      }\n\n      #dots.show-4 {\n        display: block;\n        width: 20rem;\n        height: 20rem;\n      }\n\n      #dots.show-3 {\n        display: block;\n        width: 17rem;\n        height: 17rem;\n      }\n\n      #dots.show-2 {\n        display: block;\n        width: 14rem;\n        height: 14rem;\n      }\n\n      #dots.show-1 {\n        display: block;\n        width: 11rem;\n        height: 11rem;\n      }\n    </style>\n  ',
  globalCss: '\n    @keyframes sending {\n      0% {\n        background-color: rgba(108,63,255, 0.3);\n        transform: scale3d(1, 1, 1);\n      }\n      33% {\n        background-color: #8c3fff;\n      }\n      66% {\n        background-color: #a33fff;\n      }\n      100% {\n        opacity: 0;\n        background-color: rgba(194,63,255, 0);\n        transform: scale3d(5, 5, 1);\n      }\n    }\n  '
});

exports['default'] = Talkie;
module.exports = exports['default'];

},{"../actions/talkie":19,"../stores/app":33,"attachmediastream":1,"gaia-component":7,"getusermedia":11,"hark":13}],28:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _gaiaComponent = require('gaia-component');

var _gaiaComponent2 = _interopRequireDefault(_gaiaComponent);

var _storesApp = require('../stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _actionsDisplay = require('../actions/display');

var _actionsDisplay2 = _interopRequireDefault(_actionsDisplay);

var _actionsToolbar = require('../actions/toolbar');

var _actionsToolbar2 = _interopRequireDefault(_actionsToolbar);

var Toolbar = _gaiaComponent2['default'].register('vaani-toolbar', {
  created: function created() {
    this.setupShadowRoot();

    this.els = {};
    this.els.community = this.shadowRoot.querySelector('.community');
    this.els.communityImg = this.els.community.querySelector('img');
    this.els.help = this.shadowRoot.querySelector('.help');
    this.els.helpImg = this.els.help.querySelector('img');
  },
  attached: function attached() {
    this.els.community.addEventListener('click', this.toggleCommunity.bind(this));
    this.els.help.addEventListener('click', this.toggleHelp.bind(this));

    _storesApp2['default'].addChangeListener(this.render.bind(this));

    this.render();
  },
  detached: function detached() {
    this.els.community.removeEventListener('click', this.toggleCommunity.bind(this));
    this.els.help.removeEventListener('click', this.toggleHelp.bind(this));

    _storesApp2['default'].removeChangeListener(this.render.bind(this));
  },
  render: function render() {
    if (_storesApp2['default'].state.toolbar.activeItem === 'community') {
      this.els.communityImg.src = this.els.communityImg.dataset.srcActive;
      this.els.helpImg.src = this.els.helpImg.dataset.srcInactive;
    } else if (_storesApp2['default'].state.toolbar.activeItem === 'help') {
      this.els.communityImg.src = this.els.communityImg.dataset.srcInactive;
      this.els.helpImg.src = this.els.helpImg.dataset.srcActive;
    } else {
      this.els.communityImg.src = this.els.communityImg.dataset.srcInactive;
      this.els.helpImg.src = this.els.helpImg.dataset.srcInactive;
    }
  },
  toggleCommunity: function toggleCommunity() {
    if (_storesApp2['default'].state.firstTimeUse.tour.inFlight) {
      return;
    }

    var isSelected = _storesApp2['default'].state.toolbar.activeItem === 'community';
    _actionsToolbar2['default'].setActiveItem(isSelected ? 'none' : 'community');

    _actionsDisplay2['default'].changeViews('vaani-community');
  },
  toggleHelp: function toggleHelp() {
    if (_storesApp2['default'].state.firstTimeUse.tour.inFlight) {
      return;
    }

    var isSelected = _storesApp2['default'].state.toolbar.activeItem === 'help';
    _actionsToolbar2['default'].setActiveItem(isSelected ? 'none' : 'help');

    _actionsDisplay2['default'].changeViews('vaani-help');
  },
  template: '\n    <div id="toolbar">\n      <div class="community">\n        <img\n          alt="community"\n          src="/assets/images/community.png"\n          data-src-active="/assets/images/community_pressed.png"\n          data-src-inactive="/assets/images/community.png"\n        />\n      </div>\n      <div class="help">\n        <img\n          alt="help"\n          src="/assets/images/help.png"\n          data-src-active="/assets/images/help_pressed.png"\n          data-src-inactive="/assets/images/help.png"\n        />\n      </div>\n      <div class="clearfix"></div>\n    </div>\n\n    <style>\n      #toolbar {\n        padding: 1.5rem;\n      }\n      #toolbar .community {\n        float: left;\n      }\n      #toolbar .help {\n        float: right;\n      }\n      .clearfix {\n        clear: both;\n      }\n    </style>\n  '
});

exports['default'] = Toolbar;
module.exports = exports['default'];

},{"../actions/display":16,"../actions/toolbar":20,"../stores/app":33,"gaia-component":7}],29:[function(require,module,exports){
/* global document */
'use strict';

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _storesApp = require('./stores/app');

var _storesApp2 = _interopRequireDefault(_storesApp);

var _actionsDisplay = require('./actions/display');

var _actionsDisplay2 = _interopRequireDefault(_actionsDisplay);

require('./components/community');

require('./components/display');

require('./components/first-time-use');

require('./components/help');

require('./components/talkie');

require('./components/toolbar');

require('./components/standing-by');

require('./components/call-number');

window.myDebug = _debug2['default'];

/*
 * first time use stuff
 */

var launchCount = localStorage.getItem('launchCount') || 0;
launchCount = parseInt(launchCount, 10);
launchCount += 1;
localStorage.setItem('launchCount', launchCount);
_storesApp2['default'].state.firstTimeUse.launchCount = launchCount;

/*
 * instantiate top level components
 */

var display = document.createElement('vaani-display');
var talkie = document.createElement('vaani-talkie');
var toolbar = document.createElement('vaani-toolbar');

/*
 * kick things off
 */

document.body.appendChild(toolbar);
document.body.appendChild(talkie);
document.body.appendChild(display);

if (launchCount <= 2) {
  _storesApp2['default'].state.firstTimeUse.tour.inFlight = true;
  _actionsDisplay2['default'].changeViews('vaani-first-time-use');
}

/*
 * global state change handler
 */

var handleStateChange = function handleStateChange() {
  if (_storesApp2['default'].state.firstTimeUse.tour.inFlight) {
    if (_storesApp2['default'].state.firstTimeUse.tour.current === 0) {
      _actionsDisplay2['default'].changeViews(null);
    }
  }
};

_storesApp2['default'].addChangeListener(handleStateChange);

},{"./actions/display":16,"./components/call-number":21,"./components/community":22,"./components/display":23,"./components/first-time-use":24,"./components/help":25,"./components/standing-by":26,"./components/talkie":27,"./components/toolbar":28,"./stores/app":33,"debug":3}],30:[function(require,module,exports){
/* global navigator */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var AppLauncher = (function () {
  function AppLauncher() {
    _classCallCheck(this, AppLauncher);
  }

  _createClass(AppLauncher, null, [{
    key: 'launch',

    /**
     * Launches an app or returns an error
     * @param appName {String} The app to launch
     * @param entryPoint {String} The entry point of the app
     * @param callback {Function} The function to callback
     */
    value: function launch(appName, entryPoint, callback) {
      this.findByName(appName, function (err, app) {
        if (err) {
          callback(err);
          return;
        }

        app.launch(entryPoint);

        callback();
      });
    }

    /**
     * Finds an app by name
     * @param appName {String} The app to find
     */
  }, {
    key: 'findByName',
    value: function findByName(appName, callback) {
      if (!navigator.mozApps || !navigator.mozApps.mgmt) {
        callback(Error('navigator.mozApps not found'));
        return;
      }

      var allApps = navigator.mozApps.mgmt.getAll();

      allApps.onsuccess = function () {
        var installedApps = allApps.result;
        var foundApp = installedApps.find(function (app, index, array) {
          return app.manifest.name.toLowerCase() === appName.toLowerCase();
        });

        if (foundApp) {
          callback(null, foundApp);
        } else {
          callback(Error('App (' + appName + ') not found.'));
        }
      };

      allApps.onerror = callback;
    }
  }]);

  return AppLauncher;
})();

exports['default'] = AppLauncher;
module.exports = exports['default'];

},{}],31:[function(require,module,exports){
/* global navigator */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Dialer = (function () {
  function Dialer() {
    _classCallCheck(this, Dialer);
  }

  _createClass(Dialer, null, [{
    key: 'dial',

    /**
     * Dials the specified number
     * @param phoneNumber {String} The number to dial
     * @param callback {Function} The function to callback
     */
    value: function dial(phoneNumber, callback) {
      if (!navigator.mozTelephony) {
        callback(Error('navigator.mozTelephony not found'));
        return;
      }

      var telephony = navigator.mozTelephony;

      telephony.dial(phoneNumber).then(function (call) {
        callback(null, call);
      });
    }

    /**
     * Maps a string of number words to a string of number digits
     * @param words {String} The word numbers (separated by space)
     * @return digits {String} The digits (no spaces)
     */
  }, {
    key: 'wordsToDigits',
    value: function wordsToDigits(words) {
      var digits = words;

      digits = digits.replace(/call/g, '');
      digits = digits.replace(/zero/g, '0');
      digits = digits.replace(/one/g, '1');
      digits = digits.replace(/two/g, '2');
      digits = digits.replace(/three/g, '3');
      digits = digits.replace(/four/g, '4');
      digits = digits.replace(/five/g, '5');
      digits = digits.replace(/six/g, '6');
      digits = digits.replace(/seven/g, '7');
      digits = digits.replace(/eight/g, '8');
      digits = digits.replace(/nine/g, '9');
      digits = digits.replace(/o/g, '0');
      digits = digits.replace(/\s/g, '');

      return digits;
    }
  }]);

  return Dialer;
})();

exports['default'] = Dialer;
module.exports = exports['default'];

},{}],32:[function(require,module,exports){
/* global speechSynthesis, SpeechGrammarList, SpeechRecognition, SpeechSynthesisUtterance */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var debug = (0, _debug2['default'])('Vaani');

var Vaani = (function () {
  /**
   * @constructor
   * @param options {Object}
   * @param options.grammar {String} The JSGF 1.0 grammar list to be
   *        used by the speech recognition library
   * @param options.interpreter {Function} The function to call after
   *        speech recognition is attempted
   * @param options.onSay {Function} The function to call when say executes
   * @param options.onSayDone {Function} The function to call when say finishes
   * @param options.onListen {Function} The function to call when listen executes
   * @param options.onListenDone {Function} The function to call when listen finishes
   */

  function Vaani() {
    var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, Vaani);

    debug('constructor', arguments);

    if (!options.hasOwnProperty('grammar')) {
      throw Error('Missing required `grammar` option.');
    }

    if (!options.hasOwnProperty('interpreter')) {
      throw Error('Missing required `interpreter` option.');
    }

    this.speechGrammarList = new SpeechGrammarList();
    this.speechGrammarList.addFromString(options.grammar, 1);
    this.speechRecognition = new SpeechRecognition();
    this.isSpeaking = false;
    this.isListening = false;
    this._synthesisWasCanceled = false;
    this._interpreter = options.interpreter;
    this._onSay = options.onSay;
    this._onSayDone = options.onSayDone;
    this._onListen = options.onListen;
    this._onListenDone = options.onListenDone;
    this._interpretingCommand = false;
    this._audioEl = undefined;
  }

  /**
   * Says a sentence and optionally wait for a response
   * @param sentence {String} The sentence to be spoken
   * @param waitForResponse {Boolean} Indicates we will wait for a
   *        response after the sentence has been said
   */

  _createClass(Vaani, [{
    key: 'say',
    value: function say(sentence, waitForResponse) {
      var _this = this;

      debug('say', arguments);

      if (this._onSay) {
        this._onSay(sentence, waitForResponse);
      }

      if (waitForResponse) {
        this._interpretingCommand = true;
      }

      this.isSpeaking = true;
      this._synthesisWasCanceled = false;

      var lang = 'en'; // Aus: should be detected based on system language
      var sayItProud;

      // Reza: This is a temporary solution to help dev in the browser
      if (navigator.userAgent.indexOf('Mobile') === -1) {
        sayItProud = function () {
          _this._audioEl = document.createElement('audio');

          var url = 'http://speechan.cloudapp.net/weblayer/synth.ashx';
          url += '?lng=' + lang;
          url += '&msg=' + sentence;

          _this._audioEl.src = url;
          _this._audioEl.setAttribute('autoplay', 'true');
          _this._audioEl.addEventListener('ended', function () {
            _this.isSpeaking = false;

            if (_this._onSayDone) {
              _this._onSayDone(sentence, waitForResponse);
            }

            if (waitForResponse) {
              _this.listen();
            }
          });
        };
      } else {
        sayItProud = function () {
          var utterance = new SpeechSynthesisUtterance(sentence);

          utterance.lang = lang;
          utterance.addEventListener('end', function () {
            _this.isSpeaking = false;

            if (_this._onSayDone) {
              _this._onSayDone(sentence, waitForResponse);
            }

            if (waitForResponse && !_this._synthesisWasCanceled) {
              _this.listen();
            }
          });

          speechSynthesis.speak(utterance);
        };
      }

      // Aus: Wait an extra 100ms for the audio output to stabilize off
      setTimeout(sayItProud, 100);
    }

    /**
     * Listen for a response from the user
     */
  }, {
    key: 'listen',
    value: function listen() {
      var _this2 = this;

      debug('listen');

      if (this._onListen) {
        this._onListen();
      }

      this.isListening = true;

      this.speechRecognition.start();

      this.speechRecognition.onresult = function (event) {
        _this2.isListening = false;
        _this2._interpretingCommand = false;

        if (_this2._onListenDone) {
          _this2._onListenDone();
        }

        var transcript = '';
        var partialTranscript = '';
        // var confidence = 0;
        // var isFinal = false;

        // Assemble the transcript from the array of results
        for (var i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            // isFinal = true;
            transcript += event.results[i][0].transcript;
            // Aus: This is useless right now but the idea is we wouldn't
            // always complete the action or command requested if the
            // confidence level is too low
            // confidence = event.results[i][0].confidence;
          } else {
              partialTranscript += event.results[i][0].transcript;
              // Aus: In theory, partial transcripts shouldn't be used
              // as their confidence will always be lower than a final
              // transcript. We should ask the user to repeat what they
              // want when all we have is a partial transcript with 'low'
              // confidence.
              // confidence = event.results[i][0].confidence;
            }
        }

        // Aus: We'll fall back to the partial transcript if there
        // isn't a final one for now. It actually looks like we never
        // get a final transcript currently.
        var usableTranscript = transcript || partialTranscript;

        // Aus: Ugh. This is really crappy error handling
        if (usableTranscript === 'ERROR') {
          var getOffMyLawn = new Error('Unrecognized speech.');
          _this2._interpreter(getOffMyLawn);
        } else if (usableTranscript.length) {
          _this2._interpreter(null, usableTranscript);
        }
      };
    }

    /**
     * Cancels speech synthesis and/or recognition
     */
  }, {
    key: 'cancel',
    value: function cancel() {
      debug('cancel');

      if (this.isListening) {
        this.speechRecognition.abort();
      }

      if (this.isSpeaking) {
        if (this._audioEl) {
          this._audioEl.pause();
        } else {
          this._synthesisWasCanceled = true;
          speechSynthesis.cancel();
        }
      }

      this.isSpeaking = false;
      this.isListening = false;
    }
  }]);

  return Vaani;
})();

exports['default'] = Vaani;
module.exports = exports['default'];

},{"debug":3}],33:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _eventemitter2 = require('eventemitter2');

var CHANGE_EVENT = 'change';

var AppStore = (function () {
  /**
   * @constructor
   */

  function AppStore() {
    _classCallCheck(this, AppStore);

    this._emitter = new _eventemitter2.EventEmitter2();
    this.state = {
      display: {
        activeView: undefined
      },
      toolbar: {
        activeItem: 'none'
      },
      talkie: {
        mode: 'none',
        activeAnimation: 'none'
      },
      firstTimeUse: {
        launchCount: -1,
        tour: {
          inFlight: false,
          current: 1,
          total: 3
        }
      },
      standingBy: {
        text: ''
      },
      callNumber: {
        text: '',
        phoneNumber: ''
      }
    };
  }

  /**
   * Emits a change event
   */

  _createClass(AppStore, [{
    key: 'emitChange',
    value: function emitChange() {
      this._emitter.emit(CHANGE_EVENT);
    }

    /**
     * Adds a change listener to the emitter
     * @param func {Function} The function to add
     */
  }, {
    key: 'addChangeListener',
    value: function addChangeListener(func) {
      this._emitter.addListener(CHANGE_EVENT, func);
    }

    /**
     * Adds a change listener to the emitter
     * @param func {Function} The function to remove
     */
  }, {
    key: 'removeChangeListener',
    value: function removeChangeListener(func) {
      this._emitter.removeListener(CHANGE_EVENT, func);
    }
  }]);

  return AppStore;
})();

exports['default'] = new AppStore();
module.exports = exports['default'];

},{"eventemitter2":6}]},{},[29]);
