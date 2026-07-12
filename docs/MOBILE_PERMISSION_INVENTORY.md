# 猫伴日记移动端权限清单

更新时间：2026-07-12

本清单以 `APP_ENV=production expo config --type introspect` 的最终原生配置为准，不以页面按钮或 `app.json` 文本推断权限。每次升级 Expo SDK、增加原生模块或修改 config plugin 后必须执行 `pnpm test:mobile-config`。

## iOS

| 权限声明                         | 用途                       | 申请时机               |
| -------------------------------- | -------------------------- | ---------------------- |
| `NSCameraUsageDescription`       | 拍摄猫咪照片并加入家庭相册 | 用户点击“拍照”后       |
| `NSPhotoLibraryUsageDescription` | 选择猫咪照片并加入家庭相册 | 用户点击“从相册选择”后 |
| 通知授权                         | 疫苗、驱虫、用药和铲屎提醒 | 用户主动开启手机推送后 |

Production `NSAppTransportSecurity.NSAllowsArbitraryLoads=false`，不保留 localhost 例外。Development 为连接本机 API 保留 localhost HTTP；该设置不会进入 Preview/Production。

当前未声明 Face ID、麦克风、定位、通讯录、日历、蓝牙、运动与健康数据用途。SecureStore 仅保存 Refresh Token，不启用生物识别认证，因此关闭其 Face ID Usage Description。

## Android

业务所需能力包括网络、通知、震动，以及系统相机/照片选择器或旧 Android 的受限外部存储兼容权限。实际权限由 Expo 模块和 Android API 版本合并决定。

Production 显式阻断：

- `android.permission.RECORD_AUDIO`
- `android.permission.SYSTEM_ALERT_WINDOW`
- 定位权限
- 通讯录权限

由于本地 SQLite 包含健康记录缓存、任务缓存和待同步操作，且待上传照片暂存在 App 私有目录，Production Manifest 固定 `android:allowBackup="false"`，禁止系统云备份或设备迁移复制这些数据。服务端数据仍通过账号登录重新获取。

Development Build 仅允许 `android:usesCleartextTraffic="true"`，用于在同一局域网访问开发机 API；Preview/Production 保持关闭，只能访问 HTTPS 服务。Manifest 中 `tools:node="remove"` 的条目表示在最终合并时删除，不视为有效权限。Development Client 可以使用开发悬浮层，但该权限不进入 Preview/Production。

## 验收门禁

`pnpm test:mobile-config` 会检查：

- Production 只允许 HTTPS API，且没有 ATS 任意网络例外。
- 相机和相册用途文案与产品功能一致。
- iOS 不包含未使用的 Face ID、麦克风、定位和通讯录声明。
- Android 不包含有效的录音、悬浮窗、定位和通讯录权限。
- Android 系统备份保持关闭。
- 麦克风在 ImagePicker 与 SecureStore 插件配置层均保持禁用/不声明。

若新增权限，必须同时更新本清单、隐私政策、商店隐私问卷、自动化白名单和真机拒绝/允许两条验收路径。

## 5. iOS Privacy Manifest

App 级 `PrivacyInfo.xcprivacy` 会由 Expo Prebuild 从 `app.config.ts` 生成，声明不追踪、无追踪域名，并汇总当前 Expo/React Native 依赖使用的 File Timestamp、Disk Space、System Boot Time 和 User Defaults Required Reason API。数据类型与商店问卷映射见 [商店隐私披露基线](./STORE_PRIVACY_DISCLOSURE.md)。

每次升级原生 SDK 后运行 `pnpm test:privacy-manifest`。该门禁会在隔离临时目录执行真实 iOS Prebuild，检查最终生成文件存在、追踪为 false，且全部数据类型、API 类别和原因代码落入 XML，而不只检查 JavaScript 配置对象。
