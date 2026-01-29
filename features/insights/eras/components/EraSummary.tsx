export function EraSummary({ era }: any) {
  const mood = era.summaryVector.avgMood.toFixed(1);
  const energy = era.summaryVector.avgEnergy.toFixed(1);
  const stress = era.summaryVector.avgStress.toFixed(1);

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-6 text-gray-300 leading-relaxed">
      During this period, your life was mostly dominated by{" "}
      <b>{era.dominantPhase}</b>. Your average mood was{" "}
      <b>{mood}</b>, energy <b>{energy}</b>, and stress <b>{stress}</b>.
      The overall direction of this chapter was <b>{era.direction}</b>, with{" "}
      <b>{Math.round(era.stability * 100)}%</b> stability.
    </div>
  );
}
