import { Card } from "../ui/Card";
import { CheckboxField } from "../ui/CheckboxField";
import { InputField } from "../ui/InputField";
import { DailyLogForm } from "../types";

export function HabitsCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  const h = form.habits;

  return (
    <Card title="Habits & Discipline" subtitle="Daily discipline check">
      {["gym","reading","meditation","coding","content","learning","noFap"].map((k) => (
        <CheckboxField key={k} label={k} checked={(h as any)[k]}
          onChange={(v) => setForm({ ...form, habits: { ...h, [k]: v } })} />
      ))}

      <CheckboxField label="Ate Junk Food" checked={h.junkFood.had}
        onChange={(v) => setForm({ ...form, habits: { ...h, junkFood: { ...h.junkFood, had: v } } })} />

      {h.junkFood.had && (
        <>
          <InputField label="How many times?" type="number" value={h.junkFood.times}
            onChange={(v) => setForm({ ...form, habits: { ...h, junkFood: { ...h.junkFood, times: Number(v) } } })} />
          <InputField label="What did you eat?" value={h.junkFood.what}
            onChange={(v) => setForm({ ...form, habits: { ...h, junkFood: { ...h.junkFood, what: v } } })} />
        </>
      )}

      <CheckboxField label="Social media overuse" checked={h.socialMediaOveruse}
        onChange={(v) => setForm({ ...form, habits: { ...h, socialMediaOveruse: v } })} />
    </Card>
  );
}
