const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  const { appOutDir } = context

  // 需要保留的语言文件（只保留中文）
  const keepLocales = ['zh-CN.pak']

  // 定位 locales 目录
  const localesDir = path.join(appOutDir, 'locales')
  if (!fs.existsSync(localesDir)) {
    console.log('locales 目录不存在，跳过清理')
    return
  }

  console.log('清理 locales 目录，只保留中文语言包...')
  const files = fs.readdirSync(localesDir)

  for (const file of files) {
    if (file.endsWith('.pak')) {
      if (!keepLocales.includes(file)) {
        const filePath = path.join(localesDir, file)
        fs.unlinkSync(filePath)
        console.log(`已删除: ${file}`)
      }
    }
  }

  console.log('locales 清理完成')
}
