"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Activity,
  ChevronRight,
  BookOpen,
  Layers,
  X,
  Plus,
  Minus,
  Check,
  ArrowLeft,
  CalendarDays,
  Sparkles,
  Search,
} from "lucide-react";
import { useReactiveInvalidation } from "@/features/runtime/hooks/useReactiveInvalidation";

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface DayIntake {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}
type SheetMode = null | "library" | "template";

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
  const [logAmount, setLogAmount] = useState("100");
  const [logQuantity, setLogQuantity] = useState(1);
  const [isLogging, setIsLogging] = useState(false);

  const fetchAll = useCallback(async () => {
    const today = getLocalDateString();
    try {
      const [logRes, libRes, tplRes] = await Promise.allSettled([
        fetch(`/api/nutrition/log?date=${today}`),
        fetch("/api/nutrition/library"),
        fetch("/api/nutrition/templates"),
      ]);

      if (logRes.status === "fulfilled" && logRes.value.ok) {
        const d = await logRes.value.json();
        const t = d.log?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
        setIntake(t);
      }
      if (libRes.status === "fulfilled" && libRes.value.ok) {
        const d = await libRes.value.json();
        setLibrary(d.foods || []);
      }
      if (tplRes.status === "fulfilled" && tplRes.value.ok) {
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

  useReactiveInvalidation({
    tags: ["nutrition", "daily-log", "dashboard"],
    onInvalidate: fetchAll,
  });

  const logFoodItem = async (food: any, amount: number, mealType = "snack", quantity: number = 1) => {
    const today = getLocalDateString();
    const m = scaledMacros(food.macros, food.baseWeight, amount);
    const getRes = await fetch(`/api/nutrition/log?date=${today}`);
    const existing = getRes.ok ? (await getRes.json()).log : null;
    const existingMeals: any[] = (existing?.meals || []).map((ml: any) => ({
      mealType: ml.mealType || "snack",
      foodItemId: typeof ml.foodItemId === "object" ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
      amount: ml.amount || 100,
      macros: ml.macros,
    }));
    const newMeals = Array.from({ length: quantity }, () => ({ mealType, foodItemId: food._id, amount, macros: m }));
    const meals = [...existingMeals, ...newMeals];
    const dailyTotals = meals.reduce(
      (acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    const res = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, meals, dailyTotals }),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "Failed to log food");
    }
  };

  const confirmLogFood = async () => {
    if (!selectedFood) return;
    const amt = parseInt(logAmount) || 100;
    setIsLogging(true);
    try {
      await logFoodItem(selectedFood, amt, "snack", logQuantity);
      setSheetMode(null);
      setSelectedFood(null);
      setLogQuantity(1);
      await fetchAll();
    } catch (e: any) {
      console.error("Log Failed", e.message);
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
        mealType: ml.mealType || "snack",
        foodItemId: typeof ml.foodItemId === "object" ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      for (const m of template.meals || []) {
        const food = typeof m.foodItemId === "object" ? m.foodItemId : null;
        const id = food?._id || m.foodItemId;
        if (!id) continue;

        const resolved = food && food.macros ? food : library.find((f) => String(f._id) === String(id));
        if (!resolved?.macros) continue;

        const scaled = scaledMacros(resolved.macros, resolved.baseWeight, m.customAmount || resolved.baseWeight);
        meals.push({
          mealType: m.mealType || "snack",
          foodItemId: id,
          amount: m.customAmount || resolved.baseWeight,
          macros: scaled,
        });
      }

      const dailyTotals = meals.reduce(
        (acc: any, ml: any) => ({
          calories: acc.calories + (ml.macros?.calories || 0),
          protein: acc.protein + (ml.macros?.protein || 0),
          carbs: acc.carbs + (ml.macros?.carbs || 0),
          fats: acc.fats + (ml.macros?.fats || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
      );

      const res = await fetch("/api/nutrition/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, meals, dailyTotals }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed");
      }

      setSheetMode(null);
      await fetchAll();
    } catch (e: any) {
      console.error("Log Failed", e.message);
    } finally {
      setIsLogging(false);
    }
  };

  const closeSheet = () => {
    setSheetMode(null);
    setSelectedFood(null);
  };

  if (initialLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-[#111113] text-[#F7F5F0]">
        <div className="w-8 h-8 rounded-full border-2 border-[#D98B2B] border-t-transparent animate-spin mb-4" />
        <p className="text-[#85827A] text-xs font-mono font-semibold">Loading your nutrition overview...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#111113] text-[#F7F5F0] max-w-7xl mx-auto w-full font-sans select-none">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-12 pt-8 pb-6 border-b border-[#23242A]">
        <button
          onClick={() => router.push("/vitals")}
          className="w-9 h-9 rounded-full bg-[#17171A] border border-[#23242A] flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D98B2B]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">Nutrition Hub</h1>
          </div>
          <p className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-widest mt-1">
            Nutrition &amp; Daily Targets
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 custom-h-scrollbar pb-8">
        {/* Today's Intake Widget */}
        <button
          onClick={() => router.push("/nutrition/daily-log")}
          className="w-full bg-[#17171A] rounded-2xl border border-[#23242A] p-6 md:p-8 mb-8 text-left hover:border-[#32343D] transition-colors group cursor-pointer shadow-lg"
        >
          <div className="flex items-center mb-6">
            <Activity className="text-[#D98B2B]" size={16} />
            <span className="text-[10px] font-bold text-[#85827A] tracking-[0.2em] uppercase ml-3 font-mono">
              Today&apos;s Intake
            </span>
            <div className="flex-1" />
            <ChevronRight className="text-[#85827A] group-hover:text-[#F7F5F0] transition-colors" size={18} />
          </div>

          <div className="flex items-baseline mb-6">
            <span className="text-5xl md:text-6xl font-black text-[#F7F5F0] tracking-tight">
              {Math.round(intake.calories || 0)}
            </span>
            <span className="text-xs font-mono font-bold text-[#D98B2B] ml-2">KCAL</span>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#23242A]">
            {[
              { label: "Protein", value: Math.round(intake.protein || 0), color: "text-emerald-400" },
              { label: "Carbs", value: Math.round(intake.carbs || 0), color: "text-sky-400" },
              { label: "Fats", value: Math.round(intake.fats || 0), color: "text-amber-400" },
            ].map((item) => (
              <div key={item.label}>
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}g</div>
                <div className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-widest mt-1">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </button>

        {/* Log Food Section */}
        <div className="text-[10px] font-mono font-bold text-[#85827A] tracking-[0.2em] uppercase mb-4 ml-1">
          Quick Log Options
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => router.push("/nutrition/scan")}
            className="flex items-center bg-[#17171A] border border-[#23242A] p-4 rounded-2xl hover:border-[#32343D] transition-colors group cursor-pointer text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[#23242A] flex items-center justify-center mr-3 text-[#D98B2B]">
              <Camera size={18} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-[#F7F5F0]">AI Meal Scan</div>
              <div className="text-[11px] text-[#85827A]">Analyze macros via image</div>
            </div>
            <ChevronRight className="text-[#85827A]" size={16} />
          </button>

          <button
            onClick={() => setSheetMode("library")}
            className="flex items-center bg-[#17171A] border border-[#23242A] p-4 rounded-2xl hover:border-[#32343D] transition-colors group cursor-pointer text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[#23242A] flex items-center justify-center mr-3 text-[#D98B2B]">
              <BookOpen size={18} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-[#F7F5F0]">Food Library</div>
              <div className="text-[11px] text-[#85827A]">Browse &amp; log custom items</div>
            </div>
            <ChevronRight className="text-[#85827A]" size={16} />
          </button>

          <button
            onClick={() => setSheetMode("template")}
            className="flex items-center bg-[#17171A] border border-[#23242A] p-4 rounded-2xl hover:border-[#32343D] transition-colors group cursor-pointer text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[#23242A] flex items-center justify-center mr-3 text-[#D98B2B]">
              <Layers size={18} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-[#F7F5F0]">Meal Templates</div>
              <div className="text-[11px] text-[#85827A]">1-click logged meal sets</div>
            </div>
            <ChevronRight className="text-[#85827A]" size={16} />
          </button>
        </div>
      </div>

      {/* Slide-over / Modal for Library or Templates */}
      {sheetMode && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171A] border border-[#23242A] rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-5 shadow-2xl custom-h-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <h3 className="text-base font-bold text-[#F7F5F0]">
                {sheetMode === "library" ? "Select Food from Library" : "Select Meal Template"}
              </h3>
              <button onClick={closeSheet} className="p-1 rounded-full text-[#85827A] hover:text-[#F7F5F0]">
                <X size={16} />
              </button>
            </div>

            {sheetMode === "library" && !selectedFood && (
              <div className="flex flex-col gap-2">
                {library.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#85827A]">No foods saved in library yet.</div>
                ) : (
                  library.map((f) => (
                    <div
                      key={f._id}
                      onClick={() => setSelectedFood(f)}
                      className="p-3 bg-[#111113] border border-[#23242A] hover:border-[#D98B2B]/40 rounded-xl flex items-center justify-between cursor-pointer transition-all"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#F7F5F0]">{f.name}</div>
                        <div className="text-[10px] text-[#85827A] font-mono">
                          {f.macros?.calories || 0} kcal per {f.baseWeight}g
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-[#85827A]" />
                    </div>
                  ))
                )}
              </div>
            )}

            {sheetMode === "library" && selectedFood && (
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-[#111113] rounded-xl border border-[#23242A]">
                  <div className="text-sm font-bold text-[#F7F5F0]">{selectedFood.name}</div>
                  <div className="text-xs text-[#85827A] mt-1 font-mono">
                    Base: {selectedFood.baseWeight}g · {selectedFood.macros?.calories || 0} kcal
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-[#85827A] block mb-1">Grams</label>
                    <input
                      type="number"
                      value={logAmount}
                      onChange={(e) => setLogAmount(e.target.value)}
                      className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-[#85827A] block mb-1">Qty</label>
                    <input
                      type="number"
                      value={logQuantity}
                      onChange={(e) => setLogQuantity(parseInt(e.target.value) || 1)}
                      className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={confirmLogFood}
                  disabled={isLogging}
                  className="w-full py-2.5 bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] rounded-xl text-xs font-bold transition-all"
                >
                  {isLogging ? "Logging..." : "Confirm & Log"}
                </button>
              </div>
            )}

            {sheetMode === "template" && (
              <div className="flex flex-col gap-2">
                {templates.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#85827A]">No meal templates available.</div>
                ) : (
                  templates.map((t) => (
                    <div
                      key={t._id}
                      onClick={() => logWholeTemplate(t)}
                      className="p-3 bg-[#111113] border border-[#23242A] hover:border-[#D98B2B]/40 rounded-xl flex items-center justify-between cursor-pointer transition-all"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#F7F5F0]">{t.name}</div>
                        <div className="text-[10px] text-[#85827A] font-mono">{t.meals?.length || 0} items</div>
                      </div>
                      <Plus size={14} className="text-[#D98B2B]" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
