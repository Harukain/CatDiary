# App E2E 验收运行说明

当前已提供七条通用 Maestro 冒烟流程，另有一条 Android 专用离线同步流程：

- `.maestro/01-login-onboarding.yaml`：覆盖开发文档中的 App E2E 主流程 1～2，手机号登录、创建家庭和创建第一只猫。
- `.maestro/02-create-plan-complete-task.yaml`：覆盖 App E2E 主流程 4～5，创建照顾计划、生成任务、完成任务并在记录时间线查看生成记录。
- `.maestro/03-vomit-health-event.yaml`：覆盖 App E2E 主流程 8，新增一次呕吐异常记录，并从记录详情建立已关联的健康事件。
- `.maestro/04-weight-trend.yaml`：覆盖 App E2E 主流程 10，新增两条不同日期的体重记录，并在单猫档案查看体重趋势。
- `.maestro/05-logout-all.yaml`：覆盖 App E2E 主流程 14，从“我的 → 账号与注销”执行退出全部设备并回到登录页。
- `.maestro/06-medical-next-reminder.yaml`：覆盖 App E2E 主流程 11，新增疫苗医疗档案、填写下次日期，并在医疗档案列表和单猫档案聚合中查看。
- `.maestro/07-data-export-medical-summary.yaml`：覆盖 App E2E 主流程 13，生成单猫就医摘要，并生成家庭数据导出文件到可分享状态。
- `.maestro-android/08-offline-record-sync.yaml`：覆盖 App E2E 主流程 6，Android 真机或模拟器上断网新增饮食记录，本机时间线展示“待同步”，恢复联网后自动重放并显示同步完成。

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

第三条流程同样建议使用新手机号，避免历史记录影响第一条时间线记录的定位：

```bash
CATDIARY_E2E_PHONE=13900139022 \
CATDIARY_E2E_FAMILY='Maestro 健康验收家庭' \
CATDIARY_E2E_PET='Maestro 健康验收猫' \
CATDIARY_E2E_EVENT='Maestro 呕吐观察' \
maestro test .maestro/03-vomit-health-event.yaml
```

该流程会从中央 `+` 打开新增记录，选择“呕吐”，填写一次带血/毛球呕吐并标记异常。保存后进入记录时间线，打开记录详情并建立健康事件，最后校验健康事件详情页存在关联记录。

第四条流程会创建两条不同日期的体重记录，再进入“我的 → 猫咪档案 → 单猫档案”查看体重趋势：

```bash
CATDIARY_E2E_PHONE=13900139032 \
CATDIARY_E2E_FAMILY='Maestro 体重验收家庭' \
CATDIARY_E2E_PET='Maestro 体重验收猫' \
maestro test .maestro/04-weight-trend.yaml
```

该流程使用固定历史日期 `2026-07-14` 和 `2026-07-15`，避免趋势图因为同一天记录被服务端按天聚合成单点而无法显示柱状趋势。

第五条流程会验证账号安全里的“退出全部设备”：

```bash
CATDIARY_E2E_PHONE=13900139042 \
CATDIARY_E2E_FAMILY='Maestro 账号验收家庭' \
CATDIARY_E2E_PET='Maestro 账号验收猫' \
maestro test .maestro/05-logout-all.yaml
```

该流程会创建新家庭和猫咪，进入“我的 → 账号与注销”，触发退出全部设备的危险操作确认；确认后必须回到手机号登录页。

第六条流程会验证结构化疫苗档案与下次日期：

```bash
CATDIARY_E2E_PHONE=13900139052 \
CATDIARY_E2E_FAMILY='Maestro 医疗验收家庭' \
CATDIARY_E2E_PET='Maestro 医疗验收猫' \
CATDIARY_E2E_MEDICAL_TITLE='Maestro 猫三联加强针' \
maestro test .maestro/06-medical-next-reminder.yaml
```

该流程会从“我的 → 猫咪档案 → 单猫档案 → 医疗档案”进入新增医疗档案，填写疫苗项目、发生日期、下次日期和品牌；保存后必须在医疗档案列表看到该条记录及下次日期，返回单猫档案后也必须在医疗档案聚合中看到下次日期。

第七条流程会验证就医摘要和家庭数据导出：

```bash
CATDIARY_E2E_PHONE=13900139062 \
CATDIARY_E2E_FAMILY='Maestro 导出验收家庭' \
CATDIARY_E2E_PET='Maestro 导出验收猫' \
CATDIARY_E2E_MEDICAL_TITLE='Maestro 摘要疫苗记录' \
maestro test .maestro/07-data-export-medical-summary.yaml
```

该流程会创建一条疫苗医疗档案，点击“生成摘要”并等待摘要生成到可分享状态；随后进入“我的 → 数据导出”，生成 JSON 家庭导出并等待服务端异步任务变为可分享状态。流程不会点击系统分享按钮，避免原生分享面板在不同 iOS/Android 设备上造成自动化不稳定；分享按钮本身会在真机手工验收中单独点击确认。

Android 离线流程会验证断网新增记录和恢复同步：

```bash
CATDIARY_E2E_PHONE=13900139072 \
CATDIARY_E2E_FAMILY='Maestro 离线验收家庭' \
CATDIARY_E2E_PET='Maestro 离线验收猫' \
pnpm e2e:maestro:android-offline
```

该流程会先登录并创建家庭/猫咪，随后打开中央 `+` 的饮食记录，在点击保存前启用 Android 飞行模式；保存后必须看到 `records.sync.offline`、`records.pending.badge` 和本机记录条目；关闭飞行模式并重新进入记录页后，必须看到 `records.sync.synced`。Maestro 的 `setAirplaneMode` 只适合 Android；iOS 离线恢复仍按真机手工验收执行。

如果 Android 真机通过 USB reverse 访问本机 API，飞行模式可能不会切断 `localhost`/反向代理链路。此时应改用设备可被飞行模式影响的局域网 API 地址，或在离线保存前临时移除 API reverse、恢复联网前重新建立 reverse；否则该流程会因为没有进入离线队列而失败。

如果使用默认手机号重复运行，需要先重置测试数据库，或等待验证码冷却后换一个测试手机号。

`pnpm e2e:maestro` 会运行 `.maestro/` 目录下的七条通用流程。只有在数据库已清理，或确认每条流程使用不同手机号时，才建议直接运行全部流程。Android 离线流程独立执行，不纳入默认通用目录，避免 iOS 或非离线环境误跑。

## 照片上传与相册真机验收

产品主流程 9「上传照片并按猫筛选」涉及系统相册、相机和媒体权限，当前不放入默认 `.maestro/` 自动运行目录，避免因设备媒体库、系统授权弹窗或原生选择器状态导致整套冒烟流程不稳定。该流程在真机上按以下步骤验收：

1. 使用 `.maestro/01-login-onboarding.yaml` 或手工登录创建一个只有一只猫的新家庭。
2. 点击中央 `+`，选择 `quick-add.action.photo` 进入添加照片页，确认出现 `photo-new.title`。
3. 点击 `photo-new.pick-library.button`，首次运行时选择允许相册权限；也需要单独验证拒绝权限后页面出现 `photo-new.permission.notice`，并且 `photo-new.permission.settings.button` 可跳转系统设置。
4. 在系统相册中选择 1 张小于 10MB 的图片，返回 App 后确认出现 `photo-new.preview.item`。
5. 确认至少有一个 `photo-new.pet.item` 被选中，填写 `photo-new.note.input`，点击 `photo-new.submit.button`。
6. 上传完成后进入 `photos.title`，确认存在 `photos.item`。
7. 点击 `photos.filter.pet` 后仍能看到该猫的照片；点击 `photos.filter.all` 可回到全部照片。
8. 点击 `photos.item` 进入 `photo-detail.title`，修改 `photo-detail.note.input` 后点击 `photo-detail.save.button`，再返回相册确认详情可再次打开。
9. 管理员账号在详情页验证 `photo-detail.set-avatar.button` 可以把照片设为猫咪头像；删除行为使用 `photo-detail.delete.button` 单独验证软删除提示。

如果要覆盖拍照路径，将第 3 步改为 `photo-new.take-photo.button`，并额外验证首次拒绝相机权限后的 `photo-new.permission.notice`。

这些流程运行通过后，只能证明登录建档、创建计划、任务完成、任务生成记录、手动异常记录、健康事件关联、体重趋势查看、疫苗下次日期、Android 离线记录同步、数据导出、就医摘要和退出全部设备的自动化冒烟通过；照片上传、推送、相机/相册权限、照片队列恢复、系统分享面板、真机冷启动和 Preview/Production 环境仍以 `docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md` 为准。
