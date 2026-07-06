"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Plus, Dna, Layers, Leaf, Camera, Edit2, Trash2, X, Check 
} from 'lucide-react';
import Image from 'next/image';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function templateCalories(t: any): number {
  if (!t.meals?.length) return 0;
  return t.meals.reduce((sum: number, m: any) => {
    const food = m.foodItemId;
    if (!food?.macros?.calories || !food?.baseWeight) return sum;
    return sum + Math.round((food.macros.calories / food.baseWeight) * (m.customAmount || 100));
  }, 0);
}

export default function FoodLibraryPage() {
  const router = useRouter();
  
  const [foods, setFoods] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'foods' | 'templates'>('foods');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editTemplate, setEditTemplate] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editMeals, setEditMeals] = useState<any[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [foodsRes, templatesRes] = await Promise.all([
        fetch('/api/nutrition/library'),
        fetch('/api/nutrition/templates'),
      ]);
      if (foodsRes.ok) { const d = await foodsRes.json(); setFoods(d.foods || []); }
      if (templatesRes.ok) { const d = await templatesRes.json(); setTemplates(d.templates || []); }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  const openEditTemplate = (t: any) => {
    setEditTemplate(t);
    setEditName(t.name);
    setEditMeals([...(t.meals || [])]);
  };

  const closeEditTemplate = () => {
    setEditTemplate(null);
    setEditName('');
    setEditMeals([]);
  };

  const removeEditMeal = (idx: number) => {
    setEditMeals(prev => prev.filter((_, i) => i !== idx));
  };

  const saveEditTemplate = async () => {
    if (!editTemplate) return;
    if (!editName.trim()) return;
    setIsSavingTemplate(true);
    try {
      const sanitizedMeals = editMeals.map((m: any) => ({
        mealType: m.mealType || 'snack',
        foodItemId: typeof m.foodItemId === 'object' ? m.foodItemId._id || m.foodItemId : m.foodItemId,
        customAmount: m.customAmount || 100,
      }));
      const res = await fetch(`/api/nutrition/templates/${editTemplate._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), meals: sanitizedMeals }),
      });
      if (!res.ok) throw new Error('Failed to update template');
      closeEditTemplate();
      loadLibrary();
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteFood = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/nutrition/library/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFoods(prev => prev.filter(f => f._id !== id));
      } else {
        console.error('Failed to delete food');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  const deleteTemplate = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/nutrition/templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t._id !== id));
      } else {
        console.error('Failed to delete template');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full relative">
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
          >
            <ArrowLeft className="text-gray-400" size={18} />
          </button>
          <h1 className="text-3xl font-black text-gray-100 tracking-tight">Food Library</h1>
        </div>
        <button
          onClick={() => router.push('/nutrition/scan')}
          className="w-10 h-10 rounded-full bg-[#E8414A]/10 border border-[#E8414A]/30 flex items-center justify-center hover:bg-[#E8414A]/20 transition-colors"
        >
          <Plus className="text-[#E8414A]" size={20} />
        </button>
      </div>

      {/* Tab Toggle */}
      <div className="px-6 md:px-12 py-6">
        <div className="flex bg-[#1F2023] p-1.5 rounded-2xl border border-[#2A2B2F]">
          <button
            onClick={() => setActiveTab('foods')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors ${
              activeTab === 'foods' ? 'bg-[#2A2B2F] text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Dna size={16} className={activeTab === 'foods' ? 'text-[#E8414A]' : ''} />
            Custom Foods
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors ${
              activeTab === 'templates' ? 'bg-[#2A2B2F] text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Layers size={16} className={activeTab === 'templates' ? 'text-[#E8414A]' : ''} />
            Day Templates
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin mb-4" />
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Loading Data...</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 md:px-12 pb-24 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          
          {activeTab === 'foods' ? (
            foods.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-[#1F2023] rounded-3xl border border-[#2A2B2F] mt-8">
                <Leaf className="text-[#2A2B2F] mb-4" size={48} />
                <div className="text-xl font-black text-gray-300 mb-2">No verified foods yet.</div>
                <div className="text-sm font-semibold text-gray-500 text-center mb-8 max-w-sm">
                  Scan items with the AI camera to build your personalized library.
                </div>
                <button
                  onClick={() => router.push('/nutrition/scan')}
                  className="flex items-center gap-2 bg-gray-100 hover:bg-white text-[#161618] px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-colors shadow-lg"
                >
                  <Camera size={16} />
                  Scan a Meal
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {foods.map(f => (
                  <div key={f._id} className="flex bg-[#1F2023] rounded-3xl border border-[#2A2B2F] overflow-hidden group hover:border-[#3A3C42] transition-colors">
                    {f.imageUrl && (
                      <div className="w-32 min-h-full bg-[#161618] relative">
                        <Image src={f.imageUrl} alt={f.name} fill className="object-cover" />
                      </div>
                    )}
                    <div className="flex-1 p-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-black text-gray-100 pr-4">{f.name}</h3>
                        <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => router.push(`/nutrition/scan?editFood=${encodeURIComponent(JSON.stringify(f))}`)}
                            className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] text-gray-400 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteFood(f._id, f.name)}
                            disabled={deletingId === f._id}
                            className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-red-900/20 hover:border-red-900/50 hover:text-red-500 text-[#E8414A] transition-colors disabled:opacity-50"
                          >
                            {deletingId === f._id ? <div className="w-3 h-3 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-4">
                        {[
                          { v: `${Math.round(f.macros?.calories || 0)} kcal`, hi: true },
                          { v: `${Math.round(f.macros?.protein || 0)}g P` },
                          { v: `${Math.round(f.macros?.carbs || 0)}g C` },
                          { v: `${Math.round(f.macros?.fats || 0)}g F` },
                        ].map(({ v, hi }) => (
                          <div key={v} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                            hi ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' : 'bg-[#161618] border-[#2A2B2F] text-gray-400'
                          }`}>
                            {v}
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Base: {f.baseWeight}g</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-[#1F2023] rounded-3xl border border-[#2A2B2F] mt-8">
                <Layers className="text-[#2A2B2F] mb-4" size={48} />
                <div className="text-xl font-black text-gray-300 mb-2">No day templates yet.</div>
                <div className="text-sm font-semibold text-gray-500 text-center mb-8 max-w-sm">
                  Combine library foods into one-tap daily layouts.
                </div>
                <button
                  onClick={() => router.push('/nutrition/create-template')}
                  className="bg-gray-100 hover:bg-white text-[#161618] px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-colors shadow-lg"
                >
                  Create Template
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {templates.map(t => {
                  const kcal = templateCalories(t);
                  const created = t.createdAt ? timeAgo(t.createdAt) : '';
                  return (
                    <div key={t._id} className="bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 group hover:border-[#3A3C42] transition-colors">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-xl font-black text-gray-100 mb-1">{t.name}</h3>
                          {created && <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Created {created}</div>}
                        </div>
                        <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditTemplate(t)}
                            className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] text-gray-400 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteTemplate(t._id, t.name)}
                            disabled={deletingId === t._id}
                            className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-red-900/20 hover:border-red-900/50 hover:text-red-500 text-[#E8414A] transition-colors disabled:opacity-50"
                          >
                            {deletingId === t._id ? <div className="w-3 h-3 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="bg-[#E8414A]/10 border border-[#E8414A]/30 px-3 py-1.5 rounded-lg text-[#E8414A] text-xs font-bold">
                          {kcal} kcal
                        </div>
                        <div className="bg-[#161618] border border-[#2A2B2F] px-3 py-1.5 rounded-lg text-gray-400 text-xs font-bold">
                          {t.meals?.length || 0} meals
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => router.push('/nutrition/create-template')}
                  className="w-full flex items-center justify-center gap-2 bg-[#1F2023] rounded-3xl border border-dashed border-[#2A2B2F] p-6 hover:bg-[#2A2B2F] hover:border-[#3A3C42] transition-colors mt-2"
                >
                  <Plus className="text-gray-500" size={18} />
                  <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">Create Another Template</span>
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* ===== EDIT TEMPLATE MODAL ===== */}
      {!!editTemplate && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={closeEditTemplate} />
          <div className="relative w-full max-w-2xl mx-auto bg-[#1F2023] border-t border-[#2A2B2F] rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#2A2B2F]">
              <h2 className="text-xl font-black text-gray-100">Edit Template</h2>
              <button onClick={closeEditTemplate} className="w-8 h-8 rounded-full bg-[#2A2B2F] flex items-center justify-center hover:bg-[#3A3C42] transition-colors">
                <X className="text-gray-400" size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Template Name</div>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-[#161618] text-gray-100 text-lg font-black p-4 rounded-xl border border-[#2A2B2F] focus:border-[#3A3C42] focus:outline-none mb-6"
                placeholder="Template name..."
              />

              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Meals ({editMeals.length})</div>
              {editMeals.length === 0 ? (
                <div className="bg-[#161618] rounded-xl p-6 text-center border border-[#2A2B2F] mb-4">
                  <div className="text-gray-500 font-semibold text-sm">All meals removed. Save to create an empty template.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {editMeals.map((m: any, idx: number) => {
                    const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
                    const foodName = food?.name || 'Unknown Food';
                    const mealType = m.mealType || 'snack';
                    return (
                      <div key={idx} className="bg-[#161618] rounded-xl p-4 flex items-center border border-[#2A2B2F]">
                        <div className="flex-1">
                          <div className="text-gray-100 font-black text-base mb-1">{foodName}</div>
                          <div className="text-gray-500 font-bold text-[10px] uppercase tracking-widest">{mealType} · {m.customAmount}g</div>
                        </div>
                        <button onClick={() => removeEditMeal(idx)} className="w-10 h-10 rounded-lg bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-red-900/20 hover:text-red-500 hover:border-red-900/50 text-[#E8414A] transition-colors ml-4">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={saveEditTemplate}
                disabled={isSavingTemplate}
                className="w-full py-4 mt-8 rounded-xl flex items-center justify-center gap-2 bg-gray-100 hover:bg-white text-[#161618] font-black text-sm uppercase tracking-widest transition-colors shadow-lg disabled:opacity-50"
              >
                {isSavingTemplate ? <div className="w-5 h-5 border-2 border-[#161618] border-t-transparent rounded-full animate-spin" /> : <>
                  <Check size={18} /> Save Changes
                </>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
