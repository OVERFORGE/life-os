"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  X, Check, Plus, Minus, Layers, Coffee, Sun, Moon, Apple 
} from 'lucide-react';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee },
  { key: 'lunch', label: 'Lunch', icon: Sun },
  { key: 'dinner', label: 'Dinner', icon: Moon },
  { key: 'snack', label: 'Snack', icon: Apple },
];

const NAME_PRESETS = ['Bulk Day', 'Cut Day', 'Rest Day', 'Cheat Day', 'Training Day', 'Fasting Day'];

function scaledMacros(macros: any, baseWeight: number, amount: number) {
  if (!macros || !baseWeight) return macros;
  const ratio = amount / baseWeight;
  return {
    calories: Math.round((macros.calories || 0) * ratio),
    protein: Math.round((macros.protein || 0) * ratio * 10) / 10,
    carbs: Math.round((macros.carbs || 0) * ratio * 10) / 10,
    fats: Math.round((macros.fats || 0) * ratio * 10) / 10,
  };
}

interface TemplateItem {
  foodItem: any;
  mealType: string;
  amount: number;
}

export default function CreateTemplatePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [library, setLibrary] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [selectedItems, setSelectedItems] = useState<TemplateItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [pickerFood, setPickerFood] = useState<any | null>(null);
  const [pickerMealType, setPickerMealType] = useState('breakfast');
  const [pickerAmount, setPickerAmount] = useState('100');
  const [pickerQty, setPickerQty] = useState('1');

  useEffect(() => {
    const load = async () => {
      setLoadingLibrary(true);
      try {
        const res = await fetch('/api/nutrition/library');
        if (res.ok) {
          const data = await res.json();
          setLibrary(data.foods || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingLibrary(false);
      }
    };
    load();
  }, []);

  const openPicker = (food: any) => {
    setPickerFood(food);
    setPickerMealType('breakfast');
    setPickerAmount(String(food.baseWeight || 100));
    setPickerQty('1');
  };

  const confirmAddFood = () => {
    if (!pickerFood) return;
    const gramsPerUnit = parseInt(pickerAmount) || 100;
    const qty = Math.max(1, parseInt(pickerQty) || 1);
    const totalAmount = gramsPerUnit * qty;
    const filtered = selectedItems.filter(
      i => !(i.foodItem._id === pickerFood._id && i.mealType === pickerMealType)
    );
    setSelectedItems([...filtered, { foodItem: pickerFood, mealType: pickerMealType, amount: totalAmount }]);
    setPickerFood(null);
  };

  const removeItem = (idx: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== idx));
  };

  const saveTemplate = async () => {
    if (!name.trim() || selectedItems.length === 0) return;
    setIsSaving(true);
    try {
      const meals = selectedItems.map(si => ({
        foodItemId: si.foodItem._id,
        mealType: si.mealType,
        customAmount: si.amount,
      }));
      const res = await fetch('/api/nutrition/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), meals }),
      });
      if (!res.ok) throw new Error('Failed to save template');
      
      router.back();
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const totals = selectedItems.reduce((acc, si) => {
    const m = scaledMacros(si.foodItem.macros, si.foodItem.baseWeight, si.amount);
    return {
      calories: acc.calories + (m?.calories || 0),
      protein: acc.protein + (m?.protein || 0),
      carbs: acc.carbs + (m?.carbs || 0),
      fats: acc.fats + (m?.fats || 0),
    };
  }, { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const mealGroups = MEAL_TYPES.map(mt => ({
    ...mt,
    items: selectedItems.filter(si => si.mealType === mt.key),
  })).filter(g => g.items.length > 0);

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-4xl mx-auto w-full relative">
      
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <X className="text-gray-400" size={18} />
        </button>
        <h1 className="text-2xl font-black text-gray-100 tracking-tight">New Day Template</h1>
        <div className="w-10" />
      </div>

      <div className="flex items-center justify-center py-8 gap-3">
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
              step >= s ? 'bg-[#E8414A] border-[#E8414A]' : 'bg-[#1F2023] border-[#2A2B2F]'
            }`}>
              {step > s ? <Check className="text-white" size={16} /> : <span className={`font-black text-sm ${step === s ? 'text-white' : 'text-gray-500'}`}>{s}</span>}
            </div>
            {s < 3 && <div className={`w-12 h-1 ${step > s ? 'bg-[#E8414A]' : 'bg-[#2A2B2F]'} transition-colors rounded-full`} />}
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 pb-32 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        
        {step === 1 && (
          <div className="max-w-xl mx-auto w-full animate-in slide-in-from-right-8 duration-300 mt-8">
            <h2 className="text-3xl font-black text-gray-100 mb-2 text-center">Name Your Template</h2>
            <p className="text-sm font-semibold text-gray-500 text-center mb-12">Give this day plan a memorable name.</p>
            
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Bulk Day"
              className="w-full bg-[#1F2023] text-gray-100 text-xl font-black p-6 rounded-2xl border border-[#2A2B2F] focus:border-[#3A3C42] focus:outline-none mb-8 text-center placeholder:text-gray-600"
            />
            
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 text-center">Quick Presets</div>
            <div className="flex flex-wrap justify-center gap-3">
              {NAME_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => setName(p)}
                  className={`px-5 py-2.5 rounded-full border font-bold text-sm transition-colors ${
                    name === p ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' : 'bg-[#1F2023] border-[#2A2B2F] text-gray-400 hover:bg-[#2A2B2F]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="w-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-gray-100 mb-2">Add Foods</h2>
              <p className="text-sm font-semibold text-gray-500">Tap a food to add it with a meal type and amount.</p>
            </div>

            {selectedItems.length > 0 && (
              <div className="bg-[#1F2023] rounded-3xl p-6 mb-8 border border-[#E8414A]/30">
                <div className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest mb-4">
                  {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
                </div>
                <div className="space-y-3">
                  {selectedItems.map((si, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-100 font-bold text-sm mb-1">{si.foodItem.name}</div>
                        <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{si.mealType} · {si.amount}g total</div>
                      </div>
                      <button onClick={() => removeItem(idx)} className="p-2 text-gray-500 hover:text-red-500 transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingLibrary ? (
              <div className="flex justify-center mt-12">
                <div className="w-8 h-8 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : library.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-[#1F2023] rounded-3xl border border-[#2A2B2F]">
                <Layers className="text-[#2A2B2F] mb-4" size={48} />
                <div className="text-lg font-black text-gray-400 text-center">Your food library is empty. Scan some meals first!</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {library.map(food => {
                  const alreadyAdded = selectedItems.some(si => si.foodItem._id === food._id);
                  return (
                    <button
                      key={food._id}
                      onClick={() => openPicker(food)}
                      className={`flex items-center p-4 rounded-2xl border text-left transition-colors group ${
                        alreadyAdded ? 'bg-[#E8414A]/5 border-[#E8414A]/30' : 'bg-[#1F2023] border-[#2A2B2F] hover:bg-[#2A2B2F]'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="text-gray-100 font-black text-base mb-1">{food.name}</div>
                        <div className="text-gray-500 text-xs font-semibold">
                          {Math.round(food.macros?.calories || 0)} kcal · {Math.round(food.macros?.protein || 0)}g P · {food.baseWeight}g base
                        </div>
                      </div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                        alreadyAdded ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' : 'bg-[#161618] border-[#2A2B2F] text-gray-400 group-hover:text-gray-300 group-hover:bg-[#2A2B2F]'
                      }`}>
                        <Plus size={18} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="w-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-gray-100 mb-2">Review Template</h2>
              <p className="text-xl font-black text-gray-500">"{name}"</p>
            </div>

            <div className="bg-[#1F2023] rounded-3xl p-6 md:p-8 mb-8 border border-[#2A2B2F]">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 text-center">Daily Totals</div>
              <div className="flex justify-between items-center">
                <div className="text-center">
                  <div className="text-3xl font-black text-gray-100">{totals.calories}</div>
                  <div className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest mt-1">KCAL</div>
                </div>
                <div className="w-px h-10 bg-[#2A2B2F]" />
                <div className="text-center">
                  <div className="text-3xl font-black text-gray-100">{Math.round(totals.protein)}g</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Protein</div>
                </div>
                <div className="w-px h-10 bg-[#2A2B2F]" />
                <div className="text-center">
                  <div className="text-3xl font-black text-gray-100">{Math.round(totals.carbs)}g</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Carbs</div>
                </div>
                <div className="w-px h-10 bg-[#2A2B2F]" />
                <div className="text-center">
                  <div className="text-3xl font-black text-gray-100">{Math.round(totals.fats)}g</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Fats</div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {mealGroups.map(group => (
                <div key={group.key}>
                  <div className="flex items-center mb-4 ml-1">
                    <group.icon className="text-[#E8414A]" size={16} />
                    <span className="text-[10px] font-bold text-[#E8414A] uppercase tracking-[0.2em] ml-2">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((si, idx) => {
                      const m = scaledMacros(si.foodItem.macros, si.foodItem.baseWeight, si.amount);
                      return (
                        <div key={idx} className="bg-[#1F2023] rounded-2xl p-5 border border-[#2A2B2F]">
                          <div className="flex justify-between items-center mb-4">
                            <div className="text-base font-bold text-gray-100">{si.foodItem.name}</div>
                            <div className="text-sm font-black text-gray-500">{si.amount}g</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { v: m?.calories, l: 'kcal' },
                              { v: m?.protein, l: 'P' },
                              { v: m?.carbs, l: 'C' },
                              { v: m?.fats, l: 'F' },
                            ].map(({ v, l }) => (
                              <span key={l} className="bg-[#161618] px-3 py-1.5 rounded-lg border border-[#2A2B2F] text-xs font-bold text-gray-400">
                                {Math.round(v || 0)}{l !== 'kcal' ? 'g' : ''} {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-[#161618] border-t border-[#2A2B2F] flex gap-4 md:px-12">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 py-4 rounded-2xl bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] text-gray-300 font-black text-sm uppercase tracking-widest transition-colors"
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={() => {
              if (step === 1 && !name.trim()) return;
              if (step === 2 && selectedItems.length === 0) return;
              setStep(step + 1);
            }}
            disabled={(step === 1 && !name.trim()) || (step === 2 && selectedItems.length === 0)}
            className="flex-1 py-4 rounded-2xl bg-gray-100 hover:bg-white text-[#161618] font-black text-sm uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={saveTemplate}
            disabled={isSaving}
            className="flex-1 py-4 rounded-2xl bg-[#E8414A] hover:bg-[#D62C35] text-white font-black text-sm uppercase tracking-widest transition-colors disabled:opacity-50 flex justify-center items-center"
          >
            {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Save Template'}
          </button>
        )}
      </div>

      {/* Picker Modal */}
      {pickerFood && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={() => setPickerFood(null)} />
          <div className="relative w-full max-w-2xl mx-auto bg-[#1F2023] border-t border-[#2A2B2F] rounded-t-3xl p-6 pb-12 animate-in slide-in-from-bottom-8 duration-300">
            
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-100">{pickerFood.name}</h2>
              <button onClick={() => setPickerFood(null)} className="p-2 text-gray-500 hover:text-gray-300 transition-colors"><X size={24} /></button>
            </div>

            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Meal Type</div>
            <div className="flex gap-2 mb-8">
              {MEAL_TYPES.map(mt => (
                <button
                  key={mt.key}
                  onClick={() => setPickerMealType(mt.key)}
                  className={`flex-1 flex flex-col items-center justify-center py-4 rounded-2xl border transition-colors ${
                    pickerMealType === mt.key ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' : 'bg-[#161618] border-[#2A2B2F] text-gray-500 hover:bg-[#2A2B2F]'
                  }`}
                >
                  <mt.icon size={18} className="mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{mt.label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 text-center">Grams per unit</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPickerAmount(String(Math.max(10, parseInt(pickerAmount) - 10)))} className="w-12 h-12 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Minus className="text-gray-400" size={18} /></button>
                  <div className="flex-1 bg-[#161618] rounded-xl border border-[#2A2B2F] py-3">
                    <input type="number" value={pickerAmount} onChange={(e) => setPickerAmount(e.target.value)} className="w-full bg-transparent text-center text-2xl font-black text-gray-100 focus:outline-none" />
                  </div>
                  <button onClick={() => setPickerAmount(String((parseInt(pickerAmount) || 0) + 10))} className="w-12 h-12 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Plus className="text-gray-400" size={18} /></button>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 text-center">Quantity</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPickerQty(String(Math.max(1, parseInt(pickerQty) - 1)))} className="w-12 h-12 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Minus className="text-gray-400" size={18} /></button>
                  <div className="flex-1 bg-[#161618] rounded-xl border border-[#2A2B2F] py-3.5 text-center">
                    <span className="text-2xl font-black text-gray-100">{pickerQty}</span>
                  </div>
                  <button onClick={() => setPickerQty(String((parseInt(pickerQty) || 1) + 1))} className="w-12 h-12 rounded-full bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"><Plus className="text-gray-400" size={18} /></button>
                </div>
              </div>
            </div>

            <div className="bg-[#161618] rounded-xl py-3 border border-[#2A2B2F] flex justify-center items-center gap-2 mb-8">
              <span className="text-gray-500 text-sm font-bold">Total:</span>
              <span className="text-gray-100 font-black text-lg">{(parseInt(pickerAmount) || 0) * (parseInt(pickerQty) || 1)}g</span>
            </div>

            <button
              onClick={confirmAddFood}
              className="w-full py-5 rounded-2xl bg-gray-100 hover:bg-white text-[#161618] font-black text-sm uppercase tracking-widest transition-colors shadow-lg"
            >
              Add to Template
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
