"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Plus, Zap, AlertTriangle } from 'lucide-react';

function StateBadge({ state }: { state: string }) {
  const map: any = {
    on_track: { bg: 'bg-[#E8414A]/10', text: 'text-[#E8414A]', border: 'border-[#E8414A]/30' },
    slow: { bg: 'bg-[#F9A8AC]/10', text: 'text-[#F9A8AC]', border: 'border-[#F9A8AC]/30' },
    drifting: { bg: 'bg-[#B42129]/10', text: 'text-[#B42129]', border: 'border-[#B42129]/30' },
    stalled: { bg: 'bg-white/5', text: 'text-gray-400', border: 'border-white/10' },
    recovering: { bg: 'bg-white/10', text: 'text-white', border: 'border-white/20' },
    unknown: { bg: 'bg-white/5', text: 'text-gray-500', border: 'border-white/10' },
  };
  const style = map[state] || map.unknown;
  
  return (
    <div className={`px-3 py-1 rounded-full border ${style.bg} ${style.border}`}>
      <span className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>
        {state.replace('_', ' ')}
      </span>
    </div>
  );
}

export default function GoalDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [draftSignals, setDraftSignals] = useState<{ key: string; weight: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const [availableSignals, setAvailableSignals] = useState<any[]>([]);
  const [selectedSignalKey, setSelectedSignalKey] = useState('');

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    setLoading(true);
    try {
      const [goalRes, sigRes] = await Promise.all([
        fetch(`/api/goals/${id}`),
        fetch('/api/signals'),
      ]);

      if (goalRes.ok) {
        const d = await goalRes.json();
        setData(d);
        if (d?.goal?.signals) setDraftSignals(d.goal.signals);
      }

      if (sigRes.ok) {
        const sigData = await sigRes.json();
        const sigs = sigData.signals || [];
        setAvailableSignals(sigs);
        if (sigs.length > 0) setSelectedSignalKey(sigs[0].key);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const addSignal = () => {
    if (!selectedSignalKey) return;
    if (draftSignals.find(s => s.key === selectedSignalKey)) return;
    setDraftSignals([...draftSignals, { key: selectedSignalKey, weight: 5 }]);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      await fetch(`/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals: draftSignals, rules: data.goal.rules })
      });
      setIsEditing(false);
      await loadAll();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const deleteGoal = async () => {
    if (window.confirm("Are you sure you want to delete this goal?")) {
      try {
        await fetch(`/api/goals/${id}`, { method: 'DELETE' });
        router.push('/goals');
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
    </div>
  );

  if (!data || data.error) return (
    <div className="h-full flex flex-col items-center justify-center">
      <p className="text-[#E8414A] font-bold text-lg mb-4">Goal not found.</p>
      <button 
        onClick={() => router.push('/goals')}
        className="px-6 py-3 bg-[#1F2023] border border-[#2A2B2F] rounded-xl text-gray-300 font-bold hover:bg-[#2A2B2F] transition-colors"
      >
        Go Back
      </button>
    </div>
  );

  const { goal, stats, explanation, pressure } = data;

  const getLabel = (key: string) => {
    const sig = availableSignals.find(s => s.key === key);
    return sig?.label || key;
  };

  const unaddedSignals = availableSignals.filter(s => !draftSignals.find(d => d.key === s.key));

  const sectionLabel = (text: string) => (
    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">{text}</div>
  );

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-4xl mx-auto w-full relative">
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => router.push('/goals')}
            className="w-10 h-10 shrink-0 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
          >
            <ArrowLeft className="text-gray-400" size={18} />
          </button>
          <h1 className="text-2xl font-black text-gray-100 tracking-tight truncate">{goal.title}</h1>
        </div>

        {!isEditing ? (
          <button 
            onClick={() => setIsEditing(true)} 
            className="ml-4 px-5 py-2 bg-[#1F2023] border border-[#2A2B2F] rounded-xl text-gray-100 font-bold hover:bg-[#2A2B2F] transition-colors"
          >
            Edit
          </button>
        ) : (
          <button 
            onClick={() => { setIsEditing(false); setDraftSignals(goal.signals || []); }} 
            className="ml-4 px-5 py-2 bg-[#1F2023] border border-[#2A2B2F] rounded-xl text-gray-500 font-bold hover:bg-[#2A2B2F] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">

        {/* Stats */}
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 mb-6 flex justify-between items-center">
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Current Score</div>
            <div className="text-4xl font-black text-gray-100">{stats?.currentScore ?? 0}%</div>
          </div>
          <div className="flex items-center gap-4">
            <StateBadge state={stats?.state || 'unknown'} />
            {isEditing && (
              <button 
                onClick={deleteGoal} 
                className="p-3 bg-[#B42129]/10 border border-[#B42129]/30 rounded-xl hover:bg-[#B42129]/20 transition-colors"
              >
                <Trash2 size={20} className="text-[#B42129]" />
              </button>
            )}
          </div>
        </div>

        {/* Pressure Info */}
        {pressure && pressure.status !== 'aligned' && (
          <div className="bg-[#B42129]/10 border border-[#B42129]/30 rounded-3xl p-6 md:p-8 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-[#E8414A]" />
              <div className="text-[#E8414A] font-black uppercase tracking-widest text-xs">{pressure.status} Load</div>
            </div>
            {pressure.reasons?.map((r: string, i: number) => (
              <div key={i} className="flex items-start mb-2 last:mb-0">
                <span className="text-[#E8414A] mr-3 mt-1">•</span>
                <span className="text-gray-300 text-sm leading-relaxed">{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Explanation Summary */}
        {!isEditing && explanation?.summary && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={16} className="text-[#E8414A]" />
              {sectionLabel('Jarvis Analysis')}
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{explanation.summary}</p>
          </div>
        )}

        {/* Signals Section */}
        <div className="mb-6">
          <h2 className="text-gray-100 font-black text-xl mb-6">Tracked Signals</h2>

          {draftSignals.length === 0 && (
            <p className="text-gray-500 text-sm mb-6 font-semibold">
              No signals tracked yet. {isEditing ? 'Add some below.' : 'Tap Edit to add signals.'}
            </p>
          )}

          <div className="space-y-4">
            {draftSignals.map((s, idx) => (
              <div key={s.key} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6">
                <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${!isEditing && explanation?.signals ? 'mb-4' : ''}`}>
                  <div>
                    <div className="text-gray-100 font-bold text-base mb-1">{getLabel(s.key)}</div>
                    <div className="text-gray-500 text-xs font-mono">{s.key}</div>
                  </div>
                  
                  {isEditing ? (
                    <div className="flex items-center gap-6 w-full md:w-auto">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Wt</span>
                        <input
                          type="number"
                          className="bg-[#161618] border border-[#2A2B2F] text-gray-100 px-3 py-2 rounded-lg text-center w-16 text-sm font-bold focus:border-[#3A3C42] focus:outline-none"
                          value={s.weight}
                          onChange={(e) => {
                            const next = [...draftSignals];
                            next[idx].weight = Number(e.target.value) || 0;
                            setDraftSignals(next);
                          }}
                        />
                      </div>
                      <button 
                        onClick={() => setDraftSignals(draftSignals.filter((_, i) => i !== idx))}
                        className="text-[#E8414A] text-xs font-bold hover:text-[#D62C35] transition-colors uppercase tracking-widest"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-400 text-xs font-bold bg-[#161618] border border-[#2A2B2F] px-3 py-1.5 rounded-lg">
                      Weight: {s.weight}
                    </div>
                  )}
                </div>

                {/* Sparkline for historical signal hits */}
                {!isEditing && explanation?.signals && (() => {
                  const vals = explanation.signals.find((x: any) => x.key === s.key)?.values;
                  if (!vals?.length) return null;
                  return (
                    <div className="flex gap-1.5 mt-2">
                      {vals.map((v: number, i: number) => (
                        <div 
                          key={i} 
                          className={`flex-1 h-2 rounded-full ${v ? 'bg-[#E8414A] opacity-90' : 'bg-[#161618] opacity-40'}`} 
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Signal Picker (edit mode only) */}
          {isEditing && (
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 mt-6">
              {sectionLabel('Add Signal')}
              
              {unaddedSignals.length === 0 ? (
                <p className="text-gray-500 text-sm font-semibold">All available signals are already added.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {unaddedSignals.map(s => {
                      const isSelected = selectedSignalKey === s.key;
                      return (
                        <button
                          key={s.key}
                          onClick={() => setSelectedSignalKey(s.key)}
                          className={`px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                            isSelected ? 'bg-[#E8414A]/10 border-[#E8414A]/40 text-[#E8414A] font-bold' : 'bg-[#161618] border-[#2A2B2F] text-gray-500 font-medium hover:bg-[#2A2B2F]'
                          }`}
                        >
                          {s.label || s.key}
                        </button>
                      );
                    })}
                  </div>
                  <button 
                    onClick={addSignal} 
                    className="w-full bg-[#161618] border border-[#2A2B2F] hover:bg-[#2A2B2F] p-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <Plus size={18} className="text-gray-300" />
                    <span className="text-gray-300 font-bold text-sm">Add Signal</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {isEditing && (
          <button 
            onClick={saveChanges} 
            disabled={saving} 
            className="w-full py-5 rounded-2xl flex items-center justify-center bg-[#E8414A] hover:bg-[#D62C35] text-white font-black text-sm uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50 mt-6"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : 'Save Changes'}
          </button>
        )}
      </div>
    </div>
  );
}
