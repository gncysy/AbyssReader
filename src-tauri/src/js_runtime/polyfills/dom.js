// ============================================
// polyfill_dom — Jsoup DOM API + JsonPath（对齐 Legado）
// ============================================

(function() {
  function makeIterable(obj) {
    obj[Symbol.iterator] = function() {
        var self = this;
        var i = 0;
        return {
            next: function() {
                if (i < self.size()) {
                    return { value: self.get(i++), done: false };
                }
                return { done: true };
            }
        };
    };
    return obj;
  }

  function Elements(html, css) {
    this._html = html || "";
    this._css = css || "";
    this._childElements = null;
    makeIterable(this);
  }

  Elements.prototype.size = function() {
    if (this._childElements !== null) return this._childElements.length;
    return Deno.core.ops.op_jsoup_size(this._html, this._css);
  };

  Elements.prototype.get = function(i) {
    if (this._childElements !== null) {
      return new Element(this._childElements[i] || "");
    }
    return new Element(Deno.core.ops.op_jsoup_get(this._html, this._css, i));
  };

  Elements.prototype.first = function() {
    return this.get(0);
  };

  Elements.prototype.last = function() {
    var s = this.size();
    return s > 0 ? this.get(s - 1) : new Element("");
  };

  Elements.prototype.text = function() {
    if (this._childElements !== null) {
      var t = "";
      for (var i = 0; i < this._childElements.length; i++) {
        t += Deno.core.ops.op_jsoup_text(this._childElements[i]);
      }
      return t;
    }
    return Deno.core.ops.op_jsoup_text(this._html);
  };

  Elements.prototype.html = function() {
    if (this._childElements !== null) {
      return this._childElements.join("");
    }
    return Deno.core.ops.op_jsoup_html(this._html);
  };

  Elements.prototype.outerHtml = function() {
    if (this._childElements !== null) {
      return this._childElements.join("");
    }
    return Deno.core.ops.op_jsoup_outer_html(this._html);
  };

  // 修复：toString 返回 outerHtml，避免 [object Object]
  Elements.prototype.toString = function() {
    return this.outerHtml();
  };

  Elements.prototype.attr = function(name) {
    if (this._childElements !== null) {
      if (this._childElements.length > 0) {
        return Deno.core.ops.op_jsoup_attr(this._childElements[0], name);
      }
      return "";
    }
    return Deno.core.ops.op_jsoup_attr(this._html, name);
  };

  Elements.prototype.eachText = function() {
    if (this._childElements !== null) {
      var texts = [];
      for (var i = 0; i < this._childElements.length; i++) {
        texts.push(Deno.core.ops.op_jsoup_text(this._childElements[i]));
      }
      return makeIterable({
        size: function() { return texts.length; },
        get: function(i) { return texts[i] || ""; },
        toArray: function() { return texts; }
      });
    }
    var decoded = Deno.core.ops.op_jsoup_each_text(this._html, this._css);
    var texts2 = JSON.parse(decoded);
    return makeIterable({
      size: function() { return texts2.length; },
      get: function(i) { return texts2[i] || ""; },
      toArray: function() { return texts2; }
    });
  };

  Elements.prototype.select = function(css) {
    if (this._childElements !== null) {
      var allSelected = [];
      for (var i = 0; i < this._childElements.length; i++) {
        var subHtml = Deno.core.ops.op_jsoup_select(this._childElements[i], css);
        try {
          var parsed = JSON.parse(subHtml);
          allSelected = allSelected.concat(parsed);
        } catch(e) {}
      }
      var result = new Elements("", "");
      result._childElements = allSelected;
      return result;
    }
    return new Elements(this._html, css);
  };

  Elements.prototype.remove = function(css) {
    var result = Deno.core.ops.op_jsoup_remove(this._html, css || this._css);
    this._html = result;
    return this;
  };

  Elements.prototype.before = function(content) {
    var result = Deno.core.ops.op_jsoup_before(this._html, this._css, String(content));
    this._html = result;
    return this;
  };

  Elements.prototype.after = function(content) {
    var result = Deno.core.ops.op_jsoup_after(this._html, this._css, String(content));
    this._html = result;
    return this;
  };

  Elements.prototype.prepend = function(content) {
    var result = Deno.core.ops.op_jsoup_prepend(this._html, this._css, String(content));
    this._html = result;
    return this;
  };

  Elements.prototype.append = function(content) {
    var result = Deno.core.ops.op_jsoup_append(this._html, this._css, String(content));
    this._html = result;
    return this;
  };

  Elements.prototype.eq = function(i) {
    return this.get(i);
  };

  Elements.prototype.isEmpty = function() {
    return this.size() === 0;
  };

  Elements.prototype.add = function(el) {
    if (el instanceof Elements) {
      var combined = new Elements("", "");
      var all = [];
      for (var i = 0; i < this.size(); i++) {
        all.push(this.get(i)._html);
      }
      for (var j = 0; j < el.size(); j++) {
        all.push(el.get(j)._html);
      }
      combined._childElements = all;
      return combined;
    }
    return this;
  };

  Elements.prototype.addAll = function(el) {
    return this.add(el);
  };

  Elements.prototype.toArray = function() {
    var arr = [];
    for (var i = 0; i < this.size(); i++) arr.push(this.get(i));
    return arr;
  };

  Elements.prototype.forEach = function(fn) {
    for (var i = 0; i < this.size(); i++) fn(this.get(i), i);
  };

  function Element(html) {
    this._html = html || "";
  }

  Element.prototype.select = function(css) {
    return new Elements(this._html, css);
  };

  Element.prototype.text = function() {
    return Deno.core.ops.op_jsoup_text(this._html);
  };

  Element.prototype.ownText = function() {
    return Deno.core.ops.op_jsoup_own_text(this._html);
  };

  Element.prototype.html = function() {
    return Deno.core.ops.op_jsoup_html(this._html);
  };

  Element.prototype.outerHtml = function() {
    return Deno.core.ops.op_jsoup_outer_html(this._html);
  };

  Element.prototype.toString = function() {
    return this.outerHtml();
  };

  Element.prototype.attr = function(name) {
    return Deno.core.ops.op_jsoup_attr(this._html, name);
  };

  Element.prototype.tagName = function() {
    return Deno.core.ops.op_jsoup_tag_name(this._html);
  };

  Element.prototype.children = function() {
    var decoded = Deno.core.ops.op_jsoup_children(this._html);
    var childElements = JSON.parse(decoded);
    var result = new Elements("", "");
    result._childElements = childElements;
    return result;
  };

  Element.prototype.before = function(content) {
    var result = Deno.core.ops.op_jsoup_before(this._html, "", String(content));
    this._html = result;
    return this;
  };

  Element.prototype.after = function(content) {
    var result = Deno.core.ops.op_jsoup_after(this._html, "", String(content));
    this._html = result;
    return this;
  };

  Element.prototype.prepend = function(content) {
    var result = Deno.core.ops.op_jsoup_prepend(this._html, "", String(content));
    this._html = result;
    return this;
  };

  Element.prototype.append = function(content) {
    var result = Deno.core.ops.op_jsoup_append(this._html, "", String(content));
    this._html = result;
    return this;
  };

  Element.prototype.remove = function() {
    return this;
  };

  Element.prototype.eachText = function() {
    var t = this.text();
    return makeIterable({
      size: function() { return 1; },
      get: function(i) { return i === 0 ? t : ""; },
      toArray: function() { return [t]; }
    });
  };

  Element.prototype.isEmpty = function() {
    return false;
  };

  Element.prototype.add = function(el) {
    return this;
  };

  Element.prototype.addAll = function(el) {
    return this;
  };

  // ─── JsonPath 实现（对齐 com.jayway.jsonpath） ───

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

    // 处理递归下降语法 $..xxx
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

    // 递归下降标记
    if (segment.startsWith('..')) {
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

    // 切片 [:2] / [1:] / [1:3]
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

    // 多索引 [0,1,2]
    if (segment.indexOf(',') !== -1) {
      var indexes = segment.split(',').map(function(s) { return s.trim(); });
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
          if (item.hasOwnProperty(key)) {
            traverse(item[key]);
          }
        }
      }
    }
    traverse(obj);
    return results.length > 0 ? results : null;
  }

  // ─── Configuration + Option ───

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

  // ─── JsonPath ───

  var JsonPath = {
    using: function(config) {
      return {
        parse: function(jsonStr) {
          var data;
          if (typeof jsonStr === 'string') {
            try {
              data = JSON.parse(jsonStr);
            } catch (e) {
              data = {};
            }
          } else {
            data = jsonStr;
          }
          return new SimpleJsonPathQuery(data, '$');
        }
      };
    },
    parse: function(jsonStr) {
      var data;
      if (typeof jsonStr === 'string') {
        try {
          data = JSON.parse(jsonStr);
        } catch (e) {
          data = {};
        }
      } else {
        data = jsonStr;
      }
      return new SimpleJsonPathQuery(data, '$');
    },
    read: function(jsonStr, path) {
      var data;
      if (typeof jsonStr === 'string') {
        try {
          data = JSON.parse(jsonStr);
        } catch (e) {
          data = {};
        }
      } else {
        data = jsonStr;
      }
      return jsonPathQuery(data, path);
    }
  };

  var docElementStub = {
    nodeType: 1,
    nodeName: "HTML",
    tagName: "HTML"
  };

  globalThis.document = globalThis.document || {
    documentElement: docElementStub,
    createElement: function(tag) { return new Element("<" + tag + "></" + tag + ">"); },
    createTextNode: function(text) { return new Element(text); },
    getElementById: function(id) { return null; },
    getElementsByTagName: function(name) { return []; },
    getElementsByClassName: function(name) { return []; },
    querySelector: function(sel) { return null; },
    querySelectorAll: function(sel) { return []; },
    body: docElementStub,
    head: docElementStub
  };

  var Packages = {
    org: {
      jsoup: {
        Jsoup: {
          parse: function(html) {
            return new Element(String(html));
          }
        },
        select: {
          Elements: function() {
            var e = new Elements("", "");
            return e;
          },
          Element: function(tag) { return new Element("<" + tag + "></" + tag + ">"); }
        },
        nodes: {
          Element: function(tag) { return new Element("<" + tag + "></" + tag + ">"); }
        }
      }
    },
    com: {
      jayway: {
        jsonpath: {
          JsonPath: JsonPath,
          Configuration: Configuration,
          Option: Option,
          ReadContext: SimpleJsonPathQuery
        }
      }
    }
  };

  globalThis.Packages = Packages;
  globalThis.org = Packages.org;
  globalThis.com = Packages.com;
})();
