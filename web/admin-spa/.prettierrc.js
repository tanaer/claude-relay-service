module.exports = {
  // 继承根配置
  ...require('../../.prettierrc.js'),
  
  // 前端特定配置
  plugins: ['prettier-plugin-tailwindcss'],
  
  // Vue和前端特定覆盖
  overrides: [
    {
      files: '*.vue',
      options: {
        parser: 'vue',
        printWidth: 100,
        singleAttributePerLine: false, // 允许多个属性在同一行（短属性）
        vueIndentScriptAndStyle: true  // 缩进script和style标签内容
      }
    },
    {
      files: '*.{js,ts}',
      options: {
        parser: 'babel-ts',
        printWidth: 100
      }
    },
    {
      files: '*.{css,scss}',
      options: {
        parser: 'css',
        printWidth: 80
      }
    }
  ]
}