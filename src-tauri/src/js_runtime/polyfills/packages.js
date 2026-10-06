// ============================================
// polyfill_packages — Packages.java.* 命名空间
// ============================================
//
// 背景：番茄书源 jsLib 用 Packages.java.math.BigInteger 等 Java 路径。
// 本项目无 JVM，用 JS 模拟这些类，底层复用已有 Rust op。
//
// 依赖：
// - globalThis.BigInteger（bigint.js 提供）
// - globalThis.sm3（sm3.js 提供）
// - Deno.core.ops.*（Rust op）
// - globalThis.__sandbox_data（runtime 注入）

(function() {
  'use strict';

  // ─── 工具：字节数组归一化 ───

  function toU8(data) {
    if (data === null || data === undefined) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) return new Uint8Array(data);
    if (typeof data === 'string') {
      return Deno.core.ops.op_java_str_to_bytes(data, 'UTF-8');
    }
    if (data && typeof data === 'object') {
      var arr = [];
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (typeof v === 'number') arr.push(v);
      }
      return new Uint8Array(arr);
    }
    return new Uint8Array(0);
  }

  function u8ToHex(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) {
      s += ('0' + u8[i].toString(16)).slice(-2);
    }
    return s;
  }

  function hexToU8(hex) {
    var s = String(hex).replace(/\s/g, '');
    if (s.length % 2) s = '0' + s;
    var out = new Uint8Array(s.length / 2);
    for (var i = 0; i < s.length; i += 2) {
      out[i / 2] = parseInt(s.substr(i, 2), 16);
    }
    return out;
  }

  // ─── java.lang.String ───

  function JavaString(value, charsetOrBytes) {
    if (arguments.length === 2 && typeof charsetOrBytes === 'string') {
      var cs = charsetOrBytes.toUpperCase();
      var bytes = toU8(value);
      return Deno.core.ops.op_java_bytes_to_str(bytes, cs);
    }
    return String(value === null || value === undefined ? '' : value);
  }

  JavaString.fromCharCode = function() {
    return String.fromCharCode.apply(null, arguments);
  };

  // ─── java.lang.System ───

  var JavaSystem = {
    arraycopy: function(src, srcPos, dest, destPos, length) {
      for (var i = 0; i < length; i++) {
        dest[destPos + i] = src[srcPos + i];
      }
    },
    currentTimeMillis: function() { return Date.now(); },
    nanoTime: function() { return Date.now() * 1000000; }
  };

  // ─── java.math.BigInteger ───

  var JavaBigInteger = globalThis.BigInteger || function(v) {
    this._v = BigInt(v);
  };

  // ─── java.security.MessageDigest ───

  function MessageDigest(algo) {
    this._algo = String(algo).toUpperCase().replace('-', '');
    this._buffer = new Uint8Array(0);
  }

  MessageDigest.getInstance = function(algo) { return new MessageDigest(algo); };

  MessageDigest.prototype.update = function(bytes) {
    var u8 = toU8(bytes);
    var next = new Uint8Array(this._buffer.length + u8.length);
    next.set(this._buffer, 0);
    next.set(u8, this._buffer.length);
    this._buffer = next;
    return this;
  };

  MessageDigest.prototype.digest = function(bytes) {
    var u8;
    if (bytes === undefined || bytes === null) {
      u8 = this._buffer;
    } else {
      var more = toU8(bytes);
      u8 = new Uint8Array(this._buffer.length + more.length);
      u8.set(this._buffer, 0);
      u8.set(more, this._buffer.length);
    }
    this._buffer = new Uint8Array(0);

    var algo = this._algo;
    if (algo === 'MD5') {
      var hex = Deno.core.ops.op_java_md5_encode(Deno.core.ops.op_java_bytes_to_str(u8, 'UTF-8'));
      return hexToU8(hex);
    }
    if (algo === 'SHA1') {
      var hex1 = Deno.core.ops.op_java_sha1_encode(Deno.core.ops.op_java_bytes_to_str(u8, 'UTF-8'));
      return hexToU8(hex1);
    }
    if (algo === 'SHA256') {
      var hex2 = Deno.core.ops.op_java_sha256_encode(Deno.core.ops.op_java_bytes_to_str(u8, 'UTF-8'));
      return hexToU8(hex2);
    }
    if (algo === 'SM3') {
      if (typeof globalThis.sm3 === 'function') {
        return globalThis.sm3(u8);
      }
      return new Uint8Array(0);
    }
    return new Uint8Array(0);
  };

  // ─── java.security.SecureRandom ───

  function SecureRandom() {}
  SecureRandom.getInstance = function(_algo) { return new SecureRandom(); };
  SecureRandom.prototype.nextBytes = function(arr) {
    var u8 = toU8(arr);
    var random = Deno.core.ops.op_java_random_bytes(u8.length);
    for (var i = 0; i < u8.length; i++) {
      u8[i] = random[i];
    }
    return u8;
  };

  // ─── java.util.Arrays ───

  var JavaArrays = {
    copyOf: function(arr, newLen) {
      var src = toU8(arr);
      var out = new Uint8Array(newLen);
      out.set(src.subarray(0, Math.min(src.length, newLen)));
      return out;
    },
    copyOfRange: function(arr, from, to) {
      var src = toU8(arr);
      var len = to - from;
      var out = new Uint8Array(len);
      out.set(src.subarray(from, from + len));
      return out;
    }
  };

  // ─── java.util.Base64 ───

  var Base64Encoder = {
    encodeToString: function(bytes) {
      var u8 = toU8(bytes);
      return Deno.core.ops.op_java_base64_encode_bytes(u8);
    }
  };

  var Base64Decoder = {
    decode: function(str) {
      return Deno.core.ops.op_java_base64_decode_bytes(String(str));
    }
  };

  var JavaBase64 = {
    getEncoder: function() { return Base64Encoder; },
    getDecoder: function() { return Base64Decoder; }
  };

  // ─── java.util.HashMap ───

  function HashMap() { this._m = {}; this._size = 0; }
  HashMap.prototype.put = function(k, v) {
    var key = String(k);
    if (!(key in this._m)) this._size++;
    this._m[key] = v;
    return v;
  };
  HashMap.prototype.get = function(k) { return this._m[String(k)]; };
  HashMap.prototype.containsKey = function(k) { return String(k) in this._m; };
  HashMap.prototype.remove = function(k) {
    var key = String(k);
    if (key in this._m) { delete this._m[key]; this._size--; }
  };
  HashMap.prototype.size = function() { return this._size; };
  HashMap.prototype.clear = function() { this._m = {}; this._size = 0; };
  HashMap.prototype.keySet = function() { return Object.keys(this._m); };
  HashMap.prototype.values = function() {
    var self = this;
    return Object.keys(this._m).map(function(k) { return self._m[k]; });
  };
  HashMap.prototype.entrySet = function() {
    var self = this;
    return Object.keys(this._m).map(function(k) {
      return { getKey: function() { return k; }, getValue: function() { return self._m[k]; } };
    });
  };
  HashMap.prototype.forEach = function(fn) {
    var self = this;
    Object.keys(this._m).forEach(function(k) { fn(self._m[k], k); });
  };

  // ─── java.util.LinkedHashMap ───

  function LinkedHashMap() { this._m = new Map(); }
  LinkedHashMap.prototype.put = function(k, v) { this._m.set(String(k), v); return v; };
  LinkedHashMap.prototype.get = function(k) { return this._m.get(String(k)); };
  LinkedHashMap.prototype.containsKey = function(k) { return this._m.has(String(k)); };
  LinkedHashMap.prototype.remove = function(k) { this._m.delete(String(k)); };
  LinkedHashMap.prototype.size = function() { return this._m.size; };
  LinkedHashMap.prototype.clear = function() { this._m.clear(); };
  LinkedHashMap.prototype.keySet = function() {
    var out = [];
    this._m.forEach(function(_v, k) { out.push(k); });
    return out;
  };
  LinkedHashMap.prototype.values = function() {
    var out = [];
    this._m.forEach(function(v) { out.push(v); });
    return out;
  };
  LinkedHashMap.prototype.entrySet = function() {
    var out = [];
    this._m.forEach(function(v, k) {
      out.push({ getKey: function() { return k; }, getValue: function() { return v; } });
    });
    return out;
  };
  LinkedHashMap.prototype.forEach = function(fn) { this._m.forEach(function(v, k) { fn(v, k); }); };

  // ─── java.util.ArrayList ───

  function ArrayList() { this._a = []; }
  ArrayList.prototype.add = function(v) { this._a.push(v); return true; };
  ArrayList.prototype.get = function(i) { return this._a[i]; };
  ArrayList.prototype.size = function() { return this._a.length; };
  ArrayList.prototype.toArray = function() { return this._a.slice(); };
  ArrayList.prototype.clear = function() { this._a = []; };
  ArrayList.prototype.remove = function(i) { this._a.splice(i, 1); };

  // ─── java.util.Date ───

  function JavaDate(millis) {
    if (millis === undefined) {
      this._ms = Date.now();
    } else if (millis instanceof JavaDate) {
      this._ms = millis._ms;
    } else {
      this._ms = Number(millis);
    }
  }

  JavaDate.prototype.getTime = function() { return this._ms; };
  JavaDate.prototype.getYear = function() { return new Date(this._ms).getFullYear() - 1900; };
  JavaDate.prototype.getMonth = function() { return new Date(this._ms).getMonth(); };
  JavaDate.prototype.getDate = function() { return new Date(this._ms).getDate(); };
  JavaDate.prototype.getHours = function() { return new Date(this._ms).getHours(); };
  JavaDate.prototype.getMinutes = function() { return new Date(this._ms).getMinutes(); };
  JavaDate.prototype.getSeconds = function() { return new Date(this._ms).getSeconds(); };
  JavaDate.prototype.toString = function() { return new Date(this._ms).toString(); };

  // ─── java.text.SimpleDateFormat ───

  function SimpleDateFormat(pattern) {
    this._pattern = String(pattern || 'yyyy-MM-dd HH:mm:ss');
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  var WEEKDAYS_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  SimpleDateFormat.prototype.format = function(date) {
    var d;
    if (date instanceof JavaDate) {
      d = new Date(date.getTime());
    } else if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'number') {
      d = new Date(date);
    } else {
      d = new Date();
    }

    var p = this._pattern;
    var out = '';
    var i = 0;
    while (i < p.length) {
      var ch = p[i];
      var count = 1;
      while (i + count < p.length && p[i + count] === ch) count++;
      var token = p.substr(i, count);
      switch (ch) {
        case 'y': out += count >= 4 ? pad(d.getFullYear(), 4) : pad(d.getFullYear() % 100, 2); break;
        case 'M':
          if (count >= 4) out += ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'][d.getMonth()];
          else if (count === 3) out += ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
          else if (count === 2) out += pad(d.getMonth() + 1, 2);
          else out += String(d.getMonth() + 1);
          break;
        case 'd': out += count === 2 ? pad(d.getDate(), 2) : String(d.getDate()); break;
        case 'H': out += count === 2 ? pad(d.getHours(), 2) : String(d.getHours()); break;
        case 'h': var h12 = d.getHours() % 12 || 12; out += count === 2 ? pad(h12, 2) : String(h12); break;
        case 'm': out += count === 2 ? pad(d.getMinutes(), 2) : String(d.getMinutes()); break;
        case 's': out += count === 2 ? pad(d.getSeconds(), 2) : String(d.getSeconds()); break;
        case 'S': out += pad(d.getMilliseconds(), count); break;
        case 'E': out += count >= 4 ? WEEKDAYS_CN[d.getDay()] : WEEKDAYS_EN[d.getDay()]; break;
        case 'D':
          var start = new Date(d.getFullYear(), 0, 0);
          var diff = d.getTime() - start.getTime();
          var dayOfYear = Math.floor(diff / 86400000);
          out += count >= 3 ? pad(dayOfYear, 3) : String(dayOfYear);
          break;
        case 'a': out += d.getHours() < 12 ? '上午' : '下午'; break;
        default: out += token;
      }
      i += count;
    }
    return out;
  };

  SimpleDateFormat.prototype.parse = function(str) {
    var s = String(str || '').trim();
    var p = this._pattern;
    var m = null;
    var year = 1970, month = 0, day = 1, hour = 0, minute = 0, second = 0;
    var idx = 0;
    var re = /(y+|M+|d+|H+|h+|m+|s+|S+)/g;
    while ((m = re.exec(p)) !== null) {
      var token = m[0];
      var len = token.length;
      var numStr = s.substr(idx, len);
      var num = parseInt(numStr, 10);
      if (isNaN(num)) { idx += 1; continue; }
      idx += len;
      var type = token[0];
      if (type === 'y') year = len >= 4 ? num : 2000 + num;
      else if (type === 'M') month = num - 1;
      else if (type === 'd') day = num;
      else if (type === 'H' || type === 'h') hour = num;
      else if (type === 'm') minute = num;
      else if (type === 's') second = num;
      while (idx < s.length && !/\d/.test(s[idx]) && /\D/.test(p[idx] || '')) idx++;
    }
    return new JavaDate(new Date(year, month, day, hour, minute, second).getTime());
  };

  // ─── java.io.ByteArrayInputStream ───

  function ByteArrayInputStream(bytes) {
    this._bytes = toU8(bytes);
    this._pos = 0;
  }

  ByteArrayInputStream.prototype.read = function(buf) {
    if (this._pos >= this._bytes.length) return -1;
    if (buf === undefined) return this._bytes[this._pos++];
    var n = Math.min(buf.length, this._bytes.length - this._pos);
    for (var i = 0; i < n; i++) {
      buf[i] = this._bytes[this._pos + i];
    }
    this._pos += n;
    return n;
  };
  ByteArrayInputStream.prototype.close = function() {};

  // ─── java.io.ByteArrayOutputStream ───

  function ByteArrayOutputStream() {
    this._chunks = [];
    this._len = 0;
  }

  ByteArrayOutputStream.prototype.write = function(buf, off, len) {
    var o = off === undefined ? 0 : off;
    var l = len === undefined ? buf.length : len;
    var slice = new Uint8Array(l);
    for (var i = 0; i < l; i++) slice[i] = buf[o + i];
    this._chunks.push(slice);
    this._len += l;
  };
  ByteArrayOutputStream.prototype.toByteArray = function() {
    var out = new Uint8Array(this._len);
    var pos = 0;
    for (var i = 0; i < this._chunks.length; i++) {
      out.set(this._chunks[i], pos);
      pos += this._chunks[i].length;
    }
    return out;
  };
  ByteArrayOutputStream.prototype.close = function() {};

  // ─── java.util.zip.GZIPInputStream ───

  function GZIPInputStream(stream) {
    this._stream = stream;
    this._decoded = null;
    this._pos = 0;
  }

  GZIPInputStream.prototype._ensureDecoded = function() {
    if (this._decoded !== null) return;
    var chunks = [];
    var buf = new Uint8Array(4096);
    var n;
    while ((n = this._stream.read(buf)) > 0) {
      chunks.push(buf.slice(0, n));
    }
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var all = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) {
      all.set(chunks[j], off);
      off += chunks[j].length;
    }
    this._decoded = Deno.core.ops.op_java_gunzip(all);
  };

  GZIPInputStream.prototype.read = function(buf) {
    this._ensureDecoded();
    if (this._pos >= this._decoded.length) return -1;
    if (buf === undefined) return this._decoded[this._pos++];
    var n = Math.min(buf.length, this._decoded.length - this._pos);
    for (var i = 0; i < n; i++) {
      buf[i] = this._decoded[this._pos + i];
    }
    this._pos += n;
    return n;
  };
  GZIPInputStream.prototype.close = function() {
    if (this._stream && this._stream.close) this._stream.close();
  };

  // ─── javax.crypto.spec ───

  function SecretKeySpec(key, algo) {
    this._key = toU8(key);
    this._algo = String(algo || 'AES');
  }
  SecretKeySpec.prototype.getEncoded = function() { return this._key; };

  function IvParameterSpec(iv) {
    this._iv = toU8(iv);
  }
  IvParameterSpec.prototype.getIV = function() { return this._iv; };

  // ─── javax.crypto.Cipher ───

  var CipherMode = { ENCRYPT_MODE: 1, DECRYPT_MODE: 2 };

  function Cipher(transformation) {
    this._transformation = String(transformation);
    this._mode = 0;
    this._key = null;
    this._iv = null;
  }

  Cipher.getInstance = function(transformation) { return new Cipher(transformation); };

  Cipher.prototype.init = function(mode, key, iv) {
    this._mode = mode;
    this._key = key instanceof SecretKeySpec ? key.getEncoded() : toU8(key);
    this._iv = iv instanceof IvParameterSpec ? iv.getIV() : toU8(iv);
    return this;
  };

  Cipher.prototype.doFinal = function(data) {
    var u8 = toU8(data);
    var parts = this._transformation.split('/');
    var algo = (parts[0] || 'AES').toUpperCase();
    var noPad = parts[2] === 'NoPadding';

    if (this._mode === CipherMode.ENCRYPT_MODE) {
      if (algo === 'AES') return Deno.core.ops.op_java_aes_encrypt_bytes(u8, this._key, this._iv);
      if (algo === 'DES') return Deno.core.ops.op_java_des_encrypt_bytes(u8, this._key, this._iv);
    } else {
      if (algo === 'AES') {
        if (noPad) return Deno.core.ops.op_java_aes_decrypt_bytes_nopad(u8, this._key, this._iv);
        return Deno.core.ops.op_java_aes_decrypt_bytes(u8, this._key, this._iv);
      }
      if (algo === 'DES') {
        if (noPad) return Deno.core.ops.op_java_des_decrypt_bytes_nopad(u8, this._key, this._iv);
        return Deno.core.ops.op_java_des_decrypt_bytes(u8, this._key, this._iv);
      }
    }
    return new Uint8Array(0);
  };

  // ─── 组装 Packages ───

  var existingPackages = globalThis.Packages || {};
  var existingOrg = existingPackages.org || {};
  var existingCom = existingPackages.com || {};

  var java = {
    lang: {
      String: JavaString,
      System: JavaSystem,
      StringBuilder: (function() {
        function SB() { this._parts = []; }
        SB.prototype.append = function(s) { this._parts.push(String(s)); return this; };
        SB.prototype.toString = function() { return this._parts.join(''); };
        return SB;
      })(),
      Integer: {
        parseInt: function(s, radix) { return parseInt(s, radix || 10); },
        valueOf: function(s) { return parseInt(s, 10); },
        toHexString: function(n) { return (n >>> 0).toString(16); },
        toBinaryString: function(n) { return (n >>> 0).toString(2); }
      },
      Long: {
        parseLong: function(s) { return Number(s); },
        toHexString: function(n) { return (n >>> 0).toString(16); }
      },
      Math: {
        floor: Math.floor, ceil: Math.ceil, round: Math.round,
        abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow
      }
    },
    math: { BigInteger: JavaBigInteger },
    security: { MessageDigest: MessageDigest, SecureRandom: SecureRandom },
    text: { SimpleDateFormat: SimpleDateFormat },
    util: {
      Arrays: JavaArrays,
      Base64: JavaBase64,
      HashMap: HashMap,
      LinkedHashMap: LinkedHashMap,
      ArrayList: ArrayList,
      Date: JavaDate,
      zip: { GZIPInputStream: GZIPInputStream }
    },
    io: {
      ByteArrayInputStream: ByteArrayInputStream,
      ByteArrayOutputStream: ByteArrayOutputStream
    }
  };

  var javax = {
    crypto: {
      Cipher: Cipher,
      spec: { SecretKeySpec: SecretKeySpec, IvParameterSpec: IvParameterSpec }
    }
  };

  globalThis.Packages = {
    java: java,
    javax: javax,
    org: existingOrg,
    com: existingCom
  };
})();

// ============================================
// RegexJsExtensions — 替换规则的 java 命名空间
// 对齐 Legado 的 io.legado.app.help.RegexJsExtensions + JsEncodeUtils
//
// 用法：在替换规则的 JS 里，globalThis.java 被替换为此对象。
// 提供与 Legado 一致的 API，只暴露安全的编解码 + 加解密方法。
// ============================================

(function() {
  'use strict';

  function toU8(data) {
    if (data === null || data === undefined) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) return new Uint8Array(data);
    if (typeof data === 'string') {
      return Deno.core.ops.op_java_str_to_bytes(data, 'UTF-8');
    }
    if (data && typeof data === 'object') {
      var arr = [];
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (typeof v === 'number') arr.push(v);
      }
      return new Uint8Array(arr);
    }
    return new Uint8Array(0);
  }

  function u8ToHex(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) {
      s += ('0' + u8[i].toString(16)).slice(-2);
    }
    return s;
  }

  function hexToU8(hex) {
    var s = String(hex).replace(/\s/g, '');
    if (s.length % 2) s = '0' + s;
    var out = new Uint8Array(s.length / 2);
    for (var i = 0; i < s.length; i += 2) {
      out[i / 2] = parseInt(s.substr(i, 2), 16);
    }
    return out;
  }

  function u8ToBase64(u8) {
    return Deno.core.ops.op_java_base64_encode_bytes(u8);
  }

  function base64ToU8(str) {
    return Deno.core.ops.op_java_base64_decode_bytes(String(str));
  }

  // digestHex 支持 SM3，其他走 Rust op
  function digestHex(data, algorithm) {
    var algo = String(algorithm || 'sha256').toUpperCase().replace('-', '');
    if (algo === 'SM3') {
      if (typeof globalThis.sm3 === 'function') {
        return u8ToHex(globalThis.sm3(toU8(data)));
      }
      return '';
    }
    var lower = algo.toLowerCase();
    if (lower === 'md5') {
      return Deno.core.ops.op_java_md5_encode(String(data));
    }
    if (lower === 'sha1') {
      return Deno.core.ops.op_java_sha1_encode(String(data));
    }
    if (lower === 'sha256') {
      return Deno.core.ops.op_java_sha256_encode(String(data));
    }
    return '';
  }

  // 对齐 Legado：HMacHex(data, algorithm, key)
  // 注意：Rust op op_java_hmac_hex 的参数顺序是 (data, algorithm, key)
  function HMacHex(data, algorithm, key) {
    var algo = String(algorithm || 'sha256').toLowerCase().replace('-', '');
    var algoMap = {
      sha1: 'sha1',
      sha256: 'sha256',
      sha384: 'sha384',
      sha512: 'sha512',
      md5: 'md5',
    };
    var mapped = algoMap[algo] || 'sha256';
    if (typeof Deno.core.ops.op_java_hmac_hex !== 'function') {
      return '';
    }
    return Deno.core.ops.op_java_hmac_hex(String(data), mapped, String(key));
  }

  // ─── SymmetricCrypto 包装 ───
  // 对齐 Legado 的 SymmetricCrypto 接口

  function makeSymmetricCrypto(transformation, key, iv) {
    var algo = String(transformation || 'AES/CBC/PKCS5Padding');
    var upper = algo.toUpperCase();
    var isDes = upper.indexOf('DES') !== -1;
    var isAes = upper.indexOf('AES') !== -1;

    var keyU8 = toU8(key);
    var ivU8 = iv ? toU8(iv) : new Uint8Array(0);

    return {
      decrypt: function(data) {
        var u8 = toU8(data);
        try {
          if (isDes) return Deno.core.ops.op_java_des_decrypt_bytes(u8, keyU8, ivU8);
          if (isAes) return Deno.core.ops.op_java_aes_decrypt_bytes(u8, keyU8, ivU8);
        } catch (e) {}
        return new Uint8Array(0);
      },
      decryptStr: function(data) {
        var u8 = toU8(data);
        try {
          var decrypted;
          if (isDes) decrypted = Deno.core.ops.op_java_des_decrypt_bytes(u8, keyU8, ivU8);
          else if (isAes) decrypted = Deno.core.ops.op_java_aes_decrypt_bytes(u8, keyU8, ivU8);
          else return '';
          return Deno.core.ops.op_java_bytes_to_str(toU8(decrypted), 'UTF-8');
        } catch (e) { return ''; }
      },
      encrypt: function(data) {
        var u8 = toU8(data);
        try {
          if (isDes) return Deno.core.ops.op_java_des_encrypt_bytes(u8, keyU8, ivU8);
          if (isAes) return Deno.core.ops.op_java_aes_encrypt_bytes(u8, keyU8, ivU8);
        } catch (e) {}
        return new Uint8Array(0);
      },
      encryptBase64: function(data) {
        var u8 = toU8(data);
        try {
          var encrypted;
          if (isDes) encrypted = Deno.core.ops.op_java_des_encrypt_bytes(u8, keyU8, ivU8);
          else if (isAes) encrypted = Deno.core.ops.op_java_aes_encrypt_bytes(u8, keyU8, ivU8);
          else return '';
          return u8ToBase64(toU8(encrypted));
        } catch (e) { return ''; }
      },
      encryptHex: function(data) {
        var u8 = toU8(data);
        try {
          var encrypted;
          if (isDes) encrypted = Deno.core.ops.op_java_des_encrypt_bytes(u8, keyU8, ivU8);
          else if (isAes) encrypted = Deno.core.ops.op_java_aes_encrypt_bytes(u8, keyU8, ivU8);
          else return '';
          return u8ToHex(toU8(encrypted));
        } catch (e) { return ''; }
      }
    };
  }

  // ─── 工厂函数 ───

  globalThis.__createRegexJsExtensions = function(name) {
    var originalJava = globalThis.java;
    var storageKey = 'regex_rule_' + String(name);

    function proxy(methodName) {
      return function() {
        if (typeof originalJava[methodName] !== 'function') return '';
        return originalJava[methodName].apply(originalJava, arguments);
      };
    }

    return {
      // ─── RegexJsExtensions 自有方法 ───

      log: function(msg) {
        Deno.core.ops.op_java_emit_log('debug', '替换净化规则 ' + name + ' 输出: ' + String(msg));
        return msg;
      },

      logType: function(any) {
        var typeName;
        if (any === null || any === undefined) {
          typeName = 'null';
        } else if (typeof any === 'object' && any.constructor && any.constructor.name) {
          typeName = any.constructor.name;
        } else {
          typeName = typeof any;
        }
        Deno.core.ops.op_java_emit_log('debug', '替换净化规则 ' + name + ' 输出: ' + typeName);
        return undefined;
      },

      t2s: function(text) {
        if (typeof originalJava.t2s !== 'function') return String(text);
        return originalJava.t2s(String(text));
      },

      s2t: function(text) {
        if (typeof originalJava.s2t !== 'function') return String(text);
        return originalJava.s2t(String(text));
      },

      get: function(key) {
        return Deno.core.ops.op_java_get(storageKey, String(key)) || '';
      },

      put: function(key, value) {
        Deno.core.ops.op_java_put(storageKey, String(key), String(value));
        return value;
      },

      // ─── JsEncodeUtils 代理：MD5 ───

      md5Encode: proxy('md5Encode'),
      md5Encode16: proxy('md5Encode16'),

      // ─── 对称加解密 ───

      createSymmetricCrypto: function(transformation, key, iv) {
        return makeSymmetricCrypto(transformation, key, iv);
      },

      // ─── 非对称加解密（仅 RSA） ───

      createAsymmetricCrypto: function(transformation) {
        var algo = String(transformation || 'RSA').toUpperCase();
        if (algo.indexOf('RSA') === -1) {
          throw new Error('AsymmetricCrypto 仅支持 RSA，收到: ' + transformation);
        }
        var cryptoKey = storageKey + '_asym_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        return {
          setPublicKey: function(key) {
            Deno.core.ops.op_java_rsa_set_public_key(cryptoKey, String(key));
            return this;
          },
          setPrivateKey: function(key) {
            Deno.core.ops.op_java_rsa_set_private_key(cryptoKey, String(key));
            return this;
          },
          encrypt: function(data) {
            return Deno.core.ops.op_java_rsa_encrypt(cryptoKey, String(data));
          },
          decrypt: function(data) {
            return Deno.core.ops.op_java_rsa_decrypt(cryptoKey, String(data));
          },
          encryptBase64: function(data) {
            return Deno.core.ops.op_java_rsa_encrypt(cryptoKey, String(data));
          },
          decryptStr: function(data) {
            return Deno.core.ops.op_java_rsa_decrypt(cryptoKey, String(data));
          }
        };
      },

      // ─── 签名 ───

      createSign: function(algorithm) {
        return {
          sign: function(data) {
            return Deno.core.ops.op_java_sign(storageKey, String(data), String(algorithm));
          }
        };
      },

      // ─── AES 旧接口（Deprecated，web 需要） ───

      aesDecodeToByteArray: function(str, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).decrypt(str);
      },
      aesDecodeToString: function(str, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).decryptStr(str);
      },
      aesDecodeArgsBase64Str: function(data, key, mode, padding, iv) {
        return makeSymmetricCrypto('AES/' + mode + '/' + padding, base64ToU8(key), base64ToU8(iv)).decryptStr(data);
      },
      aesBase64DecodeToByteArray: function(str, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).decrypt(str);
      },
      aesBase64DecodeToString: function(str, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).decryptStr(str);
      },
      aesEncodeToByteArray: function(data, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).encrypt(data);
      },
      aesEncodeToString: function(data, key, transformation, iv) {
        var enc = makeSymmetricCrypto(transformation, key, iv).encrypt(data);
        return Deno.core.ops.op_java_bytes_to_str(toU8(enc), 'UTF-8');
      },
      aesEncodeToBase64ByteArray: function(data, key, transformation, iv) {
        var b64 = makeSymmetricCrypto(transformation, key, iv).encryptBase64(data);
        return Deno.core.ops.op_java_str_to_bytes(String(b64), 'UTF-8');
      },
      aesEncodeToBase64String: function(data, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).encryptBase64(data);
      },
      aesEncodeArgsBase64Str: function(data, key, mode, padding, iv) {
        return makeSymmetricCrypto('AES/' + mode + '/' + padding, key, iv).encryptBase64(data);
      },

      // ─── DES 旧接口 ───

      desDecodeToString: function(data, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).decryptStr(data);
      },
      desBase64DecodeToString: function(data, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).decryptStr(data);
      },
      desEncodeToString: function(data, key, transformation, iv) {
        var enc = makeSymmetricCrypto(transformation, key, iv).encrypt(data);
        return Deno.core.ops.op_java_bytes_to_str(toU8(enc), 'UTF-8');
      },
      desEncodeToBase64String: function(data, key, transformation, iv) {
        return makeSymmetricCrypto(transformation, key, iv).encryptBase64(data);
      },

      // ─── 3DES 旧接口 ───

      tripleDESDecodeStr: function(data, key, mode, padding, iv) {
        return makeSymmetricCrypto('DESede/' + mode + '/' + padding, key, iv).decryptStr(data);
      },
      tripleDESDecodeArgsBase64Str: function(data, key, mode, padding, iv) {
        return makeSymmetricCrypto('DESede/' + mode + '/' + padding, base64ToU8(key), toU8(iv)).decryptStr(data);
      },
      tripleDESEncodeBase64Str: function(data, key, mode, padding, iv) {
        return makeSymmetricCrypto('DESede/' + mode + '/' + padding, key, iv).encryptBase64(data);
      },
      tripleDESEncodeArgsBase64Str: function(data, key, mode, padding, iv) {
        return makeSymmetricCrypto('DESede/' + mode + '/' + padding, base64ToU8(key), toU8(iv)).encryptBase64(data);
      },

      // ─── 摘要 / HMAC（对齐 JsEncodeUtils） ───

      digestHex: function(data, algorithm) {
        return digestHex(data, algorithm);
      },
      digestBase64Str: function(data, algorithm) {
        var hex = digestHex(data, algorithm);
        if (!hex) return '';
        return u8ToBase64(hexToU8(hex));
      },
      HMacHex: function(data, algorithm, key) {
        return HMacHex(data, algorithm, key);
      },
      HMacBase64: function(data, algorithm, key) {
        var hex = HMacHex(data, algorithm, key);
        if (!hex) return '';
        return u8ToBase64(hexToU8(hex));
      },

      // ─── JsEncodeUtils 里其他基础方法 ───

      base64Encode: proxy('base64Encode'),
      base64Decode: proxy('base64Decode'),
      base64DecodeToByteArray: proxy('base64DecodeToByteArray'),
      encodeURI: proxy('encodeURI'),
      decodeURI: proxy('decodeURI'),
      hexEncodeToString: proxy('hexEncodeToString'),
      hexDecodeToString: proxy('hexDecodeToString'),
      androidId: proxy('androidId'),
      getWebViewUA: proxy('getWebViewUA'),
      timeFormat: proxy('timeFormat'),
      timeFormatUTC: proxy('timeFormatUTC'),
      randomUUID: proxy('randomUUID'),
      htmlFormat: proxy('htmlFormat'),
      strToBytes: proxy('strToBytes'),
      bytesToStr: proxy('bytesToStr'),
      getByteArray: proxy('getByteArray'),
      toURL: proxy('toURL'),
    };
  };
})();
