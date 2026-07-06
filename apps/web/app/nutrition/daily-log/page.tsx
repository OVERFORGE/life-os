"use client";

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, Trash2, Coffee, Sun, Moon, Apple, Activity, Zap, 
  BookOpen, Layers, X, Plus, Minus, Check 
} from 'lucide-react';

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MEAL_ICONS: Record<string, any> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snack: Apple,
};

type SheetMode = null | 'library' | 'template';

function scaledMacros(macros: any, baseWeight: number, amount: number) {
  if (!macros || !baseWeight) return { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const r = amount / baseWeight;
  return {
    calories: Math.round((macros.calories || 0) * r),
    protein: Math.round((macros.protein || 0) * r * 10) / 10,
    carbs: Math.round((macros.carbs || 0) * r * 10) / 10,
    fats: Math.round((macros.fats || 0) * r * 10) / 10,
  };
}

function MacroChip({ label, value, unit = 'g' }: { label: string, value: number, unit?: string }) {
  return (
    <div className="flex flex-col items-center flex-1">
      <div className="text-xl font-black text-gray-100">{value}{unit}</div>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

function DailyLogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams?.get('date');

  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [library, setLibrary] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [selectedFood, setSelectedFood] = useState<any | null>(null);
  const [logAmount, setLogAmount] = useState('100');
  const [logQuantity, setLogQuantity] = useState(1);
  const [isLogging, setIsLogging] = useState(false);

  const now = new Date();
  const today = getLocalDateString();
  const targetDate = dateParam || today;
  const isToday = targetDate === today;

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const [logRes, libRes, tplRes] = await Promise.allSettled([
        fetch(`/api/nutrition/log?date=${targetDate}&_t=${Date.now()}`),
        fetch('/api/nutrition/library'),
        fetch('/api/nutrition/templates'),
      ]);

      if (logRes.status === 'fulfilled' && logRes.value.ok) {
        const data = await logRes.value.json();
        setLog(data.log || null);
      }
      if (libRes.status === 'fulfilled' && libRes.value.ok) {
        const data = await libRes.value.json();
        setLibrary(data.foods || []);
      }
      if (tplRes.status === 'fulfilled' && tplRes.value.ok) {
        const data = await tplRes.value.json();
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const deleteMeal = async (mealIndex: number) => {
    if (!log) return;
    setDeletingId(`${mealIndex}`);
    try {
      const newMeals = (log.meals || []).filter((_: any, i: number) => i !== mealIndex);
      const dailyTotals = newMeals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      const sanitizedMeals = newMeals.map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, meals: sanitizedMeals, dailyTotals }),
      });
      if (res.ok) {
        loadLog();
      } else {
        console.error('Delete failed');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  const logFoodItem = async (food: any, amount: number, mealType = 'snack', quantity: number = 1) => {
    const m = scaledMacros(food.macros, food.baseWeight, amount);
    const existingMeals: any[] = (log?.meals || []).map((ml: any) => ({
      mealType: ml.mealType || 'snack',
      foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
      amount: ml.amount || 100,
      macros: ml.macros,
    }));
    const newMeals = Array.from({ length: quantity }, () => ({ mealType, foodItemId: food._id, amount, macros: m }));
    const meals = [...existingMeals, ...newMeals];
    const dailyTotals = meals.reduce((acc: any, ml: any) => ({
      calories: acc.calories + (ml.macros?.calories || 0),
      protein: acc.protein + (ml.macros?.protein || 0),
      carbs: acc.carbs + (ml.macros?.carbs || 0),
      fats: acc.fats + (ml.macros?.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    const res = await fetch('/api/nutrition/log', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: targetDate, meals, dailyTotals }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to log food'); }
  };

  const confirmLogFood = async () => {
    if (!selectedFood) return;
    const amt = parseInt(logAmount) || 100;
    setIsLogging(true);
    try {
      await logFoodItem(selectedFood, amt, 'snack', logQuantity);
      setSheetMode(null); setSelectedFood(null); setLogQuantity(1);
      await loadLog();
    } catch (e: any) { 
      console.error(e);
    } finally { 
      setIsLogging(false); 
    }
  };

  const logWholeTemplate = async (template: any) => {
    setIsLogging(true);
    try {
      let newMeals: any[] = (log?.meals || []).map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      for (const m of template.meals || []) {
        const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
        const id = food?._id || m.foodItemId;
        if (!id) continue;
        const resolved = food && food.macros ? food : library.find(f => String(f._id) === String(id));
        if (!resolved?.macros) continue;
        const scaled = scaledMacros(resolved.macros, resolved.baseWeight, m.customAmount || resolved.baseWeight);
        newMeals.push({ mealType: m.mealType || 'snack', foodItemId: id, amount: m.customAmount || resolved.baseWeight, macros: scaled });
      }

      const dailyTotals = newMeals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      const res = await fetch('/api/nutrition/log', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, meals: newMeals, dailyTotals }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }

      setSheetMode(null);
      await loadLog();
    } catch (e: any) { 
      console.error(e);
    } finally { 
      setIsLogging(false); 
    }
  };

  const closeSheet = () => { setSheetMode(null); setSelectedFood(null); };

  const totals = log?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const meals: any[] = log?.meals || [];

  const grouped: Record<string, { meal: any; index: number }[]> = {};
  meals.forEach((m, i) => {
    const key = m.mealType || 'snack';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ meal: m, index: i });
  });

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full relative">
      
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ArrowLeft className="text-gray-400" size={18} />
        </button>
        <div>
          <h1 className="text-3xl font-black text-gray-100 tracking-tight">
            {isToday ? "Today's Log" : "Daily Log"}
          </h1>
          <p className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase mt-1">
            {targetDate}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
          
          {/* Daily Totals Card */}
          <div className="bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 md:p-8 mb-10">
            <div className="flex items-center mb-6">
              <Activity className="text-[#E8414A]" size={16} />
              <span className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase ml-3">
                Daily Totals
              </span>
            </div>
            
            <div className="flex items-baseline mb-8">
              <span className="text-5xl md:text-6xl font-black text-gray-100 tracking-tighter">
                {Math.round(totals.calories)}
              </span>
              <span className="text-sm font-bold text-[#E8414A] ml-2 tracking-widest">KCAL</span>
            </div>
            
            <div className="flex justify-between items-center pt-6 border-t border-[#2A2B2F]">
              <MacroChip label="Protein" value={Math.round(totals.protein || 0)} />
              <div className="w-px h-8 bg-[#2A2B2F]" />
              <MacroChip label="Carbs" value={Math.round(totals.carbs || 0)} />
              <div className="w-px h-8 bg-[#2A2B2F]" />
              <MacroChip label="Fats" value={Math.round(totals.fats || 0)} />
            </div>
          </div>

          {/* Meals */}
          {meals.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-[#1F2023] rounded-3xl border border-[#2A2B2F]">
              <Zap className="text-[#2A2B2F] mb-4" size={48} />
              <div className="text-lg font-black text-gray-300 mb-2">Nothing logged yet</div>
              <div className="text-sm font-semibold text-gray-500 text-center">
                Use the buttons below to log from the library or apply a template.
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {mealOrder.filter(key => grouped[key]).map(key => {
                const Icon = MEAL_ICONS[key] || Apple;
                return (
                  <div key={key}>
                    <div className="flex items-center mb-4 ml-1">
                      <Icon className="text-[#E8414A]" size={16} />
                      <span className="text-[10px] font-bold text-[#E8414A] uppercase tracking-[0.2em] ml-2">
                        {key}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      {grouped[key].map(({ meal: m, index: i }) => {
                        const foodName = typeof m.foodItemId === 'object' ? m.foodItemId?.name : m.name || 'Unknown Food';
                        return (
                          <div key={i} className="flex items-center bg-[#1F2023] rounded-2xl p-5 border border-[#2A2B2F]">
                            <div className="flex-1">
                              <div className="text-base font-bold text-gray-100 mb-2">{foodName}</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="bg-[#161618] px-2 py-1 rounded-lg border border-[#2A2B2F] text-xs font-bold text-gray-300">
                                  {m.amount}g
                                </span>
                                {m.macros?.calories ? <span className="text-xs font-semibold text-gray-500">{Math.round(m.macros.calories)} kcal</span> : null}
                                {m.macros?.protein ? <span className="text-xs font-semibold text-gray-500">· {Math.round(m.macros.protein)}g P</span> : null}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteMeal(i)}
                              disabled={deletingId === `${i}`}
                              className="w-10 h-10 rounded-xl bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-red-900/20 hover:border-red-900/50 hover:text-red-500 transition-colors ml-4 text-gray-500 disabled:opacity-50"
                            >
                              {deletingId === `${i}` ? (
                                <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions Footer */}
      <div className="absolute bottom-6 left-6 right-6 flex gap-4 md:px-6">
        <button 
          onClick={() => setSheetMode('library')} 
          className="flex-1 py-4 bg-gray-100 hover:bg-white rounded-2xl text-[#161618] font-black text-base transition-colors shadow-lg shadow-black/20"
        >
          Log Food
        </button>
        <button 
          onClick={() => setSheetMode('template')} 
          className="flex-1 py-4 bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] rounded-2xl text-gray-100 font-black text-base transition-colors shadow-lg shadow-black/20"
        >
          Use Template
        </button>
      </div>

      {/* ═══════════════ BOTTOM SHEET OVERLAYS ═══════════════ */}
      {sheetMode !== null && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={closeSheet} />
          
          <div className="relative w-full max-w-2xl mx-auto bg-[#1F2023] border-t border-[#2A2B2F] rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            
            <div className="flex items-center justify-between p-6 border-b border-[#2A2B2F]">
              <h2 className="text-xl font-black text-gray-100">
                {sheetMode === 'library' ? (selectedFood ? 'Set Amount' : 'From Library') : 'Apply Day Template'}
              </h2>
              <button onClick={closeSheet} className="w-8 h-8 rounded-full bg-[#2A2B2F] flex items-center justify-center hover:bg-[#3A3C42] transition-colors">
                <X className="text-gray-400" size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {sheetMode === 'library' && !selectedFood && (
                <div className="space-y-3">
                  {library.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="text-gray-600 mx-auto mb-4" size={40} />
                      <p className="text-gray-400 font-semibold">Your library is empty. Go to home dashboard to scan meals.</p>
                    </div>
                  ) : (
                    library.map(food => (
                      <button key={food._id} onClick={() => { setSelectedFood(food); setLogAmount(String(food.baseWeight || 100)); setLogQuantity(1); }} className="w-full flex items-center bg-[#161618] p-4 rounded-2xl border border-[#2A2B2F] hover:border-[#3A3C42] transition-colors text-left group">
                        <div className="flex-1">
                          <div className="text-base font-bold text-gray-100 mb-1">{food.name}</div>
                          <div className="text-xs font-semibold text-gray-500">{food.macros?.calories} kcal · {food.macros?.protein}g P · base {food.baseWeight}g</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {sheetMode === 'library' && selectedFood && (
                <div className="space-y-6">
                  <button onClick={() => setSelectedFood(null)} className="flex items-center text-sm font-bold text-[#E8414A] hover:text-[#D62C35] transition-colors">
                    ← Back
                  </button>
                  
                  <div>
                    <h3 className="text-2xl font-black text-gray-100 mb-1">{selectedFood.name}</h3>
                    <p className="text-sm font-semibold text-gray-500">Set the amount to log</p>
                  </div>

                  {(() => {
                    const m = scaledMacros(selectedFood.macros, selectedFood.baseWeight, parseInt(logAmount) || 100);
                    const totalM = {
                      calories: m.calories * logQuantity,
                      protein: Math.round(m.protein * logQuantity * 10) / 10,
                      carbs: Math.round(m.carbs * logQuantity * 10) / 10,
                      fats: Math.round(m.fats * logQuantity * 10) / 10,
                    };
                    return (
                      <div className="flex justify-between bg-[#161618] rounded-2xl p-6 border border-[#2A2B2F]">
                        {[{ v: totalM.calories, l: 'KCAL' }, { v: totalM.protein, l: 'P' }, { v: totalM.carbs, l: 'C' }, { v: totalM.fats, l: 'F' }].map(({ v, l }) => (
                          <div key={l} className="text-center">
                            <div className="text-2xl font-black text-gray-100">{Math.round(v)}{l !== 'KCAL' ? 'g' : ''}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{l}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center mb-3">Grams</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setLogAmount(String(Math.max(10, parseInt(logAmount) - 10)))} className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Minus className="text-gray-400" size={16} /></button>
                        <div className="flex-1 bg-[#161618] rounded-xl border border-[#2A2B2F] py-2">
                          <input type="number" value={logAmount} onChange={(e) => setLogAmount(e.target.value)} className="w-full bg-transparent text-center text-xl font-black text-gray-100 focus:outline-none" />
                        </div>
                        <button onClick={() => setLogAmount(String((parseInt(logAmount) || 0) + 10))} className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Plus className="text-gray-400" size={16} /></button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center mb-3">Quantity</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setLogQuantity(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Minus className="text-gray-400" size={16} /></button>
                        <div className="flex-1 bg-[#161618] rounded-xl border border-[#2A2B2F] py-2.5 text-center">
                          <span className="text-xl font-black text-gray-100">{logQuantity}</span>
                        </div>
                        <button onClick={() => setLogQuantity(q => q + 1)} className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Plus className="text-gray-400" size={16} /></button>
                      </div>
                    </div>
                  </div>

                  <button onClick={confirmLogFood} disabled={isLogging} className="w-full py-4 rounded-xl bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 transition-colors mt-4 text-white font-black text-lg flex justify-center items-center">
                    {isLogging ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Log to ${targetDate}`}
                  </button>
                </div>
              )}

              {sheetMode === 'template' && (
                <div className="space-y-3">
                  {templates.length === 0 ? (
                    <div className="text-center py-12">
                      <Layers className="text-gray-600 mx-auto mb-4" size={40} />
                      <p className="text-gray-400 font-semibold mb-6">No templates yet.</p>
                    </div>
                  ) : (
                    templates.map(t => {
                      const tplCals = (t.meals || []).reduce((sum: number, m: any) => {
                        const food = typeof m.foodItemId === 'object' ? m.foodItemId : library.find(f => String(f._id) === String(m.foodItemId));
                        if (!food?.macros) return sum;
                        const r = (m.customAmount || food.baseWeight) / food.baseWeight;
                        return sum + Math.round(food.macros.calories * r);
                      }, 0);
                      return (
                        <button key={t._id} onClick={() => logWholeTemplate(t)} disabled={isLogging} className="w-full flex items-center bg-[#161618] p-5 rounded-2xl border border-[#2A2B2F] hover:border-[#3A3C42] transition-colors text-left group">
                          <div className="flex-1">
                            <div className="text-lg font-bold text-gray-100 mb-1">{t.name}</div>
                            <div className="text-xs font-semibold text-gray-500">{t.meals?.length || 0} meals{tplCals > 0 ? ` · ${tplCals} kcal` : ''}</div>
                          </div>
                          {isLogging ? <div className="w-5 h-5 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" /> : <Check className="text-[#E8414A] opacity-0 group-hover:opacity-100 transition-opacity" size={20} />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DailyLogPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex justify-center items-center h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
      </div>
    }>
      <DailyLogContent />
    </Suspense>
  );
}
