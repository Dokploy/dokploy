// 读取已创建的翻译文件
const fs = require('fs');
const path = require('path');

try {
  const basePath = process.cwd();
  const commonPart1Path = path.join(basePath, 'common-zh-Hans.json');
  const commonPart2Path = path.join(basePath, 'common-zh-Hans-buttons.json');
  const fullCommonPath = path.join(basePath, 'optimized-common-translations.json');
  const fullSettingsPath = path.join(basePath, 'optimized-settings-translations.json');

  const commonPart1 = JSON.parse(fs.readFileSync(commonPart1Path, 'utf8'));
  const commonPart2 = JSON.parse(fs.readFileSync(commonPart2Path, 'utf8'));
  const fullCommon = JSON.parse(fs.readFileSync(fullCommonPath, 'utf8'));
  const fullSettings = JSON.parse(fs.readFileSync(fullSettingsPath, 'utf8'));

  // 创建一个全新的翻译对象
  const mergedCommon = {};
  const mergedSettings = {};

  // 添加通用组件翻译
  mergedCommon["dashboard.title"] = "仪表盘";
  mergedCommon["dashboard.overview"] = "概览";
  mergedCommon["dashboard.projects"] = "项目";
  mergedCommon["dashboard.servers"] = "服务器";
  mergedCommon["dashboard.docker"] = "Docker";
  mergedCommon["dashboard.monitoring"] = "监控";
  mergedCommon["dashboard.settings"] = "设置";
  mergedCommon["dashboard.logout"] = "退出登录";
  mergedCommon["dashboard.profile"] = "个人资料";
  mergedCommon["dashboard.terminal"] = "终端";
  mergedCommon["dashboard.containers"] = "容器";
  mergedCommon["dashboard.images"] = "镜像";
  mergedCommon["dashboard.volumes"] = "卷";
  mergedCommon["dashboard.networks"] = "网络";
  
  // 按钮翻译
  mergedCommon["button.create"] = "创建";
  mergedCommon["button.edit"] = "编辑";
  mergedCommon["button.delete"] = "删除";
  mergedCommon["button.cancel"] = "取消";
  mergedCommon["button.save"] = "保存";
  mergedCommon["button.confirm"] = "确认";
  mergedCommon["button.back"] = "返回";
  mergedCommon["button.next"] = "下一步";
  mergedCommon["button.finish"] = "完成";
  
  // 状态翻译
  mergedCommon["status.running"] = "运行中";
  mergedCommon["status.stopped"] = "已停止";
  mergedCommon["status.error"] = "错误";
  mergedCommon["status.pending"] = "等待中";
  mergedCommon["status.success"] = "成功";
  mergedCommon["status.failed"] = "失败";
  
  // 表单翻译
  mergedCommon["form.required"] = "必填";
  mergedCommon["form.invalid"] = "无效";
  mergedCommon["form.submit"] = "提交";
  mergedCommon["form.reset"] = "重置";
  
  // 通知翻译
  mergedCommon["notification.success"] = "操作成功";
  mergedCommon["notification.error"] = "操作失败";
  mergedCommon["notification.warning"] = "警告";
  mergedCommon["notification.info"] = "信息";
  
  // 时间翻译
  mergedCommon["time.now"] = "刚刚";
  mergedCommon["time.minutes"] = "分钟前";
  mergedCommon["time.hours"] = "小时前";
  mergedCommon["time.days"] = "天前";
  
  // 过滤翻译
  mergedCommon["filter.all"] = "全部";
  mergedCommon["filter.active"] = "活跃";
  mergedCommon["filter.inactive"] = "不活跃";
  
  // 排序翻译
  mergedCommon["sort.asc"] = "升序";
  mergedCommon["sort.desc"] = "降序";
  
  // 搜索翻译
  mergedCommon["search.placeholder"] = "搜索...";
  mergedCommon["search.noResults"] = "无结果";
  
  // 分页翻译
  mergedCommon["pagination.prev"] = "上一页";
  mergedCommon["pagination.next"] = "下一页";
  mergedCommon["pagination.of"] = "共 {0} 页";
  
  // 错误翻译
  mergedCommon["error.notFound"] = "未找到";
  mergedCommon["error.serverError"] = "服务器错误";
  mergedCommon["error.unauthorized"] = "未授权";
  mergedCommon["error.forbidden"] = "禁止访问";
  
  // 通用状态翻译
  mergedCommon["loading"] = "加载中...";
  mergedCommon["empty"] = "暂无数据";
  mergedCommon["more"] = "更多";
  mergedCommon["less"] = "收起";
  
  // 项目翻译
  mergedCommon["project.create"] = "创建项目";
  mergedCommon["project.edit"] = "编辑项目";
  mergedCommon["project.delete"] = "删除项目";
  mergedCommon["project.name"] = "项目名称";
  mergedCommon["project.description"] = "项目描述";
  
  // 服务翻译
  mergedCommon["service.create"] = "创建服务";
  mergedCommon["service.edit"] = "编辑服务";
  mergedCommon["service.delete"] = "删除服务";
  mergedCommon["service.name"] = "服务名称";
  mergedCommon["service.type"] = "服务类型";
  
  // 域名翻译
  mergedCommon["domain.add"] = "添加域名";
  mergedCommon["domain.remove"] = "移除域名";
  
  // 环境变量翻译
  mergedCommon["environment.variables"] = "环境变量";
  mergedCommon["environment.add"] = "添加环境变量";
  mergedCommon["environment.edit"] = "编辑环境变量";
  mergedCommon["environment.name"] = "变量名";
  mergedCommon["environment.value"] = "变量值";

  // 设置页面的通用翻译
  mergedSettings["common.save"] = "保存";
  mergedSettings["common.enterTerminal"] = "终端";
  
  // 服务器域名设置
  mergedSettings["server.domain.title"] = "服务器域名";
  mergedSettings["server.domain.description"] = "为您的服务器应用添加域名。";
  mergedSettings["server.domain.form.domain"] = "域名";
  mergedSettings["server.domain.form.letsEncryptEmail"] = "Let's Encrypt 邮箱";
  mergedSettings["server.domain.form.certificate.label"] = "证书提供商";
  mergedSettings["server.domain.form.certificate.placeholder"] = "选择证书";
  mergedSettings["server.domain.form.certificateOptions.none"] = "无";
  mergedSettings["server.domain.form.certificateOptions.letsencrypt"] = "Let's Encrypt";
  
  // Web服务器设置
  mergedSettings["server.webServer.title"] = "Web 服务器";
  mergedSettings["server.webServer.description"] = "重载或清理 Web 服务器。";
  mergedSettings["server.webServer.actions"] = "操作";
  mergedSettings["server.webServer.reload"] = "重新加载";
  mergedSettings["server.webServer.watchLogs"] = "查看日志";
  mergedSettings["server.webServer.updateServerIp"] = "更新服务器 IP";
  mergedSettings["server.webServer.server.label"] = "服务器";
  
  // Traefik设置
  mergedSettings["server.webServer.traefik.label"] = "Traefik";
  mergedSettings["server.webServer.traefik.modifyEnv"] = "修改环境变量";
  mergedSettings["server.webServer.traefik.managePorts"] = "额外端口映射";
  mergedSettings["server.webServer.traefik.managePortsDescription"] = "为 Traefik 添加或删除额外端口";
  mergedSettings["server.webServer.traefik.targetPort"] = "目标端口";
  mergedSettings["server.webServer.traefik.publishedPort"] = "发布端口";
  mergedSettings["server.webServer.traefik.addPort"] = "添加端口";
  mergedSettings["server.webServer.traefik.portsUpdated"] = "端口更新成功";
  mergedSettings["server.webServer.traefik.portsUpdateError"] = "端口更新失败";
  mergedSettings["server.webServer.traefik.publishMode"] = "发布模式";
  
  // 存储空间设置
  mergedSettings["server.webServer.storage.label"] = "存储空间";
  mergedSettings["server.webServer.storage.cleanUnusedImages"] = "清理未使用的镜像";
  mergedSettings["server.webServer.storage.cleanUnusedVolumes"] = "清理未使用的卷";
  mergedSettings["server.webServer.storage.cleanStoppedContainers"] = "清理已停止的容器";
  mergedSettings["server.webServer.storage.cleanDockerBuilder"] = "清理 Docker Builder 和系统";
  mergedSettings["server.webServer.storage.cleanMonitoring"] = "清理监控数据";
  mergedSettings["server.webServer.storage.cleanAll"] = "清理所有内容";
  
  // 个人资料设置
  mergedSettings["profile.title"] = "账户";
  mergedSettings["profile.description"] = "在此更改您的个人资料详情。";
  mergedSettings["profile.email"] = "邮箱";
  mergedSettings["profile.password"] = "密码";
  mergedSettings["profile.avatar"] = "头像";
  
  // 外观设置
  mergedSettings["appearance.title"] = "外观";
  mergedSettings["appearance.description"] = "自定义您的仪表盘主题。";
  mergedSettings["appearance.theme"] = "主题";
  mergedSettings["appearance.themeDescription"] = "为您的仪表盘选择主题";
  mergedSettings["appearance.themes.light"] = "明亮";
  mergedSettings["appearance.themes.dark"] = "暗黑";
  mergedSettings["appearance.themes.system"] = "跟随系统";
  mergedSettings["appearance.language"] = "语言";
  mergedSettings["appearance.languageDescription"] = "为您的仪表盘选择语言";
  
  // 终端设置
  mergedSettings["terminal.connectionSettings"] = "连接设置";
  mergedSettings["terminal.ipAddress"] = "IP 地址";
  mergedSettings["terminal.port"] = "端口";
  mergedSettings["terminal.username"] = "用户名";
  
  // 其他设置
  mergedSettings["settings"] = "设置";
  mergedSettings["general"] = "通用设置";
  mergedSettings["security"] = "安全";
  mergedSettings["users"] = "用户管理";
  mergedSettings["roles"] = "角色管理";
  mergedSettings["permissions"] = "权限";
  mergedSettings["api"] = "API设置";
  mergedSettings["certificates"] = "证书管理";
  mergedSettings["ssh"] = "SSH密钥";
  mergedSettings["backups"] = "备份";
  mergedSettings["logs"] = "日志";
  mergedSettings["updates"] = "更新";
  mergedSettings["network"] = "网络";
  
  // 输出合并后的文件内容
  console.log('Common translations total:', Object.keys(mergedCommon).length);
  console.log('Settings translations total:', Object.keys(mergedSettings).length);

  // 保存为最终的翻译文件
  fs.writeFileSync(path.join(basePath, 'final-zh-Hans-common.json'), JSON.stringify(mergedCommon, null, 2));
  fs.writeFileSync(path.join(basePath, 'final-zh-Hans-settings.json'), JSON.stringify(mergedSettings, null, 2));
  
  // 输出翻译完成的统计
  const commonKeys = Object.keys(mergedCommon);
  const settingsKeys = Object.keys(mergedSettings);
  console.log('最终翻译文件已保存：');
  console.log(`- 通用翻译 (${commonKeys.length} 个词条)`);
  console.log(`- 设置翻译 (${settingsKeys.length} 个词条)`);
  
  // 创建最终放入项目中的文件（按项目结构）
  const projectCommonPath = path.join(basePath, 'apps', 'dokploy', 'public', 'locales', 'zh-Hans');
  
  // 确保目录存在
  if (!fs.existsSync(projectCommonPath)) {
    fs.mkdirSync(projectCommonPath, { recursive: true });
    console.log(`创建目录: ${projectCommonPath}`);
  }
  
  // 写入到项目中的目标位置
  const projectCommonFilePath = path.join(projectCommonPath, 'common.json');
  const projectSettingsFilePath = path.join(projectCommonPath, 'settings.json');
  
  console.log(`尝试写入到:\n- ${projectCommonFilePath}\n- ${projectSettingsFilePath}`);
  
  try {
    fs.writeFileSync(projectCommonFilePath, JSON.stringify(mergedCommon, null, 2));
    fs.writeFileSync(projectSettingsFilePath, JSON.stringify(mergedSettings, null, 2));
    console.log('已成功写入到项目文件夹中！');
  } catch (error) {
    console.error('写入到项目文件夹失败:', error.message);
    console.log('请手动将文件复制到目标位置。');
  }
} catch (error) {
  console.error('错误:', error);
}
