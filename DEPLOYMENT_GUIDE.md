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

> 本仓库当前已按实际环境配置：
> - Workers 名称：`haers-certification-api`
> - D1 数据库名称：`levelcertification`
> - D1 绑定名：`levelcertification`（在代码里通过 `env.levelcertification` 访问）
> - D1 database_id：`9c819a89-9bce-4eca-ba41-8d799277cd5b`
> - 已部署的 API（示例）：`https://haers-certification-api.gaolujie26.workers.dev`

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

打开 `wrangler.toml` 文件，将步骤3获得的 `database_id` 填入（本仓库已填好当前环境的 `database_id`，如果你新建了数据库需要替换成你自己的）：

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

打开 `index.html`，确认 API 地址配置正确（默认指向 Workers URL，也可通过 `?api=` 或 `window.__API_BASE_URL__` 覆盖）：

```javascript
const API_BASE_URL = (
  (typeof window !== 'undefined' && window.__API_BASE_URL__) ||
  new URLSearchParams(location.search).get('api') ||
  'https://haers-certification-api.gaolujie26.workers.dev'
).replace(/\/$/, '');
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
https://haers-certification-api.gaolujie26.workers.dev/api/health
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
curl -X POST https://haers-certification-api.gaolujie26.workers.dev/api/login \
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

## 🧩 系统功能与 API 使用

> API 默认无鉴权（便于内网/培训快速使用）。如需对外开放，请阅读“安全建议”章节。

### 1) 健康检查

- `GET /api/health`

```bash
curl https://haers-certification-api.gaolujie26.workers.dev/api/health
```

### 2) 登录 / 创建用户

- `POST /api/login`
- 请求体：`{ "employeeId": "工号", "name": "姓名" }`
- 返回：`{ success, user: { id, employeeId, name } }`

```bash
curl -X POST https://haers-certification-api.gaolujie26.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"TEST001","name":"测试用户"}'
```

### 3) 保存考试成绩

- `POST /api/save-exam`
- 请求体字段（核心）：
  - `userId`：登录返回的用户 id
  - `subject`：科目（例如 DM/PSP/SW/VSM/5S/TIMWOODS）
  - `score`：0-100
  - `totalQuestions`：总题数
  - `correctCount`：答对题数
  - `timeSpent`：耗时（秒，可选）
  - `wrongAnswers`：错题数组（可选）

```bash
curl -X POST https://haers-certification-api.gaolujie26.workers.dev/api/save-exam \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "subject": "DM",
    "score": 85,
    "totalQuestions": 20,
    "correctCount": 17,
    "timeSpent": 260,
    "wrongAnswers": [
      {
        "questionNumber": 2,
        "questionText": "示例题目",
        "userAnswer": "A",
        "correctAnswer": "B"
      }
    ]
  }'
```

### 4) 查询用户考试记录

- `GET /api/user-exams?userId=1`

```bash
curl "https://haers-certification-api.gaolujie26.workers.dev/api/user-exams?userId=1"
```

### 5) 查询单次考试详情（含错题）

- `GET /api/exam-history?examRecordId=123`

```bash
curl "https://haers-certification-api.gaolujie26.workers.dev/api/exam-history?examRecordId=123"
```

### 6) 统计接口

- `GET /api/stats`：全局统计
- `GET /api/stats?userId=1`：用户维度统计（按科目）
- `GET /api/stats?subject=DM`：科目维度统计

```bash
curl "https://haers-certification-api.gaolujie26.workers.dev/api/stats"
curl "https://haers-certification-api.gaolujie26.workers.dev/api/stats?userId=1"
curl "https://haers-certification-api.gaolujie26.workers.dev/api/stats?subject=DM"
```

## 🗄️ 数据库管理与查询（D1）

### 0) 重要概念：local vs remote

- 不带 `--remote`：默认操作本地开发数据库（`.wrangler/` 下），用于本地调试
- 带 `--remote`：操作 Cloudflare 上的远程数据库（生产/线上）

建议：只要你是在“管理线上数据”，所有命令都加 `--remote`。

### 1) 查看数据库信息

```bash
wrangler d1 info levelcertification
```

### 2) 查看/管理表结构（建议线上加 --remote）

```bash
# 列出表
wrangler d1 execute levelcertification --remote --command "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;"

# 列出视图
wrangler d1 execute levelcertification --remote --command "SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name;"
```

### 3) 常用业务查询（线上）

```bash
# 用户列表（最近 50）
wrangler d1 execute levelcertification --remote --command "SELECT id, employee_id, name, created_at, updated_at FROM users ORDER BY id DESC LIMIT 50;"

# 通过工号查用户
wrangler d1 execute levelcertification --remote --command "SELECT * FROM users WHERE employee_id='TEST001' LIMIT 1;"

# 最近 20 条考试记录
wrangler d1 execute levelcertification --remote --command "SELECT id, user_id, subject, score, total_questions, correct_count, time_spent, exam_date FROM exam_records ORDER BY exam_date DESC LIMIT 20;"

# 查看某次考试的错题
wrangler d1 execute levelcertification --remote --command "SELECT question_number, question_text, user_answer, correct_answer, created_at FROM wrong_answers WHERE exam_record_id=123 ORDER BY question_number;"

# 视图：用户按科目统计
wrangler d1 execute levelcertification --remote --command "SELECT * FROM user_exam_stats WHERE employee_id='TEST001' ORDER BY subject;"

# 视图：科目统计
wrangler d1 execute levelcertification --remote --command "SELECT * FROM subject_stats ORDER BY subject;"
```

### 4) 数据清理（示例）

```bash
# 删除测试工号（会因外键约束导致历史记录仍在；如需级联删除请自行补充 SQL）
wrangler d1 execute levelcertification --remote --command "DELETE FROM users WHERE employee_id='TEST001';"
```

### 5) 使用 Cloudflare Dashboard 查询

1. 登录 Cloudflare Dashboard
2. Workers & Pages → D1
3. 选择数据库 `levelcertification`
4. 在 Console 中执行 SQL 查询

### 6) 备份与恢复（导出 SQL）

```bash
# 导出（线上）
wrangler d1 export levelcertification --remote --output=backup.sql

# 恢复（线上）
wrangler d1 execute levelcertification --remote --file=./backup.sql
```

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
# 导出（线上）
wrangler d1 export levelcertification --remote --output=backup.sql

# 恢复（线上）
wrangler d1 execute levelcertification --remote --file=./backup.sql
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
wrangler d1 execute levelcertification --remote --file=./migration.sql
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
