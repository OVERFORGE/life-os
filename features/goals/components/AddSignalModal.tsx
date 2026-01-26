"use client";

import { SIGNAL_CATALOG } from "../signalCatalog";
import { useState } from "react";

export function AddSignalModal({
  onClose,
  onAdd,
  existingKeys,
}: {
  onClose: () => void;
  onAdd: (signal: { key: string; weight: number }) => void;
  existingKeys: string[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [weight, setWeight] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#0f1115] border border-[#232632] rounded-2xl p-6 space-y-6 shadow-2xl">
        <div className="text-lg font-semibold">Add Signal</div>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
          {Object.entries(SIGNAL_CATALOG).map(([group, keys]) => (
            <div key={group} className="space-y-2">
              <div className="text-xs uppercase text-gray-500 tracking-wider">
                {group}
              </div>

              <div className="grid grid-cols-1 gap-2">
                {keys.map((key) => {
                  const disabled = existingKeys.includes(key);

                  return (
                    <button
                      key={key}
                      disabled={disabled}
                      onClick={() => setSelectedKey(key)}
                      className={`text-left px-3 py-2 rounded-lg border transition ${
                        selectedKey === key
                          ? "border-white bg-[#161922]"
                          : "border-[#232632] bg-[#0f1115]"
                      } ${
                        disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-[#161922]"
                      }`}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-[#232632]">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Weight</span>
            <input
              type="number"
              min={1}
              max={10}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="w-20 bg-[#0f1115] border border-[#232632] rounded px-2 py-1 text-sm"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#232632] text-gray-300"
            >
              Cancel
            </button>

            <button
              disabled={!selectedKey}
              onClick={() => {
                if (!selectedKey) return;
                onAdd({ key: selectedKey, weight });
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-40"
            >
              Add Signal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
