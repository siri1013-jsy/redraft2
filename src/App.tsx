/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { 
  Layout, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Sparkles, 
  ArrowRight, 
  Briefcase, 
  GraduationCap, 
  Code, 
  FileText, 
  Info,
  ExternalLink,
  ChevronRight,
  Upload,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Experience {
  id: string;
  content: string;
}

interface Project {
  id: string;
  content: string;
}

interface ResumeDraft {
  summary: string;
  education: string;
  experience: string[];
  projects: string[];
  skills: string;
}

interface Analysis {
  focus: string;
  adjustments: string;
  weakened: string;
}

interface GeneratePayload {
  targetJob: {
    title: string;
    company: string;
    jd: string;
  };
  education: string;
  experiences: string[];
  projects: string[];
  skills: string;
  notes: string;
}

interface ProfileData {
  education: string;
  experiences: string[];
  projects: string[];
  skills: string;
  notes: string;
}

interface ResumeVersion {
  id: string;
  name: string;
  tags: string[];
  targetJob: GeneratePayload['targetJob'];
  draft: ResumeDraft;
  analysis: Analysis;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_PROFILE_KEY = 'redraft_profile_v1';
const STORAGE_VERSIONS_KEY = 'redraft_versions_v1';

const createDefaultPayload = (): GeneratePayload => ({
  targetJob: {
    title: '',
    company: '',
    jd: '',
  },
  education: '',
  experiences: [''],
  projects: [''],
  skills: '',
  notes: '',
});

const toDisplayTime = (iso: string): string => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const parseVersionTags = (raw: string): string[] => {
  return [...new Set(raw.split(/[，,、\s]+/).map(item => item.trim()).filter(Boolean))].slice(0, 6);
};

const GENERIC_PHRASES = [
  '沟通能力',
  '抗压能力',
  '学习能力',
  '责任心',
  '团队协作',
  '热爱技术',
  '自我驱动',
  '追求卓越',
  '快速学习',
  '善于总结',
  '熟练掌握',
  '精通',
  '显著优化',
  '大幅提升',
];

const splitRawKeywords = (text: string): string[] => {
  return text
    .replace(/[：:]/g, ' ')
    .split(/[\n,，;；、/|]/)
    .map(part => part.trim())
    .filter(Boolean);
};

const extractJDKeywords = (jd: string): string[] => {
  if (!jd.trim()) return [];

  const lines = splitRawKeywords(jd)
    .filter(item => item.length >= 2)
    .filter(item => !/^\d+[.)、]/.test(item));

  const matched = lines
    .flatMap(line => line.match(/[A-Za-z0-9+#.]{2,}|[\u4e00-\u9fa5]{2,12}/g) || [])
    .map(word => word.trim())
    .filter(word => word.length >= 2)
    .filter(word => !['负责', '岗位', '要求', '优先', '相关', '能力'].includes(word));

  return [...new Set(matched)].slice(0, 12);
};

const findGenericPhrases = (text: string): string[] => {
  const found = GENERIC_PHRASES.filter(item => text.includes(item));
  return [...new Set(found)];
};

const extractNumbers = (text: string): string[] => {
  return [...new Set(text.match(/\d+(?:\.\d+)?%?|\d+\+/g) || [])];
};

// --- Components ---

const InputSection = ({
  onGenerate,
  initialData,
  onInputChange,
  syncKey,
}: {
  onGenerate: (data: GeneratePayload) => void;
  initialData: GeneratePayload;
  onInputChange: (data: GeneratePayload) => void;
  syncKey: number;
}) => {
  const [targetJob, setTargetJob] = useState(initialData.targetJob);
  const [education, setEducation] = useState(initialData.education);
  const [experiences, setExperiences] = useState<Experience[]>(
    (initialData.experiences.length > 0 ? initialData.experiences : ['']).map((content, idx) => ({
      id: String(idx + 1),
      content,
    }))
  );
  const [projects, setProjects] = useState<Project[]>(
    (initialData.projects.length > 0 ? initialData.projects : ['']).map((content, idx) => ({
      id: String(idx + 1),
      content,
    }))
  );
  const [skills, setSkills] = useState(initialData.skills);
  const [notes, setNotes] = useState(initialData.notes);
  const [submitHint, setSubmitHint] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTargetJob(initialData.targetJob);
    setEducation(initialData.education);
    setExperiences(
      (initialData.experiences.length > 0 ? initialData.experiences : ['']).map((content, idx) => ({
        id: String(idx + 1),
        content,
      }))
    );
    setProjects(
      (initialData.projects.length > 0 ? initialData.projects : ['']).map((content, idx) => ({
        id: String(idx + 1),
        content,
      }))
    );
    setSkills(initialData.skills);
    setNotes(initialData.notes);
  }, [syncKey]);

  useEffect(() => {
    onInputChange({
      targetJob,
      education,
      experiences: experiences.map(item => item.content),
      projects: projects.map(item => item.content),
      skills,
      notes,
    });
  }, [targetJob, education, experiences, projects, skills, notes, onInputChange]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsing(true);
      setParseError(null);

      const form = new FormData();
      form.append('file', file);

      const resp = await fetch('/api/parse-resume', {
        method: 'POST',
        body: form,
      });

      if (!resp.ok) {
        let msg = `解析失败：${resp.status}`;
        try {
          const errBody = await resp.json();
          if (errBody?.error) msg = String(errBody.error);
        } catch {
          // ignore
        }
        console.error(msg);
        setParseError(msg);
        return;
      }

      const result = await resp.json();
      const parsed = result?.parsed || {};

      setEducation(parsed.education || '');
      const nextExperiences = Array.isArray(parsed.experiences) ? parsed.experiences : [];
      setExperiences(
        nextExperiences.length > 0
          ? nextExperiences.slice(0, 3).map((content: string, idx: number) => ({
              id: String(idx + 1),
              content: String(content || ''),
            }))
          : [{ id: '1', content: '' }]
      );

      const nextProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
      setProjects(
        nextProjects.length > 0
          ? nextProjects.slice(0, 2).map((content: string, idx: number) => ({
              id: String(idx + 1),
              content: String(content || ''),
            }))
          : [{ id: '1', content: '' }]
      );

      setSkills(parsed.skills || '');
      setNotes(parsed.notes || '');
      setHighlightKey(prev => prev + 1);
    } catch (err) {
      console.error('解析接口调用失败：', err);
      setParseError('解析接口调用失败（fetch failed）。请确认后端窗口正在运行，并把后端窗口最新几行文字发我。');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addExperience = () => {
    if (experiences.length < 3) {
      setExperiences([...experiences, { id: Date.now().toString(), content: '' }]);
    }
  };

  const updateExperience = (id: string, content: string) => {
    setExperiences(experiences.map(e => e.id === id ? { ...e, content } : e));
  };

  const removeExperience = (id: string) => {
    if (experiences.length > 1) {
      setExperiences(experiences.filter(e => e.id !== id));
    }
  };

  const addProject = () => {
    if (projects.length < 2) {
      setProjects([...projects, { id: Date.now().toString(), content: '' }]);
    }
  };

  const updateProject = (id: string, content: string) => {
    setProjects(projects.map(p => p.id === id ? { ...p, content } : p));
  };

  const removeProject = (id: string) => {
    if (projects.length > 1) {
      setProjects(projects.filter(p => p.id !== id));
    }
  };

  const jdKeywords = extractJDKeywords(targetJob.jd);
  const filledExperienceCount = experiences.filter(item => item.content.trim()).length;
  const filledProjectCount = projects.filter(item => item.content.trim()).length;
  const hasCoreMaterial =
    education.trim().length > 0 ||
    filledExperienceCount > 0 ||
    filledProjectCount > 0;

  const handleSubmit = () => {
    if (!targetJob.jd.trim()) {
      setSubmitHint('请先填写目标岗位 JD，再生成。');
      return;
    }

    if (!hasCoreMaterial) {
      setSubmitHint('请至少填写教育、实习或项目中的一项真实经历。');
      return;
    }

    setSubmitHint(null);

    onGenerate({
      targetJob,
      education,
      experiences: experiences.map(e => e.content),
      projects: projects.map(p => p.content),
      skills,
      notes
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants} className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900">输入目标岗位与基础信息</h2>
        <p className="text-slate-500 text-sm">请提供尽可能详细的信息，以便 AI 生成更精准的简历。</p>
      </motion.div>

      <div className="space-y-6">
        <div className="input-zone-label input-zone-job">岗位信息</div>
        {/* Resume Upload */}
        <motion.div variants={itemVariants} className="glass-card profile-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-brand-600 mb-2">
            <Upload size={18} />
            <span className="font-bold text-sm uppercase tracking-wider">快速开始：上传已有简历</span>
          </div>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="upload-zone"
          >
            {isParsing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={32} className="text-brand-500 animate-spin" />
                <span className="text-sm font-medium text-slate-600">正在智能解析简历内容...</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-500">
                  <Upload size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-700">点击或拖拽简历文件到此处</p>
                  <p className="text-xs text-slate-400 mt-1">支持 PDF, Word, JPG 格式 (AI 将自动识别并填充下方模块)</p>
                </div>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".pdf,.doc,.docx,.jpg,.png"
              onChange={handleFileUpload}
            />
          </div>
          {parseError && (
            <div className="text-sm text-red-600 whitespace-pre-line">
              {parseError}
            </div>
          )}
        </motion.div>

        {/* Target Job */}
        <motion.div variants={itemVariants} className="glass-card job-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-brand-600 mb-2">
            <Briefcase size={18} />
            <span className="font-bold text-sm uppercase tracking-wider">目标岗位</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 ml-1">岗位名称</label>
              <input 
                type="text" 
                placeholder="例如：后端开发工程师" 
                className="input-field"
                value={targetJob.title}
                onChange={(e) => setTargetJob({ ...targetJob, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 ml-1">公司名称</label>
              <input 
                type="text" 
                placeholder="例如：字节跳动" 
                className="input-field"
                value={targetJob.company}
                onChange={(e) => setTargetJob({ ...targetJob, company: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 ml-1">岗位描述 (JD)</label>
            <textarea 
              placeholder="粘贴目标岗位的任职要求、岗位职责等内容..." 
              className="input-field min-h-[120px] resize-none"
              value={targetJob.jd}
              onChange={(e) => setTargetJob({ ...targetJob, jd: e.target.value })}
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500">JD 关键信号预览（用于帮助你检查是否贴岗）</p>
            {jdKeywords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {jdKeywords.map((item) => (
                  <span key={item} className="keyword-chip">{item}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">填写 JD 后会自动提取关键词，建议至少包含岗位职责与任职要求。</p>
            )}
          </div>
        </motion.div>

        <div className="input-zone-label input-zone-profile">基础简历内容</div>

        {/* Education */}
        <motion.div variants={itemVariants} className="glass-card profile-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-brand-600 mb-2">
            <GraduationCap size={18} />
            <span className="font-bold text-sm uppercase tracking-wider">教育背景</span>
          </div>
          <textarea 
            key={`edu-${highlightKey}`}
            placeholder="学校、专业、学位、在校时间、主修课程等..." 
            className={`input-field min-h-[80px] resize-none ${highlightKey > 0 ? 'animate-highlight' : ''}`}
            value={education}
            onChange={(e) => setEducation(e.target.value)}
          />
        </motion.div>

        {/* Experience */}
        <motion.div variants={itemVariants} className="glass-card profile-card p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-brand-600">
              <Layout size={18} />
              <span className="font-bold text-sm uppercase tracking-wider">工作/实习经历 (最多3条)</span>
            </div>
            {experiences.length < 3 && (
              <button onClick={addExperience} className="text-brand-600 hover:text-brand-700 p-1 transition-colors">
                <Plus size={20} />
              </button>
            )}
          </div>
          <div className="space-y-4">
            {experiences.map((exp, index) => (
              <div key={exp.id} className="relative group">
                <textarea 
                  key={`exp-${exp.id}-${highlightKey}`}
                  placeholder={`经历 ${index + 1}：公司、职位、时间、核心产出与职责...`} 
                  className={`input-field min-h-[100px] resize-none pr-10 ${highlightKey > 0 ? 'animate-highlight' : ''}`}
                  value={exp.content}
                  onChange={(e) => updateExperience(exp.id, e.target.value)}
                />
                {experiences.length > 1 && (
                  <button 
                    onClick={() => removeExperience(exp.id)}
                    className="absolute top-3 right-3 text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Projects */}
        <motion.div variants={itemVariants} className="glass-card profile-card p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-brand-600">
              <Code size={18} />
              <span className="font-bold text-sm uppercase tracking-wider">项目经历 (最多2条)</span>
            </div>
            {projects.length < 2 && (
              <button onClick={addProject} className="text-brand-600 hover:text-brand-700 p-1 transition-colors">
                <Plus size={20} />
              </button>
            )}
          </div>
          <div className="space-y-4">
            {projects.map((proj, index) => (
              <div key={proj.id} className="relative group">
                <textarea 
                  key={`proj-${proj.id}-${highlightKey}`}
                  placeholder={`项目 ${index + 1}：项目名称、角色、技术栈、核心功能与成果...`} 
                  className={`input-field min-h-[100px] resize-none pr-10 ${highlightKey > 0 ? 'animate-highlight' : ''}`}
                  value={proj.content}
                  onChange={(e) => updateProject(proj.id, e.target.value)}
                />
                {projects.length > 1 && (
                  <button 
                    onClick={() => removeProject(proj.id)}
                    className="absolute top-3 right-3 text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Skills & Notes */}
        <div className="grid grid-cols-2 gap-4">
          <motion.div variants={itemVariants} className="glass-card profile-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-2">
              <Sparkles size={18} />
              <span className="font-bold text-sm uppercase tracking-wider">技能证书</span>
            </div>
            <textarea 
              key={`skills-${highlightKey}`}
              placeholder="技术栈、语言能力、证书等..." 
              className={`input-field min-h-[80px] resize-none ${highlightKey > 0 ? 'animate-highlight' : ''}`}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </motion.div>
          <motion.div variants={itemVariants} className="glass-card profile-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-brand-600 mb-2">
              <Info size={18} />
              <span className="font-bold text-sm uppercase tracking-wider">补充说明</span>
            </div>
            <textarea 
              placeholder="其他你想让 AI 知道的信息..." 
              className="input-field min-h-[80px] resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </motion.div>
        </div>

        <motion.button 
          variants={itemVariants}
          onClick={handleSubmit}
          className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-3 mt-4 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!targetJob.jd.trim() || !hasCoreMaterial}
        >
          生成定制简历草稿 <ArrowRight size={20} />
        </motion.button>
        {submitHint && <p className="text-sm text-amber-600">{submitHint}</p>}
        <p className="text-xs text-slate-400">
          建议优先写清时间、角色、具体动作和结果依据。信息越具体，生成结果越像真实学生简历。
        </p>
      </div>
    </motion.div>
  );
};

const ResultSection = ({ 
  draft, 
  analysis, 
  isGenerating,
  error,
  sourceData,
  setDraft,
  onSaveVersion,
  isSavedVersion
}: { 
  draft: ResumeDraft | null, 
  analysis: Analysis | null,
  isGenerating: boolean,
  error: string | null,
  sourceData: GeneratePayload | null,
  setDraft: React.Dispatch<React.SetStateAction<ResumeDraft | null>>,
  onSaveVersion: () => void,
  isSavedVersion: boolean
}) => {
  const [copiedModule, setCopiedModule] = useState<string | null>(null);

  const updateDraftField = (field: 'summary' | 'education' | 'skills', value: string) => {
    setDraft(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateDraftArrayField = (field: 'experience' | 'projects', index: number, value: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      const next = [...prev[field]];

      if (next.length === 0 && index === 0) {
        return { ...prev, [field]: [value] };
      }

      if (index < 0 || index >= next.length) {
        return prev;
      }

      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const handleDeleteSummary = () => {
    updateDraftField('summary', '');
  };

  const copyToClipboard = (text: string, moduleName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedModule(moduleName);
    setTimeout(() => setCopiedModule(null), 2000);
  };

  if (isGenerating) {
    return (
      <div className="h-full min-h-[600px] flex flex-col items-center justify-center space-y-6 text-center">
        <div className="relative">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 border-4 border-brand-100 border-t-brand-500 rounded-full"
          />
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 flex items-center justify-center text-brand-500"
          >
            <Sparkles size={32} />
          </motion.div>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-800">AI 正在深度重塑您的简历...</h3>
          <p className="text-slate-500">正在解析岗位需求并匹配您的核心经历</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full min-h-[600px] flex flex-col items-center justify-center space-y-4 text-center border-2 border-dashed border-red-200 rounded-3xl bg-red-50/30 p-10">
        <div className="w-20 h-20 rounded-3xl bg-white shadow-sm flex items-center justify-center text-red-400">
          <Info size={40} />
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-bold text-red-500">生成失败</h3>
          <p className="text-sm text-slate-600 whitespace-pre-line">{error}</p>
          <p className="text-xs text-slate-400">
            常见原因：后端没启动、API Key 没配置、网络/代理问题。你也可以按 F12 打开控制台查看红色报错。
          </p>
        </div>
      </div>
    );
  }

  if (!draft || !analysis) {
    return (
      <div className="h-full min-h-[600px] flex flex-col items-center justify-center space-y-6 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/30">
        <div className="w-20 h-20 rounded-3xl bg-white shadow-sm flex items-center justify-center text-slate-300">
          <FileText size={40} />
        </div>
        <div className="space-y-2 max-w-xs">
          <h3 className="text-lg font-bold text-slate-400">暂无生成结果</h3>
          <p className="text-sm text-slate-400">在左侧输入信息并点击生成按钮，AI 将为您定制专属简历草稿。</p>
        </div>
      </div>
    );
  }

  const fullDraftText = [
    draft.summary,
    draft.education,
    ...draft.experience,
    ...draft.projects,
    draft.skills,
  ].join('\n');
  const genericHits = findGenericPhrases(fullDraftText);

  const sourceNumbers = extractNumbers(
    sourceData
      ? [
          sourceData.targetJob.jd,
          sourceData.education,
          ...sourceData.experiences,
          ...sourceData.projects,
          sourceData.skills,
          sourceData.notes,
        ].join('\n')
      : ''
  );
  const draftNumbers = extractNumbers(fullDraftText);
  const numberRisk = draftNumbers.filter(item => !sourceNumbers.includes(item)).slice(0, 5);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8 result-panel"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-2xl font-bold text-slate-900">岗位定制简历草稿</h2>
          <button onClick={onSaveVersion} className="btn-secondary text-sm px-4 py-2">
            {isSavedVersion ? '更新当前版本' : '保存当前版本'}
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">真实性与表达检查</h3>
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-slate-500 mb-1">套话命中</p>
              <p className="font-semibold text-slate-700">
                {genericHits.length > 0 ? `发现 ${genericHits.length} 处，建议人工替换` : '未发现明显通用套话'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-slate-500 mb-1">新增数字风险</p>
              <p className="font-semibold text-slate-700">
                {numberRisk.length > 0 ? `发现 ${numberRisk.length} 处，请核对来源` : '未发现明显新增数字'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-slate-500 mb-1">学生口吻建议</p>
              <p className="font-semibold text-slate-700">优先写课程/实习中的具体动作，少用资深职场措辞</p>
            </div>
          </div>
          {genericHits.length > 0 && (
            <p className="text-xs text-amber-700">建议优先替换词：{genericHits.join('、')}</p>
          )}
          {numberRisk.length > 0 && (
            <p className="text-xs text-amber-700">建议核对数字：{numberRisk.join('、')}</p>
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="bg-brand-50/50 border border-brand-100 p-4 rounded-2xl space-y-2">
            <div className="text-[11px] font-semibold text-brand-600">本版重点强调</div>
            <p className="text-xs text-slate-600 leading-relaxed">{analysis.focus}</p>
          </div>
          <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl space-y-2">
            <div className="text-[11px] font-semibold text-blue-600">本版针对性调整</div>
            <p className="text-xs text-slate-600 leading-relaxed">{analysis.adjustments}</p>
          </div>
          <div className="bg-slate-100/50 border border-slate-200 p-4 rounded-2xl space-y-2">
            <div className="text-[11px] font-semibold text-slate-500">本版已弱化内容</div>
            <p className="text-xs text-slate-500 leading-relaxed">{analysis.weakened}</p>
          </div>
        </div>
      </div>

      <div className="resume-card space-y-8 relative group">
        {/* Summary */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="module-title">个人总结</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteSummary}
                className="text-slate-300 hover:text-red-500 transition-colors"
                title="清空个人总结"
                aria-label="清空个人总结"
              >
                <Trash2 size={14} />
              </button>
              <button onClick={() => copyToClipboard(draft.summary, 'summary')} className="text-slate-300 hover:text-brand-500 transition-colors">
                {copiedModule === 'summary' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <textarea
            value={draft.summary}
            onChange={(e) => updateDraftField('summary', e.target.value)}
            className="result-editor min-h-[96px]"
            placeholder="可直接编辑个人总结，建议保持 2-3 句具体描述。"
          />
        </section>

        {/* Education */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="module-title">教育背景</h3>
            <button onClick={() => copyToClipboard(draft.education, 'edu')} className="text-slate-300 hover:text-brand-500 transition-colors">
              {copiedModule === 'edu' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <textarea
            value={draft.education}
            onChange={(e) => updateDraftField('education', e.target.value)}
            className="result-editor min-h-[120px]"
            placeholder="可直接编辑教育背景内容。"
          />
        </section>

        {/* Experience */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="module-title">工作/实习经历</h3>
            <button onClick={() => copyToClipboard(draft.experience.join('\n\n'), 'exp')} className="text-slate-300 hover:text-brand-500 transition-colors">
              {copiedModule === 'exp' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="space-y-4">
            {(draft.experience.length > 0 ? draft.experience : ['']).map((exp, i) => (
              <textarea
                key={`exp-${i}`}
                value={exp}
                onChange={(e) => updateDraftArrayField('experience', i, e.target.value)}
                className="result-editor min-h-[120px]"
                placeholder={`经历 ${i + 1}：可直接编辑公司、角色、时间与具体产出。`}
              />
            ))}
          </div>
        </section>

        {/* Projects */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="module-title">项目经历</h3>
            <button onClick={() => copyToClipboard(draft.projects.join('\n\n'), 'proj')} className="text-slate-300 hover:text-brand-500 transition-colors">
              {copiedModule === 'proj' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="space-y-4">
            {(draft.projects.length > 0 ? draft.projects : ['']).map((proj, i) => (
              <textarea
                key={`proj-${i}`}
                value={proj}
                onChange={(e) => updateDraftArrayField('projects', i, e.target.value)}
                className="result-editor min-h-[120px]"
                placeholder={`项目 ${i + 1}：可直接编辑角色、技术栈与成果细节。`}
              />
            ))}
          </div>
        </section>

        {/* Skills */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="module-title">技能与证书</h3>
            <button onClick={() => copyToClipboard(draft.skills, 'skills')} className="text-slate-300 hover:text-brand-500 transition-colors">
              {copiedModule === 'skills' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <textarea
            value={draft.skills}
            onChange={(e) => updateDraftField('skills', e.target.value)}
            className="result-editor min-h-[96px]"
            placeholder="可直接编辑技能与证书分类。"
          />
        </section>
      </div>
    </motion.div>
  );
};

const ResumeLibraryView = ({
  versions,
  activeVersionId,
  onOpenVersion,
}: {
  versions: ResumeVersion[];
  activeVersionId: string | null;
  onOpenVersion: (id: string) => void;
}) => {
  return (
    <div className="pt-28 pb-20 px-6 md:px-12 max-w-6xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">我的简历</h2>
          <p className="text-sm text-slate-500 mt-2">统一保存不同岗位版本，可命名并打标签管理。</p>
        </div>
        <span className="text-sm text-slate-400">共 {versions.length} 个版本</span>
      </div>

      {versions.length === 0 ? (
        <div className="glass-card p-10 text-center text-slate-400 text-sm">
          暂无已保存版本。请先在工作台生成草稿并点击“保存当前版本”。
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {versions.map((version) => {
            const isActive = version.id === activeVersionId;
            return (
              <div key={version.id} className={`version-item ${isActive ? 'version-item-active' : ''} p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="version-tag">{version.name || '未命名版本'}</span>
                  <span className="text-xs text-slate-400">{toDisplayTime(version.updatedAt)}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700">{version.targetJob.title || '未填写岗位名称'}</p>
                <p className="mt-1 text-xs text-slate-500">{version.targetJob.company || '未填写公司名称'}</p>
                {version.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {version.tags.map(tag => (
                      <span key={`${version.id}-${tag}`} className="version-subtag">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button onClick={() => onOpenVersion(version.id)} className="btn-secondary text-sm px-3 py-1.5">
                    进入工作台查看
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

type View = 'home' | 'workspace' | 'intro' | 'tutorial' | 'examples' | 'resume-library';

const Navbar = ({ currentView, setView }: { currentView: View, setView: (v: View) => void }) => (
  <nav className="fixed top-0 left-0 right-0 h-16 bg-white/88 backdrop-blur-md border-b border-slate-200/70 z-50 flex items-center px-6 md:px-12 justify-between">
    <div className="flex items-center gap-8">
      <button onClick={() => setView('home')} className="text-xl font-bold tracking-tight text-slate-900 hover:text-brand-600 transition-colors">Redraft</button>
      <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
        <button 
          onClick={() => setView('intro')} 
          className={`transition-colors ${currentView === 'intro' ? 'text-brand-600' : 'hover:text-brand-600'}`}
        >产品介绍</button>
        <button 
          onClick={() => setView('tutorial')} 
          className={`transition-colors ${currentView === 'tutorial' ? 'text-brand-600' : 'hover:text-brand-600'}`}
        >如何使用</button>
        <button 
          onClick={() => setView('examples')} 
          className={`transition-colors ${currentView === 'examples' ? 'text-brand-600' : 'hover:text-brand-600'}`}
        >示例</button>
        <button
          onClick={() => setView('resume-library')}
          className={`transition-colors ${currentView === 'resume-library' ? 'text-brand-600' : 'hover:text-brand-600'}`}
        >我的简历</button>
      </div>
    </div>
    <button onClick={() => setView('workspace')} className="btn-primary text-sm py-2">开始生成</button>
  </nav>
);

const Hero = ({ onStart, onViewExamples }: { onStart: () => void, onViewExamples: () => void }) => (
  <section className="relative pt-40 pb-10 px-6 md:px-12 max-w-7xl mx-auto min-h-[74vh] grid lg:grid-cols-2 gap-12 items-center overflow-hidden">
    {/* Animated Background Gradient */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-40">
      <motion.div 
        animate={{ 
          scale: [1, 1.4, 1],
          rotate: [0, 120, 0],
          x: [-50, 50, -50]
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-brand-200/50 rounded-full blur-[140px]"
      />
      <motion.div 
        animate={{ 
          scale: [1.4, 1, 1.4],
          rotate: [120, 0, 120],
          x: [50, -50, 50]
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-200/40 rounded-full blur-[120px]"
      />
    </div>

    <motion.div 
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }}
      className="self-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-600 text-xs font-bold mb-8"
      >
        <Sparkles size={14} className="animate-pulse" />
        <span>AI 驱动的简历重塑工具</span>
      </motion.div>
      <h1 className="text-8xl font-bold text-slate-900 mb-6 tracking-tighter leading-[1]">
        Redraft
      </h1>
      <h2 className="text-4xl font-semibold text-slate-700 mb-8 tracking-tight">
        根据 JD 生成岗位定制简历草稿
      </h2>
      <p className="text-xl text-slate-500 mb-12 leading-relaxed max-w-lg">
        直接粘贴你已有的经历和项目内容，系统将深度解析岗位需求，为你生成一份高匹配度的专业简历草稿。
      </p>
      <div className="flex flex-wrap gap-5">
        <motion.button 
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onStart} 
          className="btn-primary px-10 py-5 text-xl flex items-center gap-3 shadow-2xl shadow-brand-500/40"
        >
          开始生成 <ArrowRight size={22} />
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,1)' }}
          whileTap={{ scale: 0.98 }}
          onClick={onViewExamples} 
          className="btn-secondary px-10 py-5 text-xl border-slate-200"
        >
          查看示例
        </motion.button>
      </div>
    </motion.div>
    
    <motion.div 
      initial={{ opacity: 0, scale: 0.85, rotateY: 15 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ duration: 1.2, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="relative perspective-2000 hidden lg:block self-center"
    >
      <motion.div 
        animate={{ 
          y: [0, -15, 0],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="glass-card p-6 rotate-1 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.1)] border-white/50 bg-white/70 backdrop-blur-2xl"
      >
        <div className="flex gap-6 mb-6">
          <div className="w-1/3 h-64 bg-slate-50/90 rounded-2xl border border-slate-100 p-5">
            <div className="w-full h-3 bg-slate-200 rounded-full mb-4" />
            <div className="w-2/3 h-3 bg-slate-100 rounded-full mb-8" />
            <div className="space-y-3">
              <div className="w-full h-2 bg-slate-100/60 rounded-full" />
              <div className="w-full h-2 bg-slate-100/60 rounded-full" />
              <div className="w-4/5 h-2 bg-slate-100/60 rounded-full" />
            </div>
          </div>
          <div className="w-2/3 h-64 bg-white rounded-2xl border border-slate-100 p-6 shadow-inner">
            <div className="flex justify-between items-center mb-6">
              <div className="w-32 h-5 bg-brand-100/80 rounded-full" />
              <div className="w-16 h-4 bg-slate-100 rounded-full" />
            </div>
            <div className="space-y-4">
              <div className="w-full h-3 bg-slate-50 rounded-full" />
              <div className="w-full h-3 bg-slate-50 rounded-full" />
              <div className="w-3/4 h-3 bg-slate-50 rounded-full" />
              <div className="pt-4 border-t border-slate-50">
                <div className="w-full h-2 bg-slate-50/80 rounded-full" />
                <div className="w-full h-2 bg-slate-50/80 rounded-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="px-6 py-2 bg-brand-500 text-white text-xs font-bold rounded-full shadow-xl shadow-brand-500/30"
          >
            精准匹配 · 智能重塑
          </motion.div>
        </div>
      </motion.div>

      {/* Floating UI Elements */}
      <motion.div 
        animate={{ 
          y: [0, 20, 0],
          x: [0, 10, 0]
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -top-12 -left-12 glass-card p-4 shadow-2xl border-white/60"
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-slate-700 tracking-tight">匹配度 98%</span>
        </div>
      </motion.div>
      
      <motion.div 
        animate={{ 
          y: [0, -20, 0],
          x: [0, -10, 0]
        }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute -bottom-8 -right-8 glass-card p-4 shadow-2xl border-white/60"
      >
        <div className="flex items-center gap-3">
          <Sparkles size={16} className="text-brand-500" />
          <span className="text-xs font-bold text-slate-700 tracking-tight">已优化 12 处描述</span>
        </div>
      </motion.div>
    </motion.div>

    {/* Scroll Down Indicator */}
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2, duration: 1 }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-400"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">向下滚动探索</span>
      <motion.div 
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-px h-12 bg-gradient-to-b from-slate-300 to-transparent"
      />
    </motion.div>
  </section>
);

const IntroView = () => (
  <motion.div 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8 }}
    className="pt-32 pb-20 px-6 md:px-12 max-w-4xl mx-auto space-y-16"
  >
    <div className="text-center space-y-4">
      <h2 className="text-4xl font-bold text-slate-900">产品介绍</h2>
      <p className="text-xl text-slate-500">Redraft 是您求职路上的 AI 简历专家</p>
    </div>
    
    <div className="grid md:grid-cols-2 gap-8">
      {[
        { icon: <Sparkles size={24} />, title: "智能解析 JD", desc: "深度提取目标岗位的核心关键词、技能要求和业务背景，确保简历内容直击痛点。", color: "text-brand-600", bg: "bg-brand-50" },
        { icon: <Layout size={24} />, title: "动态重组经历", desc: "不再是简单的修改，而是根据岗位权重重新排列和改写您的经历，突出最相关的产出。", color: "text-blue-600", bg: "bg-blue-50" },
        { icon: <Check size={24} />, title: "真实不虚构", desc: "我们坚持基于您的原始素材进行优化，绝不虚构任何经历，保证简历的真实性与可信度。", color: "text-emerald-600", bg: "bg-emerald-50" },
        { icon: <FileText size={24} />, title: "专业产品体验", desc: "极简、干净、高效的界面设计，让您专注于内容本身，告别繁琐的排版困扰。", color: "text-slate-600", bg: "bg-slate-50" }
      ].map((item, i) => (
        <motion.div 
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
          className="glass-card p-8 space-y-4"
        >
          <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center ${item.color}`}>
            {item.icon}
          </div>
          <h3 className="text-xl font-bold text-slate-800">{item.title}</h3>
          <p className="text-slate-500 leading-relaxed">{item.desc}</p>
        </motion.div>
      ))}
    </div>
  </motion.div>
);

const TutorialView = () => (
  <motion.div 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8 }}
    className="pt-32 pb-20 px-6 md:px-12 max-w-4xl mx-auto space-y-16"
  >
    <div className="text-center space-y-4">
      <h2 className="text-4xl font-bold text-slate-900">如何使用</h2>
      <p className="text-xl text-slate-500">三步完成一份高质量的岗位定制简历</p>
    </div>

    <div className="space-y-12">
      {[
        { step: "01", title: "粘贴目标岗位 JD", desc: "将你想投递的岗位描述完整粘贴到输入框中，包括任职要求和岗位职责。" },
        { step: "02", title: "输入原始经历素材", desc: "不需要精细排版，直接粘贴你过去的旧简历内容或项目笔记，AI 会自动识别核心信息。" },
        { step: "03", title: "一键生成并微调", desc: "点击生成按钮，获取 AI 优化后的草稿。根据系统给出的调整建议，进行最后的个性化修改。" }
      ].map((item, i) => (
        <motion.div 
          key={i} 
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.2 }}
          className="flex gap-8 items-start"
        >
          <div className="text-5xl font-black text-slate-200 tabular-nums">{item.step}</div>
          <div className="space-y-2 pt-2">
            <h3 className="text-2xl font-bold text-slate-800">{item.title}</h3>
            <p className="text-lg text-slate-500 leading-relaxed">{item.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.div>
);

const ExamplesView = () => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="pt-32 pb-20 px-6 md:px-12 max-w-6xl mx-auto space-y-16"
  >
    <div className="text-center space-y-4">
      <h2 className="text-4xl font-bold text-slate-900">示例展示</h2>
      <p className="text-xl text-slate-500">看看 Redraft 是如何优化简历的</p>
    </div>

    <div className="grid md:grid-cols-2 gap-12">
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-slate-500 text-center">优化前（原始素材）</h3>
        <div className="glass-card p-8 bg-slate-50/50 border-dashed min-h-[400px]">
          <div className="space-y-4 text-sm text-slate-400 italic">
            <p>“在学校参加过一个电商项目，主要负责写代码。”</p>
            <p>“用过 Java 和 MySQL，做了一个登录功能。”</p>
            <p>“实习的时候帮老板整理过文档，也写过一点简单的接口。”</p>
            <p>“JD 要求：熟悉高并发，有分布式开发经验。”</p>
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-brand-500 text-center">优化后（Redraft 生成）</h3>
        <div className="resume-card min-h-[400px] border-brand-100 shadow-brand-500/10">
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-bold text-brand-600 mb-2">项目经历</h4>
              <p className="text-sm text-slate-700 font-bold mb-1">分布式电商秒杀系统设计</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                - 针对高并发场景，采用 Redis 缓存预热及 RabbitMQ 消息队列实现请求削峰。<br />
                - 独立完成核心下单接口开发，通过分布式锁解决超卖问题，支撑 QPS 提升至 2000+。
              </p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-brand-600 mb-2">工作经历</h4>
              <p className="text-sm text-slate-700 font-bold mb-1">后端开发实习生 | 某互联网公司</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                - 深度参与微服务架构下的接口优化，通过 SQL 索引调优将核心查询延迟降低 40%。<br />
                - 负责技术文档的系统化梳理，提升了团队 20% 的协作效率。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </motion.div>
);

const WorkspaceView = ({ 
  isGenerating, 
  draft, 
  analysis, 
  onGenerate,
  error,
  sourceData,
  setDraft,
  formData,
  setFormData,
  formSyncKey,
  versions,
  activeVersionId,
  onSelectVersion,
  onSaveVersion,
  
}: { 
  isGenerating: boolean, 
  draft: ResumeDraft | null, 
  analysis: Analysis | null, 
  onGenerate: (data: GeneratePayload) => void,
  error: string | null,
  sourceData: GeneratePayload | null,
  setDraft: React.Dispatch<React.SetStateAction<ResumeDraft | null>>,
  formData: GeneratePayload,
  setFormData: React.Dispatch<React.SetStateAction<GeneratePayload>>,
  formSyncKey: number,
  versions: ResumeVersion[],
  activeVersionId: string | null,
  onSelectVersion: (id: string) => void,
  onSaveVersion: () => void
}) => (
  <div className="max-w-7xl mx-auto px-6 md:px-12 pt-28 pb-24 grid lg:grid-cols-12 gap-12 items-start workspace-shell">
    <div className="lg:col-span-6 lg:pl-10 xl:pl-14">
      <InputSection
        onGenerate={onGenerate}
        initialData={formData}
        onInputChange={setFormData}
        syncKey={formSyncKey}
      />
    </div>
    <div className="lg:col-span-6 sticky top-24">
      <ResultSection 
        draft={draft} 
        analysis={analysis}
        isGenerating={isGenerating}
        error={error}
        sourceData={sourceData}
        setDraft={setDraft}
        onSaveVersion={onSaveVersion}
        isSavedVersion={Boolean(activeVersionId)}
      />
    </div>
  </div>
);

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<ResumeDraft | null>(null);
  const [editableDraft, setEditableDraft] = useState<ResumeDraft | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceData, setSourceData] = useState<GeneratePayload | null>(null);
  const [formData, setFormData] = useState<GeneratePayload>(createDefaultPayload());
  const [formSyncKey, setFormSyncKey] = useState(0);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [versionName, setVersionName] = useState('');
  const [versionTags, setVersionTags] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile) as ProfileData;
        setFormData(prev => ({
          ...prev,
          education: parsed.education || '',
          experiences: Array.isArray(parsed.experiences) && parsed.experiences.length > 0 ? parsed.experiences : [''],
          projects: Array.isArray(parsed.projects) && parsed.projects.length > 0 ? parsed.projects : [''],
          skills: parsed.skills || '',
          notes: parsed.notes || '',
        }));
      }
    } catch (err) {
      console.error('读取本地 Profile 失败：', err);
    }

    try {
      const storedVersions = localStorage.getItem(STORAGE_VERSIONS_KEY);
      if (storedVersions) {
        const parsed = JSON.parse(storedVersions);
        if (Array.isArray(parsed)) {
          const next = (parsed as any[]).map((item) => ({
            id: String(item.id || Date.now()),
            name: String(item.name || item?.targetJob?.title || '未命名版本'),
            tags: Array.isArray(item.tags) ? item.tags.map((tag: any) => String(tag)) : [],
            targetJob: {
              title: String(item?.targetJob?.title || ''),
              company: String(item?.targetJob?.company || ''),
              jd: String(item?.targetJob?.jd || ''),
            },
            draft: item.draft,
            analysis: item.analysis,
            createdAt: String(item.createdAt || new Date().toISOString()),
            updatedAt: String(item.updatedAt || item.createdAt || new Date().toISOString()),
          })) as ResumeVersion[];
          setVersions(next);
        }
      }
    } catch (err) {
      console.error('读取本地版本失败：', err);
    }

    setFormSyncKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    const profile: ProfileData = {
      education: formData.education,
      experiences: formData.experiences,
      projects: formData.projects,
      skills: formData.skills,
      notes: formData.notes,
    };

    localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
  }, [formData.education, formData.experiences, formData.projects, formData.skills, formData.notes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_VERSIONS_KEY, JSON.stringify(versions));
  }, [versions]);

  const handleGenerate = async (data: GeneratePayload) => {
    try {
      setIsGenerating(true);
      setGeneratedDraft(null);
      setEditableDraft(null);
      setAnalysis(null);
      setError(null);
      setSourceData(data);
      setActiveVersionId(null);
      setVersionName(data.targetJob.title || '');
      setVersionTags('');

      const resp = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!resp.ok) {
        let msg = `接口返回错误状态：${resp.status}`;
        try {
          const errBody = await resp.json();
          if (errBody?.error) msg = String(errBody.error);
        } catch {
          // ignore
        }
        console.error('生成接口返回错误：', msg);
        setError(msg);
        return;
      }

      const result = await resp.json();
      setAnalysis(result.analysis);
      setGeneratedDraft(result.draft);
      setEditableDraft({
        summary: String(result?.draft?.summary || ''),
        education: String(result?.draft?.education || ''),
        experience: Array.isArray(result?.draft?.experience) ? result.draft.experience.map((item: string) => String(item || '')) : [],
        projects: Array.isArray(result?.draft?.projects) ? result.draft.projects.map((item: string) => String(item || '')) : [],
        skills: String(result?.draft?.skills || ''),
      });
    } catch (e) {
      console.error('调用生成接口失败：', e);
      setError('调用生成接口失败。请确认后端已启动（localhost:3001）且网络正常。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveVersion = () => {
    if (!editableDraft || !analysis) return;

    const current = activeVersionId ? versions.find(v => v.id === activeVersionId) : null;
    setVersionName(current?.name || formData.targetJob.title || '');
    setVersionTags(current?.tags?.join(', ') || '');
    setSaveDialogOpen(true);
  };

  const handleConfirmSaveVersion = () => {
    if (!editableDraft || !analysis) return;

    const now = new Date().toISOString();
    const normalizedName = versionName.trim() || formData.targetJob.title.trim() || '未命名版本';
    const parsedTags = parseVersionTags(versionTags);

    if (activeVersionId) {
      setVersions(prev =>
        prev.map(item =>
          item.id === activeVersionId
            ? {
                ...item,
                name: normalizedName,
                tags: parsedTags,
                targetJob: formData.targetJob,
                draft: editableDraft,
                analysis,
                updatedAt: now,
              }
            : item
        )
      );
      setSaveDialogOpen(false);
      return;
    }

    const newVersion: ResumeVersion = {
      id: String(Date.now()),
      name: normalizedName,
      tags: parsedTags,
      targetJob: formData.targetJob,
      draft: editableDraft,
      analysis,
      createdAt: now,
      updatedAt: now,
    };

    setVersions(prev => [newVersion, ...prev]);
    setActiveVersionId(newVersion.id);
    setVersionName(newVersion.name);
    setVersionTags(newVersion.tags.join(', '));
    setSaveDialogOpen(false);
  };

  const handleSelectVersion = (id: string) => {
    const selected = versions.find(item => item.id === id);
    if (!selected) return;

    setActiveVersionId(id);
    setGeneratedDraft(selected.draft);
    setEditableDraft({
      summary: selected.draft.summary,
      education: selected.draft.education,
      experience: [...selected.draft.experience],
      projects: [...selected.draft.projects],
      skills: selected.draft.skills,
    });
    setAnalysis(selected.analysis);
    setError(null);
    setVersionName(selected.name || selected.targetJob.title || '');
    setVersionTags((selected.tags || []).join(', '));
    setFormData(prev => ({
      ...prev,
      targetJob: selected.targetJob,
    }));
    setSourceData({
      targetJob: selected.targetJob,
      education: formData.education,
      experiences: formData.experiences,
      projects: formData.projects,
      skills: formData.skills,
      notes: formData.notes,
    });
    setFormSyncKey(prev => prev + 1);
  };

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <Hero onStart={() => setCurrentView('workspace')} onViewExamples={() => setCurrentView('examples')} />;
      case 'workspace':
        return (
          <WorkspaceView
            isGenerating={isGenerating}
            draft={editableDraft || generatedDraft}
            analysis={analysis}
            onGenerate={handleGenerate}
            error={error}
            sourceData={sourceData}
            setDraft={setEditableDraft}
            formData={formData}
            setFormData={setFormData}
            formSyncKey={formSyncKey}
            versions={versions}
            activeVersionId={activeVersionId}
            onSelectVersion={handleSelectVersion}
            onSaveVersion={handleSaveVersion}
            versionName={versionName}
            versionTags={versionTags}
            setVersionName={setVersionName}
            setVersionTags={setVersionTags}
          />
        );
      case 'intro':
        return <IntroView />;
      case 'tutorial':
        return <TutorialView />;
      case 'examples':
        return <ExamplesView />;
      case 'resume-library':
        return (
          <ResumeLibraryView
            versions={versions}
            activeVersionId={activeVersionId}
            onOpenVersion={(id) => {
              handleSelectVersion(id);
              setCurrentView('workspace');
            }}
          />
        );
      default:
        return <Hero onStart={() => setCurrentView('workspace')} onViewExamples={() => setCurrentView('examples')} />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar currentView={currentView} setView={setCurrentView} />
      
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-slate-200 bg-white py-7 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-900">Redraft</span>
            <span className="text-xs text-slate-400">© 2026 岗位定制简历生成器</span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500">
            <button onClick={() => setCurrentView('intro')} className="hover:text-brand-600 transition-colors">产品介绍</button>
            <button onClick={() => setCurrentView('tutorial')} className="hover:text-brand-600 transition-colors">如何使用</button>
            <button onClick={() => setCurrentView('examples')} className="hover:text-brand-600 transition-colors">示例展示</button>
            <button onClick={() => setCurrentView('resume-library')} className="hover:text-brand-600 transition-colors">我的简历</button>
          </div>
        </div>
      </footer>

      {saveDialogOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-900/25 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-xl glass-card p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">保存到我的简历</h3>
              <p className="text-sm text-slate-500 mt-1">你可以先重命名版本并添加标签，再确认保存。</p>
            </div>
            <div className="space-y-3">
              <input
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                className="input-field"
                placeholder="版本名称（例如：产品实习-美团）"
              />
              <input
                value={versionTags}
                onChange={(e) => setVersionTags(e.target.value)}
                className="input-field"
                placeholder="标签（用逗号分隔，如 产品,实习,秋招）"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm px-4 py-2" onClick={() => setSaveDialogOpen(false)}>取消</button>
              <button className="btn-primary text-sm px-4 py-2" onClick={handleConfirmSaveVersion}>确认保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
