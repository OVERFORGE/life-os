"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';

export default function NewGoalPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('identity');
  const [signals, setSignals] = useState<{ key: string; weight: number }[]>([]);
  
  const [availableSignals, setAvailableSignals] = useState<any[]>([]);
  const [selectedSignalKey, setSelectedSignalKey] = useState('');
  
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/signals')
      .then(r => r.json())
      .then(d => {
        if (d.signals) {
          setAvailableSignals(d.signals);
          if (d.signals.length > 0) setSelectedSignalKey(d.signals[0].key);
        }
      })
      .catch(e => console.error("Error loading signals:", e));
  }, []);

  const addSignal = () => {
    if (!selectedSignalKey) return;
    if (signals.find(s => s.key === selectedSignalKey)) return;
    
    setSignals([...signals, { key: selectedSignalKey, weight: 5 }]);
  };

  const removeSignal = (key: string) => {
    setSignals(signals.filter(s => s.key !== key));
  };

  const createGoal = async () => {
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch('/api/goals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, signals })
      });
      const data = await res.json();
      if (data.id) {
        router.push(`/goals/${data.id}`);
      } else {
        router.back();
      }
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  };

  const sectionLabel = (text: string) => (
    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">{text}</div>
  );

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-3xl mx-auto w-full relative">
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ArrowLeft className="text-gray-400" size={18} />
        </button>
        <h1 className="text-2xl font-black text-gray-100 tracking-tight">New Goal</h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
        
        {/* Title */}
        <div className="mb-8">
          {sectionLabel('Goal Title')}
          <input
            type="text"
            className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-100 p-4 rounded-2xl text-lg font-bold focus:border-[#E8414A] focus:outline-none placeholder:text-gray-600 transition-colors"
            placeholder="e.g. Master React Native"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Type */}
        <div className="mb-10">
          {sectionLabel('Goal Type')}
          <div className="flex flex-wrap gap-3">
            {['identity', 'performance', 'maintenance', 'recovery'].map(t => {
              const isSelected = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-5 py-3 rounded-xl border text-sm capitalize transition-colors ${
                    isSelected ? 'bg-[#E8414A]/10 border-[#E8414A]/40 text-[#E8414A] font-black' : 'bg-[#1F2023] border-[#2A2B2F] text-gray-400 font-semibold hover:bg-[#2A2B2F]'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Signals */}
        <div className="mb-10">
          <h2 className="text-gray-100 font-black text-xl mb-6">Tracked Signals</h2>
          
          {/* Add Signal Form */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 mb-6">
            {sectionLabel('Select Signal')}
            <div className="flex flex-wrap gap-2 mb-6">
              {availableSignals.map(s => {
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
          </div>

          {/* List of Added Signals */}
          <div className="space-y-3">
            {signals.map((s, idx) => (
              <div key={s.key} className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="text-gray-100 font-bold text-base mb-1">
                    {availableSignals.find(a => a.key === s.key)?.label || s.key}
                  </div>
                  <div className="text-gray-500 text-xs font-mono">{s.key}</div>
                </div>
                <div className="flex items-center gap-6 w-full md:w-auto">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Weight</span>
                    <input
                      type="number"
                      className="bg-[#161618] border border-[#2A2B2F] text-gray-100 px-3 py-2 rounded-lg text-center w-16 text-sm font-bold focus:border-[#3A3C42] focus:outline-none"
                      value={s.weight}
                      onChange={(e) => {
                        const next = [...signals];
                        next[idx].weight = Number(e.target.value);
                        setSignals(next);
                      }}
                    />
                  </div>
                  <button 
                    onClick={() => removeSignal(s.key)}
                    className="text-[#E8414A] text-xs font-bold hover:text-[#D62C35] transition-colors uppercase tracking-widest"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={createGoal} 
          disabled={creating || !title} 
          className="w-full py-5 rounded-2xl flex items-center justify-center bg-gray-100 hover:bg-white text-[#161618] font-black text-sm uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50"
        >
          {creating ? (
            <div className="w-5 h-5 border-2 border-[#161618] border-t-transparent rounded-full animate-spin" />
          ) : 'Create Goal'}
        </button>
      </div>
    </div>
  );
}
