# App E2E 验收运行说明

当前已提供九条通用 Maestro 冒烟流程，另有一条 Android 专用离线同步流程：

- `.maestro/01-login-onboarding.yaml`：覆盖开发文档中的 App E2E 主流程 1～2，手机号登录、创建家庭和创建第一只猫。
- `.maestro/02-create-plan-complete-task.yaml`：覆盖 App E2E 主流程 4～5，创建照顾计划、生成任务、完成任务并在记录时间线查看生成记录。
- `.maestro/03-vomit-health-event.yaml`：覆盖 App E2E 主流程 8，新增一次呕吐异常记录，并从记录详情建立已关联的健康事件。
- `.maestro/04-weight-trend.yaml`：覆盖 App E2E 主流程 10，新增两条不同日期的体重记录，并在单猫档案查看体重趋势。
- `.maestro/05-logout-all.yaml`：覆盖 App E2E 主流程 14，从“我的 → 账号与注销”执行退出全部设备并回到登录页。
- `.maestro/06-medical-next-reminder.yaml`：覆盖 App E2E 主流程 11，新增疫苗医疗档案、填写下次日期，并在医疗档案列表和单猫档案聚合中查看。
- `.maestro/07-data-export-medical-summary.yaml`：覆盖 App E2E 主流程 13，生成单猫就医摘要，并生成家庭数据导出文件到可分享状态。
- `.maestro/08-family-invite-role.yaml`：覆盖 App E2E 主流程 3，创建者生成手机号绑定邀请，被邀请账号通过深链接接受邀请，创建者重新登录后把该成员调整为管理员。
- `.maestro/09-feishu-settings-notification-logs.yaml`：覆盖 App E2E 主流程 12 的稳定页面链路，验证“我的 → 通知偏好 → 飞书配置”和“提醒发送记录 → 失败筛选/刷新”入口；不触发真实飞书 Webhook 发送。
- `.maestro-android/08-offline-record-sync.yaml`：覆盖 App E2E 主流程 6，Android 真机或模拟器上断网新增饮食记录，本机时间线展示“待同步”，恢复联网后自动重放并显示同步完成。
- `scripts/verify-task-concurrency.mjs`：覆盖 App E2E 主流程 7 的服务端一致性门禁，真实启动 API/Worker/PostgreSQL/Redis 后验证两个家庭成员基于同一任务版本并发完成时，只能成功一次，失败方收到明确 409，刷新后看到已完成状态。

提交前会执行 `pnpm test:e2e-flows` 静态检查 Maestro 流程清单、默认手机号唯一性、关键 testID、脚本入口和本说明文档引用，防止真机回归前流程被误删或入口漂移。该检查只证明脚本结构完整，不代表已在真机上运行通过。

运行前提：

- 已安装 Maestro CLI。
- Android 或 iOS Development Build 已安装并可打开 `com.haruka.catdiary`。
- 本地 API、Worker、PostgreSQL、Redis 和 Metro 已启动；Android USB 调试可先运行 `pnpm android:preflight -- --fix --launch`，让脚本检查 USB reverse 后直接打开 Development Build 并加载当前 Metro 项目；iPhone 真机可先运行 `pnpm ios:preflight`，确认 Xcode 命令行工具、已信任设备、局域网 API 和 Metro 连通。
- API 处于开发或测试环境，验证码为 `123456`。

## iOS Development Build 真机预检

iPhone 真机不能访问 Mac 上的 `localhost`、`127.0.0.1` 或 Android Emulator 专用的 `10.0.2.2`。真机验收前，先让 iPhone 与 Mac 接入同一 Wi-Fi，并使用 Mac 的局域网 IPv4 启动 Metro：

```bash
EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \
  pnpm --filter @cat-diary/mobile exec expo start --dev-client --lan --clear --port 8081
```

随后在另一个终端执行：

```bash
EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \
IOS_METRO_URL='http://开发机局域网IP:8081' \
pnpm ios:preflight
```

该脚本只做只读检查：Xcode 命令行工具、可见且已信任的 iPhone/iPad、本机 Metro、iPhone 可访问的 Metro、以及 iPhone 可访问的 API `/health/live`。预检通过后，如果 Development Build 没有自动发现项目，可复制脚本输出的 `exp+catdiary://...` 深链到 iPhone Safari 打开。

## 真机验收证据

真机回归不能只口头记录“已跑过”。仓库提供证据模板 [DEVICE_ACCEPTANCE_EVIDENCE.example.json](./DEVICE_ACCEPTANCE_EVIDENCE.example.json)，覆盖 14 条 App E2E 主流程、双平台设备信息、预检结果、权限、推送、离线、照片队列、小屏布局和冷启动专项检查。

真实证据建议放在本地忽略目录，不提交到 GitHub：

```bash
mkdir -p docs/device-acceptance
cp docs/DEVICE_ACCEPTANCE_EVIDENCE.example.json docs/device-acceptance/2026-07-development-build.json
```

每轮真机跑完后，填写脱敏证据，再执行：

```bash
pnpm acceptance:evidence -- --file docs/device-acceptance/2026-07-development-build.json --require-passed
```

严格模式会要求 `sourceCommit` 等于当前 Git HEAD，iOS 和 Android 真机记录都存在，14 条 MVP 主流程、设备专项检查和平台预检全部为 `passed`，且不允许遗留 P0/P1。证据文件不得写入 Token、密码、私钥、完整 Webhook 或未脱敏设备标识；脚本会做敏感信息拦截。CI 会执行 `pnpm test:device-evidence` 自检，确保当前提交证据可通过、旧提交证据会被拒绝。

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

第八条流程会验证家庭邀请和角色调整：

```bash
CATDIARY_E2E_OWNER_PHONE=13900139083 \
CATDIARY_E2E_MEMBER_PHONE=13900139084 \
CATDIARY_E2E_FAMILY='Maestro 协作验收家庭' \
CATDIARY_E2E_PET='Maestro 协作验收猫' \
maestro test .maestro/08-family-invite-role.yaml
```

该流程会创建家庭和猫咪，由创建者在“我的 → 家庭成员”生成邀请，复制开发环境展示的 `catdiary:///family-invites/...` 深链；退出后用被邀请手机号登录并接受邀请；最后重新登录创建者账号，将该成员调整为管理员。该流程依赖 App 原生 scheme `catdiary`，移动配置门禁会校验该 scheme 不被移除。

第九条流程会验证飞书配置和通知日志入口：

```bash
CATDIARY_E2E_PHONE=13900139092 \
CATDIARY_E2E_FAMILY='Maestro 通知验收家庭' \
CATDIARY_E2E_PET='Maestro 通知验收猫' \
pnpm e2e:maestro:feishu-logs
```

该流程会创建新家庭和猫咪，进入“我的 → 通知偏好 → 飞书通知”，等待飞书配置状态加载完成；随后输入一个非飞书域名的 Webhook，确认本地格式校验会阻止保存，并通过放弃草稿返回。最后进入“提醒发送记录”，切换到“失败”筛选并执行刷新，确认没有失败日志时展示稳定空态。该流程只覆盖不依赖外部服务的入口、校验和筛选链路；真实飞书 Webhook 保存、测试发送、失败日志重试仍按下方手工验收执行。

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

`pnpm e2e:maestro` 会运行 `.maestro/` 目录下的九条通用流程。只有在数据库已清理，或确认每条流程使用不同手机号时，才建议直接运行全部流程。Android 离线流程独立执行，不纳入默认通用目录，避免 iOS 或非离线环境误跑。

如果只想在提交前确认 E2E 脚本结构没有漂移，执行：

```bash
pnpm test:e2e-flows
```

## 双设备并发完成任务验收

产品主流程 7「两设备并发完成同一任务」已纳入 `pnpm test:integration` 的服务端门禁：`scripts/verify-task-concurrency.mjs` 会创建同一家庭的两个成员，让双方基于同一个 `version=1` 任务快照并行调用完成接口，并断言以下结果：

1. 两个完成请求只有一个返回成功。
2. 另一个请求必须返回 409，错误码为 `VERSION_CONFLICT` 或 `TASK_ALREADY_COMPLETED`。
3. 数据库中该任务只进入一次 `COMPLETED`，版本只递增一次。
4. 任务生成的 `Record` 只有一条，且内容来自成功方，不会被失败方覆盖。
5. 失败方重新读取任务详情后能看到最新已完成状态。

该门禁证明服务端并发一致性和第二设备刷新恢复能力。真正“两台物理手机同时点击完成按钮”的 UI 与网络时序仍需按真机手工回归：两台设备登录同一家庭，打开同一任务详情，同时点击完成；预期一台显示完成成功，另一台出现“任务已被其他成员处理/任务已经完成”类提示，刷新后两台设备都看到同一条已完成任务和同一条任务记录。

## 飞书通知与失败重试真机验收

产品主流程 12「配置飞书、失败重试」涉及真实飞书群机器人和外部发送结果，不放入默认自动化断言真实发送成功或失败，避免测试脚本误发群消息、依赖公网超时或刷爆飞书机器人限流。该流程在真机上按以下步骤验收：

1. 用管理员账号进入“我的 → 通知偏好 → 飞书通知”，确认页面状态从“正在加载飞书通知配置…”进入“未配置”或“已配置”。
2. 输入非 HTTPS、非飞书/Lark 域名、非 `/open-apis/bot/` 路径三类错误地址，确认页面分别阻止保存并展示格式错误。
3. 输入真实飞书或 Lark 自定义机器人 Webhook，点击 `feishu.save.button`，确认出现 `feishu.success.text`，状态变为“已配置”，且只展示脱敏尾号。
4. 点击 `feishu.test.button`，确认 App 出现测试发送成功，并在对应飞书群收到“猫伴日记测试通知”。
5. 为同一家庭创建一个固定时间提醒任务，等待 Worker 生成并发送通知；进入“提醒发送记录”，确认对应日志展示为发送中、已发送或送达。
6. 若需要验证失败重试，应临时将飞书机器人 Webhook 替换为已删除、无效或会被飞书拒绝的真实飞书/Lark Webhook，等待任务通知失败后进入“提醒发送记录 → 失败”，确认失败原因安全可读。
7. 修复 Webhook 后点击失败项的 `notification-logs.retry.button`，在确认弹窗中选择“确认重试”，确认日志状态从失败回到队列中，并在 Worker 处理后变为已发送/送达。
8. 普通成员账号进入飞书通知页，应只能看到 `feishu.readonly.card`，不能保存、测试或移除 Webhook。

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

这些流程运行通过后，只能证明登录建档、家庭邀请与角色调整、创建计划、任务完成、任务生成记录、双成员任务并发服务端一致性、手动异常记录、健康事件关联、体重趋势查看、疫苗下次日期、Android 离线记录同步、飞书配置入口、通知日志失败筛选、数据导出、就医摘要和退出全部设备的自动化冒烟通过；照片上传、真实推送、真实飞书 Webhook、两台物理真机同时点击完成、相机/相册权限、照片队列恢复、系统分享面板、真机冷启动和 Preview/Production 环境仍以 `docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md` 为准。
