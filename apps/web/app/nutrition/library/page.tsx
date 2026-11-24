"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Dna,
  Layers,
  Leaf,
  Camera,
  Edit2,
  Trash2,
  X,
  Check,
  Utensils,
  Sparkles,
} from "lucide-react";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
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

/* Safe Image component that handles mobile file:/// paths and network failures gracefully */
function SafeFoodImage({ src, name }: { src?: string; name: string }) {
  const [hasError, setHasError] = useState(false);
  const isInvalidScheme = !src || src.startsWith("file://");

  if (isInvalidScheme || hasError) {
    return (
      <div className="w-24 sm:w-28 min-h-full bg-[#111113] flex flex-col items-center justify-center p-3 text-[#85827A] border-r border-[#23242A] shrink-0">
        <Utensils size={20} className="text-[#D98B2B]/70 mb-1" />
        <span className="text-[10px] font-mono uppercase text-center line-clamp-1">{name}</span>
      </div>
    );
  }

  return (
    <div className="w-24 sm:w-28 min-h-full bg-[#111113] relative overflow-hidden border-r border-[#23242A] shrink-0">
      <img
        src={src}
        alt={name}
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export default function FoodLibraryPage() {
  const router = useRouter();

  const [foods, setFoods] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"foods" | "templates">("foods");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editTemplate, setEditTemplate] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editMeals, setEditMeals] = useState<any[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [foodsRes, templatesRes] = await Promise.all([
        fetch("/api/nutrition/library"),
        fetch("/api/nutrition/templates"),
      ]);
      if (foodsRes.ok) {
        const d = await foodsRes.json();
        setFoods(d.foods || []);
      }
      if (templatesRes.ok) {
        const d = await templatesRes.json();
        setTemplates(d.templates || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const openEditTemplate = (t: any) => {
    setEditTemplate(t);
    setEditName(t.name);
    setEditMeals([...(t.meals || [])]);
  };

  const closeEditTemplate = () => {
    setEditTemplate(null);
    setEditName("");
    setEditMeals([]);
  };

  const removeEditMeal = (idx: number) => {
    setEditMeals((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveEditTemplate = async () => {
    if (!editTemplate) return;
    if (!editName.trim()) return;
    setIsSavingTemplate(true);
    try {
      const sanitizedMeals = editMeals.map((m: any) => ({
        mealType: m.mealType || "snack",
        foodItemId: typeof m.foodItemId === "object" ? m.foodItemId._id || m.foodItemId : m.foodItemId,
        customAmount: m.customAmount || 100,
      }));
      const res = await fetch(`/api/nutrition/templates/${editTemplate._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), meals: sanitizedMeals }),
      });
      if (!res.ok) throw new Error("Failed to update template");
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
      const res = await fetch(`/api/nutrition/library/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFoods((prev) => prev.filter((f) => f._id !== id));
      } else {
        console.error("Failed to delete food");
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
      const res = await fetch(`/api/nutrition/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t._id !== id));
      } else {
        console.error("Failed to delete template");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#111113] text-[#F7F5F0] max-w-7xl mx-auto w-full font-sans select-none relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#23242A]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/vitals")}
            className="w-9 h-9 rounded-full bg-[#17171A] border border-[#23242A] flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D98B2B]" />
              <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">Food Library</h1>
            </div>
            <p className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-widest mt-1">
              Verified Food Database &amp; Daily Templates
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/nutrition/scan")}
          className="flex items-center gap-2 px-4 py-2 bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] rounded-full text-xs font-bold transition-all shadow-md cursor-pointer"
        >
          <Plus size={14} className="stroke-[2.5]" />
          <span>Add Food</span>
        </button>
      </div>

      {/* Tab Toggle */}
      <div className="px-6 md:px-12 py-6">
        <div className="flex bg-[#17171A] p-1 rounded-full border border-[#23242A] max-w-md">
          <button
            onClick={() => setActiveTab("foods")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "foods" ? "bg-[#23242A] text-[#F7F5F0] shadow-sm" : "text-[#85827A] hover:text-[#F7F5F0]"
            }`}
          >
            <Dna size={14} className={activeTab === "foods" ? "text-[#D98B2B]" : ""} />
            <span>Custom Foods ({foods.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "templates" ? "bg-[#23242A] text-[#F7F5F0] shadow-sm" : "text-[#85827A] hover:text-[#F7F5F0]"
            }`}
          >
            <Layers size={14} className={activeTab === "templates" ? "text-[#D98B2B]" : ""} />
            <span>Day Templates ({templates.length})</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#D98B2B] border-t-transparent animate-spin mb-4" />
          <div className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-widest">
            Loading Library Data...
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 md:px-12 pb-24 custom-h-scrollbar">
          {activeTab === "foods" ? (
            foods.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-[#17171A] rounded-2xl border border-[#23242A] mt-4">
                <Leaf className="text-[#85827A] mb-4" size={40} />
                <div className="text-lg font-bold text-[#F7F5F0] mb-2">No verified foods yet.</div>
                <div className="text-xs text-[#85827A] text-center mb-6 max-w-sm">
                  Scan items with the AI camera to build your personalized metabolic library.
                </div>
                <button
                  onClick={() => router.push("/nutrition/scan")}
                  className="flex items-center gap-2 bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer"
                >
                  <Camera size={14} />
                  <span>Scan a Meal</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {foods.map((f) => (
                  <div
                    key={f._id}
                    className="flex bg-[#17171A] rounded-2xl border border-[#23242A] overflow-hidden group hover:border-[#32343D] transition-colors"
                  >
                    <SafeFoodImage src={f.imageUrl} name={f.name} />

                    <div className="flex-1 p-5 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-base font-bold text-[#F7F5F0] pr-4">{f.name}</h3>
                          <div className="text-[10px] font-mono text-[#85827A] mt-0.5">
                            Serving Base: {f.baseWeight}g
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              router.push(
                                `/nutrition/scan?editFood=${encodeURIComponent(JSON.stringify(f))}`
                              )
                            }
                            className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] flex items-center justify-center hover:bg-[#23242A] text-[#85827A] hover:text-[#F7F5F0] transition-colors cursor-pointer"
                            title="Edit Food Item"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => deleteFood(f._id, f.name)}
                            disabled={deletingId === f._id}
                            className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[#85827A] transition-colors disabled:opacity-50 cursor-pointer"
                            title="Delete Food Item"
                          >
                            {deletingId === f._id ? (
                              <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {[
                          { v: `${Math.round(f.macros?.calories || 0)} kcal`, hi: true },
                          { v: `${Math.round(f.macros?.protein || 0)}g P`, color: "text-emerald-400" },
                          { v: `${Math.round(f.macros?.carbs || 0)}g C`, color: "text-sky-400" },
                          { v: `${Math.round(f.macros?.fats || 0)}g F`, color: "text-amber-400" },
                        ].map(({ v, hi, color }) => (
                          <div
                            key={v}
                            className={`px-2.5 py-1 rounded-md border text-xs font-mono font-semibold ${
                              hi
                                ? "bg-[#D98B2B]/10 border-[#D98B2B]/30 text-[#D98B2B]"
                                : `bg-[#111113] border-[#23242A] ${color || "text-[#85827A]"}`
                            }`}
                          >
                            {v}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-[#17171A] rounded-2xl border border-[#23242A] mt-4">
              <Layers className="text-[#85827A] mb-4" size={40} />
              <div className="text-lg font-bold text-[#F7F5F0] mb-2">No day templates yet.</div>
              <div className="text-xs text-[#85827A] text-center mb-6 max-w-sm">
                Combine library foods into one-tap daily layouts.
              </div>
              <button
                onClick={() => router.push("/nutrition/create-template")}
                className="bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                Create Template
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((t) => {
                const kcal = templateCalories(t);
                const created = t.createdAt ? timeAgo(t.createdAt) : "";
                return (
                  <div
                    key={t._id}
                    className="bg-[#17171A] rounded-2xl border border-[#23242A] p-5 group hover:border-[#32343D] transition-colors"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-base font-bold text-[#F7F5F0] mb-0.5">{t.name}</h3>
                        {created && (
                          <div className="text-[10px] font-mono text-[#85827A] uppercase tracking-wider">
                            Created {created}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditTemplate(t)}
                          className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] flex items-center justify-center hover:bg-[#23242A] text-[#85827A] hover:text-[#F7F5F0] transition-colors cursor-pointer"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => deleteTemplate(t._id, t.name)}
                          disabled={deletingId === t._id}
                          className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[#85827A] transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {deletingId === t._id ? (
                            <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="bg-[#D98B2B]/10 border border-[#D98B2B]/30 px-3 py-1 rounded-md text-[#D98B2B] text-xs font-mono font-bold">
                        {kcal} kcal
                      </div>
                      <div className="bg-[#111113] border border-[#23242A] px-3 py-1 rounded-md text-[#85827A] text-xs font-mono font-semibold">
                        {t.meals?.length || 0} meals
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => router.push("/nutrition/create-template")}
                className="w-full flex items-center justify-center gap-2 bg-[#17171A] rounded-2xl border border-dashed border-[#23242A] p-5 hover:bg-[#23242A] transition-colors mt-2 text-xs font-mono font-semibold text-[#85827A] hover:text-[#F7F5F0] cursor-pointer"
              >
                <Plus size={14} className="text-[#D98B2B]" />
                <span>Create Another Template</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== EDIT TEMPLATE MODAL ===== */}
      {!!editTemplate && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-xl mx-auto bg-[#17171A] border-t border-[#23242A] rounded-t-3xl max-h-[85vh] flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#23242A]">
              <h2 className="text-base font-bold text-[#F7F5F0]">Edit Template</h2>
              <button
                onClick={closeEditTemplate}
                className="w-8 h-8 rounded-full bg-[#111113] border border-[#23242A] flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0]"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pt-4 custom-h-scrollbar">
              <label className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-wider mb-1 block">
                Template Name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-[#111113] text-[#F7F5F0] text-sm font-semibold p-3 rounded-xl border border-[#23242A] focus:border-[#D98B2B] outline-none mb-5"
                placeholder="Template name..."
              />

              <div className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-wider mb-2">
                Meals ({editMeals.length})
              </div>
              {editMeals.length === 0 ? (
                <div className="bg-[#111113] rounded-xl p-4 text-center border border-[#23242A] mb-4 text-xs text-[#85827A]">
                  All meals removed. Save to create an empty template.
                </div>
              ) : (
                <div className="space-y-2">
                  {editMeals.map((m: any, idx: number) => {
                    const food = typeof m.foodItemId === "object" ? m.foodItemId : null;
                    const foodName = food?.name || "Unknown Food";
                    const mealType = m.mealType || "snack";
                    return (
                      <div
                        key={idx}
                        className="bg-[#111113] rounded-xl p-3 flex items-center justify-between border border-[#23242A]"
                      >
                        <div>
                          <div className="text-[#F7F5F0] font-semibold text-xs mb-0.5">{foodName}</div>
                          <div className="text-[#85827A] font-mono text-[10px] uppercase">
                            {mealType} · {m.customAmount}g
                          </div>
                        </div>
                        <button
                          onClick={() => removeEditMeal(idx)}
                          className="w-7 h-7 rounded-lg bg-[#17171A] border border-[#23242A] flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 text-[#85827A] transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={saveEditTemplate}
                disabled={isSavingTemplate}
                className="w-full py-3 mt-6 rounded-xl flex items-center justify-center gap-2 bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] font-bold text-xs uppercase tracking-wider transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isSavingTemplate ? (
                  <div className="w-4 h-4 border-2 border-[#111113] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check size={16} /> Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
