import { User } from "@/server/db/models/User";
import { connectDB } from "@/server/db/connect";

const DIET_MODE_DEFAULTS: Record<string, number> = {
    bulk: 500,
    slight_bulk: 250,
    recomp: 0,
    slight_cut: -250,
    cut: -500,
};

const DIET_MODE_LABELS: Record<string, string> = {
    bulk: 'Bulk (+500 kcal)',
    slight_bulk: 'Slight Bulk (+250 kcal)',
    recomp: 'Recomp (~maintenance)',
    slight_cut: 'Slight Cut (−250 kcal)',
    cut: 'Cut (−500 kcal)',
};

export async function handleSetDietMode(
    payload: { mode: string; calorieOffset?: number; confirmed?: boolean; proposalText?: string },
    userId: string
) {
    await connectDB();

    // ── PROPOSAL PHASE ──────────────────────────────────────────────────
    // If mode is given but not confirmed yet, return a proposal for user to approve
    if (!payload.confirmed) {
        const mode = payload.mode?.toLowerCase().replace(' ', '_');
        if (!DIET_MODE_DEFAULTS.hasOwnProperty(mode)) {
            return {
                type: 'error',
                message: `Unknown diet mode "${payload.mode}". Valid options: bulk, slight_bulk, recomp, slight_cut, cut`,
            };
        }

        const user = await User.findById(userId).select('maintenanceCalories').lean();
        const maintenance = user?.maintenanceCalories || 2200;
        const defaultOffset = DIET_MODE_DEFAULTS[mode];
        const suggestedTarget = maintenance + defaultOffset;
        const suggestedOffset = payload.calorieOffset ?? defaultOffset;
        const finalTarget = maintenance + suggestedOffset;

        return {
            type: 'propose_diet_mode',
            pendingPayload: { mode, calorieOffset: suggestedOffset, confirmed: true },
            proposalText: payload.proposalText || [
                `Based on your maintenance of **${maintenance} kcal**, here's what I suggest for **${DIET_MODE_LABELS[mode]}**:`,
                ``,
                `• Diet mode: **${mode.replace('_', ' ')}**`,
                `• Calorie offset: **${suggestedOffset > 0 ? '+' : ''}${suggestedOffset} kcal/day**`,
                `• New daily target: **${finalTarget} kcal**`,
                ``,
                `This is a ${Math.abs(defaultOffset) === Math.abs(suggestedOffset) ? 'standard' : 'custom'} ${mode.includes('cut') ? 'deficit' : mode === 'recomp' ? 'maintenance' : 'surplus'}.`,
                `Want to go with **${finalTarget} kcal**, or would you prefer a different amount? (Reply "yes" to confirm, or tell me a different calorie target)`,
            ].join('\n'),
        };
    }

    // ── CONFIRMATION PHASE ──────────────────────────────────────────────
    const mode = payload.mode?.toLowerCase().replace(' ', '_');
    const user = await User.findById(userId).select('maintenanceCalories').lean();
    const maintenance = user?.maintenanceCalories || 2200;
    const offset = payload.calorieOffset ?? DIET_MODE_DEFAULTS[mode] ?? 0;
    const newTarget = Math.max(1200, maintenance + offset);

    await User.findByIdAndUpdate(userId, {
        $set: {
            dietMode: mode,
            dietModeCalorieOffset: offset,
            targetCalories: newTarget,
        }
    });

    return {
        type: 'diet_mode_set',
        mode,
        calorieOffset: offset,
        newTargetCalories: newTarget,
        message: `✅ Diet mode updated to **${mode.replace('_', ' ')}**. Your new daily calorie target is **${newTarget} kcal** (maintenance ${maintenance} ${offset >= 0 ? '+' : ''}${offset}).`,
    };
}
