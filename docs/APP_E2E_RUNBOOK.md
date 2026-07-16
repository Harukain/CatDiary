# App E2E 验收运行说明

当前已提供两条 Maestro 冒烟流程：

- `.maestro/01-login-onboarding.yaml`：覆盖开发文档中的 App E2E 主流程 1～2，手机号登录、创建家庭和创建第一只猫。
- `.maestro/02-create-plan-complete-task.yaml`：覆盖 App E2E 主流程 4～5，创建照顾计划、生成任务、完成任务并在记录时间线查看生成记录。

运行前提：

- 已安装 Maestro CLI。
- Android 或 iOS Development Build 已安装并可打开 `com.haruka.catdiary`。
- 本地 API、Worker、PostgreSQL、Redis 和 Metro 已启动；Android USB 调试可先运行 `pnpm android:preflight -- --fix`。
- API 处于开发或测试环境，验证码为 `123456`。

建议使用尚未登录过的新手机号，避免直接进入已有家庭。单独验证登录建档流程时执行：

```bash
CATDIARY_E2E_PHONE=13900139002 \
CATDIARY_E2E_FAMILY='Maestro 验收家庭' \
CATDIARY_E2E_PET='Maestro 验收猫' \
maestro test .maestro/01-login-onboarding.yaml
```

第二条流程同样建议使用新手机号，避免历史计划或任务影响定位：

```bash
CATDIARY_E2E_PHONE=13900139012 \
CATDIARY_E2E_FAMILY='Maestro 任务验收家庭' \
CATDIARY_E2E_PET='Maestro 任务验收猫' \
CATDIARY_E2E_PLAN='Maestro 铲屎提醒' \
maestro test .maestro/02-create-plan-complete-task.yaml
```

该流程会创建一个“铲屎”公共照顾计划，把提醒时间固定为 `00:00` 并选择每天重复。这样新任务会稳定出现在“即将”范围中，避免执行时间依赖当前时刻。

如果使用默认手机号重复运行，需要先重置测试数据库，或等待验证码冷却后换一个测试手机号。

`pnpm e2e:maestro` 会运行 `.maestro/` 目录下的全部流程。只有在数据库已清理，或确认每条流程使用不同手机号时，才建议直接运行全部流程。

这些流程只能证明登录建档、创建计划、任务完成和任务生成记录的自动化冒烟通过；推送、相机/相册权限、弱网、照片队列恢复、真机冷启动和 Preview/Production 环境仍以 `docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md` 为准。
