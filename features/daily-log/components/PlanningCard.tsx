import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";
import { TextareaField } from "../ui/TextareaField";
import { DailyLogForm } from "../types";

export function PlanningCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  return (
    <Card title="Planning vs Reality" subtitle="How honest were you with your plan?">
      <InputField label="Planned tasks" type="number" value={form.planning.plannedTasks}
        onChange={(v) => setForm({ ...form, planning: { ...form.planning, plannedTasks: Number(v) } })} />

      <InputField label="Completed tasks" type="number" value={form.planning.completedTasks}
        onChange={(v) => setForm({ ...form, planning: { ...form.planning, completedTasks: Number(v) } })} />

      <TextareaField label="Why didn't you complete them?" value={form.planning.reasonNotCompleted}
        onChange={(v) => setForm({ ...form, planning: { ...form.planning, reasonNotCompleted: v } })} />
    </Card>
  );
}
