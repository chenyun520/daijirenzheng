/**
 * Cloudflare Workers API for 哈尔斯带级认证学习系统
 * 功能：用户认证、成绩保存、数据查询
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 路由分发
      if (path === '/api/login' && request.method === 'POST') {
        return await handleLogin(request, env, corsHeaders);
      } else if (path === '/api/save-exam' && request.method === 'POST') {
        return await handleSaveExam(request, env, corsHeaders);
      } else if (path === '/api/user-exams' && request.method === 'GET') {
        return await handleGetUserExams(request, env, corsHeaders);
      } else if (path === '/api/exam-history' && request.method === 'GET') {
        return await handleGetExamHistory(request, env, corsHeaders);
      } else if (path === '/api/stats' && request.method === 'GET') {
        return await handleGetStats(request, env, corsHeaders);
      } else if (path === '/api/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * 处理用户登录
 */
async function handleLogin(request, env, corsHeaders) {
  const { employeeId, name } = await request.json();

  if (!employeeId || !name) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 查找或创建用户
    let user = await env.DB.prepare(
      'SELECT * FROM users WHERE employee_id = ?'
    ).bind(employeeId).first();

    if (!user) {
      // 创建新用户
      const result = await env.DB.prepare(
        'INSERT INTO users (employee_id, name) VALUES (?, ?)'
      ).bind(employeeId, name).run();

      user = await env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(result.meta.last_row_id).first();
    } else {
      // 更新用户名（如果可能变化）
      await env.DB.prepare(
        'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?'
      ).bind(name, employeeId).run();
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        name: user.name,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '登录失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 保存考试成绩
 */
async function handleSaveExam(request, env, corsHeaders) {
  const data = await request.json();
  const { userId, subject, score, totalQuestions, correctCount, timeSpent, wrongAnswers } = data;

  // 验证必填字段
  if (!userId || !subject || score === undefined || !totalQuestions || !correctCount) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 插入考试记录
    const result = await env.DB.prepare(`
      INSERT INTO exam_records (user_id, subject, score, total_questions, correct_count, time_spent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, subject, score, totalQuestions, correctCount, timeSpent || 0).run();

    const examRecordId = result.meta.last_row_id;

    // 如果有错题，插入错题记录
    if (wrongAnswers && wrongAnswers.length > 0) {
      const stmt = env.DB.prepare(`
        INSERT INTO wrong_answers (exam_record_id, question_number, question_text, user_answer, correct_answer)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const wrong of wrongAnswers) {
        await stmt.bind(
          examRecordId,
          wrong.questionNumber,
          wrong.questionText,
          wrong.userAnswer || '',
          wrong.correctAnswer
        ).run();
      }
    }

    // 查询用户的该科目历史最高分
    const bestScore = await env.DB.prepare(`
      SELECT MAX(score) as best_score FROM exam_records
      WHERE user_id = ? AND subject = ?
    `).bind(userId, subject).first();

    return new Response(JSON.stringify({
      success: true,
      examRecordId,
      bestScore: bestScore.best_score || 0,
      message: score >= 80 ? '恭喜！考试通过！' : '继续努力！'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '保存失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取用户的考试记录
 */
async function handleGetUserExams(request, env, corsHeaders) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return new Response(JSON.stringify({ error: '缺少userId参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const records = await env.DB.prepare(`
      SELECT
        er.id,
        er.subject,
        er.score,
        er.total_questions,
        er.correct_count,
        er.time_spent,
        er.exam_date,
        (SELECT MAX(score) FROM exam_records WHERE user_id = ? AND subject = er.subject) as best_score
      FROM exam_records er
      WHERE er.user_id = ?
      ORDER BY er.exam_date DESC
      LIMIT 50
    `).bind(userId, userId).all();

    return new Response(JSON.stringify({
      success: true,
      records: records.results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '查询失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取考试历史（含错题详情）
 */
async function handleGetExamHistory(request, env, corsHeaders) {
  const url = new URL(request.url);
  const examRecordId = url.searchParams.get('examRecordId');

  if (!examRecordId) {
    return new Response(JSON.stringify({ error: '缺少examRecordId参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 获取考试记录
    const exam = await env.DB.prepare(`
      SELECT er.*, u.name, u.employee_id
      FROM exam_records er
      JOIN users u ON er.user_id = u.id
      WHERE er.id = ?
    `).bind(examRecordId).first();

    if (!exam) {
      return new Response(JSON.stringify({ error: '考试记录不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 获取错题详情
    const wrongAnswers = await env.DB.prepare(`
      SELECT question_number, question_text, user_answer, correct_answer
      FROM wrong_answers
      WHERE exam_record_id = ?
      ORDER BY question_number
    `).bind(examRecordId).all();

    return new Response(JSON.stringify({
      success: true,
      exam: {
        ...exam,
        wrongAnswers: wrongAnswers.results
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '查询失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取统计数据
 */
async function handleGetStats(request, env, corsHeaders) {
  const url = new URL(request.url);
  const subject = url.searchParams.get('subject');
  const userId = url.searchParams.get('userId');

  try {
    let stats = {};

    if (userId) {
      // 单个用户的统计
      stats = await env.DB.prepare(`
        SELECT
          subject,
          COUNT(*) as exam_count,
          AVG(score) as avg_score,
          MAX(score) as best_score,
          MAX(exam_date) as last_exam_date
        FROM exam_records
        WHERE user_id = ?
        GROUP BY subject
      `).bind(userId).all();
    } else if (subject) {
      // 单个科目的统计
      stats = await env.DB.prepare(`
        SELECT
          COUNT(*) as total_exams,
          AVG(score) as avg_score,
          COUNT(CASE WHEN score >= 80 THEN 1 END) as pass_count,
          COUNT(CASE WHEN score < 80 THEN 1 END) as fail_count
        FROM exam_records
        WHERE subject = ?
      `).bind(subject).first();
    } else {
      // 全局统计
      stats = {
        totalUsers: (await env.DB.prepare('SELECT COUNT(*) as count FROM users').first()).count,
        totalExams: (await env.DB.prepare('SELECT COUNT(*) as count FROM exam_records').first()).count,
        passRate: (await env.DB.prepare('SELECT AVG(CASE WHEN score >= 80 THEN 100 ELSE 0 END) as rate FROM exam_records').first()).rate,
        bySubject: await env.DB.prepare('SELECT * FROM subject_stats').all(),
      };
    }

    return new Response(JSON.stringify({
      success: true,
      stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '统计失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
