// ============================================
// polyfill_dom — Jsoup DOM API（对齐 Legado）
// ============================================

(function() {
  function Elements(html, css) {
    this._html = html || "";
    this._css = css || "";
    this._childElements = null;
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
      return {
        size: function() { return texts.length; },
        get: function(i) { return texts[i] || ""; },
        toArray: function() { return texts; }
      };
    }
    var decoded = Deno.core.ops.op_jsoup_each_text(this._html, this._css);
    var texts2 = JSON.parse(decoded);
    return {
      size: function() { return texts2.length; },
      get: function(i) { return texts2[i] || ""; },
      toArray: function() { return texts2; }
    };
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

  // ─── 新增 DOM 操作 ───

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
    return this;
  };

  Elements.prototype.addAll = function(el) {
    return this;
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

  // ─── 新增 DOM 操作 ───

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
    return {
      size: function() { return 1; },
      get: function(i) { return i === 0 ? t : ""; },
      toArray: function() { return [t]; }
    };
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

  // document stub
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

  // Packages 兼容层
  var Packages = {
    org: {
      jsoup: {
        Jsoup: {
          parse: function(html) {
            return new Element(String(html));
          }
        },
        select: {
          Elements: function() { return new Elements("", ""); },
          Element: function(tag) { return new Element("<" + tag + "></" + tag + ">"); }
        },
        nodes: {
          Element: function(tag) { return new Element("<" + tag + "></" + tag + ">"); }
        }
      }
    }
  };

  globalThis.Packages = Packages;
  globalThis.org = Packages.org;
})();
