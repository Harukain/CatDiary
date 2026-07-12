# 外部环境与真机验收清单

本清单只记录标识和验收结果，不填写任何 Secret、Token、密码或私钥。敏感值仅进入 EAS Secret、GitHub Environment Secret 或腾讯云密钥管理服务。

## 1. 需要确认的非敏感信息

- [ ] Expo/EAS 组织或用户名：`待确认`
- [ ] EAS Project ID：执行 `eas init` 后填写
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

在仓库根目录执行：

```bash
pnpm eas login
pnpm eas init
pnpm eas build --profile development --platform ios
pnpm eas build --profile development --platform android
```

仓库通过 `pnpm dlx` 固定使用 `eas-cli@20.5.1`，不把 EAS 的易变工具链加入应用依赖，也不要使用未固定的全局 CLI。首次登录/绑定前执行 `pnpm eas:check`；它会检查 Git 根与初始提交、三个 EAS profile、CLI、Expo 登录和项目绑定，但不会创建项目或触发构建。当前仓库尚未初始化 Git，且本机 Expo CLI 尚未登录，这两步需要项目所有者确认账号与初始提交后执行。

- [ ] iPhone 真机安装并完成登录、建档、任务、记录、相册主流程
- [ ] Android 真机安装并完成相同主流程
- [ ] 相机、相册、通知权限的首次拒绝与再次开启路径正确
- [ ] App 被杀进程后图片上传队列可以恢复
- [ ] 无网启动显示缓存，联网后按顺序同步
- [ ] Token 刷新时断网不会丢失本地操作
- [ ] 通知点击打开正确任务
- [ ] 小屏 360dp 与常规 390–430dp 无遮挡
- [ ] Release 冷启动在目标真机小于 3 秒

## 4. Preview 环境

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

## 5. Preview 回归出口

- [ ] 产品文档 14 条 App E2E 主流程全部通过
- [ ] iOS 最低/最新系统与 Android API 29/最新版本覆盖
- [ ] 至少两类国内 Android 品牌真机完成通知验证
- [ ] P0/P1 为 0；P2 有负责人和目标版本
- [ ] 隐私政策、用户协议、客服/隐私邮箱和权限用途文案确认
- [ ] 两个法律文档 URL 均可在未登录状态通过 HTTPS 打开，正文包含版本、生效日期和账号删除渠道
- [ ] TestFlight 与 Google Internal Testing 构建可安装

全部通过后，才进入 Production 构建和应用商店提审。
