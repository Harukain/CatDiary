# 猫伴日记发布运行手册

## 1. 发布门禁

每次合并或发布前必须通过：

```bash
pnpm install --frozen-lockfile
pnpm test:release-env
pnpm test:preview-compose
pnpm db:validate
pnpm verify
pnpm acceptance:report
pnpm release:image-refs -- --registry ccr.ccs.tencentyun.com --namespace <TCR_NAMESPACE>
pnpm release:plan -- --target preview --registry ccr.ccs.tencentyun.com --namespace <TCR_NAMESPACE> --env-file ../.env.preview --format markdown
pnpm release:preflight -- --target preview --env-file ../.env.preview --api-image <API_IMAGE> --worker-image <WORKER_IMAGE>
pnpm test:integration
pnpm test:restore
pnpm acceptance:evidence -- --file docs/device-acceptance/实际证据文件.json --require-passed
pnpm acceptance:gate
pnpm audit --audit-level high
```

`pnpm test:integration` 会先自动执行 `prisma migrate deploy` 和 `prisma migrate status`，迁移失败时不会启动 API/Worker，避免新代码连接旧数据库结构。

CI 还会执行 Prisma 迁移状态检查、iOS/Android Expo bundle 导出和 Gitleaks 密钥扫描。

`pnpm test:release-env` 校验 `.env.preview.example` 与 `.env.production.example` 覆盖发布必需变量、显式禁用本地上传/导出目录、保留 EAS Project ID、区分 COS/SMS 占位密钥，并避免混入开发验证码或本地地址。`pnpm test:preview-compose` 校验 Preview Compose 只包含 migrate/API/Worker 三个服务、API 默认仅绑定 `127.0.0.1`、Worker 不暴露端口、容器使用只读文件系统/无新增权限/丢弃 capabilities、API/Worker 镜像保留非 root 用户和健康检查，防止部署模板在后续修改中回退。`pnpm release:image-refs` 从当前 Git HEAD 生成 `YYYYMMDD-<12位sha>` 镜像 tag，并输出 API/Worker 两个独立镜像引用；默认会拒绝未提交改动、无效 registry、本地 registry、无效 namespace 和非法 SHA，CI 通过 `pnpm test:release-image-refs` 防止规则回退。`pnpm release:plan` 生成不含 Secret 的发布执行清单，汇总 Git、镜像、env 脱敏摘要和下一步命令；它只输出公开 URL、Bucket 名称、地域和开关状态，真实密钥只显示变量名已存在，CI 通过 `pnpm test:release-plan` 验证清单不泄漏 Secret。`pnpm release:preflight` 在正式部署前做静态配置检查，不连接腾讯云、不发送短信、不读取真实外部服务状态。它会检查 Git 提交、EAS profile、Preview/Production 公开 API 与法律文档 URL、EAS Project ID、PostgreSQL/Redis 非本地连接串、CORS、反向代理、Swagger 关闭、通知/导出开关、固定验证码禁用、密钥长度、COS/SMS 配置分离、Worker 运维端口、Preview Compose 运行时 API 绑定地址/端口、发布镜像不可变引用以及本地上传/导出目录禁用。镜像引用必须包含真实 registry 和命名空间，并使用 `sha256` digest、SemVer、日期+Git SHA 或 12-40 位 Git SHA；`latest`、`main`、`prod`、`stable` 等浮动标签、缺失 registry host 和 API/Worker 共用同一镜像都会失败。CI 执行 `pnpm test:release-preflight`，用脱敏样例证明规则能放行安全配置并拒绝开发验证码、本地 API、SMS/COS 共用密钥、公开 API 绑定、非法 API 端口、浮动镜像标签、缺失 registry host 和共用服务镜像；真实部署仍需使用实际 env 文件和镜像引用运行 `release:preflight`。

`pnpm acceptance:gate` 读取 [外部环境与真机验收清单](./EXTERNAL_ACCEPTANCE_CHECKLIST.md)，只允许在非敏感配置、COS、双平台真机、Preview 环境和 Preview 回归出口全部勾选后进入 Production 发布。日常排查可先运行 `pnpm acceptance:audit` 查看待确认项，或用 `pnpm acceptance:report -- --output /tmp/catdiary-acceptance-report.md` 生成脱敏 Markdown 报告给人工逐项补证据；不要把 Secret、Token、密码或私钥写入清单。

Preview API 部署后，先运行以下外部探针再勾选 Preview 环境相关项：

```bash
PREVIEW_API_URL='https://preview.example.com/api/v1' \
PREVIEW_METRICS_TOKEN='从密钥管理临时注入，不写入文档' \
PREVIEW_PRIVACY_POLICY_URL='https://www.example.com/privacy' \
PREVIEW_TERMS_URL='https://www.example.com/terms' \
pnpm preview:probe
```

该探针会验证 Preview API 使用非本地 HTTPS、TLS 1.2+、API live/ready 正常、Swagger 不公开、匿名 Metrics 被拒绝、Bearer Metrics 可读取，以及固定开发验证码 `123456` 不会被接受。它不会触发真实短信发送；固定验证码检查只调用验证码校验接口，若 Preview 误开开发验证码会失败。提供法律文档 URL 时，探针还会验证用户协议和隐私政策均可未登录访问，并包含版本/生效信息和账号删除渠道。

双平台真机回归完成后，先复制 [真机验收证据模板](./DEVICE_ACCEPTANCE_EVIDENCE.example.json) 到 `docs/device-acceptance/` 本地忽略目录，填写脱敏结果，再运行 `pnpm acceptance:evidence -- --file docs/device-acceptance/实际证据文件.json --require-passed`。该命令会要求 `sourceCommit` 等于当前 Git HEAD，iOS/Android 设备记录、14 条 MVP 主流程、权限/推送/离线/照片队列/小屏/冷启动专项检查全部通过，并阻止把 Token、密码、私钥、完整 Webhook 或未脱敏设备标识写入证据。

当前依赖审计无高危或严重漏洞。Expo 构建工具链间接依赖的 `uuid@7` 有 1 个中危公告；它位于本地原生工程配置生成链路，不进入业务 API 运行时，待 Expo 上游升级后移除。禁止用跨大版本强制 override 破坏 Expo 工具链。

## 2. 服务端环境

Preview/Production 不要从开发 `.env.example` 开始复制。Preview 使用 `.env.preview.example`，Production 使用 `.env.production.example`，复制到仓库外层或受控部署目录后，通过密钥管理服务注入真实值，不提交 `.env.preview`、`.env.production` 或任何真实 `.env`。生产启动校验会阻止弱密钥、固定验证码、生产 Swagger 和缺失的 COS/SMS 配置。`pnpm verify` 已包含 `pnpm test:production-env`；需要单独排查生产环境校验时，也可以在构建后直接运行该命令。

必须配置 HTTPS 反向代理，并设置：

- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `CORS_ALLOWED_ORIGINS` 为逗号分隔的可信来源
- `ENABLE_SWAGGER=false`
- `FEATURE_NOTIFICATIONS_ENABLED=true`、`FEATURE_EXPORTS_ENABLED=true`；这两个值只接受字面量 `true`/`false`
- `METRICS_TOKEN` 使用至少 32 位随机值，并仅注入监控采集器
- `WORKER_HOST=0.0.0.0`、`WORKER_PORT=3001`；Worker 运维端口只允许负载均衡探针和监控网络访问
- 三个 `THROTTLE_*` 使用默认值或更严格值

腾讯云短信使用 SMS API 3.0 独立产品密钥。验证码模板必须按顺序包含两个变量：`{1}` 为 6 位验证码，`{2}` 为有效分钟数。API 只记录脱敏供应商错误码和 Request ID，不记录手机号或验证码。

生产验证码保存在 Redis：60 秒发送冷却、单手机号每日最多 10 次、默认 5 分钟失效、连续错误 5 次锁定，验证成功立即删除。开发和测试环境继续仅接受固定验证码 `123456`。

发布顺序：先备份数据库，再执行 `prisma migrate deploy`，然后滚动启动 API 与 Worker。API 探针使用 `/api/v1/health/live` 和 `/api/v1/health/ready`；Worker 探针使用 3001 端口的 `/health/live` 和 `/health/ready`。Worker readiness 会同时验证 PostgreSQL 与 BullMQ/Redis，失败返回 503。

`REDIS_URL` 支持 `redis://` 与托管服务常用的 `rediss://`，BullMQ 的 API 生产者、Worker 和运维工具会一致解析 TLS、用户名、百分号编码密码、端口和数据库编号。禁止用 `https://` 等非 Redis 协议伪装配置。

API 与 Worker 使用独立生产镜像，均以非 root `node` 用户运行，并内置 OpenSSL、CA 证书、Prisma Client 与健康检查：

```bash
pnpm --silent release:image-refs -- --registry ccr.ccs.tencentyun.com --namespace <TCR_NAMESPACE> --format export > /tmp/catdiary-images.env
. /tmp/catdiary-images.env

docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
docker build -f apps/worker/Dockerfile -t "$WORKER_IMAGE" .

ENV_FILE=../.env.preview docker compose -f infra/docker-compose.preview.yml config
```

Preview Compose 默认只把 API 绑定到 `127.0.0.1`，由 HTTPS 反向代理或负载均衡器对外提供服务；容器启用只读文件系统、丢弃 Linux capabilities 并禁止权限提升。生产图片与导出必须使用 COS，不依赖容器本地磁盘。

## 3. 数据库备份与恢复

每日运行：

```bash
DATABASE_URL='...' BACKUP_DIR='/secure/backups' ./scripts/backup-postgres.sh
```

默认保留 14 天并生成 SHA-256 校验文件。生产备份还需复制到异地私有对象存储并启用服务端加密。每月至少在隔离数据库演练一次恢复：

```bash
DATABASE_URL='隔离测试库地址' RESTORE_CONFIRM_DATABASE='隔离数据库名' \
  ./scripts/restore-postgres.sh --confirm /secure/backups/cat-diary-时间.dump
```

恢复脚本要求 `RESTORE_CONFIRM_DATABASE` 与 URL 中目标库名完全一致，拒绝 `postgres`/模板库，默认强制校验同目录 SHA-256 文件，并先验证 dump 目录可读。只有经批准的历史备份确实没有校验文件时，才可临时设置 `ALLOW_MISSING_CHECKSUM=true`，并必须通过其他可信渠道核对文件来源。

禁止直接在生产库执行恢复脚本。恢复后必须运行迁移状态检查、就绪探针和核心 API 冒烟测试。可使用以下命令自动创建随机隔离库、逐表比对行数、校验迁移并自动清理：

```bash
SOURCE_DATABASE_URL='源数据库地址' ADMIN_DATABASE_URL='postgres 管理库地址' \
  pnpm test:restore
```

## 4. App 构建

首次构建前在 `apps/mobile` 中执行 `eas init`，将生成的 Project ID 配置为各 EAS 环境的 `EAS_PROJECT_ID`；随后配置 Apple、Google 与推送凭据。

EAS CLI 通过 `pnpm dlx` 固定为 `20.5.1`，统一使用根目录的 `pnpm eas <command>`，不依赖开发机全局版本，也不把其存在高危公告的易变工具依赖装入应用工作区。EAS 上传以 Git 仓库为边界；仓库根目录必须是 `cat-diary` 且至少有一个经过审核的初始提交。不得保留 `apps/mobile` 内的第二份 lockfile，依赖安装只认 Monorepo 根目录的 `pnpm-lock.yaml`。执行 `pnpm eas:check` 可在不创建项目、不触发构建的情况下检查这些条件以及 Expo 登录和项目绑定状态。

Development Build 真机调试前可执行平台预检：Android 使用 `pnpm android:preflight -- --fix --launch` 检查并配置 USB reverse；iPhone 使用 `EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' IOS_METRO_URL='http://开发机局域网IP:8081' pnpm ios:preflight` 检查 Xcode 命令行工具、已信任设备、局域网 API 和 Metro。iPhone 真机不能使用 `127.0.0.1`、`localhost` 或 `10.0.2.2` 访问开发机服务。

Development/Preview/Production profile 会分别注入对应 `APP_ENV`。Preview 和 Production 在配置解析阶段强制要求：

- `EXPO_PUBLIC_API_URL` 是非 localhost 的 HTTPS 绝对地址，以 `/api/v1` 结尾，且不含账号密码、查询参数或 fragment。
- `EAS_PROJECT_ID` 是 `eas init` 生成的 UUID，用于 Expo Push Token 和 EAS Update URL。
- `EXPO_PUBLIC_PRIVACY_POLICY_URL` 与 `EXPO_PUBLIC_TERMS_URL` 必须是无账号密码、查询参数或 fragment 的非本地 HTTPS 地址。

Preview/Production 缺少任一法律文档 URL 会在原生构建前失败。登录页会在用户获取验证码前提供两个可点击入口，“我的－协议与隐私”也会持续提供入口和数据导出/删除说明。URL 对应页面必须可在未登录状态访问，内容变更需保留版本与生效日期；不得先用空白页通过门禁再替换。

缺少或错误配置会在 EAS 原生构建开始前直接失败，避免商店包误连开发 API。开发环境未显式配置 API 时仍按平台使用 iOS `127.0.0.1` / Android Emulator `10.0.2.2`。

```bash
pnpm eas build --profile development --platform all
pnpm eas build --profile preview --platform all
pnpm eas build --profile production --platform all
```

Development Build 用于真机调试，Preview 用于内测，Production 仅在完整回归通过后提交商店。正式构建前必须将 `EXPO_PUBLIC_API_URL` 指向 HTTPS 生产 API。

每次修改 App 配置、权限插件、Bundle ID、Package、API 环境或 OTA 策略后执行 `pnpm test:mobile-config`。该门禁覆盖缺失配置和不安全 URL 的失败分支，以及双平台标识、`runtimeVersion=appVersion`、EAS Update URL、出口加密声明和麦克风权限禁用。

权限审核以 Expo introspection 最终产物为准，完整白名单见 [移动端权限清单](./MOBILE_PERMISSION_INVENTORY.md)。Production 明确关闭 iOS 任意 HTTP，移除未使用的 Face ID/麦克风用途，并阻断 Android 录音与开发悬浮窗权限。任何新增原生依赖都必须同步更新清单、隐私政策和自动门禁。

iOS App 级 Privacy Manifest 必须通过 `pnpm test:privacy-manifest` 的真实 Prebuild 验证；App Store/Google Play 数据问卷以 [商店隐私披露基线](./STORE_PRIVACY_DISCLOSURE.md) 为工程事实来源。该基线不替代正式隐私政策，运营主体、联系邮箱、URL、存储地域和第三方处理者仍需产品所有者确认。

移动端本地数据策略：Refresh/Access Token 与最小会话快照保存在 `WHEN_UNLOCKED_THIS_DEVICE_ONLY` SecureStore；短暂断网重启时仅允许相同 Refresh Token 世代恢复离线会话，服务端明确返回无效/重放时立即清除。记录缓存保留 90 天，任务缓存保留 7 天，未登记的本地照片副本 24 小时后回收。用户退出登录或会话被撤销时清除缓存、离线操作和待上传照片；退出按钮必须保留数据清除警告。Android 系统备份保持关闭。

## 5. 回滚与事故处理

- App：停止商店分阶段发布；JS 更新仅发布与当前 `runtimeVersion` 兼容的回滚版本。
- API/Worker：回滚到上一镜像；数据库迁移默认只前向修复，不直接执行破坏性回滚。
- 若数据完整性受损：切换维护模式，保留日志与审计证据，在隔离环境验证备份后再制定恢复窗口。
- 泄密：立即轮换 JWT、手机号加密、Webhook、COS、短信与数据库凭据，并撤销现有会话。

### 5.1 通知与导出事故开关

当通知供应商异常、误发风险或导出链路出现数据安全风险时，可分别设置：

```bash
FEATURE_NOTIFICATIONS_ENABLED=false
FEATURE_EXPORTS_ENABLED=false
```

必须同时滚动重启 API 和 Worker。关闭通知后，任务仍会按计划生成，但不会生成新的提醒任务；Worker 不消费已经排队的通知，恢复开关后继续处理。关闭导出后，API 对新建导出返回 `503 / EXPORTS_TEMPORARILY_DISABLED`，Worker 不消费既有导出任务。通知日志查询、用户通知偏好、飞书配置删除和既有导出状态查询仍可使用，便于排障和善后。

重启后检查 API 与 Worker `/health/ready` 返回的 `features.notifications`、`features.exports`，确认所有实例值一致。恢复前先定位根因、核对积压量并评估是否需要删除误生成任务；恢复时一次只开启一个开关并观察 30 分钟。开关不是授权绕过、数据迁移或永久下线机制，所有变更必须记录操作者、时间、原因和恢复时间。

### 5.2 Worker 队列暂停与恢复

先通过密钥管理或临时受控环境变量注入 `REDIS_URL`，不要把连接串写进命令历史。以下工具只允许 `scheduler`、`notifications`、`exports` 三个固定队列，状态查询默认覆盖全部队列：

```bash
pnpm queue:ops -- status
pnpm queue:ops -- status --queue notifications
pnpm queue:ops -- pause --queue notifications --confirm PAUSE:notifications
pnpm queue:ops -- resume --queue notifications --confirm RESUME:notifications
```

源码工作区命令会先构建共享包和 Worker。生产 Worker 镜像已经包含相同工具，可在受控运维容器中执行 `node dist/queue-operations.js status`；不要为了运行工具给业务容器开放交互式公网入口。

暂停和恢复是 Redis 中的全局队列状态，会影响连接同一 Redis/前缀的全部 Worker 实例，并要求与操作完全一致的确认词。操作后工具会返回 `paused` 和 waiting/active/delayed/failed/completed 数量；再次执行 `status` 并结合 Worker 指标复核。`--queue all` 只用于已经批准的全局事故，确认词分别为 `PAUSE:all`、`RESUME:all`。暂停不会取消 active 作业，也不会删除积压；恢复前必须先评估失败任务和通知时效性。

## 6. 发布后观察

发布后至少观察 30 分钟：就绪率、5xx、P95 延迟、登录失败率、BullMQ 失败/积压、推送失败、COS 上传失败、数据库连接数与磁盘/备份状态。达到告警阈值时停止发布并按回滚流程处理。

Expo 推送的 `SENT` 只表示 Expo 已签发推送票据；Worker 会在 15 分钟后查询回执，成功后更新为 `DELIVERED`。回执尚未生成或临时网络失败最多指数退避重试 6 次；最终失败写入 `EXPO_RECEIPT_CHECK_FAILED`。若 Expo 返回 `DeviceNotRegistered`，对应设备 Token 会自动停用，用户下次在 Development Build 中重新授权/注册后恢复。

设备 Token 必须附属于有效 DeviceSession。退出当前设备、退出全部设备、远程撤销或 Refresh Token 重放会在同一数据库事务中停用关联 Token；即使历史数据未及时清理，Worker 生成提醒和管理员重试也必须过滤已撤销或过期会话。发布验收需执行会话/Token 真实集成场景，不能只验证 App 本机清理。

管理员重试 Receipt 失败通知时，API 不复用已 completed 的旧发送 Job，而是读取该用户最新的有效 Expo Token 重建任务。若设备尚未重新注册，接口返回明确错误，不会继续向失效 Token 发送。

家庭成员被移除或主动离开时，系统会同时清空其计划和未完成任务负责人。Worker 仅将家庭提醒发送给当前有效成员；管理员重试历史失败通知前也会再次校验接收人仍在该家庭。若成员已离开，接口返回 `410 NOTIFICATION_RECIPIENT_LEFT_FAMILY`，不得通过重试或手工重投绕过此边界。

Prometheus 从 `/api/v1/metrics` 抓取指标。API 与 Worker 同时支持 `Authorization: Bearer <token>` 和兼容旧采集器的 `X-Metrics-Token`；生产抓取应使用标准 Bearer `credentials_file`，禁止把端点直接暴露到公网或在配置中明文提交 Token。

Worker Prometheus 从 3001 端口的 `/metrics` 抓取，并使用相同的 `X-Metrics-Token`。核心指标包括：

- `cat_diary_worker_queue_jobs{queue,state}`：scheduler、notifications、exports 的 waiting/active/delayed/failed/completed/paused 数量。
- `cat_diary_worker_jobs_total{queue,name,outcome}`：任务完成和失败次数。
- `cat_diary_worker_job_duration_seconds{queue,name,outcome}`：实际处理耗时分布。

建议至少为 Worker readiness 连续失败、failed 数持续增加、waiting/delayed 异常积压和 P95 处理耗时突增配置告警。运维端口不得通过公网负载均衡暴露。

仓库提供可部署模板 [prometheus.yml](../infra/monitoring/prometheus.yml) 和 6 条基础告警 [cat-diary-alerts.yml](../infra/monitoring/cat-diary-alerts.yml)，覆盖 API/Worker 不可用、API 5xx、API P95、Worker 连续失败、等待积压和 Worker P95。部署时把真实 Token 以只读 Secret 挂载到 `/run/secrets/metrics_token`，不要修改或提交示例文件保存真实密钥。

修改监控配置后必须执行：

```bash
pnpm test:monitoring
```

该命令使用固定版本的官方 `promtool` 同时校验规则表达式、规则文件引用、抓取配置和认证字段，并用合成时间序列逐条证明 6 条告警在持续时间与阈值满足后会携带预期标签和文案触发。
