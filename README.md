# 猫伴日记（CatDiary）

正式 App 工程。产品、架构和验收规范以仓库上级目录的 `PROJECT.md`、`设计规范.md` 与 `docs/development/` 为准。

## 目录

- `apps/mobile`：Expo Development Build React Native App
- `apps/api`：NestJS REST API
- `apps/worker`：BullMQ 后台任务
- `packages/*`：跨端领域、校验、客户端与设计 Token
- `prisma`：数据库模型与迁移
- `infra`：本地 PostgreSQL/Redis

## 本地启动

1. `pnpm install`
2. `docker compose -f infra/docker-compose.yml up -d`
3. `cp .env.example .env`
4. `pnpm db:generate`
5. `pnpm dev`

开发验证码固定为 `123456`，仅允许在非生产环境启用。
