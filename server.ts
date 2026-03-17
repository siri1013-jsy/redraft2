import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileURLToPath } from 'url';

// 强制从“项目根目录”读取 .env（Windows 上更稳）
const projectRoot = path.resolve();
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, '.env.local') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use((req, _res, next) => {
  // 简单请求日志，方便排查“fetch failed”
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

const distPath = path.join(projectRoot, 'dist');
const distIndexPath = path.join(distPath, 'index.html');
const hasDist = fs.existsSync(distIndexPath);

// 只有在打包产物存在时，才托管静态页面（避免开发阶段报 dist/index.html 不存在）
if (hasDist) {
  app.use(express.static(distPath));
}

const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  console.warn(
    `[WARN] DEEPSEEK_API_KEY 未设置，解析和生成接口将无法调用 DeepSeek。当前工作目录：${process.cwd()}`
  );
} else {
  console.log(`[OK] 已读取到 DeepSeek API key（长度 ${apiKey.length}）`);
}

app.get('/api/health', (_req, res) => {
  const envPath = path.join(projectRoot, '.env');
  const envLocalPath = path.join(projectRoot, '.env.local');
  const hasEnv = fs.existsSync(envPath);
  const hasEnvLocal = fs.existsSync(envLocalPath);
  const key = process.env.DEEPSEEK_API_KEY || '';
  res.json({
    ok: true,
    cwd: process.cwd(),
    projectRoot,
    envFiles: {
      env: { path: envPath, exists: hasEnv },
      envLocal: { path: envLocalPath, exists: hasEnvLocal },
    },
    apiKey: {
      present: Boolean(key),
      length: key.length,
      // 只暴露前后少量字符，避免泄露
      preview: key ? `${key.slice(0, 4)}****${key.slice(-4)}` : '',
      source: process.env.GOOGLE_GENAI_API_KEY ? 'GOOGLE_GENAI_API_KEY' : process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : '',
    },
  });
});

async function extractTextFromFile(file: Express.Multer.File): Promise<{
  text: string;
  detectedType: 'pdf' | 'docx' | 'image' | 'unknown';
}> {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();

  const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
  const isDocx =
    mime.includes('wordprocessingml') ||
    name.endsWith('.docx') ||
    mime.includes('msword') ||
    name.endsWith('.doc');
  const isImage =
    mime.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg');

  if (isPdf) {
    const data = await pdfParse(file.buffer);
    return { text: (data.text || '').trim(), detectedType: 'pdf' };
  }

  // 注意：mammoth 主要支持 docx。doc 旧格式通常无法可靠解析。
  if (name.endsWith('.doc')) {
    return { text: '', detectedType: 'unknown' };
  }

  if (isDocx) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return { text: (value || '').trim(), detectedType: 'docx' };
  }

  if (isImage) {
    // Lazy import to keep serverless startup lightweight and avoid optional dependency crashes.
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('chi_sim+eng');
    try {
      const { data } = await worker.recognize(file.buffer);
      return { text: (data.text || '').trim(), detectedType: 'image' };
    } finally {
      await worker.terminate();
    }
  }

  return { text: '', detectedType: 'unknown' };
}

app.post('/api/parse-resume', upload.single('file'), async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error: missing DEEPSEEK_API_KEY.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Missing file.' });
    }

    const { text: rawText, detectedType } = await extractTextFromFile(file);

    if (!rawText) {
      return res.status(400).json({
        error:
          detectedType === 'unknown'
            ? '无法识别该文件类型或内容为空。建议上传 PDF / DOCX / 清晰的图片。'
            : '未能从文件中提取到文字。请确认文件可复制文本或图片清晰。',
      });
    }

    const prompt = `
你是简历信息抽取助手。下面给你一份“用户简历的原始文本”（可能是 PDF/Word/OCR 提取），请把其中内容整理为可填入简历生成器表单的结构化字段。

要求：
- 全部输出简体中文。
- 不要虚构任何经历；如果原文没写，就留空字符串或空数组。
- experiences 最多返回 3 条；projects 最多返回 2 条（多余内容可合并或择优保留）。
- 每条经历/项目尽量保持原文的关键信息（公司/岗位/时间/要点），用多行字符串。

只输出合法 JSON，不要多余文字。结构如下：
{
  "education": "一段或多行字符串",
  "experiences": ["经历1", "经历2", "经历3"],
  "projects": ["项目1", "项目2"],
  "skills": "多行字符串",
  "notes": "补充说明（可空）"
}

======== 原始简历文本开始 ========
${rawText}
======== 原始简历文本结束 ========
`;

    const dsResp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个严格按照要求返回 JSON 的助手。' },
          { role: 'user', content: prompt },
        ],
        stream: false,
      }),
    });

    if (!dsResp.ok) {
      const errBody = await dsResp.text();
      console.error('DeepSeek parse API error:', dsResp.status, errBody);
      return res.status(500).json({ error: `DeepSeek API error: ${dsResp.status}` });
    }

    const dsJson: any = await dsResp.json();
    const responseText: string =
      dsJson?.choices?.[0]?.message?.content?.[0]?.text ||
      dsJson?.choices?.[0]?.message?.content ||
      '';

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(500).json({ error: 'Failed to parse model response as JSON.' });
      }
      parsed = JSON.parse(match[0]);
    }

    return res.json({
      parsed: {
        education: parsed.education || '',
        experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        skills: parsed.skills || '',
        notes: parsed.notes || '',
      },
      rawText,
      detectedType,
    });
  } catch (err: any) {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件太大了（最大 10MB）。' });
    }
    console.error('Error in /api/parse-resume:', err);
    return res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error.'
          : String(err?.message || err),
    });
  }
});

app.post('/api/generate-resume', async (req, res) => {
  try {
    const {
      targetJob = {},
      education = '',
      experiences = [],
      projects = [],
      skills = '',
      notes = '',
    } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error: missing DEEPSEEK_API_KEY.' });
    }

    const systemPrompt = `
你是一名熟悉中文实习招聘场景的“简历顾问”（不是自由发挥的写手）。
你的任务是：在不改变事实的前提下，基于用户提供的原始素材，生成一版更贴合目标岗位 JD 的中文学生简历草稿。

硬性约束（必须遵守）：
1) 只能基于用户提供的信息改写与重组，禁止虚构任何经历、技能、项目、工具、职责、结果或量化数据（包括百分比、QPS、用户数、营收等）。
2) 可以调整信息顺序、合并拆分表述、提炼要点，但不能改变事实含义。
3) 优先突出与 JD 直接相关的经历/项目/技能；不相关内容可以弱化或不展开，但不能捏造“更相关”的内容。
4) 风格必须像真实中文学生简历：简洁、具体、可信；避免写成资深职场人士口吻。
5) 严禁空泛套话与 AI 味表达。避免出现或尽量不用这些词/句式：
   - “具备良好的沟通能力/抗压能力/学习能力/责任心强/团队协作能力强”
   - “热爱技术/自我驱动/追求卓越/快速学习/善于总结”
   - “熟练掌握/精通/业内领先/大幅提升/显著优化”（除非原文明确支持且不含虚构）
6) Summary 控制在 2–3 句，必须具体（基于素材），不要空。
7) 如果信息不足：宁可保守表达或留空，也不要脑补。
8) 输出必须为严格 JSON，且仅输出 JSON，不要任何多余文本。
`;

    const userPrompt = `
请根据“目标岗位 JD”和“用户素材”输出一份岗位定制的中文学生简历草稿。必须遵守 system 里的所有硬性约束。

======== 目标岗位 JD ========
岗位名称：${targetJob.title || '（未提供）'}
公司名称：${targetJob.company || '（未提供）'}
JD：
${targetJob.jd || '（未提供）'}

======== 用户素材（原文，可为空） ========
【教育】
${education || '（未提供）'}

【工作/实习经历（多条原文）】
${(experiences as string[]).join('\n\n') || '（未提供）'}

【项目经历（多条原文）】
${(projects as string[]).join('\n\n') || '（未提供）'}

【技能】
${skills || '（未提供）'}

【补充说明】
${notes || '（未提供）'}

======== 输出结构（字段名必须完全一致） ========
{
  "analysis": {
    "focus": "这个岗位更看重：用 3-6 个要点/短句，直接从 JD 抽取（不要泛化）",
    "adjustments": "这版调整了什么：2-5 条，说明你如何从素材里挑选/重排/改写来贴合 JD（不要夸大）",
    "weakened": "本次弱化的内容：1-4 条，说明哪些内容与 JD 相关度低所以少写（不要编造）"
  },
  "draft": {
    "summary": "Summary：2-3 句，学生口吻，具体可信，不空泛",
    "education": "Education：只整理用户提供的教育信息，不补学校/时间",
    "experience": ["Experience 第1条（多行字符串，尽量用要点）", "第2条（如有）", "第3条（如有）"],
    "projects": ["Projects 第1条（多行字符串，尽量用要点）", "第2条（如有）"],
    "skills": "Skills：把用户技能按类别整理（语言/框架/数据库/工具等），不新增不存在的技能"
  }
}

补充规则：
- experience 最多 3 条；projects 最多 2 条。
- 如果某模块素材为空，对应字段用空字符串或空数组，不要编造。
- 不要输出 Markdown，不要代码块标记，不要解释过程。
`;

    const dsResp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt.trim() },
          { role: 'user', content: userPrompt.trim() },
        ],
        stream: false,
        temperature: 0.3,
      }),
    });

    if (!dsResp.ok) {
      const errBody = await dsResp.text();
      console.error('DeepSeek generate API error:', dsResp.status, errBody);
      return res.status(500).json({ error: `DeepSeek API error: ${dsResp.status}` });
    }

    const dsJson: any = await dsResp.json();
    const responseText: string =
      dsJson?.choices?.[0]?.message?.content?.[0]?.text ||
      dsJson?.choices?.[0]?.message?.content ||
      '';

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      console.error('LLM 返回内容非纯 JSON，尝试从中提取 JSON。');
      const match = responseText.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(500).json({ error: 'Failed to parse model response as JSON.' });
      }
      parsed = JSON.parse(match[0]);
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.analysis ||
      !parsed.draft
    ) {
      return res.status(500).json({ error: 'Model response missing required fields.' });
    }

    const analysis = parsed.analysis;
    const draft = parsed.draft;

    draft.experience = Array.isArray(draft.experience) ? draft.experience : [];
    draft.projects = Array.isArray(draft.projects) ? draft.projects : [];

    return res.json({ analysis, draft });
  } catch (err) {
    console.error('Error in /api/generate-resume:', err);
    return res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error.'
          : String((err as any)?.message || err),
    });
  }
});

// 如果存在 dist，则把非 API 路由交给前端 SPA（生产模式一体化部署）
if (hasDist) {
  app.get('*', (_req, res) => {
    res.sendFile(distIndexPath);
  });
} else {
  // 开发阶段：提示用户去跑前端 dev server
  app.get('/', (_req, res) => {
    res.type('text/plain').send('后端已启动。请打开前端：http://localhost:3000 （运行 npm run dev）');
  });
}

const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === currentFilePath;

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export default app;

