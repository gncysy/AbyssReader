if (typeof File === "undefined") {
    global.File = class File {
        constructor(bits, name, opts) {
            this.name = name || "";
            this.size = bits?.length || 0;
            this.type = opts?.type || "";
            this.lastModified = Date.now();
        }
    };
    console.log("[Polyfill] File global added");
}
if (typeof Blob === "undefined") {
    global.Blob = class Blob {
        constructor(parts, opts) {
            this.size = parts?.length || 0;
            this.type = opts?.type || "";
        }
    };
    console.log("[Polyfill] Blob global added");
}
if (typeof FormData === "undefined") {
    global.FormData = class FormData {
        constructor() { this._data = new Map(); }
        append(key, value) { this._data.set(key, value); }
        get(key) { return this._data.get(key); }
    };
    console.log("[Polyfill] FormData global added");
}
