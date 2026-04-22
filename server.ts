import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUICKFORM_BASE_URL = "http://127.0.0.1:5001/api/4e7WWXaLjZB";
const QUICKFORM_ALL_URL = `${QUICKFORM_BASE_URL}/all`;
const QUICKFORM_PUBLIC_TASK_ID = QUICKFORM_BASE_URL.split("/").pop() || "";
const QUICKFORM_DB_PATH = path.resolve(__dirname, "../quickform-run/QuickForm 1.5纯代码版/quickform.db");
const TOTAL_STAGES = 7;
const LEGACY_TOTAL_RAW_MAX = 518;

type AnyRecord = Record<string, any>;

const stageBucketLabels = ["未开始", "第1关", "第2关", "第3关", "第4关", "第5关", "第6关", "第7关", "已完成"];

const safeNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toTimestamp = (value: unknown) => {
  const time = new Date(typeof value === "string" || typeof value === "number" ? value : 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") {
    return value ?? {};
  }

  try {
    return JSON.parse(value);
  } catch {
    try {
      const normalized = value
        .replace(/\bNone\b/g, "null")
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false")
        .replace(/\\'/g, "__SINGLE_QUOTE__")
        .replace(/'/g, "\"")
        .replace(/__SINGLE_QUOTE__/g, "'");
      return JSON.parse(normalized);
    } catch {
      return {};
    }
  }
};

const clampStage = (value: number) => Math.min(TOTAL_STAGES + 1, Math.max(0, value));

const getCompletedStages = (currentStage: number) => {
  if (currentStage >= TOTAL_STAGES + 1) {
    return TOTAL_STAGES;
  }
  return Math.max(0, currentStage - 1);
};

const getProgressPercent = (currentStage: number) => {
  return Math.round((getCompletedStages(currentStage) / TOTAL_STAGES) * 100);
};

const getCurrentStageLabel = (currentStage: number) => {
  if (currentStage >= TOTAL_STAGES + 1) {
    return "全部完成";
  }
  if (currentStage <= 0) {
    return "尚未开始";
  }
  return `进行到第 ${currentStage} 关`;
};

const buildQuizSummary = (records: any[] = []) => {
  const totalQuestions = records.length;
  const correctCount = records.filter((record) => record?.isCorrect).length;

  return {
    totalQuestions,
    correctCount,
    wrongCount: Math.max(0, totalQuestions - correctCount),
    accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
  };
};

const normalizeWordSummary = (details: AnyRecord) => {
  if (Array.isArray(details?.wordFreqSummary)) {
    return details.wordFreqSummary;
  }

  if (Array.isArray(details?.stageDetails?.stage6?.finalWordFreq)) {
    return details.stageDetails.stage6.finalWordFreq;
  }

  if (Array.isArray(details?.stageDetails?.stage5?.generatedWords)) {
    return details.stageDetails.stage5.generatedWords;
  }

  if (details?.stageDetails?.stage4?.wordFreqMap && typeof details.stageDetails.stage4.wordFreqMap === "object") {
    return Object.entries(details.stageDetails.stage4.wordFreqMap)
      .map(([text, count]) => ({ text, count: safeNumber(count) }))
      .sort((a, b) => b.count - a.count);
  }

  return [];
};

const resolveScore100 = (summary: AnyRecord, item: AnyRecord) => {
  if (summary?.score100 !== undefined && summary?.score100 !== null) {
    return safeNumber(summary.score100, 0);
  }

  const summaryTotal = safeNumber(summary?.totalXP, Number.NaN);
  if (Number.isFinite(summaryTotal)) {
    if (summaryTotal <= 100) {
      return summaryTotal;
    }
    return Math.min(100, Math.round((summaryTotal / LEGACY_TOTAL_RAW_MAX) * 100));
  }

  const itemScore = safeNumber(item?.score, 0);
  if (itemScore <= 100) {
    return itemScore;
  }
  return Math.min(100, Math.round((itemScore / LEGACY_TOTAL_RAW_MAX) * 100));
};

const normalizeSubmission = (item: AnyRecord, index: number) => {
  const payload = parseMaybeJson(item.data) as AnyRecord;
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const details = parseMaybeJson(source.details ?? item.details) as AnyRecord;
  const summary = details?.summary && typeof details.summary === "object" ? details.summary : {};
  const submittedAt = item.submitted_at || summary.lastUpdatedAt || new Date(0).toISOString();

  let currentStage = clampStage(safeNumber(summary.currentStage, 0));
  if (currentStage === 0 && safeNumber(source.stage ?? item.stage, 0) > 0) {
    currentStage = clampStage(safeNumber(source.stage ?? item.stage, 0) + 1);
  }

  const completedStages = safeNumber(summary.completedStages, getCompletedStages(currentStage));
  const wordFreqSummary = normalizeWordSummary(details);
  const stageDetails = details?.stageDetails && typeof details.stageDetails === "object" ? details.stageDetails : {};
  const quizRecords = Array.isArray(stageDetails?.stage7?.records)
    ? stageDetails.stage7.records
    : Array.isArray(stageDetails?.stage7)
      ? stageDetails.stage7
      : [];
  const quizSummary = details?.quizSummary || buildQuizSummary(quizRecords);

  const score100 = resolveScore100(summary, source.score !== undefined ? source : item);

  return {
    sessionId: source.sessionId || item.sessionId || details?.sessionId || `${source.playerName || item.playerName || "未知学生"}-${submittedAt}-${index}`,
    playerName: source.playerName || item.playerName || "未知学生",
    submittedAt,
    startedAt: summary.startedAt || "",
    currentStage,
    currentStageLabel: getCurrentStageLabel(currentStage),
    completedStages,
    progressPercent: safeNumber(summary.progressPercent, getProgressPercent(currentStage)),
    totalXP: score100,
    rawTotalScore: safeNumber(summary.rawTotalScore, safeNumber(source.score ?? item.score, 0)),
    totalFailCount: safeNumber(summary.totalFailCount, safeNumber(source.failCount ?? item.failCount, 0)),
    isCompleted: summary.isCompleted === true || currentStage >= TOTAL_STAGES + 1,
    wordFreqSummary,
    quizSummary,
    stageResults: Array.isArray(details?.stageResults) ? details.stageResults : [],
    rawStageResults: Array.isArray(details?.rawStageResults) ? details.rawStageResults : [],
    stageScoreBreakdown: Array.isArray(details?.stageScoreBreakdown) ? details.stageScoreBreakdown : [],
    stageDetails,
    raw: item,
    isDemo: Boolean(details?.isDemo),
  };
};

const aggregateDashboardData = (rawData: AnyRecord) => {
  const submissions = Array.isArray(rawData?.submissions) ? rawData.submissions : [];
  const normalized = submissions
    .map((item, index) => normalizeSubmission(item, index))
    .sort((a, b) => toTimestamp(b.submittedAt) - toTimestamp(a.submittedAt));

  const latestBySession = new Map<string, ReturnType<typeof normalizeSubmission>>();
  for (const item of normalized) {
    const existing = latestBySession.get(item.sessionId);
    if (!existing || toTimestamp(item.submittedAt) > toTimestamp(existing.submittedAt)) {
      latestBySession.set(item.sessionId, item);
    }
  }

  const students = Array.from(latestBySession.values()).sort((a, b) => {
    if (b.totalXP !== a.totalXP) {
      return b.totalXP - a.totalXP;
    }
    return toTimestamp(b.submittedAt) - toTimestamp(a.submittedAt);
  });

  const totalXP = students.reduce((sum, student) => sum + student.totalXP, 0);
  const progressBuckets = stageBucketLabels.map((label, index) => ({
    label,
    count: students.filter((student) => {
      if (index === stageBucketLabels.length - 1) {
        return student.currentStage >= TOTAL_STAGES + 1;
      }
      return student.currentStage === index;
    }).length,
  })).map((bucket) => ({
    ...bucket,
    percent: students.length > 0 ? Math.round((bucket.count / students.length) * 100) : 0,
  }));

  const topKeywords = Array.from(
    students.reduce((map, student) => {
      for (const item of student.wordFreqSummary.slice(0, 12)) {
        if (!item?.text) continue;
        map.set(item.text, (map.get(item.text) || 0) + safeNumber(item.count, 1));
      }
      return map;
    }, new Map<string, number>())
  )
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 18);

  return {
    taskTitle: rawData?.task_title || "学习数据中心",
    fetchedAt: new Date().toISOString(),
    metrics: {
      totalSnapshots: normalized.length,
      activeStudents: students.length,
      completedStudents: students.filter((student) => student.isCompleted).length,
      averageScore: students.length > 0 ? Math.round(totalXP / students.length) : 0,
    },
    leaderboard: students.slice(0, 8).map((student, index) => ({
      rank: index + 1,
      playerName: student.playerName,
      totalXP: student.totalXP,
      progressPercent: student.progressPercent,
      currentStageLabel: student.currentStageLabel,
      isCompleted: student.isCompleted,
    })),
    progressBuckets,
    topKeywords,
    recentUpdates: normalized.slice(0, 10).map((item) => ({
      playerName: item.playerName,
      totalXP: item.totalXP,
      currentStageLabel: item.currentStageLabel,
      submittedAt: item.submittedAt,
      isCompleted: item.isCompleted,
      isDemo: item.isDemo,
    })),
    students: students.map((student) => ({
      sessionId: student.sessionId,
      playerName: student.playerName,
      totalXP: student.totalXP,
      rawTotalScore: student.rawTotalScore,
      totalFailCount: student.totalFailCount,
      currentStage: student.currentStage,
      currentStageLabel: student.currentStageLabel,
      completedStages: student.completedStages,
      progressPercent: student.progressPercent,
      submittedAt: student.submittedAt,
      isCompleted: student.isCompleted,
      isDemo: student.isDemo,
      quizSummary: student.quizSummary,
      wordFreqSummary: student.wordFreqSummary.slice(0, 8),
      stageResults: student.stageResults,
      rawStageResults: student.rawStageResults,
      stageScoreBreakdown: student.stageScoreBreakdown,
      textPreview: student.stageDetails?.stage6?.rawTextPreview || "",
      wordCloudImage: student.stageDetails?.stage6?.wordCloudImage || "",
    })),
  };
};

const adminHtml = () => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>学生学习数据大屏</title>
  <style>
    :root {
      --bg: #07111f;
      --panel: rgba(8, 22, 39, 0.78);
      --panel-strong: rgba(13, 33, 56, 0.92);
      --line: rgba(132, 217, 255, 0.16);
      --cyan: #7be7ff;
      --mint: #6dffcf;
      --gold: #ffd26d;
      --rose: #ff8b9d;
      --text: #ecf7ff;
      --muted: #8ca6bd;
      --accent: linear-gradient(135deg, #0f2f4f 0%, #0a192c 45%, #251036 100%);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at 15% 20%, rgba(123, 231, 255, 0.16), transparent 26%),
        radial-gradient(circle at 85% 15%, rgba(255, 210, 109, 0.16), transparent 24%),
        radial-gradient(circle at 70% 80%, rgba(109, 255, 207, 0.13), transparent 20%),
        linear-gradient(180deg, #09111d 0%, #040812 100%);
      min-height: 100vh;
    }
    .shell {
      max-width: 1500px;
      margin: 0 auto;
      padding: 28px 22px 40px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      margin-bottom: 18px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 20px 70px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(22px);
    }
    .hero-main {
      padding: 28px 28px 24px;
      background-image: var(--accent);
      position: relative;
      overflow: hidden;
    }
    .hero-main::after {
      content: "";
      position: absolute;
      inset: auto -80px -80px auto;
      width: 240px;
      height: 240px;
      background: radial-gradient(circle, rgba(123, 231, 255, 0.18), transparent 68%);
    }
    .hero-side {
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
    }
    .eyebrow {
      color: var(--mint);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 12px;
      font-weight: 700;
    }
    h1 {
      margin: 10px 0 10px;
      font-size: clamp(32px, 4vw, 54px);
      line-height: 1.02;
    }
    .subtext {
      max-width: 720px;
      color: rgba(236, 247, 255, 0.74);
      font-size: 15px;
      line-height: 1.7;
    }
    .hero-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 22px;
      flex-wrap: wrap;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 10px 16px;
      border: 1px solid rgba(123, 231, 255, 0.18);
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
      font-size: 13px;
    }
    button {
      cursor: pointer;
      border: 0;
      border-radius: 999px;
      padding: 11px 18px;
      color: #07111f;
      background: linear-gradient(135deg, var(--mint), var(--cyan));
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(123, 231, 255, 0.2);
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }
    .metric-card {
      padding: 20px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 12px;
    }
    .metric-value {
      font-size: 38px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .metric-note {
      color: rgba(236, 247, 255, 0.66);
      font-size: 13px;
    }
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.9fr 0.95fr;
      gap: 18px;
      margin-bottom: 18px;
    }
    .section {
      padding: 22px;
    }
    .section h2 {
      margin: 0 0 18px;
      font-size: 18px;
      letter-spacing: 0.02em;
    }
    .progress-list, .timeline, .leaderboard-list, .student-grid {
      display: grid;
      gap: 14px;
    }
    .progress-item {
      display: grid;
      grid-template-columns: 84px 1fr 46px;
      gap: 12px;
      align-items: center;
    }
    .bar {
      height: 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.07);
      overflow: hidden;
    }
    .bar > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--cyan), var(--mint));
    }
    .leaderboard-row, .timeline-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .rank {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-weight: 800;
      background: linear-gradient(135deg, rgba(255,210,109,0.24), rgba(255,139,157,0.22));
      color: var(--gold);
    }
    .mini {
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
    }
    .value-strong {
      font-weight: 800;
      color: var(--gold);
      font-size: 18px;
    }
    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .keyword {
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.09);
      background: linear-gradient(135deg, rgba(123, 231, 255, 0.08), rgba(255, 210, 109, 0.08));
      font-size: 13px;
    }
    .student-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .student-card {
      padding: 20px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
      border: 1px solid rgba(255,255,255,0.06);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      cursor: pointer;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .student-card:hover {
      transform: translateY(-4px);
      border-color: rgba(123, 231, 255, 0.26);
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
    }
    .student-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .student-name {
      font-size: 21px;
      font-weight: 800;
    }
    .badge {
      padding: 7px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .badge.done {
      color: #07111f;
      background: linear-gradient(135deg, var(--gold), #fff0c4);
    }
    .badge.demo {
      color: var(--rose);
      background: rgba(255,139,157,0.08);
    }
    .stats-line {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .stat-chip {
      padding: 12px;
      border-radius: 16px;
      background: rgba(7, 17, 31, 0.5);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .stat-chip b {
      display: block;
      font-size: 18px;
      margin-top: 4px;
    }
    .stage-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0;
    }
    .stage-pill {
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(123,231,255,0.08);
      border: 1px solid rgba(123,231,255,0.13);
      font-size: 12px;
      color: rgba(236,247,255,0.86);
    }
    .text-preview {
      margin-top: 14px;
      padding: 14px;
      border-radius: 16px;
      background: rgba(255,255,255,0.035);
      color: rgba(236,247,255,0.72);
      line-height: 1.65;
      font-size: 13px;
      min-height: 88px;
    }
    .click-tip {
      margin-top: 12px;
      color: var(--cyan);
      font-size: 12px;
    }
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(1, 6, 14, 0.72);
      backdrop-filter: blur(16px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 999;
    }
    .modal.show {
      display: flex;
    }
    .modal-card {
      width: min(1100px, 100%);
      max-height: calc(100vh - 40px);
      overflow: auto;
      border-radius: 28px;
      border: 1px solid rgba(123, 231, 255, 0.18);
      background: linear-gradient(180deg, rgba(7,17,31,0.96), rgba(7,17,31,0.92));
      box-shadow: 0 30px 100px rgba(0, 0, 0, 0.48);
      padding: 26px;
    }
    .modal-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    .close-btn {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      box-shadow: none;
    }
    .modal-grid {
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 18px;
    }
    .detail-panel {
      border-radius: 22px;
      background: rgba(255,255,255,0.035);
      border: 1px solid rgba(255,255,255,0.06);
      padding: 18px;
    }
    .detail-title {
      font-size: 15px;
      font-weight: 800;
      margin-bottom: 12px;
    }
    .detail-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .detail-kpi {
      border-radius: 16px;
      background: rgba(7,17,31,0.55);
      border: 1px solid rgba(255,255,255,0.05);
      padding: 12px;
      font-size: 12px;
      color: var(--muted);
    }
    .detail-kpi b {
      display: block;
      margin-top: 4px;
      font-size: 18px;
      color: var(--text);
    }
    .score-breakdown {
      display: grid;
      gap: 10px;
    }
    .score-row {
      display: grid;
      grid-template-columns: 106px 1fr 74px;
      gap: 10px;
      align-items: center;
    }
    .score-bar {
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255,255,255,0.07);
    }
    .score-bar > span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--gold), var(--cyan));
      border-radius: inherit;
    }
    .cloud-wrap {
      min-height: 360px;
      border-radius: 20px;
      border: 1px dashed rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.02);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .cloud-wrap img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: contain;
      background: white;
    }
    .empty {
      padding: 42px 22px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed rgba(255,255,255,0.12);
      border-radius: 20px;
    }
    .footer-note {
      margin-top: 18px;
      color: var(--muted);
      font-size: 12px;
      text-align: right;
    }
    .loading {
      padding: 60px 0;
      text-align: center;
      color: var(--muted);
      font-size: 15px;
    }
    @media (max-width: 1200px) {
      .hero, .dashboard-grid, .student-grid, .metrics { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 860px) {
      .hero, .dashboard-grid, .student-grid, .metrics { grid-template-columns: 1fr; }
      .progress-item { grid-template-columns: 70px 1fr 40px; }
      .stats-line { grid-template-columns: 1fr; }
      .modal-grid, .detail-kpis { grid-template-columns: 1fr; }
      .score-row { grid-template-columns: 86px 1fr 62px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel hero-main">
        <div class="eyebrow">Learning Intelligence Screen</div>
        <h1>学生学习数据大屏</h1>
        <div class="subtext">
          管理端实时读取本地部署接口的全量提交记录，并自动聚合出每位学生的最新学习快照。
          学生不必等到全部通关，只要开始学习并产生进度，数据就会进入总览、排行和画像卡片。
        </div>
        <div class="hero-actions">
          <div class="pill">数据源：127.0.0.1:5001 /all</div>
          <div class="pill" id="lastUpdatedPill">正在载入最新数据...</div>
        </div>
      </div>
      <div class="panel hero-side">
        <div>
          <div class="eyebrow">Control</div>
          <div style="font-size:28px;font-weight:800;margin-top:10px;">教师视角看全局</div>
          <div class="mini" style="margin-top:10px;">自动刷新间隔 15 秒，可手动立即刷新。</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button id="refreshBtn">立即刷新大屏</button>
          <button id="clearBtn" class="close-btn" style="background:rgba(255,139,157,0.12);color:var(--rose);border:1px solid rgba(255,139,157,0.18);">清除所有数据</button>
        </div>
      </div>
    </section>

    <section class="metrics" id="metrics">
      <div class="panel metric-card loading">正在读取学习快照...</div>
    </section>

    <section class="dashboard-grid">
      <div class="panel section">
        <h2>进度分布</h2>
        <div id="progressBoard" class="progress-list"></div>
      </div>
      <div class="panel section">
        <h2>学习排行榜</h2>
        <div id="leaderboard" class="leaderboard-list"></div>
      </div>
      <div class="panel section">
        <h2>最近动态</h2>
        <div id="timeline" class="timeline"></div>
      </div>
    </section>

    <section class="panel section" style="margin-bottom:18px;">
      <h2>全班高频关键词</h2>
      <div id="keywords" class="keywords"></div>
    </section>

    <section class="panel section">
      <h2>学生学习画像</h2>
      <div id="studentGrid" class="student-grid"></div>
    </section>

    <div class="footer-note">数据来自 http://127.0.0.1:5001/api/4e7WWXaLjZB/all</div>
  </div>

  <div id="studentModal" class="modal">
    <div class="modal-card">
      <div class="modal-head">
        <div>
          <div class="eyebrow">Student Detail</div>
          <div id="modalTitle" style="font-size:30px;font-weight:800;margin-top:10px;">学生学习详情</div>
          <div id="modalSubtitle" class="mini" style="margin-top:8px;"></div>
        </div>
        <button id="closeModalBtn" class="close-btn">关闭</button>
      </div>
      <div id="modalBody"></div>
    </div>
  </div>

  <script>
    let dashboardState = { students: [] };

    const formatDate = function(value) {
      if (!value) return '暂无时间';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    };

    const escapeHtml = function(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const setEmpty = function(id, text) {
      document.getElementById(id).innerHTML = '<div class="empty">' + escapeHtml(text) + '</div>';
    };

    const renderMetrics = function(metrics) {
      const items = [
        { label: '累计快照', value: metrics.totalSnapshots, note: '包含同一学生的多次进度上报' },
        { label: '当前学生数', value: metrics.activeStudents, note: '按最新 session 去重后的学习人数' },
        { label: '已完成人数', value: metrics.completedStudents, note: '已经完成全部 7 个学习阶段' },
        { label: '平均评分', value: metrics.averageScore, note: '学生最新快照的平均综合评分（100分制）' }
      ];

      document.getElementById('metrics').innerHTML = items.map(function(item) {
        return '<div class="panel metric-card">' +
          '<div class="metric-label">' + escapeHtml(item.label) + '</div>' +
          '<div class="metric-value">' + escapeHtml(item.value) + '</div>' +
          '<div class="metric-note">' + escapeHtml(item.note) + '</div>' +
        '</div>';
      }).join('');
    };

    const renderProgress = function(buckets) {
      if (!buckets.length) {
        setEmpty('progressBoard', '还没有可展示的学生进度。');
        return;
      }

      document.getElementById('progressBoard').innerHTML = buckets.map(function(bucket) {
        return '<div class="progress-item">' +
          '<div>' + escapeHtml(bucket.label) + '</div>' +
          '<div class="bar"><span style="width:' + escapeHtml(bucket.percent) + '%"></span></div>' +
          '<div style="text-align:right;color:var(--muted);">' + escapeHtml(bucket.count) + '</div>' +
        '</div>';
      }).join('');
    };

    const renderLeaderboard = function(list) {
      if (!list.length) {
        setEmpty('leaderboard', '排行榜还没有数据。');
        return;
      }

      document.getElementById('leaderboard').innerHTML = list.map(function(item) {
        return '<div class="leaderboard-row">' +
          '<div class="rank">' + escapeHtml(item.rank) + '</div>' +
          '<div>' +
            '<div style="font-weight:800;">' + escapeHtml(item.playerName) + '</div>' +
            '<div class="mini">' + escapeHtml(item.currentStageLabel) + ' · 进度 ' + escapeHtml(item.progressPercent) + '%</div>' +
          '</div>' +
          '<div class="value-strong">' + escapeHtml(item.totalXP) + ' 分</div>' +
        '</div>';
      }).join('');
    };

    const renderTimeline = function(items) {
      if (!items.length) {
        setEmpty('timeline', '最近动态还没有更新。');
        return;
      }

      document.getElementById('timeline').innerHTML = items.map(function(item) {
        const tags = [];
        if (item.isCompleted) tags.push('完成');
        if (item.isDemo) tags.push('测试');

        return '<div class="timeline-row">' +
          '<div class="rank" style="background:linear-gradient(135deg, rgba(123,231,255,0.18), rgba(109,255,207,0.18));color:var(--cyan);">↻</div>' +
          '<div>' +
            '<div style="font-weight:700;">' + escapeHtml(item.playerName) + '</div>' +
            '<div class="mini">' + escapeHtml(item.currentStageLabel) + ' · 综合评分 ' + escapeHtml(item.totalXP) + '/100' + (tags.length ? ' · ' + escapeHtml(tags.join(' / ')) : '') + '</div>' +
          '</div>' +
          '<div class="mini" style="text-align:right;">' + escapeHtml(formatDate(item.submittedAt)) + '</div>' +
        '</div>';
      }).join('');
    };

    const renderKeywords = function(items) {
      if (!items.length) {
        setEmpty('keywords', '暂时还没有统计到高频关键词。');
        return;
      }

      document.getElementById('keywords').innerHTML = items.map(function(item) {
        return '<div class="keyword">' + escapeHtml(item.text) + ' · ' + escapeHtml(item.count) + '</div>';
      }).join('');
    };

    const openStudentModal = function(sessionId) {
      const student = (dashboardState.students || []).find(function(item) {
        return item.sessionId === sessionId;
      });
      if (!student) return;

      document.getElementById('modalTitle').textContent = student.playerName + ' 的学习详情';
      document.getElementById('modalSubtitle').textContent = '最近更新：' + formatDate(student.submittedAt) + ' · ' + student.currentStageLabel;

      const breakdown = (student.stageScoreBreakdown || []).map(function(item) {
        const score = Number(item.score || 0);
        const weight = Number(item.weight || 0);
        const percent = weight > 0 ? Math.round((score / weight) * 100) : 0;
        return '<div class="score-row">' +
          '<div style="font-size:12px;">第' + escapeHtml(item.stage) + '关</div>' +
          '<div class="score-bar"><span style="width:' + escapeHtml(percent) + '%"></span></div>' +
          '<div style="text-align:right;font-size:12px;color:var(--muted);">' + escapeHtml(score) + '/' + escapeHtml(weight) + '</div>' +
        '</div>';
      }).join('');

      const wordCloudHtml = student.wordCloudImage
        ? '<div class="cloud-wrap"><img alt="词云图" src="' + student.wordCloudImage + '" /></div>'
        : '<div class="cloud-wrap"><div class="empty" style="margin:18px;">该学生还没有生成词云图。</div></div>';

      const keywords = (student.wordFreqSummary || []).map(function(item) {
        return '<span class="stage-pill">' + escapeHtml(item.text) + ' · ' + escapeHtml(item.count) + '</span>';
      }).join('');

      const stageBreakdownFallback = breakdown || '<div class="empty">暂无阶段评分明细</div>';

      document.getElementById('modalBody').innerHTML = '' +
        '<div class="modal-grid">' +
          '<div class="detail-panel">' +
            '<div class="detail-title">实战词云图</div>' +
            wordCloudHtml +
            '<div class="detail-title" style="margin-top:18px;">实战文本片段</div>' +
            '<div class="text-preview" style="margin-top:0;">' + escapeHtml(student.textPreview || '该学生当前尚未提交实战文本片段。') + '</div>' +
          '</div>' +
          '<div style="display:grid;gap:18px;">' +
            '<div class="detail-panel">' +
              '<div class="detail-title">核心指标</div>' +
              '<div class="detail-kpis">' +
                '<div class="detail-kpi">综合评分<b>' + escapeHtml(student.totalXP) + '/100</b></div>' +
                '<div class="detail-kpi">学习进度<b>' + escapeHtml(student.progressPercent) + '%</b></div>' +
                '<div class="detail-kpi">累计失误<b>' + escapeHtml(student.totalFailCount) + '</b></div>' +
                '<div class="detail-kpi">测验正确率<b>' + escapeHtml((student.quizSummary && student.quizSummary.accuracy) || 0) + '%</b></div>' +
              '</div>' +
              '<div class="detail-title">阶段评分拆解</div>' +
              '<div class="score-breakdown">' + stageBreakdownFallback + '</div>' +
            '</div>' +
            '<div class="detail-panel">' +
              '<div class="detail-title">关键词摘要</div>' +
              '<div class="stage-pills">' + (keywords || '<span class="stage-pill">暂无词频摘要</span>') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      document.getElementById('studentModal').classList.add('show');
    };

    const closeStudentModal = function() {
      document.getElementById('studentModal').classList.remove('show');
    };

    const clearAllData = async function() {
      const confirmed = window.confirm('确定要清除当前任务的所有提交数据吗？这个操作不可恢复。');
      if (!confirmed) return;

      try {
        const res = await fetch('/api/clear-all', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error((data && data.message) || '清除失败');
        }
        closeStudentModal();
        await loadDashboard();
      } catch (error) {
        window.alert('清除失败：' + (error && error.message ? error.message : '未知错误'));
      }
    };

    const renderStudents = function(students) {
      if (!students.length) {
        setEmpty('studentGrid', '还没有学生提交数据，请先在学生端开始一轮学习。');
        return;
      }

      document.getElementById('studentGrid').innerHTML = students.map(function(student) {
        const badges = [];
        if (student.isCompleted) {
          badges.push('<span class="badge done">已完成</span>');
        }
        if (student.isDemo) {
          badges.push('<span class="badge demo">测试样本</span>');
        }

        const stagePills = (student.stageScoreBreakdown || []).map(function(item) {
          return '<span class="stage-pill">第' + escapeHtml(item.stage) + '关 ' + escapeHtml(item.score || 0) + '/' + escapeHtml(item.weight || 0) + '分</span>';
        }).join('');

        const keywords = (student.wordFreqSummary || []).map(function(item) {
          return '<span class="stage-pill">' + escapeHtml(item.text) + ' · ' + escapeHtml(item.count) + '</span>';
        }).join('');

        return '<article class="student-card" data-session-id="' + escapeHtml(student.sessionId) + '">' +
          '<div class="student-top">' +
            '<div>' +
              '<div class="student-name">' + escapeHtml(student.playerName) + '</div>' +
              '<div class="mini">最近更新：' + escapeHtml(formatDate(student.submittedAt)) + '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">' +
              '<span class="badge">' + escapeHtml(student.currentStageLabel) + '</span>' +
              badges.join('') +
            '</div>' +
          '</div>' +
          '<div class="stats-line">' +
            '<div class="stat-chip">综合评分<b>' + escapeHtml(student.totalXP) + '/100</b></div>' +
            '<div class="stat-chip">累计失误<b>' + escapeHtml(student.totalFailCount) + '</b></div>' +
            '<div class="stat-chip">测验正确率<b>' + escapeHtml((student.quizSummary && student.quizSummary.accuracy) || 0) + '%</b></div>' +
          '</div>' +
          '<div class="bar"><span style="width:' + escapeHtml(student.progressPercent) + '%"></span></div>' +
          '<div class="mini" style="margin-top:8px;">已完成 ' + escapeHtml(student.completedStages) + ' / 7 个阶段</div>' +
          '<div class="stage-pills">' + (stagePills || '<span class="stage-pill">暂无关卡成绩</span>') + '</div>' +
          '<div class="stage-pills">' + (keywords || '<span class="stage-pill">暂无词频摘要</span>') + '</div>' +
          '<div class="text-preview">' + escapeHtml(student.textPreview || '该学生当前尚未提交实战文本片段。') + '</div>' +
          '<div class="click-tip">点击查看词云图与完整实战详情</div>' +
        '</article>';
      }).join('');

      Array.from(document.querySelectorAll('.student-card')).forEach(function(card) {
        card.addEventListener('click', function() {
          const sessionId = card.getAttribute('data-session-id');
          if (sessionId) openStudentModal(sessionId);
        });
      });
    };

    const loadDashboard = async function() {
      try {
        const res = await fetch('/api/dashboard-data', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        const data = await res.json();
        dashboardState = data;
        document.getElementById('lastUpdatedPill').textContent = '最近拉取：' + formatDate(data.fetchedAt);
        renderMetrics(data.metrics || {});
        renderProgress(data.progressBuckets || []);
        renderLeaderboard(data.leaderboard || []);
        renderTimeline(data.recentUpdates || []);
        renderKeywords(data.topKeywords || []);
        renderStudents(data.students || []);
      } catch (error) {
        console.error(error);
        ['metrics', 'progressBoard', 'leaderboard', 'timeline', 'keywords', 'studentGrid'].forEach(function(id) {
          setEmpty(id, '大屏数据拉取失败，请稍后刷新重试。');
        });
        document.getElementById('lastUpdatedPill').textContent = '拉取失败';
      }
    };

    document.getElementById('refreshBtn').addEventListener('click', loadDashboard);
    document.getElementById('clearBtn').addEventListener('click', clearAllData);
    document.getElementById('closeModalBtn').addEventListener('click', closeStudentModal);
    document.getElementById('studentModal').addEventListener('click', function(event) {
      if (event.target && event.target.id === 'studentModal') {
        closeStudentModal();
      }
    });
    loadDashboard();
    setInterval(loadDashboard, 15000);
  </script>
</body>
</html>`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  app.get("/admin", (_req, res) => {
    res.type("html").send(adminHtml());
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/records", async (req, res) => {
    try {
      const upstream = await fetch(QUICKFORM_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const text = await upstream.text();
      let data: AnyRecord = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!upstream.ok) {
        return res.status(upstream.status).json(data);
      }

      res.json(data);
    } catch (error) {
      console.error("Error forwarding submission:", error);
      res.status(500).json({ error: "Failed to forward submission." });
    }
  });

  app.get("/api/dashboard-data", async (_req, res) => {
    try {
      const upstream = await fetch(QUICKFORM_ALL_URL, { headers: { "Accept": "application/json" } });
      if (!upstream.ok) {
        const message = await upstream.text();
        return res.status(upstream.status).json({ error: message || "Failed to fetch dashboard data." });
      }

      const rawData = await upstream.json();
      res.json(aggregateDashboardData(rawData));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data." });
    }
  });

  app.post("/api/clear-all", (_req, res) => {
    try {
      const db = new Database(QUICKFORM_DB_PATH, { readonly: false });
      const task = db.prepare("SELECT id FROM task WHERE task_id = ?").get(QUICKFORM_PUBLIC_TASK_ID) as { id: number } | undefined;
      if (!task) {
        db.close();
        return res.status(404).json({ success: false, message: "未找到目标任务。" });
      }

      db.prepare("DELETE FROM submission WHERE task_id = ?").run(task.id);
      db.close();
      return res.json({ success: true, message: "已清除所有数据。" });
    } catch (error) {
      console.error("Error clearing local quickform data:", error);
      return res.status(500).json({ success: false, message: "清除数据失败。" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
