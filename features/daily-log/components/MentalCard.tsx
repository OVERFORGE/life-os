import { Card } from "../ui/Card";
import { SliderField } from "../ui/SliderField";
import { DailyLogForm } from "../types";

export function MentalCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  return (
    <Card title="Mental State" subtitle="How did your mind feel today?">
      <SliderField label="Mood" leftLabel="Terrible" rightLabel="Amazing" value={form.mental.mood}
        onChange={(v) => setForm({ ...form, mental: { ...form.mental, mood: v } })} />
      <SliderField label="Energy" leftLabel="Exhausted" rightLabel="Powerful" value={form.mental.energy}
        onChange={(v) => setForm({ ...form, mental: { ...form.mental, energy: v } })} />
      <SliderField label="Stress" leftLabel="Calm" rightLabel="Overwhelmed" value={form.mental.stress}
        onChange={(v) => setForm({ ...form, mental: { ...form.mental, stress: v } })} />
      <SliderField label="Anxiety" leftLabel="Relaxed" rightLabel="Anxious" value={form.mental.anxiety}
        onChange={(v) => setForm({ ...form, mental: { ...form.mental, anxiety: v } })} />
      <SliderField label="Focus" leftLabel="Distracted" rightLabel="Laser Focused" value={form.mental.focus}
        onChange={(v) => setForm({ ...form, mental: { ...form.mental, focus: v } })} />
    </Card>
  );
}
