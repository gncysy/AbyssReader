// ============================================
// polyfill_sm3 — 纯 JS SM3 实现（GB/T 32905-2016）
// ============================================
//
// 背景：番茄书源 jsLib 的 argusRounds 依赖 SM3。
// Rust 侧无 SM3 crate，且 SM3 只此一处用，故纯 JS 实现。
//
// 接口：globalThis.sm3(bytes) → Uint8Array(32)
// 对齐 Java 实现：输入是字节数组，输出 32 字节摘要。

(function() {
  'use strict';

  var SM3_IV = [1937774191, 1226093241, 388252375, 3666478592, 2842636476, 372324522, 3817729613, 2969243214];

  function rotl32(x, n) {
    n = n % 32;
    if (n === 0) return x >>> 0;
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  function toU8(data) {
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

  function sm3(data) {
    var bytes = toU8(data);

    // 填充
    var len = bytes.length;
    var bitLen = len * 8;
    // 需要 k 个 0，使得 len + 1 + k ≡ 56 (mod 64)
    var padLen = ((len + 1) % 64 === 0) ? 0 : (56 - (len + 1) % 64 + 64) % 64;
    // 修正：按标准公式 k = 56 - (len + 1) mod 64
    var k = (56 - (len + 1) % 64 + 64) % 64;
    var totalLen = len + 1 + k + 8;

    var msg = new Uint8Array(totalLen);
    msg.set(bytes, 0);
    msg[len] = 0x80;

    // 长度（64 位大端，高 32 位 + 低 32 位）
    var highBits = Math.floor(bitLen / 0x100000000);
    var lowBits = bitLen >>> 0;
    msg[totalLen - 8] = (highBits >>> 24) & 0xFF;
    msg[totalLen - 7] = (highBits >>> 16) & 0xFF;
    msg[totalLen - 6] = (highBits >>> 8) & 0xFF;
    msg[totalLen - 5] = highBits & 0xFF;
    msg[totalLen - 4] = (lowBits >>> 24) & 0xFF;
    msg[totalLen - 3] = (lowBits >>> 16) & 0xFF;
    msg[totalLen - 2] = (lowBits >>> 8) & 0xFF;
    msg[totalLen - 1] = lowBits & 0xFF;

    // 状态
    var V = SM3_IV.slice();

    // 逐块处理
    for (var off = 0; off < totalLen; off += 64) {
      var W = new Array(68);
      var W1 = new Array(64);

      // 前 16 个字
      for (var i = 0; i < 16; i++) {
        W[i] = ((msg[off + i * 4] << 24) |
                (msg[off + i * 4 + 1] << 16) |
                (msg[off + i * 4 + 2] << 8) |
                msg[off + i * 4 + 3]) >>> 0;
      }

      // 16-67 扩展
      for (var j = 16; j < 68; j++) {
        var x = (W[j - 16] ^ W[j - 9] ^ rotl32(W[j - 3], 15)) >>> 0;
        var y = (x ^ rotl32(x, 15) ^ rotl32(x, 23) ^ rotl32(W[j - 13], 7) ^ W[j - 6]) >>> 0;
        W[j] = y;
      }

      // W1 用于压缩函数
      for (var m = 0; m < 64; m++) {
        W1[m] = (W[m] ^ W[m + 4]) >>> 0;
      }

      var A = V[0], B = V[1], C = V[2], D = V[3];
      var E = V[4], F = V[5], G = V[6], H = V[7];

      for (var n = 0; n < 64; n++) {
        var T = n < 16 ? 0x79CC4519 : 0x7A879D8A;
        var SS1 = rotl32((rotl32(A, 12) + E + rotl32(T, n % 32)) >>> 0, 7);
        var SS2 = (SS1 ^ rotl32(A, 12)) >>> 0;

        var FF, GG;
        if (n < 16) {
          FF = (A ^ B ^ C) >>> 0;
          GG = (E ^ F ^ G) >>> 0;
        } else {
          FF = ((A & B) | (A & C) | (B & C)) >>> 0;
          GG = ((E & F) | (~E & G)) >>> 0;
        }

        var TT1 = (FF + D + SS2 + W1[n]) >>> 0;
        var TT2 = (GG + H + SS1 + W[n]) >>> 0;

        D = C;
        C = rotl32(B, 9);
        B = A;
        A = TT1;
        H = G;
        G = rotl32(F, 19);
        F = E;
        E = (TT2 ^ rotl32(TT2, 9) ^ rotl32(TT2, 17)) >>> 0;
      }

      V[0] = (V[0] ^ A) >>> 0;
      V[1] = (V[1] ^ B) >>> 0;
      V[2] = (V[2] ^ C) >>> 0;
      V[3] = (V[3] ^ D) >>> 0;
      V[4] = (V[4] ^ E) >>> 0;
      V[5] = (V[5] ^ F) >>> 0;
      V[6] = (V[6] ^ G) >>> 0;
      V[7] = (V[7] ^ H) >>> 0;
    }

    // 输出 32 字节（大端）
    var out = new Uint8Array(32);
    for (var p = 0; p < 8; p++) {
      out[p * 4] = (V[p] >>> 24) & 0xFF;
      out[p * 4 + 1] = (V[p] >>> 16) & 0xFF;
      out[p * 4 + 2] = (V[p] >>> 8) & 0xFF;
      out[p * 4 + 3] = V[p] & 0xFF;
    }
    return out;
  }

  globalThis.sm3 = sm3;
})();
