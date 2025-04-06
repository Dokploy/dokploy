console.log('Creating translation extractor script...');

const fs = require('fs');
const path = require('path');

// 存储找到的所有翻译键
const translationKeys = {
  common: new Set(),
  settings: new Set()
};

// 匹配更多格式的翻译函数调用
// 支持 t('common.xxx')、t("common.xxx")、t(`common.xxx`)
const translationPatterns = [
  /t\(\s*['"]([a-zA-Z0-9._-]+)['"]?\s*[,)]/g,  // t('key') 或 t("key")
  /t\(\s*`([a-zA-Z0-9._-]+)`\s*[,)]/g,         // t(`key`)
  /useTranslation\(\s*["']([a-zA-Z0-9._-]+)["']\s*\)/g, // useTranslation('namespace')
  /serverSideTranslations\([^)]*["']([a-zA-Z0-9._-]+)["']/g // serverSideTranslations(..., ['namespace'])
];

const namespaceRegex = /^(common|settings)\./;

// 递归扫描目录下的所有 JS 和 TS 文件
function scanDirectory(directory) {
  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.next')) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          // 检查文件中是否使用了翻译
          let usesTranslation = false;
          if (content.includes('useTranslation') || content.includes('t(') || content.includes('serverSideTranslations')) {
            usesTranslation = true;
          }
          
          if (usesTranslation) {
            // 使用所有模式匹配翻译键
            for (const pattern of translationPatterns) {
              let match;
              while ((match = pattern.exec(content)) !== null) {
                const key = match[1];
                
                // 检查是否有命名空间
                const namespaceMatch = key.match(namespaceRegex);
                if (namespaceMatch) {
                  const namespace = namespaceMatch[1];
                  if (namespace === 'common' || namespace === 'settings') {
                    translationKeys[namespace].add(key);
                  }
                }
                
                // 如果文件中导入了特定命名空间，所有的 t(key) 都属于该命名空间
                if (content.includes(`useTranslation('common')`) || content.includes(`useTranslation("common")`)) {
                  if (!key.includes('.')) {
                    translationKeys.common.add(`common.${key}`);
                  }
                }
                
                if (content.includes(`useTranslation('settings')`) || content.includes(`useTranslation("settings")`)) {
                  if (!key.includes('.')) {
                    translationKeys.settings.add(`settings.${key}`);
                  }
                }
              }
            }
            
            // 控制台输出被处理的文件及其找到的翻译键
            if (usesTranslation) {
              console.log(`检查文件: ${fullPath}`);
            }
          }
        } catch (error) {
          console.error(`Error reading file ${fullPath}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directory}:`, error);
  }
}

// 手动添加一些常见的翻译键（基于直接观察和常见用法）
function addCommonTranslationKeys() {
  const commonKeys = [
    'dashboard.title', 'dashboard.overview', 'dashboard.projects', 'dashboard.servers',
    'dashboard.docker', 'dashboard.monitoring', 'dashboard.settings', 'dashboard.logout',
    'dashboard.profile', 'dashboard.terminal', 'dashboard.containers', 'dashboard.images',
    'dashboard.volumes', 'dashboard.networks',
    
    'button.create', 'button.edit', 'button.delete', 'button.cancel',
    'button.save', 'button.confirm', 'button.back', 'button.next', 'button.finish',
    
    'status.running', 'status.stopped', 'status.error', 'status.pending', 
    'status.success', 'status.failed',
    
    'form.required', 'form.invalid', 'form.submit', 'form.reset',
    
    'notification.success', 'notification.error', 'notification.warning', 'notification.info',
    
    'time.now', 'time.minutes', 'time.hours', 'time.days',
    
    'filter.all', 'filter.active', 'filter.inactive',
    
    'sort.asc', 'sort.desc',
    
    'search.placeholder', 'search.noResults',
    
    'pagination.prev', 'pagination.next', 'pagination.of',
    
    'error.notFound', 'error.serverError', 'error.unauthorized', 'error.forbidden',
    
    'loading', 'empty', 'more', 'less',
    
    'project.create', 'project.edit', 'project.delete', 'project.name', 'project.description',
    
    'service.create', 'service.edit', 'service.delete', 'service.name', 'service.type',
    
    'domain.add', 'domain.remove',
    
    'environment.variables', 'environment.add', 'environment.edit', 
    'environment.name', 'environment.value'
  ];
  
  commonKeys.forEach(key => {
    translationKeys.common.add(`common.${key}`);
  });
}

// 读取现有翻译文件
function readTranslationFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error reading translation file ${filePath}:`, error);
  }
  return {};
}

// 主函数
function extractTranslations() {
  const appsDir = path.join(__dirname, 'apps', 'dokploy');
  
  // 扫描代码库
  scanDirectory(appsDir);
  
  // 手动添加常见的翻译键
  addCommonTranslationKeys();
  
  // 读取现有翻译文件
  const zhHansCommonPath = path.join(appsDir, 'public', 'locales', 'zh-Hans', 'common.json');
  const zhHansSettingsPath = path.join(appsDir, 'public', 'locales', 'zh-Hans', 'settings.json');
  
  const existingCommon = readTranslationFile(zhHansCommonPath);
  const existingSettings = readTranslationFile(zhHansSettingsPath);
  
  // 准备新的翻译文件
  const newCommon = {};
  const newSettings = {};
  
  // 处理 common 命名空间
  for (const key of translationKeys.common) {
    const shortKey = key.replace('common.', '');
    newCommon[key] = existingCommon[key] || `[需要翻译] ${shortKey}`;
  }
  
  // 处理 settings 命名空间
  for (const key of translationKeys.settings) {
    const shortKey = key.replace('settings.', '');
    newSettings[key] = existingSettings[key] || `[需要翻译] ${shortKey}`;
  }
  
  // 输出结果
  console.log('=== 提取的 common 翻译键 ===');
  console.log(Array.from(translationKeys.common).sort().join('\n'));
  console.log(`\n共找到 ${translationKeys.common.size} 个 common 翻译键`);
  
  console.log('\n=== 提取的 settings 翻译键 ===');
  console.log(Array.from(translationKeys.settings).sort().join('\n'));
  console.log(`\n共找到 ${translationKeys.settings.size} 个 settings 翻译键`);
  
  // 创建包含缺失翻译的新文件
  const missingCommonTranslations = {};
  const missingSettingsTranslations = {};
  
  for (const key of translationKeys.common) {
    if (!existingCommon[key]) {
      const shortKey = key.replace('common.', '');
      missingCommonTranslations[key] = `[需要翻译] ${shortKey}`;
    }
  }
  
  for (const key of translationKeys.settings) {
    if (!existingSettings[key]) {
      const shortKey = key.replace('settings.', '');
      missingSettingsTranslations[key] = `[需要翻译] ${shortKey}`;
    }
  }
  
  // 输出缺失的翻译
  console.log('\n=== 缺失的 common 翻译 ===');
  console.log(JSON.stringify(missingCommonTranslations, null, 2));
  console.log(`\n共缺失 ${Object.keys(missingCommonTranslations).length} 个 common 翻译`);
  
  console.log('\n=== 缺失的 settings 翻译 ===');
  console.log(JSON.stringify(missingSettingsTranslations, null, 2));
  console.log(`\n共缺失 ${Object.keys(missingSettingsTranslations).length} 个 settings 翻译`);
  
  // 输出可以直接复制到文件中的完整翻译对象
  console.log('\n=== 完整的 common.json 内容 ===');
  const fullCommon = { ...existingCommon };
  translationKeys.common.forEach(key => {
    if (!fullCommon[key]) {
      const shortKey = key.replace('common.', '');
      fullCommon[key] = `[翻译] ${shortKey}`;
    }
  });
  console.log(JSON.stringify(fullCommon, null, 2));
  
  console.log('\n=== 完整的 settings.json 内容 ===');
  const fullSettings = { ...existingSettings };
  translationKeys.settings.forEach(key => {
    if (!fullSettings[key]) {
      const shortKey = key.replace('settings.', '');
      fullSettings[key] = `[翻译] ${shortKey}`;
    }
  });
  console.log(JSON.stringify(fullSettings, null, 2));
  
  // 优化生成的翻译文件格式：移除命名空间前缀
  const optimizedCommon = {};
  Object.keys(fullCommon).forEach(key => {
    const shortKey = key.replace('common.', '');
    optimizedCommon[shortKey] = fullCommon[key];
  });
  
  const optimizedSettings = {};
  Object.keys(fullSettings).forEach(key => {
    const shortKey = key.replace('settings.', '');
    optimizedSettings[shortKey] = fullSettings[key];
  });
  
  // 写入文件
  fs.writeFileSync('missing-common-translations.json', JSON.stringify(missingCommonTranslations, null, 2), 'utf8');
  fs.writeFileSync('missing-settings-translations.json', JSON.stringify(missingSettingsTranslations, null, 2), 'utf8');
  fs.writeFileSync('full-common-translations.json', JSON.stringify(fullCommon, null, 2), 'utf8');
  fs.writeFileSync('full-settings-translations.json', JSON.stringify(fullSettings, null, 2), 'utf8');
  fs.writeFileSync('optimized-common-translations.json', JSON.stringify(optimizedCommon, null, 2), 'utf8');
  fs.writeFileSync('optimized-settings-translations.json', JSON.stringify(optimizedSettings, null, 2), 'utf8');
  
  console.log('\n翻译提取完成！');
  console.log('文件已保存：');
  console.log('- missing-common-translations.json: 缺失的 common 翻译');
  console.log('- missing-settings-translations.json: 缺失的 settings 翻译');
  console.log('- full-common-translations.json: 完整的 common 翻译（包含命名空间）');
  console.log('- full-settings-translations.json: 完整的 settings 翻译（包含命名空间）');
  console.log('- optimized-common-translations.json: 优化格式的 common 翻译（不含命名空间）');
  console.log('- optimized-settings-translations.json: 优化格式的 settings 翻译（不含命名空间）');
}

extractTranslations();
