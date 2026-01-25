import { Card } from "../ui/Card";
import { TextareaField } from "../ui/TextareaField";
import { DailyLogForm } from "../types";

export function ReflectionCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  return (
    <Card title="Reflection" subtitle="Close the day consciously">
      <TextareaField label="1 Win" value={form.reflection.win}
        onChange={(v) => setForm({ ...form, reflection: { ...form.reflection, win: v } })} />

      <TextareaField label="1 Mistake" value={form.reflection.mistake}
        onChange={(v) => setForm({ ...form, reflection: { ...form.reflection, mistake: v } })} />

      <TextareaField label="What did you learn?" value={form.reflection.learned}
        onChange={(v) => setForm({ ...form, reflection: { ...form.reflection, learned: v } })} />

      <TextareaField label="What's bothering your mind?" value={form.reflection.bothering}
        onChange={(v) => setForm({ ...form, reflection: { ...form.reflection, bothering: v } })} />
    </Card>
  );
}
