use deno_core::op2;
use std::collections::HashMap;
use std::sync::LazyLock;
use parking_lot::Mutex;

#[op2]
#[string]
pub fn op_java_base64_encode(#[string] input: String) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD_NO_PAD.encode(input.as_bytes())
}

#[op2]
#[string]
pub fn op_java_base64_decode(#[string] input: String) -> String {
    use base64::Engine;
    String::from_utf8_lossy(
        &base64::engine::general_purpose::STANDARD
            .decode(input)
            .unwrap_or_default(),
    )
    .to_string()
}

// 修复：移除 #[serde]，让 Vec<u8> 映射为 Uint8Array（而不是 JSON 数组）
#[op2]
pub fn op_java_base64_decode_bytes(#[string] input: String) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(input.as_bytes())
        .unwrap_or_default()
}

#[op2]
#[string]
pub fn op_java_md5_encode(#[string] input: String) -> String {
    format!("{:x}", md5::compute(input.as_bytes()))
}

// 解析 key/iv 字节，支持 hex 编码
fn parse_key_bytes(s: &str, expected_len: usize) -> Vec<u8> {
    if s.len() == expected_len * 2 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        let mut bytes = Vec::with_capacity(expected_len);
        for i in 0..expected_len {
            let hex_pair = &s[i * 2..i * 2 + 2];
            match u8::from_str_radix(hex_pair, 16) {
                Ok(b) => bytes.push(b),
                Err(_) => {
                    break;
                }
            }
        }
        if bytes.len() == expected_len {
            return bytes;
        }
    }

    let mut bytes = vec![0u8; expected_len];
    let src = s.as_bytes();
    let len = src.len().min(expected_len);
    bytes[..len].copy_from_slice(&src[..len]);
    bytes
}

fn parse_aes_key_iv(key: &str) -> ([u8; 16], [u8; 16]) {
    let (key_str, iv_str) = if let Some(pos) = key.find("::") {
        (&key[..pos], &key[pos + 2..])
    } else {
        (key, "")
    };

    let key_bytes = parse_key_bytes(key_str, 16);
    let iv_bytes = parse_key_bytes(iv_str, 16);

    let mut key_arr = [0u8; 16];
    key_arr.copy_from_slice(&key_bytes);
    let mut iv_arr = [0u8; 16];
    iv_arr.copy_from_slice(&iv_bytes);
    (key_arr, iv_arr)
}

fn parse_des_key_iv(key: &str) -> ([u8; 8], [u8; 8]) {
    let (key_str, iv_str) = if let Some(pos) = key.find("::") {
        (&key[..pos], &key[pos + 2..])
    } else {
        (key, "")
    };

    let key_bytes = parse_key_bytes(key_str, 8);
    let iv_bytes = parse_key_bytes(iv_str, 8);

    let mut key_arr = [0u8; 8];
    key_arr.copy_from_slice(&key_bytes);
    let mut iv_arr = [0u8; 8];
    iv_arr.copy_from_slice(&iv_bytes);
    (key_arr, iv_arr)
}

#[op2]
#[string]
pub fn op_java_aes_base64_decode(#[string] data: String, #[string] key: String) -> String {
    use aes::Aes128;
    use base64::Engine;
    use cbc::cipher::{BlockDecryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .unwrap_or_default();

    let (key_arr, iv_arr) = parse_aes_key_iv(&key);

    let cipher = cbc::Decryptor::<Aes128>::new(&key_arr.into(), &iv_arr.into());
    let mut buf = decoded;
    if let Ok(decrypted) = cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
        return String::from_utf8_lossy(decrypted).trim().to_string();
    }
    String::new()
}

#[op2]
#[string]
pub fn op_java_aes_base64_encode(#[string] data: String, #[string] key: String) -> String {
    use aes::Aes128;
    use base64::Engine;
    use cbc::cipher::{BlockEncryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let (key_arr, iv_arr) = parse_aes_key_iv(&key);

    let data_bytes = data.as_bytes();
    let block_size: usize = 16;
    let mut buf = data_bytes.to_vec();
    buf.resize(buf.len() + block_size, 0);

    let cipher = cbc::Encryptor::<Aes128>::new(&key_arr.into(), &iv_arr.into());
    match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
        Ok(encrypted) => base64::engine::general_purpose::STANDARD.encode(encrypted),
        Err(_) => String::new(),
    }
}

#[op2]
#[string]
pub fn op_java_des_base64_decode(#[string] data: String, #[string] key: String) -> String {
    use des::Des;
    use base64::Engine;
    use cbc::cipher::{BlockDecryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let decoded = match base64::engine::general_purpose::STANDARD.decode(&data) {
        Ok(d) => {
            if d.len() < 8 || d.len() % 8 != 0 { return String::new(); }
            d
        }
        Err(_) => return String::new(),
    };

    let (key_arr, iv_arr) = parse_des_key_iv(&key);

    let cipher = cbc::Decryptor::<Des>::new(&key_arr.into(), &iv_arr.into());
    let mut buf = decoded;
    if let Ok(decrypted) = cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
        return String::from_utf8_lossy(decrypted).trim().to_string();
    }
    String::new()
}

#[op2]
#[string]
pub fn op_java_des_base64_encode(#[string] data: String, #[string] key: String) -> String {
    use des::Des;
    use base64::Engine;
    use cbc::cipher::{BlockEncryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let (key_arr, iv_arr) = parse_des_key_iv(&key);

    let data_bytes = data.as_bytes();
    let block_size: usize = 8;
    let mut buf = data_bytes.to_vec();
    buf.resize(buf.len() + block_size, 0);

    let cipher = cbc::Encryptor::<Des>::new(&key_arr.into(), &iv_arr.into());
    if let Ok(encrypted) = cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
        return base64::engine::general_purpose::STANDARD.encode(encrypted);
    }
    String::new()
}

use rsa::{RsaPrivateKey, RsaPublicKey, Pkcs1v15Encrypt};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::pkcs1v15::SigningKey;
use rsa::signature::{Signer, SignatureEncoding};
use sha2::Sha256;

static RSA_KEY_STORE: LazyLock<Mutex<HashMap<String, (Option<RsaPrivateKey>, Option<RsaPublicKey>)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[op2]
#[string]
pub fn op_java_rsa_set_public_key(#[string] source: String, #[string] key: String) -> String {
    use base64::Engine;
    let clean = key.trim();
    let der = if clean.starts_with("-----") {
        match RsaPublicKey::from_public_key_pem(clean) {
            Ok(k) => k,
            Err(e) => return format!("error: {}", e),
        }
    } else {
        match base64::engine::general_purpose::STANDARD.decode(clean) {
            Ok(der_bytes) => match RsaPublicKey::from_public_key_der(&der_bytes) {
                Ok(k) => k,
                Err(e) => return format!("error: {}", e),
            },
            Err(e) => return format!("error: base64 decode: {}", e),
        }
    };
    let mut store = RSA_KEY_STORE.lock();
    let entry = store.entry(source).or_insert((None, None));
    entry.1 = Some(der);
    "ok".into()
}

#[op2]
#[string]
pub fn op_java_rsa_set_private_key(#[string] source: String, #[string] key: String) -> String {
    use base64::Engine;
    let clean = key.trim();
    let der = if clean.starts_with("-----") {
        match RsaPrivateKey::from_pkcs8_pem(clean) {
            Ok(k) => k,
            Err(e) => return format!("error: {}", e),
        }
    } else {
        match base64::engine::general_purpose::STANDARD.decode(clean) {
            Ok(der_bytes) => match RsaPrivateKey::from_pkcs8_der(&der_bytes) {
                Ok(k) => k,
                Err(e) => return format!("error: {}", e),
            },
            Err(e) => return format!("error: base64 decode: {}", e),
        }
    };
    let mut store = RSA_KEY_STORE.lock();
    let entry = store.entry(source).or_insert((None, None));
    entry.0 = Some(der);
    "ok".into()
}

#[op2]
#[string]
pub fn op_java_rsa_encrypt(#[string] source: String, #[string] data: String) -> String {
    use base64::Engine;
    let store = RSA_KEY_STORE.lock();
    let entry = match store.get(&source) {
        Some(e) => e,
        None => return "error: no key set".into(),
    };
    let pub_key = match &entry.1 {
        Some(k) => k,
        None => return "error: no public key".into(),
    };
    let mut rng = rand::thread_rng();
    match pub_key.encrypt(&mut rng, Pkcs1v15Encrypt, data.as_bytes()) {
        Ok(encrypted) => base64::engine::general_purpose::STANDARD.encode(&encrypted),
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_rsa_decrypt(#[string] source: String, #[string] data: String) -> String {
    use base64::Engine;
    let store = RSA_KEY_STORE.lock();
    let entry = match store.get(&source) {
        Some(e) => e,
        None => return "error: no key set".into(),
    };
    let priv_key = match &entry.0 {
        Some(k) => k,
        None => return "error: no private key".into(),
    };
    let decoded = match base64::engine::general_purpose::STANDARD.decode(&data) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    match priv_key.decrypt(Pkcs1v15Encrypt, &decoded) {
        Ok(decrypted) => String::from_utf8_lossy(&decrypted).to_string(),
        Err(e) => format!("error: {}", e),
    }
}

#[op2]
#[string]
pub fn op_java_sign(#[string] source: String, #[string] data: String, #[string] _algorithm: String) -> String {
    use base64::Engine;
    let store = RSA_KEY_STORE.lock();
    let entry = match store.get(&source) {
        Some(e) => e,
        None => return "error: no key set".into(),
    };
    let priv_key = match &entry.0 {
        Some(k) => k,
        None => return "error: no private key".into(),
    };
    let signing_key = SigningKey::<Sha256>::new(priv_key.clone());
    match signing_key.try_sign(data.as_bytes()) {
        Ok(sig) => base64::engine::general_purpose::STANDARD.encode(sig.to_bytes()),
        Err(e) => format!("error: {}", e),
    }
}

// ─── 字节级 AES-CBC 解密（返回原始字节） ───

// 修复：移除 #[serde]，让 Vec<u8> 映射为 Uint8Array
#[op2]
pub fn op_java_aes_decrypt_bytes(
    #[buffer] data: &[u8],
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
) -> Vec<u8> {
    use aes::Aes256;
    use cbc::cipher::{BlockDecryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let mut key_arr = [0u8; 32];
    let key_len = key.len().min(32);
    key_arr[..key_len].copy_from_slice(&key[..key_len]);

    let mut iv_arr = [0u8; 16];
    let iv_len = iv.len().min(16);
    iv_arr[..iv_len].copy_from_slice(&iv[..iv_len]);

    let cipher = cbc::Decryptor::<Aes256>::new(&key_arr.into(), &iv_arr.into());
    let mut buf = data.to_vec();
    if let Ok(decrypted) = cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
        decrypted.to_vec()
    } else {
        Vec::new()
    }
}

#[op2]
pub fn op_java_aes_encrypt_bytes(
    #[buffer] data: &[u8],
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
) -> Vec<u8> {
    use aes::Aes256;
    use cbc::cipher::{BlockEncryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let mut key_arr = [0u8; 32];
    let key_len = key.len().min(32);
    key_arr[..key_len].copy_from_slice(&key[..key_len]);

    let mut iv_arr = [0u8; 16];
    let iv_len = iv.len().min(16);
    iv_arr[..iv_len].copy_from_slice(&iv[..iv_len]);

    let block_size = 16;
    let mut buf = data.to_vec();
    buf.resize(buf.len() + block_size, 0);

    let cipher = cbc::Encryptor::<Aes256>::new(&key_arr.into(), &iv_arr.into());
    if let Ok(encrypted) = cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data.len()) {
        encrypted.to_vec()
    } else {
        Vec::new()
    }
}

// ─── 字节级 DES-CBC 解密（返回原始字节） ───

#[op2]
pub fn op_java_des_decrypt_bytes(
    #[buffer] data: &[u8],
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
) -> Vec<u8> {
    use des::Des;
    use cbc::cipher::{BlockDecryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let mut key_arr = [0u8; 8];
    let key_len = key.len().min(8);
    key_arr[..key_len].copy_from_slice(&key[..key_len]);

    let mut iv_arr = [0u8; 8];
    let iv_len = iv.len().min(8);
    iv_arr[..iv_len].copy_from_slice(&iv[..iv_len]);

    let cipher = cbc::Decryptor::<Des>::new(&key_arr.into(), &iv_arr.into());
    let mut buf = data.to_vec();
    if let Ok(decrypted) = cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
        decrypted.to_vec()
    } else {
        Vec::new()
    }
}

#[op2]
pub fn op_java_des_encrypt_bytes(
    #[buffer] data: &[u8],
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
) -> Vec<u8> {
    use des::Des;
    use cbc::cipher::{BlockEncryptMut, KeyIvInit};
    use cbc::cipher::block_padding::Pkcs7;

    let mut key_arr = [0u8; 8];
    let key_len = key.len().min(8);
    key_arr[..key_len].copy_from_slice(&key[..key_len]);

    let mut iv_arr = [0u8; 8];
    let iv_len = iv.len().min(8);
    iv_arr[..iv_len].copy_from_slice(&iv[..iv_len]);

    let block_size = 8;
    let mut buf = data.to_vec();
    buf.resize(buf.len() + block_size, 0);

    let cipher = cbc::Encryptor::<Des>::new(&key_arr.into(), &iv_arr.into());
    if let Ok(encrypted) = cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data.len()) {
        encrypted.to_vec()
    } else {
        Vec::new()
    }
}
