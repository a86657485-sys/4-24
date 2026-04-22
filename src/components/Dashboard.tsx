import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ArrowLeft, Users, Zap, AlertTriangle } from 'lucide-react';

interface LearningRecord {
  id: number;
  playerName: string;
  stage: number;
  score: number;
  failCount: number;
  details: any;
  timestamp: string;
}

export const Dashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const res = await fetch('/api/records');
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        setRecords(data);
      } catch (err) {
        setError('无法连接本地数据库，请确保使用 npm start 启动了本地服务端。');
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, []);

  const totalStudents = new Set(records.map(r => r.playerName)).size;
  const totalXP = records.reduce((sum, r) => sum + r.score, 0);
  const totalFails = records.reduce((sum, r) => sum + r.failCount, 0);

  // Group by stage
  const stageStats = [1, 2, 3, 4, 5, 6].map(stageId => {
    const stageRecords = records.filter(r => r.stage === stageId);
    return {
      name: `第${stageId}关`,
      avgScore: stageRecords.length ? Math.round(stageRecords.reduce((s, r) => s + r.score, 0) / stageRecords.length) : 0,
      avgFails: stageRecords.length ? Number((stageRecords.reduce((s, r) => s + r.failCount, 0) / stageRecords.length).toFixed(1)) : 0,
      attempts: stageRecords.length
    };
  });

  return (
    <div className="w-full h-full p-4 flex flex-col font-sans text-white max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6 relative z-20">
        <button onClick={onBack} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-brand-cyan to-brand-gold bg-clip-text text-transparent">
          学情数据大屏 (本地化)
        </h1>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-12 h-12 border-4 border-brand-cyan border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-brand-red text-xl">
          <AlertTriangle className="mr-2" /> {error}
        </div>
      ) : (
        <div className="flex flex-col gap-6 flex-1 overflow-y-auto pb-20 relative z-20">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-glass border border-brand-cyan/30 p-6 rounded-2xl flex items-center gap-4">
              <div className="bg-brand-cyan/20 p-4 rounded-xl text-brand-cyan"><Users size={32} /></div>
              <div><p className="text-white/60">参与学生总数</p><p className="text-3xl font-bold">{totalStudents}</p></div>
            </div>
            <div className="bg-glass border border-brand-gold/30 p-6 rounded-2xl flex items-center gap-4">
              <div className="bg-brand-gold/20 p-4 rounded-xl text-brand-gold"><Zap size={32} /></div>
              <div><p className="text-white/60">累计获得经验 (XP)</p><p className="text-3xl font-bold">{totalXP}</p></div>
            </div>
            <div className="bg-glass border border-brand-red/30 p-6 rounded-2xl flex items-center gap-4">
              <div className="bg-brand-red/20 p-4 rounded-xl text-brand-red"><AlertTriangle size={32} /></div>
              <div><p className="text-white/60">题目总试错次数</p><p className="text-3xl font-bold">{totalFails}</p></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px]">
            {/* Chart 1: Average Score per Stage */}
            <div className="bg-glass p-6 rounded-2xl flex flex-col">
              <h2 className="text-lg font-bold mb-4">关卡平均获得 XP</h2>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="name" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  <Bar dataKey="avgScore" name="平均XP" fill="#00ffff" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            {/* Chart 2: Average Fails per Stage */}
            <div className="bg-glass p-6 rounded-2xl flex flex-col">
              <h2 className="text-lg font-bold mb-4">关卡平均试错次数 (易错点分析)</h2>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="name" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  <Bar dataKey="avgFails" name="平均试错次" fill="#ff4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Raw Data Log */}
          <div className="bg-glass p-6 rounded-2xl">
            <h2 className="text-lg font-bold mb-4">最新学习轨迹</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/20 text-white/50">
                    <th className="p-2">时间</th>
                    <th className="p-2">学生</th>
                    <th className="p-2">关卡</th>
                    <th className="p-2">获得XP</th>
                    <th className="p-2">试错次数</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 15).map(r => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-2">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="p-2 font-bold text-brand-cyan">{r.playerName}</td>
                      <td className="p-2">第 {r.stage} 关</td>
                      <td className="p-2 text-brand-gold">+{r.score}</td>
                      <td className="p-2 text-brand-red">{r.failCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
