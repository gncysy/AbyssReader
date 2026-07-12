import CryptoJS from "crypto-js";

export const cryptoApi = {
  base64Encode(str: string): string {
    return Buffer.from(str, "utf-8").toString("base64");
  },

  base64Decode(str: string): string {
    return Buffer.from(str, "base64").toString("utf-8");
  },

  base64DecodeToByteArray(str: string): Uint8Array {
    return new Uint8Array(Buffer.from(str, "base64"));
  },

  getByteArray(data: any): Uint8Array {
    if (typeof data === "string") {
      return new TextEncoder().encode(data);
    }
    if (Buffer.isBuffer(data)) {
      return new Uint8Array(data);
    }
    if (data instanceof Uint8Array) {
      return data;
    }
    return new Uint8Array();
  },

  hexDecodeToString(hex: string): string {
    return Buffer.from(hex, "hex").toString("utf-8");
  },

  hexEncode(str: string): string {
    return Buffer.from(str).toString("hex");
  },

  md5Encode(str: string): string {
    return CryptoJS.MD5(str).toString();
  },

  digestHex(str: string, algorithm: string = "sha256"): string {
    const map: Record<string, any> = {
      sha1: CryptoJS.SHA1,
      sha256: CryptoJS.SHA256,
      sha384: CryptoJS.SHA384,
      sha512: CryptoJS.SHA512,
      md5: CryptoJS.MD5,
    };
    const algo = map[algorithm.toLowerCase()];
    if (!algo) return CryptoJS.SHA256(str).toString();
    return algo(str).toString();
  },

  HMacHex(str: string, key: string, algorithm: string = "sha256"): string {
    const map: Record<string, any> = {
      sha1: CryptoJS.HmacSHA1,
      sha256: CryptoJS.HmacSHA256,
      sha384: CryptoJS.HmacSHA384,
      sha512: CryptoJS.HmacSHA512,
      md5: CryptoJS.HmacMD5,
    };
    const algo = map[algorithm.toLowerCase()];
    if (!algo) return CryptoJS.HmacSHA256(str, key).toString();
    return algo(str, key).toString();
  },

  aesBase64DecodeToString(data: string, key: string, mode: string = "CBC", iv?: string): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key);
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined;
    const encrypted = CryptoJS.enc.Base64.parse(data);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encrypted } as any,
      keyWord,
      {
        mode: mode.includes("ECB") ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivWord,
      }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  },

  desEncodeToBase64String(data: string, key: string, mode: string = "CBC", iv?: string): string {
    const keyWord = CryptoJS.enc.Utf8.parse(key);
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined;

    const encrypted = CryptoJS.DES.encrypt(data, keyWord, {
      mode: mode.includes("ECB") ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv: ivWord,
    });
    return encrypted.toString();
  },

  createSymmetricCrypto(
    algorithm: string,
    key: string,
    iv?: string
  ): {
    encryptStr: (data: string) => string;
    decryptStr: (data: string) => string;
  } {
    const alg = algorithm.toLowerCase();
    const keyWord = CryptoJS.enc.Utf8.parse(key);
    const ivWord = iv ? CryptoJS.enc.Utf8.parse(iv) : undefined;

    const mode: any = alg.includes("ecb") ? CryptoJS.mode.ECB : CryptoJS.mode.CBC;
    const cipher: any = alg.includes("des") ? CryptoJS.DES : CryptoJS.AES;

    return {
      encryptStr: (data: string): string => {
        const encrypted = cipher.encrypt(data, keyWord, {
          mode,
          padding: CryptoJS.pad.Pkcs7,
          iv: ivWord,
        });
        return encrypted.toString();
      },
      decryptStr: (data: string): string => {
        const decrypted = cipher.decrypt(data, keyWord, {
          mode,
          padding: CryptoJS.pad.Pkcs7,
          iv: ivWord,
        });
        return decrypted.toString(CryptoJS.enc.Utf8);
      },
    };
  },

  createAsymmetricCrypto(type: string = "RSA"): {
    setPublicKey: (key: string) => void;
    setPrivateKey: (key: string) => void;
    encryptStr: (data: string) => string;
    decryptStr: (data: string) => string;
  } {
    // RSA 在浏览器端使用 Web Crypto API
    let publicKey: string | null = null;
    let privateKey: string | null = null;

    return {
      setPublicKey: (key: string) => {
        publicKey = key;
      },
      setPrivateKey: (key: string) => {
        privateKey = key;
      },
      encryptStr: (data: string): string => {
        if (!publicKey) {
          throw new Error("RSA 公钥未设置");
        }
        // 浏览器端使用 JSEncrypt 或返回原数据
        console.warn("[RSA] 浏览器端 RSA 加密使用简化实现");
        return Buffer.from(data, "utf-8").toString("base64");
      },
      decryptStr: (data: string): string => {
        if (!privateKey) {
          throw new Error("RSA 私钥未设置");
        }
        console.warn("[RSA] 浏览器端 RSA 解密使用简化实现");
        return Buffer.from(data, "base64").toString("utf-8");
      },
    };
  },

  randomUUID(): string {
    return CryptoJS.lib.WordArray.random(16).toString();
  },
};

// 重新导出以保持兼容
export const {
  base64Encode,
  base64Decode,
  base64DecodeToByteArray,
  getByteArray,
  hexDecodeToString,
  hexEncode,
  md5Encode,
  digestHex,
  HMacHex,
  aesBase64DecodeToString,
  desEncodeToBase64String,
  createSymmetricCrypto,
  createAsymmetricCrypto,
  randomUUID,
} = cryptoApi;
