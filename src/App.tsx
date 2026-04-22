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

export default function App() {
  const [gameState, setGameState] = useState({
    playerName: "",
    totalXP: 0,
    currentStage: 0,
    stageResults: [] as number[],
    wordFreq: { '悟空': 12, '唐僧': 6, '妖怪': 8 }, // Default fallback
    cloudWords: [] as {text: string, count: number}[]
  });

  const handleStart = (name: string) => {
    setGameState(prev => ({ ...prev, playerName: name, currentStage: 1 }));
  };

  const wrapComplete = (stageIdx: number) => {
    return (score: number, extraData?: any, failCount: number = 0) => {
      // Async POST without awaiting to avoid blocking UI
      fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: gameState.playerName,
          stage: stageIdx,
          score: score,
          failCount: failCount,
          details: extraData || {}
        })
      }).catch(err => console.log('Notice: Local saving skipped', err));

      setGameState(prev => {
        const next = { ...prev };
        next.totalXP += score;
        next.stageResults[stageIdx - 1] = score;
        next.currentStage = stageIdx + 1;
        
        if (stageIdx === 4 && extraData) {
          next.wordFreq = extraData;
        }
        if (stageIdx === 5 && extraData) {
          next.cloudWords = extraData;
        }
        
        return next;
      });
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

