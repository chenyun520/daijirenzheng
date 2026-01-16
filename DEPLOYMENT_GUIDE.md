# 哈尔斯带级认证系统 - Cloudflare 部署指南

## 📋 概述

本系统使用 **Cloudflare D1 数据库 + Cloudflare Workers API** 架构，实现用户认证和成绩存储功能。

## 🏗️ 架构说明

```
GitHub Pages (前端 HTML)
    ↓
Cloudflare Workers (API 后端)
    ↓
Cloudflare D1 (SQLite 数据库)
```

## 📦 部署步骤

### 步骤1：安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 步骤2：登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器进行授权。

### 步骤3：创建 D1 数据库

wrangler d1 create "levelcertification"

**重要**：复制命令输出中的 `database_id`，例如：

```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 步骤4：初始化数据库表结构

```bash
# 执行数据库初始化脚本
wrangler d1 execute "levelcertification" --remote --file=./schema.sql
```

### 步骤5：配置 wrangler.toml

打开 `wrangler.toml` 文件，将步骤3获得的 `database_id` 填入：

```toml
[[d1_databases]]
binding = "levelcertification"
database_name = "levelcertification"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 替换为实际ID
```

### 步骤6：部署 Cloudflare Workers

```bash
wrangler deploy
```

部署成功后，会显示类似以下信息：

```
Published haers-certification-api (X.X sec)
  https://haers-certification-api.your-subdomain.workers.dev
```

**复制这个 URL**，这就是你的 Workers API 地址。

### 步骤7：配置前端 API 地址

打开 `index.html`，确认 API 地址配置正确（默认指向 Workers URL，也可通过 `?api=` 覆盖）：

```javascript
const API_BASE_URL = 'https://haers-certification-api.your-subdomain.workers.dev';
```

### 步骤8：部署前端

选择以下任一方式：

#### 方式A：使用 Cloudflare Pages（推荐）

1. 在 Cloudflare Dashboard 创建 Pages 项目
2. 连接你的 GitHub 仓库
3. 设置构建命令（无需，直接部署静态文件）
4. 部署！

#### 方式B：继续使用 GitHub Pages

直接推送到 GitHub，GitHub Pages 会自动部署。

## 🤖 GitHub 自动部署（Workers）

仓库已提供 GitHub Actions 工作流：推送到 `main/master` 后会自动执行 `wrangler deploy`。

在 GitHub 仓库里新增以下 Secrets（Settings → Secrets and variables → Actions → New repository secret）：

- `CLOUDFLARE_API_TOKEN`：需要包含 Workers 与 D1 权限（至少 workers:write、d1:write）
- `CLOUDFLARE_ACCOUNT_ID`：你的 Cloudflare Account ID

如需手动触发远程建表/更新结构，可在 Actions 里运行工作流并把 `run_migrations` 设为 `true`（会执行 `schema.sql`）。

## 🔧 验证部署

### 1. 测试 API 健康检查

在浏览器访问：

```
https://your-worker-url.workers.dev/api/health
```

应该返回：

```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

### 2. 测试登录功能

使用 Postman 或 curl 测试：

```bash
curl -X POST https://your-worker-url.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"TEST001","name":"测试用户"}'
```

应该返回：

```json
{
  "success": true,
  "user": {
    "id": 1,
    "employeeId": "TEST001",
    "name": "测试用户"
  }
}
```

### 3. 完整测试流程

1. 打开前端页面
2. 输入姓名和工号
3. 选择一个科目进行考试
4. 完成考试
5. 检查成绩是否保存到数据库

## 📊 查询数据库

### 使用 Wrangler CLI

```bash
# 查看所有用户
wrangler d1 execute "哈尔斯认证数据库" --command="SELECT * FROM users"

# 查看考试记录
wrangler d1 execute "哈尔斯认证数据库" --command="SELECT * FROM exam_records ORDER BY exam_date DESC LIMIT 10"

# 查看错题记录
wrangler d1 execute "哈尔斯认证数据库" --command="SELECT * FROM wrong_answers LIMIT 10"

# 查看用户统计
wrangler d1 execute "哈尔斯认证数据库" --command="SELECT * FROM user_exam_stats"
```

### 使用 Cloudflare Dashboard

1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 选择 D1
4. 选择 "哈尔斯认证数据库"
5. 在 Console 中执行 SQL 查询

## 🔐 安全建议

### 1. 添加 API 访问控制（可选）

如果需要限制 API 访问，可以在 `worker.js` 中添加：

```javascript
// 添加请求验证
const VALID_API_KEYS = ['your-secret-key-1', 'your-secret-key-2'];

function validateRequest(request) {
  const apiKey = request.headers.get('X-API-Key');
  return VALID_API_KEYS.includes(apiKey);
}
```

### 2. 启用 Cloudflare Access（可选）

为 Workers 添加身份验证：

1. 在 Cloudflare Dashboard
2. Workers & Pages → 你的 Worker
3. Settings → Triggers
4. 添加 Access Policy

### 3. 数据备份

定期备份数据库：

```bash
# 导出数据
wrangler d1 export "哈尔斯认证数据库" --output=backup.sql

# 恢复数据
wrangler d1 execute "哈尔斯认证数据库" --file=./backup.sql
```

## 📈 监控和分析

### Cloudflare Workers Analytics

1. Cloudflare Dashboard
2. Workers & Pages
3. 你的 Worker
4. Analytics → 查看请求数、错误率、响应时间

### 自定义日志

在 `worker.js` 中添加：

```javascript
console.log(`Exam saved: userId=${userId}, subject=${subject}, score=${score}`);
```

查看日志：

```bash
wrangler tail
```

## 🆕 常见问题

### Q: 如何修改数据库结构？

A: 创建迁移脚本，然后执行：

```bash
wrangler d1 execute "哈尔斯认证数据库" --file=./migration.sql
```

### Q: Workers 免费版限制？

A:

- 每天 100,000 次请求
- D1 数据库：
  - 存储：5GB
  - 读取：每天 5,000,000 行
  - 写入：每天 100,000 行

### Q: 如何升级到付费版？

A: 在 Cloudflare Dashboard → Workers & Pages → Resources → 升级

## 📞 技术支持

如有问题，请检查：

1. Wrangler 版本：`wrangler --version`
2. 数据库是否已创建
3. database_id 是否正确配置
4. Workers 是否已部署
5. API URL 是否正确

---

**部署完成后，你的系统将拥有：**
✅ 用户认证功能
✅ 成绩自动保存
✅ 错题详细记录
✅ 历史成绩查询
✅ 统计分析功能
