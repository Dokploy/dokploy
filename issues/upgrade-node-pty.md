## 背景
- ARM 架构构建 `pnpm install --frozen-lockfile` 失败，原因是 `node-pty@1.0.0` 在 Node 20 下编译 NAN/V8 API 不兼容，ARM 需要源码编译而 AMD 多用预编译。

## 目标
- 升级 `node-pty` 到支持 Node 20 的版本，更新锁文件，确保 ARM/AMD 构建通过。

## 计划
1. 更新 `apps/dokploy/package.json` 将 `node-pty` 升级到最新兼容版本（^1.1.0）。
2. 运行 `pnpm install` 更新 `pnpm-lock.yaml`。
3. 验证 `pnpm install --frozen-lockfile` 可在 CI/构建通过（本地不跑）。


