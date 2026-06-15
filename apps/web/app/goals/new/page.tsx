"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddSignalModal } from "@/features/goals/components/AddSignalModal";

type Signal = {
  key: string;
  weight: number;
};

export default function NewGoalPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"identity" | "performance" | "maintenance" | "recovery">("identity");

  const [signals, setSignals] = useState<Signal[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-2xl mx-auto p-6 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Create New Goal</h1>
          <div className="text-sm text-gray-400">Step {step} of 3</div>
        </div>

        {/* Step 1 — Basics */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Goal Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Become a serious Solana developer"
                className="w-full bg-[#161922] border border-[#232632] rounded-xl px-4 py-3"
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm text-gray-400">Goal Type</div>

              <div className="grid grid-cols-2 gap-3">
                {["identity", "performance", "maintenance", "recovery"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t as any)}
                    className={`px-4 py-3 rounded-xl border transition ${
                      type === t
                        ? "border-white bg-[#161922]"
                        : "border-[#232632] bg-[#0f1115]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Signals */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">Signals</div>
              <button
                onClick={() => setShowModal(true)}
                className="text-sm px-3 py-1.5 rounded-lg border border-[#232632] bg-[#161922]"
              >
                + Add Signal
              </button>
            </div>

            {signals.length === 0 && (
              <div className="text-sm text-gray-500">
                No signals added yet.
              </div>
            )}

            <div className="space-y-3">
              {signals.map((s, idx) => (
                <div
                  key={s.key}
                  className="bg-[#161922] border border-[#232632] rounded-xl p-4 flex justify-between items-center"
                >
                  <div>{s.key}</div>

                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={s.weight}
                      onChange={(e) => {
                        const next = [...signals];
                        next[idx] = { ...next[idx], weight: Number(e.target.value) };
                        setSignals(next);
                      }}
                      className="w-16 bg-[#0f1115] border border-[#232632] rounded px-2 py-1"
                    />

                    <button
                      onClick={() => {
                        setSignals(signals.filter((_, i) => i !== idx));
                      }}
                      className="text-xs text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-3">
              <div className="font-medium">{title}</div>
              <div className="text-sm text-gray-400">Type: {type}</div>

              <div className="text-sm text-gray-400">
                Signals: {signals.length}
              </div>
            </div>

            <div className="space-y-2">
              {signals.map((s) => (
                <div
                  key={s.key}
                  className="text-sm text-gray-300 flex justify-between"
                >
                  <span>{s.key}</span>
                  <span>Weight {s.weight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between pt-6 border-t border-[#232632]">
          <button
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
            className="px-4 py-2 rounded-lg border border-[#232632]"
          >
            Back
          </button>

          {step < 3 && (
            <button
              disabled={(step === 1 && !title) || (step === 2 && signals.length === 0)}
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-40"
            >
              Next
            </button>
          )}

          {step === 3 && (
            <button
              disabled={creating}
              onClick={async () => {
                setCreating(true);
                const res = await fetch("/api/goals/create", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title,
                    type,
                    signals,
                  }),
                });

                const data = await res.json();
                router.push(`/goals/${data.id}`);
              }}
              className="px-4 py-2 rounded-lg bg-white text-black font-semibold"
            >
              {creating ? "Creating..." : "Create Goal"}
            </button>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <AddSignalModal
          existingKeys={signals.map((s) => s.key)}
          onClose={() => setShowModal(false)}
          onAdd={(signal) => setSignals([...signals, signal])}
        />
      )}
    </div>
  );
}
