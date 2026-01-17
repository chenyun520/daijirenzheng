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
      } else if (path === '/api/register' && request.method === 'POST') {
        return await handleRegister(request, env, corsHeaders);
      } else if (path === '/api/delete-account' && request.method === 'POST') {
        return await handleDeleteAccount(request, env, corsHeaders);
      } else if (path === '/api/wrong-questions' && request.method === 'GET') {
        return await handleGetWrongQuestions(request, env, corsHeaders);
      } else if (path === '/api/wrong-questions/upsert' && request.method === 'POST') {
        return await handleUpsertWrongQuestion(request, env, corsHeaders);
      } else if (path === '/api/wrong-questions/delete' && request.method === 'POST') {
        return await handleDeleteWrongQuestion(request, env, corsHeaders);
      } else if (path === '/api/notes' && request.method === 'GET') {
        return await handleGetNotes(request, env, corsHeaders);
      } else if (path === '/api/notes/upsert' && request.method === 'POST') {
        return await handleUpsertNote(request, env, corsHeaders);
      } else if (path === '/api/notes/delete' && request.method === 'POST') {
        return await handleDeleteNote(request, env, corsHeaders);
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        });
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  },
};

/**
 * 处理用户登录
 */
async function handleLogin(request, env, corsHeaders) {
  const body = await request.json();
  const employeeId = String(body?.employeeId ?? '').trim();
  const name = String(body?.name ?? '').trim();

  if (!employeeId || !name) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (!/^\d{7}$/.test(employeeId)) {
    return new Response(JSON.stringify({ error: '工号必须是7位数字' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const user = await env.levelcertification.prepare(
      'SELECT * FROM users WHERE employee_id = ?'
    ).bind(employeeId).first();

    if (!user) {
      return new Response(JSON.stringify({ error: '账号不存在，请先注册' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (String(user.name || '').trim() !== name) {
      return new Response(JSON.stringify({ error: '姓名与工号不匹配' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    await env.levelcertification.prepare(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `).run();

    const profile = await env.levelcertification.prepare(
      'SELECT avatar FROM user_profiles WHERE user_id = ?'
    ).bind(user.id).first();

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        name: user.name,
        avatar: profile ? profile.avatar : null,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '登录失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

/**
 * 处理用户注册
 */
async function handleRegister(request, env, corsHeaders) {
  const body = await request.json();
  const employeeId = String(body?.employeeId ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const avatar = String(body?.avatar ?? '').trim();

  if (!employeeId || !name) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (!/^\d{7}$/.test(employeeId)) {
    return new Response(JSON.stringify({ error: '工号必须是7位数字' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const existing = await env.levelcertification.prepare(
      'SELECT * FROM users WHERE employee_id = ?'
    ).bind(employeeId).first();

    if (existing) {
      return new Response(JSON.stringify({ error: '账号已存在，请直接登录' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const result = await env.levelcertification.prepare(
      'INSERT INTO users (employee_id, name) VALUES (?, ?)'
    ).bind(employeeId, name).run();

    const user = await env.levelcertification.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(result.meta.last_row_id).first();

    await env.levelcertification.prepare(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `).run();

    if (avatar) {
      await env.levelcertification.prepare(`
        INSERT INTO user_profiles (user_id, avatar)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET avatar = excluded.avatar, updated_at = CURRENT_TIMESTAMP
      `).bind(user.id, avatar).run();
    }

    const profile = await env.levelcertification.prepare(
      'SELECT avatar FROM user_profiles WHERE user_id = ?'
    ).bind(user.id).first();

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        name: user.name,
        avatar: profile ? profile.avatar : null,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '注册失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function handleDeleteAccount(request, env, corsHeaders) {
  const body = await request.json();
  const userId = Number(body?.userId);
  const employeeId = String(body?.employeeId ?? '').trim();
  const name = String(body?.name ?? '').trim();

  if (!userId || !employeeId || !name) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (!/^\d{7}$/.test(employeeId)) {
    return new Response(JSON.stringify({ error: '工号必须是7位数字' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const user = await env.levelcertification.prepare(
      'SELECT * FROM users WHERE id = ? AND employee_id = ?'
    ).bind(userId, employeeId).first();

    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (String(user.name || '').trim() !== name) {
      return new Response(JSON.stringify({ error: '用户信息不匹配' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    await env.levelcertification.prepare(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `).run();

    await ensureMemoTables(env);

    await env.levelcertification.prepare(
      'DELETE FROM wrong_answers WHERE exam_record_id IN (SELECT id FROM exam_records WHERE user_id = ?)'
    ).bind(userId).run();
    await env.levelcertification.prepare(
      'DELETE FROM exam_records WHERE user_id = ?'
    ).bind(userId).run();
    await env.levelcertification.prepare(
      'DELETE FROM user_wrong_questions WHERE user_id = ?'
    ).bind(userId).run();
    await env.levelcertification.prepare(
      'DELETE FROM user_notes WHERE user_id = ?'
    ).bind(userId).run();
    await env.levelcertification.prepare(
      'DELETE FROM user_profiles WHERE user_id = ?'
    ).bind(userId).run();
    await env.levelcertification.prepare(
      'DELETE FROM users WHERE id = ? AND employee_id = ?'
    ).bind(userId, employeeId).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '注销失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function ensureUser(requestedUserId, requestedEmployeeId, env) {
  const userId = Number(requestedUserId);
  const employeeId = String(requestedEmployeeId ?? '').trim();
  if (!userId || !employeeId || !/^\d{7}$/.test(employeeId)) return null;
  return await env.levelcertification.prepare(
    'SELECT * FROM users WHERE id = ? AND employee_id = ?'
  ).bind(userId, employeeId).first();
}

async function ensureMemoTables(env) {
  await env.levelcertification.prepare(`
    CREATE TABLE IF NOT EXISTS user_wrong_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      question_text TEXT NOT NULL,
      options_json TEXT,
      correct_answer TEXT,
      user_answer TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject, question_text),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `).run();

  await env.levelcertification.prepare(`
    CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `).run();
}

async function handleGetWrongQuestions(request, env, corsHeaders) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const employeeId = url.searchParams.get('employeeId');
  const subject = url.searchParams.get('subject');

  const user = await ensureUser(userId, employeeId, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '用户无效' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await ensureMemoTables(env);

  const where = ['user_id = ?'];
  const binds = [user.id];
  if (subject && subject !== 'ALL') {
    where.push('subject = ?');
    binds.push(subject);
  }

  const rows = await env.levelcertification.prepare(`
    SELECT
      id,
      subject,
      question_text,
      options_json,
      correct_answer,
      user_answer,
      source,
      datetime(created_at, '+8 hours') as created_at,
      datetime(updated_at, '+8 hours') as updated_at
    FROM user_wrong_questions
    WHERE ${where.join(' AND ')}
    ORDER BY updated_at DESC
    LIMIT 200
  `).bind(...binds).all();

  const items = (rows.results || []).map(r => ({
    ...r,
    options: r.options_json ? JSON.parse(r.options_json) : [],
  }));

  return new Response(JSON.stringify({ success: true, items }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleUpsertWrongQuestion(request, env, corsHeaders) {
  const body = await request.json();
  const userId = body?.userId;
  const employeeId = body?.employeeId;
  const subject = String(body?.subject ?? '').trim();
  const questionText = String(body?.questionText ?? '').trim();
  const options = body?.options ?? [];
  const correctAnswer = String(body?.correctAnswer ?? '').trim();
  const userAnswer = String(body?.userAnswer ?? '').trim();
  const source = String(body?.source ?? '').trim();

  const user = await ensureUser(userId, employeeId, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '用户无效' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (!subject || !questionText) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await ensureMemoTables(env);

  const optionsJson = JSON.stringify(Array.isArray(options) ? options : []);

  await env.levelcertification.prepare(`
    INSERT INTO user_wrong_questions (user_id, subject, question_text, options_json, correct_answer, user_answer, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, subject, question_text) DO UPDATE SET
      options_json = excluded.options_json,
      correct_answer = excluded.correct_answer,
      user_answer = excluded.user_answer,
      source = excluded.source,
      updated_at = CURRENT_TIMESTAMP
  `).bind(user.id, subject, questionText, optionsJson, correctAnswer, userAnswer, source).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleDeleteWrongQuestion(request, env, corsHeaders) {
  const body = await request.json();
  const userId = body?.userId;
  const employeeId = body?.employeeId;
  const wrongId = Number(body?.wrongId);

  const user = await ensureUser(userId, employeeId, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '用户无效' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (!wrongId) {
    return new Response(JSON.stringify({ error: '缺少wrongId参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await ensureMemoTables(env);
  await env.levelcertification.prepare(
    'DELETE FROM user_wrong_questions WHERE id = ? AND user_id = ?'
  ).bind(wrongId, user.id).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleGetNotes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const employeeId = url.searchParams.get('employeeId');

  const user = await ensureUser(userId, employeeId, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '用户无效' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await ensureMemoTables(env);

  const rows = await env.levelcertification.prepare(`
    SELECT
      id,
      title,
      content,
      datetime(created_at, '+8 hours') as created_at,
      datetime(updated_at, '+8 hours') as updated_at
    FROM user_notes
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 200
  `).bind(user.id).all();

  return new Response(JSON.stringify({ success: true, items: rows.results || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleUpsertNote(request, env, corsHeaders) {
  const body = await request.json();
  const userId = body?.userId;
  const employeeId = body?.employeeId;
  const noteId = body?.noteId ? Number(body.noteId) : null;
  const title = String(body?.title ?? '').trim();
  const content = String(body?.content ?? '').trim();

  const user = await ensureUser(userId, employeeId, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '用户无效' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (!title || !content) {
    return new Response(JSON.stringify({ error: '标题和内容不能为空' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await ensureMemoTables(env);

  if (noteId) {
    const result = await env.levelcertification.prepare(
      'UPDATE user_notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).bind(title, content, noteId, user.id).run();
    if (!result.meta.changes) {
      return new Response(JSON.stringify({ error: '笔记不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return new Response(JSON.stringify({ success: true, noteId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const insert = await env.levelcertification.prepare(
    'INSERT INTO user_notes (user_id, title, content) VALUES (?, ?, ?)'
  ).bind(user.id, title, content).run();

  return new Response(JSON.stringify({ success: true, noteId: insert.meta.last_row_id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleDeleteNote(request, env, corsHeaders) {
  const body = await request.json();
  const userId = body?.userId;
  const employeeId = body?.employeeId;
  const noteId = Number(body?.noteId);

  const user = await ensureUser(userId, employeeId, env);
  if (!user) {
    return new Response(JSON.stringify({ error: '用户无效' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (!noteId) {
    return new Response(JSON.stringify({ error: '缺少noteId参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  await ensureMemoTables(env);
  await env.levelcertification.prepare(
    'DELETE FROM user_notes WHERE id = ? AND user_id = ?'
  ).bind(noteId, user.id).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * 保存考试成绩
 */
async function handleSaveExam(request, env, corsHeaders) {
  const data = await request.json();
  const { userId, employeeId, subject, score, totalQuestions, correctCount, timeSpent, wrongAnswers } = data;

  // 验证必填字段
  if (!userId || !employeeId || !subject || score === undefined || !totalQuestions || !correctCount) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const user = await ensureUser(userId, employeeId, env);
    if (!user) {
      return new Response(JSON.stringify({ error: '用户无效' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 插入考试记录
    const result = await env.levelcertification.prepare(`
      INSERT INTO exam_records (user_id, subject, score, total_questions, correct_count, time_spent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(user.id, subject, score, totalQuestions, correctCount, timeSpent || 0).run();

    const examRecordId = result.meta.last_row_id;

    // 如果有错题，插入错题记录
    if (wrongAnswers && wrongAnswers.length > 0) {
      const stmt = env.levelcertification.prepare(`
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
    const bestScore = await env.levelcertification.prepare(`
      SELECT MAX(score) as best_score FROM exam_records
      WHERE user_id = ? AND subject = ?
    `).bind(user.id, subject).first();

    return new Response(JSON.stringify({
      success: true,
      examRecordId,
      bestScore: bestScore.best_score || 0,
      message: score >= 90 ? '恭喜！考试通过！' : '继续努力！'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '保存失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

/**
 * 获取用户的考试记录
 */
async function handleGetUserExams(request, env, corsHeaders) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const employeeId = url.searchParams.get('employeeId');

  if (!userId || !employeeId) {
    return new Response(JSON.stringify({ error: '缺少必要参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const user = await ensureUser(userId, employeeId, env);
    if (!user) {
      return new Response(JSON.stringify({ error: '用户无效' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const records = await env.levelcertification.prepare(`
      SELECT
        er.id,
        er.subject,
        er.score,
        er.total_questions,
        er.correct_count,
        er.time_spent,
        datetime(er.exam_date, '+8 hours') as exam_date,
        (SELECT MAX(score) FROM exam_records WHERE user_id = ? AND subject = er.subject) as best_score
      FROM exam_records er
      WHERE er.user_id = ?
      ORDER BY er.exam_date DESC
      LIMIT 50
    `).bind(user.id, user.id).all();

    return new Response(JSON.stringify({
      success: true,
      records: records.results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '查询失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    // 获取考试记录
    const exam = await env.levelcertification.prepare(`
      SELECT
        er.id,
        er.user_id,
        er.subject,
        er.score,
        er.total_questions,
        er.correct_count,
        er.time_spent,
        datetime(er.exam_date, '+8 hours') as exam_date,
        u.name,
        u.employee_id
      FROM exam_records er
      JOIN users u ON er.user_id = u.id
      WHERE er.id = ?
    `).bind(examRecordId).first();

    if (!exam) {
      return new Response(JSON.stringify({ error: '考试记录不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 获取错题详情
    const wrongAnswers = await env.levelcertification.prepare(`
      SELECT
        question_number,
        question_text,
        user_answer,
        correct_answer,
        datetime(created_at, '+8 hours') as created_at
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '查询失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
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
      stats = await env.levelcertification.prepare(`
        SELECT
          subject,
          COUNT(*) as exam_count,
          AVG(score) as avg_score,
          MAX(score) as best_score,
          datetime(MAX(exam_date), '+8 hours') as last_exam_date
        FROM exam_records
        WHERE user_id = ?
        GROUP BY subject
      `).bind(userId).all();
    } else if (subject) {
      // 单个科目的统计
      stats = await env.levelcertification.prepare(`
        SELECT
          COUNT(*) as total_exams,
          AVG(score) as avg_score,
          COUNT(CASE WHEN score >= 90 THEN 1 END) as pass_count,
          COUNT(CASE WHEN score < 90 THEN 1 END) as fail_count
        FROM exam_records
        WHERE subject = ?
      `).bind(subject).first();
    } else {
      // 全局统计
      stats = {
        totalUsers: (await env.levelcertification.prepare('SELECT COUNT(*) as count FROM users').first()).count,
        totalExams: (await env.levelcertification.prepare('SELECT COUNT(*) as count FROM exam_records').first()).count,
        passRate: (await env.levelcertification.prepare('SELECT AVG(CASE WHEN score >= 90 THEN 100 ELSE 0 END) as rate FROM exam_records').first()).rate,
        bySubject: await env.levelcertification.prepare('SELECT * FROM subject_stats').all(),
      };
    }

    return new Response(JSON.stringify({
      success: true,
      stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '统计失败: ' + error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
