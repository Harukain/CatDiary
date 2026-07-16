# App E2E 验收运行说明

当前已提供第一条 Maestro 冒烟流程：`.maestro/01-login-onboarding.yaml`，覆盖开发文档中的 App E2E 主流程 1～2：手机号登录、创建家庭和创建第一只猫。

运行前提：

- 已安装 Maestro CLI。
- Android 或 iOS Development Build 已安装并可打开 `com.haruka.catdiary`。
- 本地 API、Worker、PostgreSQL、Redis 和 Metro 已启动；Android USB 调试可先运行 `pnpm android:preflight -- --fix`。
- API 处于开发或测试环境，验证码为 `123456`。

建议使用尚未登录过的新手机号，避免直接进入已有家庭：

```bash
CATDIARY_E2E_PHONE=13900139002 \
CATDIARY_E2E_FAMILY='Maestro 验收家庭' \
CATDIARY_E2E_PET='Maestro 验收猫' \
pnpm e2e:maestro
```

如果使用默认手机号重复运行，需要先重置测试数据库，或等待验证码冷却后换一个测试手机号。

该流程只能证明登录与首次建档的自动化冒烟通过；推送、相机/相册权限、弱网、照片队列恢复、真机冷启动和 Preview/Production 环境仍以 `docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md` 为准。
