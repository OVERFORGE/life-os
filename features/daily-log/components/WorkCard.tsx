import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";
import { CheckboxField } from "../ui/CheckboxField";
import { TextareaField } from "../ui/TextareaField";
import { DailyLogForm } from "../types";

export function WorkCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  return (
    <Card title="Work & Output" subtitle="Your productive work today">
      <InputField label="Deep Work Hours" type="number" value={form.work.deepWorkHours}
        onChange={(v) => setForm({ ...form, work: { ...form.work, deepWorkHours: Number(v) } })} />

      <CheckboxField label="Coded today" checked={form.work.coded}
        onChange={(v) => setForm({ ...form, work: { ...form.work, coded: v } })} />

      <CheckboxField label="Worked on Executioners" checked={form.work.executioners}
        onChange={(v) => setForm({ ...form, work: { ...form.work, executioners: v } })} />

      <CheckboxField label="Studied / Learned" checked={form.work.studied}
        onChange={(v) => setForm({ ...form, work: { ...form.work, studied: v } })} />

      <TextareaField label="Main thing you worked on" value={form.work.mainWork}
        onChange={(v) => setForm({ ...form, work: { ...form.work, mainWork: v } })} />
    </Card>
  );
}
