"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Activity } from "lucide-react";

export default function SignalsPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    key: "",
    label: "",
    categoryKey: "",
    inputType: "number",
    direction: "higher_better",
    unit: "",
    target: "",
    min: "",
    max: "",
    step: "",
    dependsOn: "",
    showIf: ""
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [catRes, sigRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/signals")
      ]);

      if (catRes.ok) {
        const d = await catRes.json();
        setCategories(d.categories || []);
        if (d.categories?.length > 0) {
          setForm(f => ({ ...f, categoryKey: d.categories[0].key }));
        }
      }
      if (sigRes.ok) {
        const d = await sigRes.json();
        setSignals(d.signals || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const addSignal = async () => {
    if (!form.key || !form.label || !form.categoryKey) {
      alert("Key, Label, and Category are required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          target: form.target ? Number(form.target) : null,
          min: form.min ? Number(form.min) : null,
          max: form.max ? Number(form.max) : null,
          step: form.step ? Number(form.step) : null,
          dependsOn: form.dependsOn || null,
          showIf: form.showIf ? Number(form.showIf) : null,
        })
      });

      if (res.ok) {
        setForm({
          key: "", label: "", categoryKey: categories[0]?.key || "",
          inputType: "number", direction: "higher_better",
          unit: "", target: "", min: "", max: "", step: "", dependsOn: "", showIf: ""
        });
        loadAll();
      } else {
        const d = await res.json();
        alert(JSON.stringify(d.error));
      }
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const removeSignal = (key: string) => {
    if (confirm(`Remove ${key}?`)) {
      fetch(`/api/signals?key=${key}`, { method: "DELETE" }).then(loadAll);
    }
  };

  const SectionLabel = ({ text }: { text: string }) => (
    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">{text}</div>
  );

  return (
    <div className="min-h-screen bg-[#161618] text-gray-100 flex flex-col">
      
      {/* Header */}
      <div className="flex items-center px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm mr-4"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Custom Signals</h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Manage Category Schemas</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-4xl mx-auto space-y-10 pb-20">

          {/* Form */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
            <h2 className="text-xl font-bold mb-2">Create Signal</h2>
            <p className="text-sm font-semibold text-gray-400 mb-8 max-w-lg">
              Signals are dynamic daily inputs: stress sliders, water intake numbers, journaling fields, etc.
            </p>

            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <SectionLabel text="Key (Internal ID)" />
                  <input
                    className="w-full bg-[#161618] border border-[#2A2B2F] text-gray-100 px-5 py-4 rounded-2xl text-[15px] font-semibold focus:outline-none focus:border-[#E8414A]/50 transition-colors shadow-sm"
                    placeholder="e.g. water_intake"
                    value={form.key}
                    onChange={e => setForm({ ...form, key: e.target.value })}
                  />
                </div>
                <div>
                  <SectionLabel text="Label (UI Display)" />
                  <input
                    className="w-full bg-[#161618] border border-[#2A2B2F] text-gray-100 px-5 py-4 rounded-2xl text-[15px] font-semibold focus:outline-none focus:border-[#E8414A]/50 transition-colors shadow-sm"
                    placeholder="e.g. Water (L)"
                    value={form.label}
                    onChange={e => setForm({ ...form, label: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <SectionLabel text="Category" />
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => (
                    <button
                      key={c.key}
                      onClick={() => setForm({ ...form, categoryKey: c.key })}
                      className={`px-5 py-3 rounded-xl border transition-colors text-sm shadow-sm ${
                        form.categoryKey === c.key 
                          ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A] font-bold' 
                          : 'bg-[#161618] border-[#2A2B2F] text-gray-400 font-semibold hover:bg-[#2A2B2F]'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel text="Input Type" />
                <div className="flex flex-wrap gap-2">
                  {['checkbox', 'number', 'slider', 'text', 'textarea'].map(t => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, inputType: t })}
                      className={`px-5 py-3 rounded-xl border transition-colors text-sm shadow-sm ${
                        form.inputType === t 
                          ? 'bg-white border-white text-black font-bold' 
                          : 'bg-[#161618] border-[#2A2B2F] text-gray-400 font-semibold hover:bg-[#2A2B2F]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel text="Direction" />
                <div className="flex gap-4">
                  <button
                    onClick={() => setForm({ ...form, direction: 'higher_better' })}
                    className={`flex-1 p-4 rounded-2xl border transition-colors shadow-sm text-center ${
                      form.direction === 'higher_better' 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 font-bold' 
                        : 'bg-[#161618] border-[#2A2B2F] text-gray-400 font-semibold hover:bg-[#2A2B2F]'
                    }`}
                  >
                    Higher = Better
                  </button>
                  <button
                    onClick={() => setForm({ ...form, direction: 'lower_better' })}
                    className={`flex-1 p-4 rounded-2xl border transition-colors shadow-sm text-center ${
                      form.direction === 'lower_better' 
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 font-bold' 
                        : 'bg-[#161618] border-[#2A2B2F] text-gray-400 font-semibold hover:bg-[#2A2B2F]'
                    }`}
                  >
                    Lower = Better
                  </button>
                </div>
              </div>

              {form.inputType === 'number' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <SectionLabel text="Unit" />
                    <input className="w-full bg-[#161618] border border-[#2A2B2F] px-4 py-3 rounded-xl font-semibold focus:border-[#E8414A]/50" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <SectionLabel text="Target" />
                    <input type="number" className="w-full bg-[#161618] border border-[#2A2B2F] px-4 py-3 rounded-xl font-semibold focus:border-[#E8414A]/50" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} />
                  </div>
                </div>
              )}

              {form.inputType === 'slider' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <SectionLabel text="Min" />
                    <input type="number" className="w-full bg-[#161618] border border-[#2A2B2F] px-4 py-3 rounded-xl font-semibold focus:border-[#E8414A]/50" value={form.min} onChange={e => setForm({ ...form, min: e.target.value })} />
                  </div>
                  <div>
                    <SectionLabel text="Max" />
                    <input type="number" className="w-full bg-[#161618] border border-[#2A2B2F] px-4 py-3 rounded-xl font-semibold focus:border-[#E8414A]/50" value={form.max} onChange={e => setForm({ ...form, max: e.target.value })} />
                  </div>
                  <div>
                    <SectionLabel text="Step" />
                    <input type="number" className="w-full bg-[#161618] border border-[#2A2B2F] px-4 py-3 rounded-xl font-semibold focus:border-[#E8414A]/50" value={form.step} onChange={e => setForm({ ...form, step: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={addSignal}
                  disabled={submitting}
                  className={`w-full py-4 rounded-2xl flex items-center justify-center text-[15px] font-bold transition-all shadow-sm ${
                    submitting
                      ? 'bg-[#2A2B2F] text-gray-500 cursor-not-allowed border border-[#2A2B2F]' 
                      : 'bg-white text-black hover:bg-gray-200'
                  }`}
                >
                  {submitting ? 'CREATING...' : '+ CREATE SIGNAL'}
                </button>
              </div>

            </div>
          </div>

          {/* List */}
          <div>
            <h2 className="text-xl font-bold mb-6 ml-2">Active Signals</h2>
            
            {loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-20 bg-[#1F2023] rounded-2xl" />
                <div className="h-20 bg-[#1F2023] rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-3">
                {signals.map(s => (
                  <div key={s.key} className="flex items-center bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 shadow-sm">
                    <div className="w-12 h-12 rounded-xl bg-[#2A2B2F] flex items-center justify-center mr-5 shrink-0">
                      <Activity size={20} className="text-gray-400" />
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-[15px] font-bold text-gray-100 mb-1">{s.label}</h3>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {s.key} • {s.inputType} • {s.categoryKey}
                      </p>
                    </div>
                    
                    <button 
                      onClick={() => removeSignal(s.key)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors ml-4 shrink-0"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
