-- Cloudflare D1 数据库初始化脚本

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建考试记录表
CREATE TABLE IF NOT EXISTS exam_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,  -- DM, PSP, SW, VSM, 5S, TIMWOODS
    score INTEGER NOT NULL,  -- 0-100
    total_questions INTEGER NOT NULL,  -- 总题数（通常20）
    correct_count INTEGER NOT NULL,  -- 答对题数
    time_spent INTEGER NOT NULL,  -- 耗时（秒）
    exam_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建错题记录表（可选，用于详细分析）
CREATE TABLE IF NOT EXISTS wrong_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_record_id INTEGER NOT NULL,
    question_number INTEGER NOT NULL,  -- 第几题
    question_text TEXT NOT NULL,
    user_answer TEXT,
    correct_answer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_record_id) REFERENCES exam_records(id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_exam_user_id ON exam_records(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_subject ON exam_records(subject);
CREATE INDEX IF NOT EXISTS idx_exam_date ON exam_records(exam_date);
CREATE INDEX IF NOT EXISTS idx_wrong_exam_record ON wrong_answers(exam_record_id);

-- 创建视图：用户考试统计
CREATE VIEW IF NOT EXISTS user_exam_stats AS
SELECT
    u.id as user_id,
    u.employee_id,
    u.name,
    er.subject,
    COUNT(*) as exam_count,
    AVG(er.score) as avg_score,
    MAX(er.score) as max_score,
    MIN(er.score) as min_score,
    MAX(er.exam_date) as last_exam_date
FROM users u
LEFT JOIN exam_records er ON u.id = er.user_id
GROUP BY u.id, er.subject;

-- 创建视图：科目统计
CREATE VIEW IF NOT EXISTS subject_stats AS
SELECT
    subject,
    COUNT(*) as total_exams,
    AVG(score) as avg_score,
    COUNT(CASE WHEN score >= 80 THEN 1 END) as pass_count,
    COUNT(CASE WHEN score < 80 THEN 1 END) as fail_count
FROM exam_records
GROUP BY subject;
