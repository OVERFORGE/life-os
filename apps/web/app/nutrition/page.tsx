"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Camera, Activity, ChevronRight, BookOpen, Layers, X, Plus, Minus, Check, ArrowLeft, CalendarDays 
} from 'lucide-react';

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DayIntake { calories: number; protein: number; carbs: number; fats: number; }
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

export default function NutritionDashboard() {
  const router = useRouter();

  const [intake, setIntake] = useState<DayIntake>({ calories: 0, protein: 0, carbs: 0, fats: 0 });
  const [library, setLibrary] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [selectedFood, setSelectedFood] = useState<any | null>(null);
  const [logAmount, setLogAmount] = useState('100');
  const [logQuantity, setLogQuantity] = useState(1);
  const [isLogging, setIsLogging] = useState(false);

  const fetchAll = useCallback(async () => {
    const today = getLocalDateString();
    try {
      const [logRes, libRes, tplRes] = await Promise.allSettled([
        fetch(`/api/nutrition/log?date=${today}`),
        fetch('/api/nutrition/library'),
        fetch('/api/nutrition/templates'),
      ]);

      if (logRes.status === 'fulfilled' && logRes.value.ok) {
        const d = await logRes.value.json();
        const t = d.log?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
        setIntake(t);
      }
      if (libRes.status === 'fulfilled' && libRes.value.ok) {
        const d = await libRes.value.json();
        setLibrary(d.foods || []);
      }
      if (tplRes.status === 'fulfilled' && tplRes.value.ok) {
        const d = await tplRes.value.json();
        setTemplates(d.templates || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setInitialLoading(false));
  }, [fetchAll]);

  const logFoodItem = async (food: any, amount: number, mealType = 'snack', quantity: number = 1) => {
    const today = getLocalDateString();
    const m = scaledMacros(food.macros, food.baseWeight, amount);
    const getRes = await fetch(`/api/nutrition/log?date=${today}`);
    const existing = getRes.ok ? (await getRes.json()).log : null;
    const existingMeals: any[] = (existing?.meals || []).map((ml: any) => ({
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
      body: JSON.stringify({ date: today, meals, dailyTotals }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to log food'); }
  };

  const confirmLogFood = async () => {
    if (!selectedFood) return;
    const amt = parseInt(logAmount) || 100;
    setIsLogging(true);
    try {
      await logFoodItem(selectedFood, amt, 'snack', logQuantity);
      setSheetMode(null); 
      setSelectedFood(null); 
      setLogQuantity(1);
      await fetchAll();
    } catch (e: any) { 
      console.error('Log Failed', e.message); 
    } finally { 
      setIsLogging(false); 
    }
  };

  const logWholeTemplate = async (template: any) => {
    setIsLogging(true);
    try {
      const today = getLocalDateString();
      const getRes = await fetch(`/api/nutrition/log?date=${today}`);
      const existing = getRes.ok ? (await getRes.json()).log : null;
      let meals: any[] = (existing?.meals || []).map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      for (const m of template.meals || []) {
        const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
        const id   = food?._id || m.foodItemId;
        if (!id) continue;

        const resolved = food && food.macros ? food : library.find(f => String(f._id) === String(id));
        if (!resolved?.macros) continue;

        const scaled = scaledMacros(resolved.macros, resolved.baseWeight, m.customAmount || resolved.baseWeight);
        meals.push({ mealType: m.mealType || 'snack', foodItemId: id, amount: m.customAmount || resolved.baseWeight, macros: scaled });
      }

      const dailyTotals = meals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      const res = await fetch('/api/nutrition/log', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, meals, dailyTotals }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }

      setSheetMode(null);
      await fetchAll();
    } catch (e: any) { 
      console.error('Log Failed', e.message); 
    } finally { 
      setIsLogging(false); 
    }
  };

  const closeSheet = () => { setSheetMode(null); setSelectedFood(null); };

  if (initialLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin mb-4" />
        <p className="text-gray-400 text-sm font-bold">Loading telemetry...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.push('/dashboard')}
          className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ArrowLeft className="text-gray-400" size={18} />
        </button>
        <div>
          <h1 className="text-3xl font-black text-gray-100 tracking-tight">Nutrition</h1>
          <p className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase mt-1">
            Metabolic Telemetry
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        
        {/* Today's Intake Widget */}
        <button
          onClick={() => router.push('/nutrition/daily-log')}
          className="w-full bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 md:p-8 mb-8 text-left hover:border-[#3A3C42] transition-colors group"
        >
          <div className="flex items-center mb-6">
            <Activity className="text-[#E8414A]" size={16} />
            <span className="text-[10px] font-bold text-gray-300 tracking-[0.2em] uppercase ml-3">
              Today's Intake
            </span>
            <div className="flex-1" />
            <ChevronRight className="text-gray-500 group-hover:text-gray-300 transition-colors" size={18} />
          </div>
          
          <div className="flex items-baseline mb-8">
            <span className="text-5xl md:text-6xl font-black text-gray-100 tracking-tighter">
              {Math.round(intake.calories || 0)}
            </span>
            <span className="text-sm font-bold text-[#E8414A] ml-2">KCAL</span>
          </div>
          
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#2A2B2F]">
            {[
              { label: 'Protein', value: Math.round(intake.protein || 0) },
              { label: 'Carbs', value: Math.round(intake.carbs || 0) },
              { label: 'Fats', value: Math.round(intake.fats || 0) },
            ].map(item => (
              <div key={item.label}>
                <div className="text-2xl font-black text-gray-100">{item.value}g</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </button>

        {/* Log Food Section */}
        <div className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase mb-4 ml-1">
          Log Food
        </div>

        <button
          onClick={() => router.push('/nutrition/scan')}
          className="w-full flex items-center bg-gray-100 p-4 rounded-2xl mb-3 hover:bg-white transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#161618] flex items-center justify-center mr-4">
            <Camera className="text-gray-100" size={20} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-[#161618] mb-1">AI Meal Scan</div>
            <div className="text-xs font-semibold text-[#161618]/60">Analyze food macros via camera/image</div>
          </div>
          <ChevronRight className="text-[#161618]/30 group-hover:text-[#161618]/60 transition-colors" size={20} />
        </button>

        <button
          onClick={() => setSheetMode('library')}
          className="w-full flex items-center bg-[#1F2023] border border-[#2A2B2F] p-4 rounded-2xl mb-3 hover:bg-[#2A2B2F] transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#2A2B2F] flex items-center justify-center mr-4 group-hover:bg-[#3A3C42] transition-colors">
            <BookOpen className="text-gray-300" size={18} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-gray-100 mb-1">From Library</div>
            <div className="text-xs font-semibold text-gray-500">
              {library.length > 0 ? `${library.length} foods saved` : 'Pick a saved food & log it'}
            </div>
          </div>
          <ChevronRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        <button
          onClick={() => setSheetMode('template')}
          className="w-full flex items-center bg-[#1F2023] border border-[#2A2B2F] p-4 rounded-2xl mb-8 hover:bg-[#2A2B2F] transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/20 flex items-center justify-center mr-4">
            <Layers className="text-[#E8414A]" size={18} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-gray-100 mb-1">Use Day Template</div>
            <div className="text-xs font-semibold text-gray-500">
              {templates.length > 0 ? `${templates.length} template${templates.length > 1 ? 's' : ''} available` : 'Log an entire day in one tap'}
            </div>
          </div>
          <ChevronRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        <div className="h-px bg-[#2A2B2F] mb-8" />

        {/* Manage Section */}
        <div className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase mb-4 ml-1">
          Manage
        </div>

        <button
          onClick={() => router.push('/nutrition/library')}
          className="w-full flex items-center bg-[#1F2023] border border-[#2A2B2F] p-4 rounded-2xl mb-3 hover:bg-[#2A2B2F] transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#2A2B2F] flex items-center justify-center mr-4 group-hover:bg-[#3A3C42] transition-colors">
            <BookOpen className="text-gray-300" size={18} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-gray-100 mb-1">Food Library</div>
            <div className="text-xs font-semibold text-gray-500">Custom foods & day templates</div>
          </div>
          <ChevronRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        <button
          onClick={() => router.push('/nutrition/history')}
          className="w-full flex items-center bg-[#1F2023] border border-[#2A2B2F] p-4 rounded-2xl mb-12 hover:bg-[#2A2B2F] transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#2A2B2F] flex items-center justify-center mr-4 group-hover:bg-[#3A3C42] transition-colors">
            <CalendarDays className="text-gray-300" size={18} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-gray-100 mb-1">History</div>
            <div className="text-xs font-semibold text-gray-500">View past logs and weekly data</div>
          </div>
          <ChevronRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

      </div>

      {/* ═══════════════ BOTTOM SHEET OVERLAYS ═══════════════ */}
      {sheetMode !== null && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={closeSheet}
          />
          
          {/* Sheet */}
          <div className="relative w-full max-w-2xl mx-auto bg-[#1F2023] border-t border-[#2A2B2F] rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            
            <div className="flex items-center justify-between p-6 border-b border-[#2A2B2F]">
              <h2 className="text-xl font-black text-gray-100">
                {sheetMode === 'library' ? 'Log from Library' : 'Use Day Template'}
              </h2>
              <button 
                onClick={closeSheet}
                className="w-8 h-8 rounded-full bg-[#2A2B2F] flex items-center justify-center hover:bg-[#3A3C42] transition-colors"
              >
                <X className="text-gray-400" size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              
              {/* Library: food list */}
              {sheetMode === 'library' && !selectedFood && (
                <div className="space-y-3">
                  {library.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="text-gray-600 mx-auto mb-4" size={40} />
                      <p className="text-gray-400 font-semibold">Your library is empty. Scan some meals first!</p>
                    </div>
                  ) : (
                    library.map(food => (
                      <button
                        key={food._id}
                        onClick={() => { setSelectedFood(food); setLogAmount(String(food.baseWeight || 100)); setLogQuantity(1); }}
                        className="w-full flex items-center bg-[#161618] p-4 rounded-2xl border border-[#2A2B2F] hover:border-[#3A3C42] transition-colors text-left group"
                      >
                        <div className="flex-1">
                          <div className="text-base font-bold text-gray-100 mb-1">{food.name}</div>
                          <div className="text-xs font-semibold text-gray-500">
                            {food.macros?.calories} kcal · {food.macros?.protein}g P · base {food.baseWeight}g
                          </div>
                        </div>
                        <ChevronRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={18} />
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Library: gram selector */}
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
                            <div className="text-2xl font-black text-gray-100">{v}{l !== 'KCAL' ? 'g' : ''}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{l}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex gap-4">
                    {/* Grams */}
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center mb-3">Grams</div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setLogAmount(String(Math.max(10, parseInt(logAmount) - 10)))}
                          className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
                        >
                          <Minus className="text-gray-400" size={16} />
                        </button>
                        <div className="flex-1 bg-[#161618] rounded-xl border border-[#2A2B2F] py-2">
                          <input
                            type="number"
                            value={logAmount}
                            onChange={(e) => setLogAmount(e.target.value)}
                            className="w-full bg-transparent text-center text-xl font-black text-gray-100 focus:outline-none"
                          />
                        </div>
                        <button 
                          onClick={() => setLogAmount(String((parseInt(logAmount) || 0) + 10))}
                          className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
                        >
                          <Plus className="text-gray-400" size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center mb-3">Quantity</div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setLogQuantity(q => Math.max(1, q - 1))}
                          className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
                        >
                          <Minus className="text-gray-400" size={16} />
                        </button>
                        <div className="flex-1 bg-[#161618] rounded-xl border border-[#2A2B2F] py-2.5 text-center">
                          <span className="text-xl font-black text-gray-100">{logQuantity}</span>
                        </div>
                        <button 
                          onClick={() => setLogQuantity(q => q + 1)}
                          className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
                        >
                          <Plus className="text-gray-400" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={confirmLogFood}
                    disabled={isLogging}
                    className="w-full py-4 rounded-xl bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 transition-colors mt-4 text-white font-black text-lg flex justify-center items-center"
                  >
                    {isLogging ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Log to Today"}
                  </button>
                </div>
              )}

              {/* Template list */}
              {sheetMode === 'template' && (
                <div className="space-y-3">
                  {templates.length === 0 ? (
                    <div className="text-center py-12">
                      <Layers className="text-gray-600 mx-auto mb-4" size={40} />
                      <p className="text-gray-400 font-semibold mb-6">No templates yet.</p>
                      <button
                        onClick={() => { closeSheet(); router.push('/nutrition/library'); }}
                        className="px-6 py-3 rounded-xl bg-[#E8414A] hover:bg-[#D62C35] text-white font-bold transition-colors"
                      >
                        Go Create One
                      </button>
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
                        <button
                          key={t._id}
                          onClick={() => logWholeTemplate(t)}
                          disabled={isLogging}
                          className="w-full flex items-center bg-[#161618] p-5 rounded-2xl border border-[#2A2B2F] hover:border-[#3A3C42] transition-colors text-left group"
                        >
                          <div className="flex-1">
                            <div className="text-lg font-bold text-gray-100 mb-1">{t.name}</div>
                            <div className="text-xs font-semibold text-gray-500">
                              {t.meals?.length || 0} meals{tplCals > 0 ? ` · ${tplCals} kcal` : ''}
                            </div>
                          </div>
                          {isLogging ? (
                            <div className="w-5 h-5 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check className="text-[#E8414A] opacity-0 group-hover:opacity-100 transition-opacity" size={20} />
                          )}
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
