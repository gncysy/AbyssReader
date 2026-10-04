// ============================================
// polyfill_bigint — Java BigInteger 模拟（任意精度）
// ============================================
//
// 背景：番茄书源 jsLib 大量使用 Packages.java.math.BigInteger。
// 项目里没有 Rhino/JVM，必须用 BigInt 模拟。
//
// 关键语义（与 Java 对齐）：
// - BigInteger 是任意精度，位运算/算术运算都不截断
// - and/or/xor/not/shiftLeft/shiftRight/add/subtract/... 全部保留精度
// - intValue/longValue 按 Java 语义截断（调用方显式要求）
// - toByteArray 返回大端字节序的补码表示

(function() {
  'use strict';

  // Java long 最大值：无符号 64 位全 1
  var J64 = (1n << 64n) - 1n;
  var ZERO = 0n;

  function toBigInt(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!isFinite(value)) return ZERO;
      return BigInt(Math.trunc(value));
    }
    if (typeof value === 'string') {
      var s = value.trim();
      if (!s) return ZERO;
      try {
        return BigInt(s);
      } catch (e) {
        return ZERO;
      }
    }
    if (value && typeof value === 'object' && typeof value._v === 'bigint') {
      return value._v;
    }
    return ZERO;
  }

  function BigInteger(value, radix) {
    if (!(this instanceof BigInteger)) {
      return new BigInteger(value, radix);
    }
    if (typeof value === 'string' && typeof radix === 'number') {
      // radix 参数：按指定进制解析
      this._v = BigInt(parseInt(value, radix));
    } else {
      this._v = toBigInt(value);
    }
    this._signed = this._v < 0n;
  }

  // ─── 位运算 ───

  BigInteger.prototype.and = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v & o);
  };

  BigInteger.prototype.or = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v | o);
  };

  BigInteger.prototype.xor = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v ^ o);
  };

  BigInteger.prototype.not = function() {
    return new BigInteger(~this._v);
  };

  BigInteger.prototype.shiftLeft = function(n) {
    var shift = Number(n);
    if (shift < 0) return this.shiftRight(-shift);
    return new BigInteger(this._v << BigInt(shift));
  };

  BigInteger.prototype.shiftRight = function(n) {
    var shift = Number(n);
    if (shift < 0) return this.shiftLeft(-shift);
    return new BigInteger(this._v >> BigInt(shift));
  };

  BigInteger.prototype.testBit = function(n) {
    return ((this._v >> BigInt(n)) & 1n) === 1n;
  };

  BigInteger.prototype.setBit = function(n) {
    return new BigInteger(this._v | (1n << BigInt(n)));
  };

  BigInteger.prototype.clearBit = function(n) {
    return new BigInteger(this._v & ~(1n << BigInt(n)));
  };

  BigInteger.prototype.flipBit = function(n) {
    return new BigInteger(this._v ^ (1n << BigInt(n)));
  };

  BigInteger.prototype.bitLength = function() {
    if (this._v <= 0n) return 0;
    return this._v.toString(2).length;
  };

  BigInteger.prototype.bitCount = function() {
    var v = this._v < 0n ? -this._v - 1n : this._v;
    var count = 0;
    while (v > 0n) {
      if (v & 1n) count++;
      v >>= 1n;
    }
    return count;
  };

  // ─── 算术运算 ───

  BigInteger.prototype.add = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v + o);
  };

  BigInteger.prototype.subtract = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v - o);
  };

  BigInteger.prototype.multiply = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v * o);
  };

  BigInteger.prototype.divide = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    if (o === 0n) throw new Error('BigInteger: divide by zero');
    return new BigInteger(this._v / o);
  };

  BigInteger.prototype.remainder = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    if (o === 0n) throw new Error('BigInteger: divide by zero');
    return new BigInteger(this._v % o);
  };

  // Java 的 mod 返回非负结果
  BigInteger.prototype.mod = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    if (o === 0n) throw new Error('BigInteger: mod by zero');
    var r = this._v % o;
    if (r < 0n) r += o < 0n ? -o : o;
    return new BigInteger(r);
  };

  BigInteger.prototype.divideAndRemainder = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    if (o === 0n) throw new Error('BigInteger: divide by zero');
    return [
      new BigInteger(this._v / o),
      new BigInteger(this._v % o),
    ];
  };

  BigInteger.prototype.pow = function(n) {
    var exp = Number(n);
    if (exp < 0) throw new Error('BigInteger: negative exponent');
    return new BigInteger(this._v ** BigInt(exp));
  };

  BigInteger.prototype.modPow = function(exp, mod) {
    var e = exp instanceof BigInteger ? exp._v : toBigInt(exp);
    var m = mod instanceof BigInteger ? mod._v : toBigInt(mod);
    if (m === 0n) throw new Error('BigInteger: mod by zero');
    if (e < 0n) throw new Error('BigInteger: negative exponent');
    // 快速幂取模
    var result = 1n;
    var base = ((this._v % m) + m) % m;
    var exp2 = e;
    while (exp2 > 0n) {
      if (exp2 & 1n) {
        result = (result * base) % m;
      }
      base = (base * base) % m;
      exp2 >>= 1n;
    }
    return new BigInteger(result);
  };

  // 扩展欧几里得求模逆
  BigInteger.prototype.modInverse = function(m) {
    var mm = m instanceof BigInteger ? m._v : toBigInt(m);
    if (mm === 0n) throw new Error('BigInteger: mod by zero');
    var a = ((this._v % mm) + mm) % mm;
    var b = mm;
    var x0 = 0n, x1 = 1n;
    while (a > 1n) {
      var q = a / b;
      var t = b;
      b = a % b;
      a = t;
      t = x0;
      x0 = x1 - q * x0;
      x1 = t;
    }
    if (a !== 1n) throw new Error('BigInteger: not invertible');
    return new BigInteger(((x1 % mm) + mm) % mm);
  };

  BigInteger.prototype.negate = function() {
    return new BigInteger(-this._v);
  };

  BigInteger.prototype.abs = function() {
    return new BigInteger(this._v < 0n ? -this._v : this._v);
  };

  BigInteger.prototype.gcd = function(other) {
    var a = this._v < 0n ? -this._v : this._v;
    var b = other instanceof BigInteger ? other._v : toBigInt(other);
    if (b < 0n) b = -b;
    while (b > 0n) {
      var t = b;
      b = a % b;
      a = t;
    }
    return new BigInteger(a);
  };

  BigInteger.prototype.min = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v < o ? this._v : o);
  };

  BigInteger.prototype.max = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    return new BigInteger(this._v > o ? this._v : o);
  };

  // ─── 比较 ───

  BigInteger.prototype.compareTo = function(other) {
    var o = other instanceof BigInteger ? other._v : toBigInt(other);
    if (this._v < o) return -1;
    if (this._v > o) return 1;
    return 0;
  };

  BigInteger.prototype.equals = function(other) {
    return this.compareTo(other) === 0;
  };

  // ─── 转换 ───

  BigInteger.prototype.intValue = function() {
    var low32 = Number(this._v & 0xFFFFFFFFn);
    if (low32 >= 0x80000000) low32 -= 0x100000000;
    return low32;
  };

  BigInteger.prototype.longValue = function() {
    var low64 = this._v & J64;
    if (low64 >= (1n << 63n)) {
      return Number(low64 - (1n << 64n));
    }
    return Number(low64);
  };

  BigInteger.prototype.doubleValue = function() {
    return Number(this._v);
  };

  BigInteger.prototype.floatValue = function() {
    return Number(this._v);
  };

  BigInteger.prototype.byteValue = function() {
    var low8 = Number(this._v & 0xFFn);
    if (low8 >= 0x80) low8 -= 0x100;
    return low8;
  };

  BigInteger.prototype.shortValue = function() {
    var low16 = Number(this._v & 0xFFFFn);
    if (low16 >= 0x8000) low16 -= 0x10000;
    return low16;
  };

  BigInteger.prototype.signum = function() {
    if (this._v === 0n) return 0;
    return this._v > 0n ? 1 : -1;
  };

  BigInteger.prototype.toString = function(radix) {
    var r = typeof radix === 'number' ? radix : 10;
    return this._v.toString(r);
  };

  BigInteger.prototype.toByteArray = function() {
    if (this._v === 0n) return new Uint8Array([0]);
    var v = this._v;
    // 负数按补码输出
    if (v < 0n) {
      // 找到最小的字节数
      var bits = (-v).toString(2).length;
      var byteLen = Math.floor(bits / 8) + 1;
      var mod = 1n << BigInt(byteLen * 8);
      v = mod + v;
    }
    var hex = v.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    var len = hex.length / 2;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    // Java 补码：如果最高位是 1，需要前置 0x00
    if (bytes[0] >= 0x80) {
      var extended = new Uint8Array(len + 1);
      extended[0] = 0;
      extended.set(bytes, 1);
      return extended;
    }
    return bytes;
  };

  BigInteger.prototype.valueOf = function() {
    return this._v;
  };

  BigInteger.prototype.toJSON = function() {
    return this._v.toString();
  };

  // ─── 静态常量 ───

  BigInteger.ZERO = new BigInteger(0);
  BigInteger.ONE = new BigInteger(1);
  BigInteger.TWO = new BigInteger(2);
  BigInteger.TEN = new BigInteger(10);

  // 静态工厂（Java 有 valueOf）
  BigInteger.valueOf = function(v) {
    return new BigInteger(v);
  };

  globalThis.BigInteger = BigInteger;
  globalThis.__BI_J64 = J64;
})();
