// 浏览器空实现 - 替代 node:vm
// 当 Vite 遇到 import('node:vm') 时，使用这个文件

// 导出空对象，让浏览器不报错
const vm = {
  Script: class Script {
    constructor() {}
    runInContext() { return null }
    runInNewContext() { return null }
  },
  createContext: (obj: any) => obj,
  isContext: () => false,
  runInContext: () => null,
  runInNewContext: () => null,
  runInThisContext: () => null,
}

// 导出 vm 对象，让 import('node:vm') 返回这个空实现
const module = { exports: vm }
export default vm
// 也支持 default 导入
export { vm }
