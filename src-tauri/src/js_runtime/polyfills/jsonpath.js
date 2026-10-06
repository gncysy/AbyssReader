// ============================================
// polyfill_jsonpath — 轻量级 JSONPath 实现（对齐 com.jayway.jsonpath）
// ============================================
//
// 从原 dom.js 拆出，独立文件，与 DOM 无关。
// 通过 globalThis.Packages.com.jayway.jsonpath 暴露。

(function() {
  'use strict';

  function SimpleJsonPathQuery(data, path) {
    this._data = data;
    this._path = path;
  }

  SimpleJsonPathQuery.prototype.read = function(path) {
    if (path === undefined || path === null) return null;
    var actualPath = typeof path === 'string' ? path : this._path;
    var result = jsonPathQuery(this._data, actualPath);
    if (result === undefined || result === null) return null;
    return result;
  };

  function jsonPathQuery(data, path) {
    if (!path || typeof path !== 'string') return null;
    var trimmed = path.trim();
    if (!trimmed.startsWith('$')) return null;

    if (trimmed === '$') return data;

    var segments = parseJsonPath(trimmed);
    if (segments.length === 0) return null;

    var current = [data];
    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si];
      if (seg === undefined) continue;
      var next = [];
      for (var ci = 0; ci < current.length; ci++) {
        var item = current[ci];
        if (item === null || item === undefined) continue;
        var resolved = resolveJsonPathSegment(item, seg);
        if (Array.isArray(resolved)) {
          for (var ri = 0; ri < resolved.length; ri++) {
            if (resolved[ri] !== undefined && resolved[ri] !== null) {
              next.push(resolved[ri]);
            }
          }
        } else if (resolved !== undefined && resolved !== null) {
          next.push(resolved);
        }
      }
      current = next;
    }
    return current.length === 0 ? null : (current.length === 1 ? current[0] : current);
  }

  function parseJsonPath(path) {
    var normalized = path.replace(/^\$/, '');
    if (!normalized) return [];
    normalized = normalized.replace(/^\./, '');
    normalized = normalized.replace(/^\[/, '');

    var segments = [];
    var current = '';
    var inBracket = false;
    var bracketContent = '';

    for (var i = 0; i < normalized.length; i++) {
      var ch = normalized[i];
      if (ch === '[') {
        if (current) { segments.push(current); current = ''; }
        inBracket = true;
        bracketContent = '';
      } else if (ch === ']') {
        if (bracketContent) { segments.push(bracketContent); bracketContent = ''; }
        inBracket = false;
      } else if (ch === '.' && !inBracket) {
        if (current) { segments.push(current); current = ''; }
      } else if (inBracket) {
        bracketContent += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push(current);
    if (inBracket && bracketContent) segments.push(bracketContent);

    return segments.filter(function(s) { return s && s.trim(); });
  }

  function resolveJsonPathSegment(data, segment) {
    if (data === null || data === undefined) return null;

    if (segment === '*') {
      if (Array.isArray(data)) {
        return data.length > 0 ? data : null;
      }
      if (typeof data === 'object') {
        var values = Object.values(data);
        return values.length > 0 ? values : null;
      }
      return null;
    }

    if (segment.indexOf('..') === 0) {
      var propName = segment.substring(2);
      return recursiveFind(data, propName);
    }

    if (/^-?\d+$/.test(segment)) {
      var index = parseInt(segment, 10);
      if (Array.isArray(data)) {
        var actualIndex = index < 0 ? data.length + index : index;
        if (actualIndex >= 0 && actualIndex < data.length) {
          return data[actualIndex];
        }
      }
      return null;
    }

    var sliceMatch = segment.match(/^(-?\d*):(-?\d*)$/);
    if (sliceMatch) {
      if (Array.isArray(data)) {
        var start = sliceMatch[1] ? parseInt(sliceMatch[1], 10) : 0;
        var end = sliceMatch[2] ? parseInt(sliceMatch[2], 10) : data.length;
        var s = start < 0 ? Math.max(0, data.length + start) : Math.min(start, data.length);
        var e = end < 0 ? Math.max(0, data.length + end) : Math.min(end, data.length);
        return data.slice(s, e);
      }
      return null;
    }

    if (segment.indexOf(',') !== -1) {
      var indexes = segment.split(',').map(function(x) { return x.trim(); });
      if (Array.isArray(data)) {
        var result = [];
        for (var i = 0; i < indexes.length; i++) {
          var idx = parseInt(indexes[i], 10);
          if (!isNaN(idx) && idx >= 0 && idx < data.length) {
            result.push(data[idx]);
          }
        }
        return result.length > 0 ? result : null;
      }
      return null;
    }

    if (typeof data === 'object') {
      return data[segment];
    }
    return null;
  }

  function recursiveFind(obj, prop) {
    var results = [];
    var visited = new WeakSet();

    function traverse(item) {
      if (item === null || item === undefined) return;
      if (typeof item === 'object') {
        if (visited.has(item)) return;
        visited.add(item);
      }
      if (Array.isArray(item)) {
        for (var i = 0; i < item.length; i++) {
          traverse(item[i]);
        }
        return;
      }
      if (typeof item === 'object') {
        if (prop in item && item[prop] !== undefined) {
          results.push(item[prop]);
        }
        for (var key in item) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            traverse(item[key]);
          }
        }
      }
    }
    traverse(obj);
    return results.length > 0 ? results : null;
  }

  function Configuration() {}
  Configuration.prototype.options = function() { return this; };
  Configuration.prototype.build = function() { return this; };

  var Option = {
    SUPPRESS_EXCEPTIONS: 'SUPPRESS_EXCEPTIONS',
    DEFAULT_PATH_LEAF_TO_NULL: 'DEFAULT_PATH_LEAF_TO_NULL',
    ALWAYS_RETURN_LIST: 'ALWAYS_RETURN_LIST',
    AS_PATH_LIST: 'AS_PATH_LIST',
    REQUIRE_PROPERTIES: 'REQUIRE_PROPERTIES'
  };

  function parseJsonStr(jsonStr) {
    if (typeof jsonStr === 'string') {
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        return {};
      }
    }
    return jsonStr;
  }

  var JsonPath = {
    using: function(_config) {
      return {
        parse: function(jsonStr) {
          return new SimpleJsonPathQuery(parseJsonStr(jsonStr), '$');
        }
      };
    },
    parse: function(jsonStr) {
      return new SimpleJsonPathQuery(parseJsonStr(jsonStr), '$');
    },
    read: function(jsonStr, path) {
      return jsonPathQuery(parseJsonStr(jsonStr), path);
    }
  };

  // 挂到共享的 Packages 命名空间（与 dom.js / packages.js 合并）
  globalThis.Packages = globalThis.Packages || {};
  globalThis.Packages.com = globalThis.Packages.com || {};
  globalThis.Packages.com.jayway = {
    jsonpath: {
      JsonPath: JsonPath,
      Configuration: Configuration,
      Option: Option,
      ReadContext: SimpleJsonPathQuery
    }
  };
  globalThis.com = globalThis.Packages.com;
})();
