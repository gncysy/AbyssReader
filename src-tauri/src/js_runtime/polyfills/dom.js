// ============================================
// polyfill_dom — Jsoup DOM API（句柄式）
// ============================================
//
// 对齐 Jsoup 语义：
// - Element 持有 (tree_handle, node_id)，不是 HTML 字符串
// - 所有操作通过 op 传递句柄，Rust 侧在树上直接执行
// - 零拷贝：一次 parse，多次操作
//
// JSONPath 已拆出到 jsonpath.js，本文件只管 DOM。

(function() {
  'use strict';

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

  // ─── Element ───

  function Element(treeHandle, nodeId) {
    this._treeHandle = treeHandle;
    this._nodeId = nodeId;
  }

  Element.prototype.select = function(css) {
    var nodeIds = Deno.core.ops.op_jsoup_select_in_subtree(this._treeHandle, this._nodeId, String(css || ''));
    return new Elements(this._treeHandle, nodeIds);
  };

  Element.prototype.text = function() {
    return Deno.core.ops.op_jsoup_text(this._treeHandle, this._nodeId) || '';
  };

  Element.prototype.ownText = function() {
    return Deno.core.ops.op_jsoup_own_text(this._treeHandle, this._nodeId) || '';
  };

  Element.prototype.html = function() {
    return Deno.core.ops.op_jsoup_inner_html(this._treeHandle, this._nodeId) || '';
  };

  Element.prototype.outerHtml = function() {
    return Deno.core.ops.op_jsoup_outer_html(this._treeHandle, this._nodeId) || '';
  };

  Element.prototype.toString = function() {
    return this.outerHtml();
  };

  Element.prototype.attr = function(name) {
    return Deno.core.ops.op_jsoup_attr(this._treeHandle, this._nodeId, String(name)) || '';
  };

  Element.prototype.hasAttr = function(name) {
    return !!Deno.core.ops.op_jsoup_has_attr(this._treeHandle, this._nodeId, String(name));
  };

  Element.prototype.tagName = function() {
    return Deno.core.ops.op_jsoup_tag_name(this._treeHandle, this._nodeId) || '';
  };

  Element.prototype.children = function() {
    var nodeIds = Deno.core.ops.op_jsoup_children(this._treeHandle, this._nodeId);
    return new Elements(this._treeHandle, nodeIds);
  };

  Element.prototype.child = function(index) {
    var nodeId = Deno.core.ops.op_jsoup_child(this._treeHandle, this._nodeId, index >>> 0);
    if (nodeId === 0) return null;
    return new Element(this._treeHandle, nodeId);
  };

  Element.prototype.childNodeSize = function() {
    return Deno.core.ops.op_jsoup_child_count(this._treeHandle, this._nodeId);
  };

  Element.prototype.parent = function() {
    var nodeId = Deno.core.ops.op_jsoup_parent(this._treeHandle, this._nodeId);
    if (nodeId === 0) return null;
    return new Element(this._treeHandle, nodeId);
  };

  Element.prototype.nextElementSibling = function() {
    var nodeId = Deno.core.ops.op_jsoup_next_sibling(this._treeHandle, this._nodeId);
    if (nodeId === 0) return null;
    return new Element(this._treeHandle, nodeId);
  };

  Element.prototype.previousElementSibling = function() {
    var nodeId = Deno.core.ops.op_jsoup_prev_sibling(this._treeHandle, this._nodeId);
    if (nodeId === 0) return null;
    return new Element(this._treeHandle, nodeId);
  };

  Element.prototype.firstElementSibling = function() {
    var nodeId = Deno.core.ops.op_jsoup_first_sibling(this._treeHandle, this._nodeId);
    if (nodeId === 0) return null;
    return new Element(this._treeHandle, nodeId);
  };

  Element.prototype.lastElementSibling = function() {
    var nodeId = Deno.core.ops.op_jsoup_last_sibling(this._treeHandle, this._nodeId);
    if (nodeId === 0) return null;
    return new Element(this._treeHandle, nodeId);
  };

  Element.prototype.siblingElements = function() {
    var nodeIds = Deno.core.ops.op_jsoup_siblings(this._treeHandle, this._nodeId);
    return new Elements(this._treeHandle, nodeIds);
  };

  Element.prototype.before = function(content) {
    Deno.core.ops.op_jsoup_before(this._treeHandle, this._nodeId, String(content));
    return this;
  };

  Element.prototype.after = function(content) {
    Deno.core.ops.op_jsoup_after(this._treeHandle, this._nodeId, String(content));
    return this;
  };

  Element.prototype.prepend = function(content) {
    Deno.core.ops.op_jsoup_prepend(this._treeHandle, this._nodeId, String(content));
    return this;
  };

  Element.prototype.append = function(content) {
    Deno.core.ops.op_jsoup_append(this._treeHandle, this._nodeId, String(content));
    return this;
  };

  Element.prototype.remove = function() {
    Deno.core.ops.op_jsoup_detach(this._treeHandle, this._nodeId);
    return this;
  };

  Element.prototype.eachText = function() {
    var t = this.text();
    return makeIterable({
      size: function() { return 1; },
      get: function(i) { return i === 0 ? t : ''; },
      toArray: function() { return [t]; }
    });
  };

  Element.prototype.isEmpty = function() {
    return this._nodeId === 0;
  };

  Element.prototype.add = function(_el) { return this; };
  Element.prototype.addAll = function(_el) { return this; };

  // ─── Elements ───

  function Elements(treeHandle, nodeIds) {
    this._treeHandle = treeHandle;
    this._nodeIds = nodeIds || [];
    makeIterable(this);
  }

  Elements.prototype.size = function() {
    return this._nodeIds.length;
  };

  Elements.prototype.get = function(i) {
    if (i < 0 || i >= this._nodeIds.length) return null;
    return new Element(this._treeHandle, this._nodeIds[i]);
  };

  Elements.prototype.eq = function(i) {
    if (i < 0 || i >= this._nodeIds.length) return null;
    return new Element(this._treeHandle, this._nodeIds[i]);
  };

  Elements.prototype.first = function() {
    if (this._nodeIds.length === 0) return null;
    return new Element(this._treeHandle, this._nodeIds[0]);
  };

  Elements.prototype.last = function() {
    if (this._nodeIds.length === 0) return null;
    return new Element(this._treeHandle, this._nodeIds[this._nodeIds.length - 1]);
  };

  Elements.prototype.isEmpty = function() {
    return this._nodeIds.length === 0;
  };

  Elements.prototype.text = function() {
    var parts = [];
    for (var i = 0; i < this._nodeIds.length; i++) {
      var t = Deno.core.ops.op_jsoup_text(this._treeHandle, this._nodeIds[i]) || '';
      if (t) parts.push(t);
    }
    return parts.join(' ');
  };

  Elements.prototype.html = function() {
    var parts = [];
    for (var i = 0; i < this._nodeIds.length; i++) {
      parts.push(Deno.core.ops.op_jsoup_inner_html(this._treeHandle, this._nodeIds[i]) || '');
    }
    return parts.join('\n');
  };

  Elements.prototype.outerHtml = function() {
    var parts = [];
    for (var i = 0; i < this._nodeIds.length; i++) {
      parts.push(Deno.core.ops.op_jsoup_outer_html(this._treeHandle, this._nodeIds[i]) || '');
    }
    return parts.join('\n');
  };

  Elements.prototype.toString = function() {
    return this.outerHtml();
  };

  Elements.prototype.attr = function(name) {
    for (var i = 0; i < this._nodeIds.length; i++) {
      var id = this._nodeIds[i];
      if (Deno.core.ops.op_jsoup_has_attr(this._treeHandle, id, String(name))) {
        return Deno.core.ops.op_jsoup_attr(this._treeHandle, id, String(name)) || '';
      }
    }
    return '';
  };

  Elements.prototype.hasAttr = function(name) {
    for (var i = 0; i < this._nodeIds.length; i++) {
      if (Deno.core.ops.op_jsoup_has_attr(this._treeHandle, this._nodeIds[i], String(name))) {
        return true;
      }
    }
    return false;
  };

  Elements.prototype.select = function(css) {
    var all = [];
    for (var i = 0; i < this._nodeIds.length; i++) {
      var sub = Deno.core.ops.op_jsoup_select_in_subtree(this._treeHandle, this._nodeIds[i], String(css || ''));
      for (var j = 0; j < sub.length; j++) {
        if (all.indexOf(sub[j]) === -1) all.push(sub[j]);
      }
    }
    return new Elements(this._treeHandle, all);
  };

  Elements.prototype.eachText = function() {
    var texts = [];
    for (var i = 0; i < this._nodeIds.length; i++) {
      texts.push(Deno.core.ops.op_jsoup_text(this._treeHandle, this._nodeIds[i]) || '');
    }
    return makeIterable({
      size: function() { return texts.length; },
      get: function(i) { return texts[i] || ''; },
      toArray: function() { return texts; }
    });
  };

  Elements.prototype.remove = function(css) {
    if (css) {
      for (var i = 0; i < this._nodeIds.length; i++) {
        Deno.core.ops.op_jsoup_remove_in_subtree(this._treeHandle, this._nodeIds[i], String(css));
      }
    } else {
      for (var i = 0; i < this._nodeIds.length; i++) {
        Deno.core.ops.op_jsoup_detach(this._treeHandle, this._nodeIds[i]);
      }
    }
    return this;
  };

  Elements.prototype.add = function(el) {
    if (el instanceof Elements) {
      var combined = this._nodeIds.slice();
      for (var i = 0; i < el._nodeIds.length; i++) {
        if (combined.indexOf(el._nodeIds[i]) === -1) combined.push(el._nodeIds[i]);
      }
      return new Elements(this._treeHandle, combined);
    }
    return this;
  };

  Elements.prototype.addAll = function(el) {
    return this.add(el);
  };

  Elements.prototype.toArray = function() {
    var arr = [];
    for (var i = 0; i < this._nodeIds.length; i++) arr.push(this.get(i));
    return arr;
  };

  Elements.prototype.forEach = function(fn) {
    for (var i = 0; i < this._nodeIds.length; i++) fn(this.get(i), i);
  };

  // ─── Jsoup 命名空间 ───

  var Jsoup = {
    parse: function(html) {
      var parsed = Deno.core.ops.op_jsoup_parse(String(html == null ? '' : html));
      return new Element(parsed[0], parsed[1]);
    },
    parseBodyFragment: function(html) {
      var parsed = Deno.core.ops.op_jsoup_parse_fragment(String(html == null ? '' : html));
      return new Element(parsed[0], parsed[1]);
    },
    parseFragment: function(html) {
      var parsed = Deno.core.ops.op_jsoup_parse_fragment(String(html == null ? '' : html));
      return new Element(parsed[0], parsed[1]);
    },
    clean: function(html) { return String(html == null ? '' : html); }
  };

  // ─── 挂到全局 ───

  globalThis.Element = Element;
  globalThis.Elements = Elements;

  globalThis.__abyss_is_dom_object = function(v) {
    return v instanceof Element || v instanceof Elements;
  };

  // 合并到 Packages（与 jsonpath.js / packages.js 协作，不覆盖已存在字段）
  globalThis.Packages = globalThis.Packages || {};
  globalThis.Packages.org = globalThis.Packages.org || {};
  globalThis.Packages.org.jsoup = {
    Jsoup: Jsoup,
    select: {
      Elements: function() { return new Elements(0, []); },
      Element: function(tag) {
        var parsed = Deno.core.ops.op_jsoup_parse_fragment('<' + tag + '></' + tag + '>');
        return new Element(parsed[0], parsed[1]);
      }
    },
    nodes: {
      Element: function(tag) {
        var parsed = Deno.core.ops.op_jsoup_parse_fragment('<' + tag + '></' + tag + '>');
        return new Element(parsed[0], parsed[1]);
      }
    }
  };
  globalThis.org = globalThis.Packages.org;
})();
