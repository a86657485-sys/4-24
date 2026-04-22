import React from 'react';
import { motion } from 'motion/react';
import { Zap, Shirt, Moon, Flame, Mountain } from 'lucide-react';

interface Props {
  stage: number;
  xp: number;
}

const STAGES = [
  { id: 1, name: '初识词云', icon: '⚡' },
  { id: 2, name: '文本分词', icon: '✨' },
  { id: 3, name: '过滤清洗', icon: '🌙' },
  { id: 4, name: '词频统计', icon: '🔥' },
  { id: 5, name: '生成词云图', icon: '🔱' },
];

export const TopBar: React.FC<Props> = ({ stage, xp }) => {
  return (
    <div className="h-[80px] w-full px-4 md:px-10 flex items-center justify-between z-50 bg-black/20 border-b border-brand-gold/10">
      
      {/* Route map progress */}
      <div className="flex items-center gap-1 md:gap-3">
        {STAGES.map((s, index) => {
          const isActive = stage >= s.id;
          
          return (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center relative">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-[2px] transition-colors duration-300 \${isActive ? 'border-brand-gold bg-brand-gold text-bg-deep shadow-[0_0_15px_#FFD700]' : 'border-white/20 bg-white/5 text-white/50 text-[14px]'}`}>
                  {s.icon}
                </div>
                <span className={`text-[10px] sm:text-[11px] absolute -bottom-5 whitespace-nowrap font-bold \${isActive ? 'text-brand-gold drop-shadow-md' : 'text-white/40'}`}>
                  {s.name}
                </span>
              </div>
              
              {index < STAGES.length - 1 && (
                <div className={`w-6 sm:w-15 h-[2px] overflow-hidden \${stage > s.id ? 'bg-gradient-to-r from-brand-gold to-brand-gold/10' : 'bg-white/10'}`}>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center gap-2 sm:gap-6 ml-auto">
        <div className="text-[10px] sm:text-xs text-white/50 uppercase tracking-widest hidden sm:block">第 24 课：抽取文本汇词云</div>
        <div className="bg-brand-red/20 border border-brand-red px-3 sm:px-4 py-1 rounded-full text-brand-gold font-bold text-sm">
          评分 <motion.span key={xp} initial={{ scale: 1.5, color: '#fff' }} animate={{ scale: 1, color: '#FFD700' }}>{Math.floor(xp).toString().padStart(3, '0')}</motion.span>/100
        </div>
      </div>
    </div>
  );
};

