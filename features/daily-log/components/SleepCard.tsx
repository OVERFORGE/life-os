import { Card } from "../ui/Card";
import { SliderField } from "../ui/SliderField";
import { InputField } from "../ui/InputField";
import { DailyLogForm } from "../types";

export function SleepCard({ form, setForm }: { form: DailyLogForm; setForm: (f: DailyLogForm) => void }) {
  return (
    <Card title="Sleep" subtitle="Your rest and recovery">
      <InputField label="Sleep Hours" type="number" value={form.sleep.hours}
        onChange={(v) => setForm({ ...form, sleep: { ...form.sleep, hours: Number(v) } })} />

      <SliderField label="Sleep Quality" leftLabel="Very bad" rightLabel="Excellent" value={form.sleep.quality}
        onChange={(v) => setForm({ ...form, sleep: { ...form.sleep, quality: v } })} />

      <InputField label="Sleep Time" type="time" value={form.sleep.sleepTime}
        onChange={(v) => setForm({ ...form, sleep: { ...form.sleep, sleepTime: v } })} />

      <InputField label="Wake Time" type="time" value={form.sleep.wakeTime}
        onChange={(v) => setForm({ ...form, sleep: { ...form.sleep, wakeTime: v } })} />
    </Card>
  );
}
