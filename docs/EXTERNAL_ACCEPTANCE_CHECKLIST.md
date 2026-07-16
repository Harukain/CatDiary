# 外部环境与真机验收清单

本清单只记录标识和验收结果，不填写任何 Secret、Token、密码或私钥。敏感值仅进入 EAS Secret、GitHub Environment Secret 或腾讯云密钥管理服务。

可使用仓库脚本审计当前缺口：

```bash
pnpm acceptance:audit
pnpm acceptance:gate
```

`acceptance:audit` 只输出未完成项；`acceptance:gate` 会在仍有未完成项或疑似敏感信息写入本清单时返回非零退出码，用于 Preview/Production 发布前门禁。

## 1. 需要确认的非敏感信息

- [x] Expo/EAS 组织：`harukains-team`
- [x] EAS 项目：`@harukains-team/catdiary`
- [x] EAS Project ID：`29f29ec5-c4ab-4371-bf41-b5b72077e531`
- [ ] Preview API HTTPS 地址：`待确认`
- [ ] Production API HTTPS 地址：`待确认`
- [ ] 腾讯云地域：`待确认`
- [ ] Preview COS Bucket 名称：`待确认`
- [ ] Production COS Bucket 名称：`待确认`
- [ ] PostgreSQL 与 Redis 使用腾讯云托管实例：`待确认`
- [ ] 腾讯云短信签名和模板已审核：`待确认`
- [ ] 短信模板变量顺序为“验证码、有效分钟数”：`待确认`
- [ ] SMS 使用与 COS 分离的最小权限 SecretId：`待确认`

## 2. COS 验收

- [ ] Preview 与 Production 使用不同 Bucket 或严格隔离前缀
- [ ] Bucket 私有读写，不允许公共读
- [ ] CAM 仅授予指定 Bucket/前缀的必要上传、读取和删除权限
- [ ] CORS 仅保留实际需要的方法和来源
- [ ] 服务端短期签名有效期符合 10 分钟要求
- [ ] 10MB 上限、伪造 MIME、跨家庭访问在真实 COS 环境仍被拒绝
- [ ] 原图、缩略图、软删除和 30 天回收通过
- [ ] 开启版本控制或生命周期策略，并验证误删恢复路径

## 3. EAS Development Build

项目已完成 EAS 绑定。需要生成新 Development Build 时，在仓库根目录执行：

```bash
pnpm eas build --profile development --platform ios
pnpm eas build --profile development --platform android
```

仓库通过 `pnpm dlx` 固定使用 `eas-cli@20.5.1`，不把 EAS 的易变工具链加入应用依赖，也不要使用未固定的全局 CLI。构建前执行 `pnpm eas:check`；它会检查 Git 根与初始提交、三个 EAS profile、Expo 登录和项目绑定，但不会触发构建。只有主动更换 EAS 项目时才重新执行 `pnpm eas init`。

- [x] Android Development Build 已生成并可安装
- [x] iOS Development Build 已生成，Apple Distribution Certificate、Provisioning Profile、测试设备和 APNs Key 已配置
- [ ] 当前代码批次已在 Android 真机完成回归
- [ ] 当前代码批次已在 iPhone 真机完成回归

### 真机连接本地 API

Development Build 的 Android 仅在开发环境允许局域网 HTTP；iOS Development Build 也允许开发 API。将手机和开发机接入同一 Wi-Fi，使用开发机局域网 IPv4（不要使用 `localhost` 或 Android 模拟器专用的 `10.0.2.2`）启动服务：

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @cat-diary/api start
pnpm --filter @cat-diary/worker start
EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \
  pnpm --filter @cat-diary/mobile dev
```

在手机的 Development Build 中选择该 Metro 开发服务器；首次验收前用手机浏览器访问 `http://开发机局域网IP:3000/api/v1/health/live`，确认 API 连通。Preview/Production 不允许此方式，必须使用正式 HTTPS API。

### iOS 真机稳定调试

iPhone 真机不能访问 Mac 上的 `localhost`、`127.0.0.1` 或 Android Emulator 专用的 `10.0.2.2`。首次真机回归前使用仓库内预检脚本检查 Xcode 命令行工具、已信任设备、本机 Metro、局域网 Metro 和局域网 API：

```bash
EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \
IOS_METRO_URL='http://开发机局域网IP:8081' \
pnpm ios:preflight
```

若没有设置 `IOS_METRO_URL`，脚本仍会检查本机 Metro 和 API，并输出可尝试的局域网 IPv4；但无法生成 iPhone 可直接打开的 Development Client 深链。预检通过后，在 iPhone 的 Development Build 中选择该 Metro 项目；如果自动发现失败，可把脚本输出的 `exp+catdiary://...` 深链复制到 iPhone Safari 打开。

### Android USB 稳定调试（推荐用于局域网不稳定时）

保持 USB 调试已授权。该模式下，Metro 与 API 都通过 ADB 转发到开发机本机，避免手机 Wi-Fi、热点隔离或 VPN 影响数据请求：

```bash
# 终端一：基础服务
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @cat-diary/api start
pnpm --filter @cat-diary/worker start

# 终端二：使 App API 请求走 USB 本机转发
EXPO_PUBLIC_API_URL='http://127.0.0.1:3000/api/v1' \
  pnpm --filter @cat-diary/mobile exec expo start --dev-client --lan --clear --port 8081

# 终端三：每次重新插线、重启 ADB 或重装 App 后重新执行
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
adb devices -l
```

也可以使用仓库内预检脚本统一检查设备、App 包名、USB reverse、API 和 Metro：

```bash
pnpm android:preflight -- --fix
```

如果要在预检通过后直接打开 Android Development Build 并加载当前 Metro 项目，使用：

```bash
pnpm android:preflight -- --fix --launch
```

在设备上打开 Development Build 后，通过 Metro 的开发链接载入项目；若启动器没有自动选择项目，可使用以下深链：

```bash
adb shell am start -a android.intent.action.VIEW \
  -d 'exp+catdiary://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' \
  com.haruka.catdiary
```

此方式只适用于已 USB 连接的 Android Development Build，拔线后必须切回同 Wi-Fi 局域网 API；不得用于 Preview、Production 或真实用户环境。

- [ ] iPhone 真机安装并完成登录、建档、任务、记录、相册主流程
- [ ] Android 真机安装并完成相同主流程
- [ ] 相机、相册、通知权限的首次拒绝与再次开启路径正确
- [ ] 通知偏好页“当前设备推送”可登记当前设备，并通过“发送测试推送”在当前手机收到系统通知
- [ ] 真实任务推送锁屏文案不展示猫名、药名、疫苗/驱虫品牌或具体任务标题；点击后才进入任务详情
- [ ] App 被杀进程后图片上传队列可以恢复
- [ ] 无网启动显示缓存，联网后按顺序同步
- [ ] Token 刷新时断网不会丢失本地操作
- [ ] 通知点击打开正确任务
- [ ] 小屏 360dp 与常规 390–430dp 无遮挡
- [ ] Release 冷启动在目标真机小于 3 秒

## 4. Preview 环境

部署 Preview API 后先执行：

```bash
PREVIEW_API_URL='https://preview.example.com/api/v1' \
PREVIEW_METRICS_TOKEN='从密钥管理临时注入，不写入本文档' \
pnpm preview:probe
```

该命令只记录验收动作，不要求把 Token、Secret 或真实域名写入清单。

- [ ] 独立 PostgreSQL、Redis、COS、短信和推送配置
- [ ] `NODE_ENV=production` 且固定验证码无法启动
- [ ] 真实手机号收到随机 6 位验证码，成功验证后不可重复使用
- [ ] 验证码冷却、过期、5 次错误锁定和每日上限返回明确错误
- [ ] HTTPS 为 TLS 1.2 或更高
- [ ] Swagger 关闭，Metrics 仅内网或监控系统可访问
- [ ] Prisma 迁移、API/Worker 就绪探针和滚动启动通过
- [ ] 每日备份成功上传到异地私有存储
- [ ] 在隔离数据库完成一次恢复并记录 RPO/RTO
- [ ] Prometheus 使用只读 Secret 抓取 API 与 Worker，公网无法访问两个指标端点
- [ ] 6 条基础告警已导入，并通过一次测试告警验证通知接收链路
- [ ] 5xx、P95、队列积压、推送失败和数据库连接告警可触发
- [ ] 飞书 Webhook 测试发送每家庭每小时最多 5 次；第 6 次返回限流且飞书群不再收到测试消息

## 5. Preview 回归出口

- [ ] 产品文档 14 条 App E2E 主流程全部通过
- [ ] iOS 最低/最新系统与 Android API 29/最新版本覆盖
- [ ] 至少两类国内 Android 品牌真机完成通知验证
- [ ] P0/P1 为 0；P2 有负责人和目标版本
- [ ] 隐私政策、用户协议、客服/隐私邮箱和权限用途文案确认
- [ ] 两个法律文档 URL 均可在未登录状态通过 HTTPS 打开，正文包含版本、生效日期和账号删除渠道
- [ ] TestFlight 与 Google Internal Testing 构建可安装

全部通过后，才进入 Production 构建和应用商店提审。
