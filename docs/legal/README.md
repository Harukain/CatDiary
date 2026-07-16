# 猫伴日记法律文档源文件

本目录保存隐私政策和用户协议的产品/工程源文档。这里的草稿用于对齐 App 功能、商店隐私披露、权限文案和发布门禁，不替代法律意见。

发布前必须完成：

1. 产品所有者补齐运营主体、联系邮箱、数据存储地域、第三方处理者和正式生效日期。
2. 合规或法律顾问复核正文。
3. 将最终版发布到两个无需登录即可访问的 HTTPS URL。
4. 在 Preview/Production 构建环境中配置：
   - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
   - `EXPO_PUBLIC_TERMS_URL`
5. 运行：

```bash
pnpm legal:audit
pnpm legal:gate
pnpm preview:probe
```

`pnpm legal:audit` 用于日常审计，允许草稿中保留待确认项；`pnpm legal:gate` 用于发布前门禁，任何占位符、草稿声明、缺失核心章节或疑似密钥都会返回非零退出码。
