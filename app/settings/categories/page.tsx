"use client";

import { useEffect, useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { InputField } from "@/features/daily-log/ui/InputField";

type Category = {
  key: string;
  label: string;
  order: number;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);

  const [form, setForm] = useState({
    key: "",
    label: "",
    order: 0,
  });

  /* ---------------- Load ---------------- */

  async function load() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.categories || []);
  }

  useEffect(() => {
    load();
  }, []);

  /* ---------------- Actions ---------------- */

  async function addCategory() {
    if (!form.key || !form.label) return;

    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setForm({ key: "", label: "", order: 0 });
    load();
  }

  async function removeCategory(key: string) {
    await fetch(`/api/categories?key=${key}`, { method: "DELETE" });
    load();
  }

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-semibold">Life Categories</h1>

        <div className="text-sm text-gray-400 max-w-xl">
          Categories define the structure of your Daily Check-in. Signals live
          inside categories like Discipline, Training, Nutrition, etc.
        </div>

        {/* Add Category */}
        <Card
          title="Create Category"
          subtitle="Add a new section to your daily form"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField
              label="Key"
              description="internal id (discipline)"
              value={form.key}
              onChange={(v) => setForm({ ...form, key: v })}
            />

            <InputField
              label="Label"
              description="shown in UI (Discipline)"
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
            />

            <InputField
              label="Order"
              description="sorting priority"
              type="number"
              value={form.order}
              onChange={(v) => setForm({ ...form, order: Number(v) })}
            />
          </div>

          <button
            onClick={addCategory}
            className="px-5 py-2 rounded-lg bg-white text-black font-semibold active:scale-[0.98] transition"
          >
            + Add Category
          </button>
        </Card>

        {/* Existing Categories */}
        <Card
          title="Your Categories"
          subtitle="These will appear in your check-in form"
        >
          {categories.length === 0 && (
            <div className="text-sm text-gray-500">
              No categories yet. Create your first one above.
            </div>
          )}

          <div className="space-y-3">
            {categories.map((c) => (
              <div
                key={c.key}
                className="flex justify-between items-center bg-[#0f1115] border border-[#232632] rounded-xl p-3"
              >
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-gray-500">
                    key: {c.key} · order: {c.order}
                  </div>
                </div>

                <button
                  onClick={() => removeCategory(c.key)}
                  className="text-sm text-red-400 hover:text-red-300 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
