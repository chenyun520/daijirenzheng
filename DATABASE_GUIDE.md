# 哈尔斯带级认证系统 - 数据库（Cloudflare D1）使用指南

## 1. 概述

本项目后端使用 **Cloudflare Workers + Cloudflare D1（SQLite）**：

- Worker：接收前端请求，写入/查询 D1
- D1：存储用户、考试记录、错题等数据

当前仓库的实际配置（以仓库文件为准）：

- D1 数据库名：`levelcertification`
- D1 绑定名：`levelcertification`（Worker 中通过 `env.levelcertification` 访问）
- 数据表结构脚本：`schema.sql`

相关文件：

- [wrangler.toml](file:///e:/工作/带级认证/daijirenzheng/wrangler.toml)
- [schema.sql](file:///e:/工作/带级认证/daijirenzheng/schema.sql)
- [worker.js](file:///e:/工作/带级认证/daijirenzheng/worker.js)

## 2. 必备工具与登录

### 2.1 安装 Wrangler

```bash
npm install -g wrangler
wrangler --version
```

### 2.2 登录 Cloudflare

```bash
wrangler login
```

登录后，Wrangler 才能对远程 D1 执行查询/导出等操作。

## 3. Local vs Remote（非常重要）

- **本地数据库（local）**：`wrangler dev` 时使用，数据存放在 `.wrangler/` 目录下（仅用于本机调试）
- **远程数据库（remote）**：Cloudflare 控制台中的真实数据库（线上数据）

结论：**只要你是在“管理线上数据/查线上成绩”，命令都加 `--remote`**。

## 4. 自动部署后要做什么？

本仓库已提供 Workers 自动部署（GitHub Actions）。

### 4.1 什么时候需要你额外操作？

- **仅改 Worker 代码**（`worker.js`、接口逻辑等）：推送代码后会自动部署，一般不需要额外操作数据库
- **改了数据库结构**（新增字段/表/视图、修改约束等）：需要执行迁移/建表脚本（例如更新 `schema.sql` 或 migration.sql）

### 4.2 数据库结构如何同步到线上？

方式 A（推荐）：使用 GitHub Actions 手动触发迁移

- GitHub → Actions → `Deploy Cloudflare Worker`
- Run workflow，把 `run_migrations` 设为 `true`
- 会在远程 D1 执行 `schema.sql`

方式 B：本地终端执行迁移

```bash
wrangler d1 execute levelcertification --remote --file=./schema.sql
```

注意：`schema.sql` 里使用了 `IF NOT EXISTS`，适合“首次初始化/增量补充视图”；如果你要删除/重建视图或做数据迁移，建议单独写 `migration.sql`。

## 5. 常用 Wrangler 命令（终端管理）

### 5.1 查看数据库信息

```bash
wrangler d1 info levelcertification
```

### 5.2 查看表/视图（线上）

```bash
# 查看表
wrangler d1 execute levelcertification --remote --command "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;"

# 查看视图
wrangler d1 execute levelcertification --remote --command "SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name;"
```

### 5.3 常用业务查询（线上）

```bash
# 1) 用户列表（最近 50）
wrangler d1 execute levelcertification --remote --command "SELECT id, employee_id, name, created_at, updated_at FROM users ORDER BY id DESC LIMIT 50;"

# 2) 通过工号查用户
wrangler d1 execute levelcertification --remote --command "SELECT * FROM users WHERE employee_id='TEST001' LIMIT 1;"

# 3) 最近 20 条考试记录
wrangler d1 execute levelcertification --remote --command "SELECT id, user_id, subject, score, total_questions, correct_count, time_spent, exam_date FROM exam_records ORDER BY exam_date DESC LIMIT 20;"

# 4) 查看某次考试错题（把 123 改为 exam_record_id）
wrangler d1 execute levelcertification --remote --command "SELECT question_number, question_text, user_answer, correct_answer, created_at FROM wrong_answers WHERE exam_record_id=123 ORDER BY question_number;"

# 5) 用户按科目统计（视图）
wrangler d1 execute levelcertification --remote --command "SELECT * FROM user_exam_stats WHERE employee_id='TEST001' ORDER BY subject;"

# 6) 科目统计（视图）
wrangler d1 execute levelcertification --remote --command "SELECT * FROM subject_stats ORDER BY subject;"
```

### 5.4 通过线口径（90 分及格）

当前系统“资格认证”通过线：**90 分及格**。

常用统计 SQL（线上）：

```bash
# 全部考试通过率（百分比）
wrangler d1 execute levelcertification --remote --command "SELECT AVG(CASE WHEN score >= 90 THEN 100 ELSE 0 END) AS pass_rate FROM exam_records;"

# 按科目统计通过/未通过
wrangler d1 execute levelcertification --remote --command \"SELECT subject, COUNT(*) total, SUM(CASE WHEN score >= 90 THEN 1 ELSE 0 END) pass, SUM(CASE WHEN score < 90 THEN 1 ELSE 0 END) fail FROM exam_records GROUP BY subject ORDER BY subject;\"
```

### 5.5 备份与恢复（导出 SQL）

```bash
# 导出（线上）
wrangler d1 export levelcertification --remote --output=backup.sql

# 仅导出结构（线上）
wrangler d1 export levelcertification --remote --no-data --output=schema_backup.sql

# 仅导出数据（线上）
wrangler d1 export levelcertification --remote --no-schema --output=data_backup.sql

# 恢复（线上）
wrangler d1 execute levelcertification --remote --file=./backup.sql
```

提示：导出文件包含敏感信息（姓名/工号/成绩），建议只存放在受控位置，不要提交到 GitHub。

## 6. 在 Cloudflare Dashboard 上查询（D1 Console）

### 6.1 打开路径

1. 登录 Cloudflare Dashboard
2. Workers & Pages → D1
3. 选择数据库：`levelcertification`
4. 打开 Console / Query（SQL 输入框）

### 6.2 常用 SQL（直接复制执行）

```sql
-- 1) 表列表
SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;

-- 2) 视图列表
SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name;

-- 3) 最近 50 用户
SELECT id, employee_id, name, created_at, updated_at
FROM users
ORDER BY id DESC
LIMIT 50;

-- 4) 最近 50 次考试
SELECT id, user_id, subject, score, total_questions, correct_count, time_spent, exam_date
FROM exam_records
ORDER BY exam_date DESC
LIMIT 50;

-- 5) 某个用户的考试记录（把 'TEST001' 改成工号）
SELECT er.*
FROM exam_records er
JOIN users u ON u.id = er.user_id
WHERE u.employee_id = 'TEST001'
ORDER BY er.exam_date DESC;

-- 6) 通过/未通过口径（90 分及格）
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN score >= 90 THEN 1 ELSE 0 END) AS pass,
  SUM(CASE WHEN score < 90 THEN 1 ELSE 0 END) AS fail
FROM exam_records;

-- 7) 查看某次考试错题（把 123 改成 exam_record_id）
SELECT question_number, question_text, user_answer, correct_answer, created_at
FROM wrong_answers
WHERE exam_record_id = 123
ORDER BY question_number;
```

## 7. 常见排查

### 7.1 我查到的数据和前端不一致

- 确认你查的是 `--remote`（线上），不是本地 `.wrangler/` 数据库
- 确认前端 API 指向的 Worker URL 是否正确（`index.html` 支持 `?api=` 覆盖）

### 7.2 结构变更没生效

- 确认执行了 `wrangler d1 execute levelcertification --remote --file=./schema.sql` 或 GitHub Actions 的 `run_migrations=true`
- 在 D1 Console 中执行：

```sql
SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name;
```

