"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Timer, X, Plus } from 'lucide-react';

const PRIORITIES = [
  { key: 'low',    label: 'Low',    color: 'text-gray-300',  border: 'border-gray-300/20',  activeBg: 'bg-gray-300/10' },
  { key: 'medium', label: 'Medium', color: 'text-[#F9A8AC]', border: 'border-[#F9A8AC]/30', activeBg: 'bg-[#F9A8AC]/10' },
  { key: 'high',   label: 'High',   color: 'text-[#E8414A]', border: 'border-[#E8414A]/40', activeBg: 'bg-[#E8414A]/10' },
];

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueTime, setDueTime] = useState<string>('');
  
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [recurringType, setRecurringType] = useState<'none' | 'daily' | 'weekly' | 'custom'>('none');
  const [recurringInterval, setRecurringInterval] = useState('1');
  const [goalId, setGoalId] = useState<string | null>(null);
  
  const [energyCost, setEnergyCost] = useState(5);
  const [estimatedDuration, setEstimatedDuration] = useState('');
  
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/goals/list');
      if (res.ok) setGoals(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, newSubtask.trim()]);
    setNewSubtask('');
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    let recurring = null;
    if (recurringType !== 'none') {
      recurring = { type: recurringType, interval: recurringType === 'custom' ? parseInt(recurringInterval) || 1 : 1 };
    }
    const payload = {
      title, description,
      dueDate,
      dueTime: dueTime ? dueTime : null,
      priority, recurring, goalId,
      metadata: { energyCost, estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : null },
      subtasks: subtasks.map(t => ({ title: t, done: false })),
    };
    try {
      const res = await fetch('/api/tasks/create', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload) 
      });
      if (res.ok) router.push('/tasks');
      else alert('Failed to create task.');
    } catch (e) {
      alert('Network error.');
    } finally {
      setLoading(false);
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
        <h1 className="text-2xl font-black text-gray-100 tracking-tight">New Task</h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">

        {/* Title & Description */}
        <div className="mb-8">
          {sectionLabel("What needs to be done?")}
          <div className="space-y-3">
            <input
              type="text"
              className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-100 p-4 rounded-2xl text-lg font-bold focus:border-[#E8414A] focus:outline-none placeholder:text-gray-600 transition-colors"
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <textarea
              className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-100 p-4 rounded-2xl text-sm focus:border-[#E8414A] focus:outline-none placeholder:text-gray-600 transition-colors min-h-[100px] resize-none"
              placeholder="Add context or notes... (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Date & Time */}
        <div className="mb-8">
          {sectionLabel("Schedule")}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Calendar size={16} className="text-[#E8414A]" />
              </div>
              <input 
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-100 pl-11 pr-4 py-3.5 rounded-2xl text-sm font-semibold focus:border-[#E8414A] focus:outline-none transition-colors"
              />
            </div>
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Clock size={16} className={dueTime ? "text-[#E8414A]" : "text-gray-500"} />
              </div>
              <input 
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={`w-full bg-[#1F2023] border pl-11 pr-4 py-3.5 rounded-2xl text-sm font-semibold focus:outline-none transition-colors ${dueTime ? 'border-[#E8414A]/40 text-[#E8414A]' : 'border-[#2A2B2F] text-gray-400 focus:border-[#3A3C42]'}`}
              />
            </div>
          </div>
        </div>

        {/* Priority */}
        <div className="mb-8">
          {sectionLabel("Priority")}
          <div className="flex gap-4">
            {PRIORITIES.map(p => (
              <button
                key={p.key}
                onClick={() => setPriority(p.key as any)}
                className={`flex-1 py-3 rounded-2xl border-2 transition-colors font-bold text-sm ${
                  priority === p.key ? `${p.activeBg} ${p.border} ${p.color}` : 'bg-[#1F2023] border-[#2A2B2F] text-gray-500 hover:bg-[#2A2B2F]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subtasks */}
        <div className="mb-8">
          {sectionLabel(`Subtasks (${subtasks.length})`)}
          
          <div className="space-y-2 mb-3">
            {subtasks.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between bg-[#1F2023] border border-[#2A2B2F] rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E8414A] opacity-60" />
                  <span className="text-gray-300 text-sm">{s}</span>
                </div>
                <button onClick={() => setSubtasks(subtasks.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-gray-300 transition-colors">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          
          <div className="flex gap-3">
            <input
              type="text"
              className="flex-1 bg-[#1F2023] border border-[#2A2B2F] text-gray-100 px-4 py-3 rounded-xl text-sm focus:border-[#E8414A] focus:outline-none placeholder:text-gray-600 transition-colors"
              placeholder="Add a subtask..."
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
            />
            <button
              onClick={addSubtask}
              className="w-12 shrink-0 bg-[#E8414A]/10 border border-[#E8414A]/30 rounded-xl flex items-center justify-center hover:bg-[#E8414A]/20 transition-colors"
            >
              <Plus size={20} className="text-[#E8414A]" />
            </button>
          </div>
        </div>

        {/* Recurring */}
        <div className="mb-8">
          {sectionLabel("Repeat")}
          <div className="flex flex-wrap gap-2">
            {(['none', 'daily', 'weekly', 'custom'] as const).map(rt => (
              <button
                key={rt}
                onClick={() => setRecurringType(rt)}
                className={`px-5 py-2.5 rounded-full border text-sm capitalize transition-colors ${
                  recurringType === rt ? 'bg-[#E8414A]/10 border-[#E8414A]/40 text-[#E8414A] font-bold' : 'bg-[#1F2023] border-[#2A2B2F] text-gray-500 font-medium hover:bg-[#2A2B2F]'
                }`}
              >
                {rt}
              </button>
            ))}
          </div>
          
          {recurringType === 'custom' && (
            <div className="flex items-center gap-3 mt-4 bg-[#1F2023] border border-[#2A2B2F] rounded-xl px-4 py-3 max-w-fit">
              <span className="text-gray-500 text-sm">Every</span>
              <input
                type="number"
                min="1"
                className="bg-[#161618] border border-[#2A2B2F] text-gray-100 text-center font-bold px-3 py-1.5 rounded-lg w-16 focus:border-[#3A3C42] focus:outline-none"
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value)}
              />
              <span className="text-gray-500 text-sm">days</span>
            </div>
          )}
        </div>

        {/* Goal Link */}
        {goals.length > 0 && (
          <div className="mb-8">
            {sectionLabel("Link to Goal")}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setGoalId(null)}
                className={`px-5 py-2.5 rounded-full border text-sm transition-colors ${
                  goalId === null ? 'bg-[#2A2B2F] border-transparent text-gray-200 font-medium' : 'bg-[#1F2023] border-[#2A2B2F] text-gray-500 hover:bg-[#2A2B2F]'
                }`}
              >
                None
              </button>
              {goals.map(g => (
                <button
                  key={g.id || g._id}
                  onClick={() => setGoalId(g.id || g._id)}
                  className={`px-5 py-2.5 rounded-full border text-sm transition-colors ${
                    goalId === (g.id || g._id) ? 'bg-[#E8414A]/10 border-[#E8414A]/40 text-[#E8414A] font-bold' : 'bg-[#1F2023] border-[#2A2B2F] text-gray-500 hover:bg-[#2A2B2F]'
                  }`}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Energy Cost */}
        <div className="mb-8">
          {sectionLabel(`Energy Cost — ${energyCost}/10`)}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6">
            <div className="flex justify-between items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                <button
                  key={v}
                  onClick={() => setEnergyCost(v)}
                  className={`flex-1 aspect-square rounded-xl flex items-center justify-center transition-colors ${
                    energyCost >= v ? 'bg-[#E8414A]/15' : 'bg-[#2A2B2F] hover:bg-[#3A3C42]'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${energyCost >= v ? 'bg-[#E8414A]' : 'bg-[#2A2B2F]'}`} />
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>

        {/* Estimated Duration */}
        <div className="mb-10">
          {sectionLabel("Estimated Duration")}
          <div className="flex items-center bg-[#1F2023] border border-[#2A2B2F] rounded-2xl px-5 py-4 focus-within:border-[#E8414A] transition-colors">
            <Timer size={18} className="text-gray-500 mr-4" />
            <input
              type="number"
              className="flex-1 bg-transparent text-gray-100 text-base font-bold focus:outline-none placeholder:text-gray-600 placeholder:font-normal"
              placeholder="Minutes (e.g. 45)"
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
            />
            <span className="text-gray-500 font-bold ml-2">min</span>
          </div>
        </div>

        {/* Submit */}
        <button 
          onClick={handleCreate} 
          disabled={loading || !title.trim()} 
          className={`w-full py-5 rounded-2xl flex items-center justify-center font-black text-sm uppercase tracking-widest transition-colors shadow-lg ${
            !title.trim() ? 'bg-[#1F2023] text-gray-600 border border-[#2A2B2F]' : 'bg-[#E8414A] hover:bg-[#D62C35] text-white'
          }`}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : 'Create Task'}
        </button>

      </div>
    </div>
  );
}
