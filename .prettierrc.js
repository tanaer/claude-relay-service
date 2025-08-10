module.exports = {
  // 基本格式化选项
  semi: false,              // 不使用分号
  singleQuote: true,        // 使用单引号
  quoteProps: 'as-needed',  // 仅在需要时给对象属性加引号
  trailingComma: 'none',    // 不使用尾随逗号
  bracketSpacing: true,     // 花括号内空格
  bracketSameLine: false,   // 闭合括号换行
  arrowParens: 'always',    // 箭头函数参数总是加括号
  
  // 缩进和换行
  tabWidth: 2,              // 缩进宽度
  useTabs: false,           // 使用空格而不是tab
  printWidth: 100,          // 行宽限制
  endOfLine: 'lf',          // 使用 LF 换行符
  
  // 文件特定覆盖
  overrides: [
    {
      files: '*.vue',
      options: {
        parser: 'vue',
        printWidth: 100,
        singleAttributePerLine: true  // Vue文件中每行一个属性
      }
    },
    {
      files: '*.json',
      options: {
        parser: 'json',
        printWidth: 80,
        tabWidth: 2
      }
    },
    {
      files: '*.md',
      options: {
        parser: 'markdown',
        printWidth: 80,
        proseWrap: 'preserve'  // 保持markdown原始换行
      }
    },
    {
      files: ['*.js', '*.ts'],
      options: {
        parser: 'babel',
        printWidth: 100
      }
    }
  ]
}