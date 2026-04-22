import React, { useState } from 'react';
import { Background } from './components/Background';
import { TopBar } from './components/TopBar';
import { Intro } from './stages/Intro';
import { Stage1 } from './stages/Stage1';
import { Stage2 } from './stages/Stage2';
import { Stage3 } from './stages/Stage3';
import { Stage4 } from './stages/Stage4';
import { Stage5 } from './stages/Stage5';
import { Stage6 } from './stages/Stage6';
import { QuizStage } from './stages/QuizStage';
import { Outro } from './stages/Outro';
import { AnimatePresence, motion } from 'motion/react';
import { TestPanel } from './components/TestPanel';
import { AITutorProvider } from './contexts/AIContext';

const TOTAL_STAGES = 7;
const STAGE_SCORE_WEIGHTS = [10, 15, 10, 15, 10, 20, 20] as const;
const STAGE_RAW_MAX_SCORES = [30, 112, 30, 126, 20, 50, 150] as const;
const STAGE_SCORE_LABELS = ['初识词云', '文本分词', '过滤清洗', '词频统计', '生成词云图', '实战演练', '知识测验'] as const;

type CloudWord = { text: string; count: number };

type GameState = {
  sessionId: string;
  startedAt: string;
  playerName: string;
  totalXP: number;
  rawTotalScore: number;
  currentStage: number;
  stageResults: number[];
  rawStageResults: number[];
  wordFreq: Record<string, number>;
  cloudWords: CloudWord[];
  stageDetails: Record<number, any>;
  totalFailCount: number;
};

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const emptyGameState = (): GameState => ({
  sessionId: '',
  startedAt: '',
  playerName: '',
  totalXP: 0,
  rawTotalScore: 0,
  currentStage: 0,
  stageResults: [],
  rawStageResults: [],
  wordFreq: { '悟空': 12, '唐僧': 6, '妖怪': 8 },
  cloudWords: [],
  stageDetails: {},
  totalFailCount: 0,
});

const normalizeStageScore = (stageIdx: number, rawScore: number) => {
  const maxScore = STAGE_RAW_MAX_SCORES[stageIdx - 1] || rawScore || 1;
  const weight = STAGE_SCORE_WEIGHTS[stageIdx - 1] || 0;
  const normalized = Math.round((Math.max(0, rawScore) / maxScore) * weight);
  return Math.min(weight, Math.max(0, normalized));
};

const normalizeWordFreq = (data: any): Record<string, number> => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return Object.entries(data).reduce<Record<string, number>>((result, [key, value]) => {
    if (typeof value === 'number' && value > 0 && !/fail/i.test(key)) {
      result[key] = value;
    }
    return result;
  }, {});
};

const estimateFailCount = (value: any): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateFailCount(item), 0);
  }

  if (!value || typeof value !== 'object') {
    return 0;
  }

  return Object.entries(value).reduce((sum, [key, val]) => {
    if (/fail/i.test(key) && typeof val === 'number') {
      return sum + val;
    }
    if (/isCorrect/i.test(key) && val === false) {
      return sum + 1;
    }
    return sum + estimateFailCount(val);
  }, 0);
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

const buildStageDetails = (state: GameState) => {
  return Object.fromEntries(
    Object.entries(state.stageDetails).map(([stageKey, details]) => {
      const stageNumber = Number(stageKey);
      if (stageNumber === 5 && Array.isArray(details)) {
        return [`stage${stageNumber}`, { generatedWords: details }];
      }
      if (stageNumber === 7 && Array.isArray(details)) {
        return [`stage${stageNumber}`, { records: details, quizSummary: buildQuizSummary(details) }];
      }
      return [`stage${stageNumber}`, details];
    })
  );
};

const getWordSummary = (state: GameState): CloudWord[] => {
  const stage6Words = state.stageDetails[6]?.finalWordFreq;
  if (Array.isArray(stage6Words) && stage6Words.length > 0) {
    return stage6Words.slice(0, 20);
  }

  if (state.cloudWords.length > 0) {
    return state.cloudWords.slice(0, 20);
  }

  return Object.entries(state.wordFreq)
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
};

const buildSnapshotPayload = (state: GameState) => {
  const completedStages = state.currentStage >= TOTAL_STAGES + 1 ? TOTAL_STAGES : Math.max(0, state.currentStage - 1);
  const quizRecords = Array.isArray(state.stageDetails[7]) ? state.stageDetails[7] : [];
  const quizSummary = buildQuizSummary(quizRecords);
  const stageScoreBreakdown = STAGE_SCORE_LABELS.map((label, index) => ({
    stage: index + 1,
    label,
    score: state.stageResults[index] || 0,
    weight: STAGE_SCORE_WEIGHTS[index],
    rawScore: state.rawStageResults[index] || 0,
    rawMax: STAGE_RAW_MAX_SCORES[index],
  }));

  return {
    playerName: state.playerName,
    sessionId: state.sessionId,
    stage: completedStages,
    score: state.totalXP,
    failCount: state.totalFailCount,
    details: {
      version: 2,
      sessionId: state.sessionId,
      summary: {
        startedAt: state.startedAt,
        lastUpdatedAt: new Date().toISOString(),
        currentStage: state.currentStage,
        completedStages,
        totalStages: TOTAL_STAGES,
        totalXP: state.totalXP,
        score100: state.totalXP,
        rawTotalScore: state.rawTotalScore,
        totalFailCount: state.totalFailCount,
        progressPercent: Math.round((completedStages / TOTAL_STAGES) * 100),
        isCompleted: state.currentStage >= TOTAL_STAGES + 1,
      },
      wordFreqSummary: getWordSummary(state),
      quizSummary,
      stageResults: state.stageResults,
      rawStageResults: state.rawStageResults,
      stageScoreBreakdown,
      stageDetails: buildStageDetails(state),
    },
  };
};

const submitSnapshot = async (payload: ReturnType<typeof buildSnapshotPayload>) => {
  if (!payload.playerName || !payload.sessionId) {
    return;
  }

  try {
    await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.log('Notice: remote saving skipped', error);
  }
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(emptyGameState);

  const handleStart = (name: string) => {
    const nextState: GameState = {
      ...emptyGameState(),
      playerName: name,
      currentStage: 1,
      sessionId: createSessionId(),
      startedAt: new Date().toISOString(),
    };

    setGameState(nextState);
    submitSnapshot(buildSnapshotPayload(nextState));
  };

  const wrapComplete = (stageIdx: number) => {
    return (score: number, extraData?: any, failCount: number = 0) => {
      let nextSnapshot: ReturnType<typeof buildSnapshotPayload> | null = null;

      setGameState(prev => {
        const inferredFailCount = estimateFailCount(extraData);
        const stageFailCount = failCount > 0 ? failCount : inferredFailCount;
        const weightedScore = normalizeStageScore(stageIdx, score);
        const next = { ...prev };
        next.totalXP += weightedScore;
        next.rawTotalScore += score;
        next.stageResults = [...prev.stageResults];
        next.rawStageResults = [...prev.rawStageResults];
        next.stageResults[stageIdx - 1] = weightedScore;
        next.rawStageResults[stageIdx - 1] = score;
        next.stageDetails = { ...prev.stageDetails, [stageIdx]: extraData || {} };
        next.currentStage = stageIdx + 1;
        next.totalFailCount += stageFailCount;
        
        if (stageIdx === 4 && extraData) {
          next.wordFreq = normalizeWordFreq(extraData);
        }
        if (stageIdx === 5) {
          next.cloudWords = Array.isArray(extraData) ? extraData : extraData?.cloudWords || [];
        }
        nextSnapshot = buildSnapshotPayload(next);
        return next;
      });

      if (nextSnapshot) {
        submitSnapshot(nextSnapshot);
      }
    };
  };

  const handleJump = (targetStage: number) => {
    setGameState(prev => ({ ...prev, currentStage: targetStage }));
  };

  return (
    <div className="min-h-screen relative font-sans text-white overflow-hidden pb-20">
      <AITutorProvider playerName={gameState.playerName}>
        <Background />
      
      {gameState.currentStage > 0 && gameState.currentStage <= 7 && (
        <TopBar stage={gameState.currentStage} xp={gameState.totalXP} />
      )}
      
      <main className="w-full h-full px-4 pt-4 pb-20 relative z-10 overflow-y-auto" style={{ height: 'calc(100vh - 60px)' }}>
        <AnimatePresence mode="wait">
          {gameState.currentStage === 0 && (
            <motion.div key="intro" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Intro onStart={handleStart} />
            </motion.div>
          )}

          {gameState.currentStage === 1 && (
            <motion.div key="stage1" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Stage1 onComplete={wrapComplete(1)} />
            </motion.div>
          )}

          {gameState.currentStage === 2 && (
            <motion.div key="stage2" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Stage2 onComplete={wrapComplete(2)} />
            </motion.div>
          )}

          {gameState.currentStage === 3 && (
            <motion.div key="stage4" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Stage4 onComplete={wrapComplete(3)} />
            </motion.div>
          )}

          {gameState.currentStage === 4 && (
            <motion.div key="stage3" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Stage3 onComplete={wrapComplete(4)} />
            </motion.div>
          )}

          {gameState.currentStage === 5 && (
            <motion.div key="stage5" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Stage5 wordFreq={gameState.wordFreq} playerName={gameState.playerName} onComplete={wrapComplete(5)} />
            </motion.div>
          )}

          {gameState.currentStage === 6 && (
            <motion.div key="stage6" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <Stage6 onComplete={wrapComplete(6)} playerName={gameState.playerName} />
            </motion.div>
          )}

          {gameState.currentStage === 7 && (
            <motion.div key="stage7" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="h-full">
              <QuizStage onComplete={wrapComplete(7)} />
            </motion.div>
          )}

          {gameState.currentStage === 8 && (
            <motion.div key="outro" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-full flex flex-col items-center">
              <Outro playerName={gameState.playerName} totalXP={gameState.totalXP} stageResults={gameState.stageResults} />
              
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2 }}
                onClick={() => handleJump(6)} // Jump back to Stage 6 (实战演练)
                className="mt-8 px-10 py-4 bg-brand-cyan/20 border border-brand-cyan text-brand-cyan font-bold rounded-xl text-xl hover:bg-brand-cyan hover:text-white transition shadow-[0_0_20px_rgba(0,255,255,0.4)]"
              >
                🔄 意犹未尽？使用自己的文本再次进入实战实验室
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <TestPanel onJump={handleJump} />
      </AITutorProvider>
    </div>
  );
}
