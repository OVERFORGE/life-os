import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";
import { CheckboxField } from "../ui/CheckboxField";
import { SelectField } from "../ui/SelectField";
import { TextareaField } from "../ui/TextareaField";
import { DailyLogForm } from "../types";

export function PhysicalCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  return (
    <Card title="Physical Health" subtitle="Your body and energy">
      <CheckboxField label="Went to gym" checked={form.physical.gym}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, gym: v } })} />

      <InputField label="Workout Type" value={form.physical.workoutType}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, workoutType: v } })} />

      <InputField label="Calories" type="number" value={form.physical.calories}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, calories: Number(v) } })} />

      <InputField label="Meals" type="number" value={form.physical.meals}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, meals: Number(v) } })} />

      <InputField label="Steps" type="number" value={form.physical.steps}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, steps: Number(v) } })} />

      <SelectField label="Body Feeling" value={form.physical.bodyFeeling}
        options={["weak", "normal", "strong"]}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, bodyFeeling: v as any } })} />

      <TextareaField label="Pain / Sickness" value={form.physical.painNote}
        onChange={(v) => setForm({ ...form, physical: { ...form.physical, painNote: v } })} />
    </Card>
  );
}
