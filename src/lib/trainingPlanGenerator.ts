import type { RecentTrainingLoad } from "@/src/lib/activityMetrics";

export type WorkoutType =
  | "Endurance"
  | "Tempo"
  | "Threshold"
  | "VO2"
  | "Recovery"
  | "Climbing"
  | "Long Ride";

export const WORKOUT_TYPES: WorkoutType[] = [
  "Endurance",
  "Tempo",
  "Threshold",
  "VO2",
  "Recovery",
  "Climbing",
  "Long Ride",
];

export type GeneratedWorkout = {
  scheduled_date: string;
  week_number: number;
  workout_type: WorkoutType;
  title: string;
  description: string;
  duration_minutes: number;
  distance_miles: number | null;
  elevation_feet: number | null;
  intensity: string;
};

export type PlanGoalInput = {
  id: string;
  name: string;
  event_date: string;
  event_type: string | null;
  distance_miles: number | null;
  elevation_feet: number | null;
  expected_high_temp_f: number | null;
};

export type PlanGenerationInput = {
  goal: PlanGoalInput | null;
  daysUntilEvent: number | null;
  recentTrainingLoad: RecentTrainingLoad;
  readinessScore: number;
  availableTrainingDays: number[];
  startDate: Date;
};

export type GeneratedPlan = {
  totalWeeks: number;
  startDate: string;
  endDate: string;
  workouts: GeneratedWorkout[];
};

const DEFAULT_WEEKLY_DISTANCE_MILES = 40;
const DEFAULT_WEEKLY_ELEVATION_FEET = 1000;
const MAX_PLAN_WEEKS = 12;
const DEFAULT_PLAN_WEEKS = 4;

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type WorkoutContext = {
  avgSpeedMph: number;
  weekElevation: number;
  longRideDistance: number;
  enduranceDistance: number;
  climbingDistance: number;
  goal: PlanGoalInput | null;
  isHeatFocus: boolean;
  isRun: boolean;
  loadMultiplier: number;
};

function buildWorkoutDetail(type: WorkoutType, ctx: WorkoutContext): Omit<GeneratedWorkout, "scheduled_date" | "week_number" | "workout_type"> {
  const { avgSpeedMph, weekElevation, longRideDistance, enduranceDistance, climbingDistance, goal, isHeatFocus, isRun, loadMultiplier } = ctx;
  const activityNoun = isRun ? "Run" : "Ride";
  const heatNote = isHeatFocus
    ? ` Practice heat-adaptation strategies — train in warm conditions when possible and dial in hydration and electrolytes for ${goal?.name ?? "race day"}.`
    : "";

  switch (type) {
    case "Long Ride": {
      const distance = round(Math.max(longRideDistance, 0), 1);
      const elevation = goal?.elevation_feet && goal?.distance_miles
        ? round(goal.elevation_feet * (longRideDistance / goal.distance_miles))
        : round(weekElevation * 0.4);
      return {
        title: `Long ${activityNoun}`,
        description: `Steady, sustained ${activityNoun.toLowerCase()} to build the endurance needed for ${goal?.name ?? "your goal event"}.${heatNote}`,
        duration_minutes: round((distance / avgSpeedMph) * 60),
        distance_miles: distance,
        elevation_feet: elevation,
        intensity: "Zone 2 — steady aerobic effort",
      };
    }
    case "Endurance": {
      const distance = round(Math.max(enduranceDistance, 0), 1);
      return {
        title: `Endurance ${activityNoun}`,
        description: `Easy aerobic ${activityNoun.toLowerCase()} to build your training base without adding fatigue.${heatNote}`,
        duration_minutes: round((distance / avgSpeedMph) * 60),
        distance_miles: distance,
        elevation_feet: round(weekElevation * 0.15),
        intensity: "Zone 2 — conversational pace",
      };
    }
    case "Tempo": {
      const duration = round(60 * loadMultiplier);
      return {
        title: "Tempo",
        description: "Sustained tempo effort: 2 x 20 minutes at Zone 3 with 5 minutes easy recovery between efforts.",
        duration_minutes: duration,
        distance_miles: round((duration / 60) * avgSpeedMph, 1),
        elevation_feet: round(weekElevation * 0.1),
        intensity: "Zone 3 — moderately hard, sustainable for about an hour",
      };
    }
    case "Threshold": {
      const duration = round(75 * loadMultiplier);
      return {
        title: "Threshold Intervals",
        description: "3 x 10 minutes at threshold (Zone 4) with 5 minutes easy recovery between efforts.",
        duration_minutes: duration,
        distance_miles: round((duration / 60) * avgSpeedMph, 1),
        elevation_feet: round(weekElevation * 0.1),
        intensity: "Zone 4 — threshold intervals",
      };
    }
    case "VO2": {
      const duration = round(60 * loadMultiplier);
      return {
        title: "VO2 Max Intervals",
        description: "5 x 3 minutes at VO2 max effort (Zone 5) with 3 minutes easy recovery between efforts.",
        duration_minutes: duration,
        distance_miles: round((duration / 60) * avgSpeedMph, 1),
        elevation_feet: round(weekElevation * 0.05),
        intensity: "Zone 5 — short, very high-intensity intervals",
      };
    }
    case "Recovery": {
      const duration = 30;
      return {
        title: "Recovery Spin",
        description: "Very easy spin to promote recovery. Keep effort light and avoid hard efforts or hills.",
        duration_minutes: duration,
        distance_miles: round((duration / 60) * avgSpeedMph, 1),
        elevation_feet: 0,
        intensity: "Zone 1 — very easy recovery",
      };
    }
    case "Climbing": {
      const distance = round(Math.max(climbingDistance, 0), 1);
      const elevationTarget = goal?.elevation_feet ? `${Math.round(goal.elevation_feet)} ft of gain at ` : "";
      return {
        title: "Climbing Repeats",
        description: `Sustained climbing efforts to build the climbing strength needed for ${elevationTarget}${goal?.name ?? "your goal event"}: repeats of 8-15 minutes at Zone 3-4.`,
        duration_minutes: round((distance / avgSpeedMph) * 60 * 1.2),
        distance_miles: distance,
        elevation_feet: round(weekElevation * 0.45),
        intensity: "Zone 3-4 — sustained climbing efforts",
      };
    }
  }
}

export function generateTrainingPlan(input: PlanGenerationInput): GeneratedPlan {
  const { goal, daysUntilEvent, recentTrainingLoad, readinessScore, availableTrainingDays, startDate } = input;

  const totalWeeks =
    daysUntilEvent != null && daysUntilEvent > 0
      ? Math.min(Math.max(Math.ceil(daysUntilEvent / 7), 1), MAX_PLAN_WEEKS)
      : DEFAULT_PLAN_WEEKS;

  const trainingDays = Array.from(new Set(availableTrainingDays)).filter((day) => day >= 0 && day <= 6);

  const baseDistance = recentTrainingLoad.average_weekly_distance_miles > 0
    ? recentTrainingLoad.average_weekly_distance_miles
    : DEFAULT_WEEKLY_DISTANCE_MILES;
  const baseElevation = recentTrainingLoad.average_weekly_elevation_feet > 0
    ? recentTrainingLoad.average_weekly_elevation_feet
    : DEFAULT_WEEKLY_ELEVATION_FEET;

  const goalDistance = goal?.distance_miles ?? null;
  const goalElevation = goal?.elevation_feet ?? null;
  const isClimbingFocus = Boolean(goalDistance && goalElevation && goalElevation / goalDistance >= 50);
  const isHeatFocus = Boolean(goal?.expected_high_temp_f != null && goal.expected_high_temp_f > 80);
  const isRun = Boolean(goal?.event_type && /run|marathon/i.test(goal.event_type));
  const avgSpeedMph = isRun ? 6 : 14;

  const intensityBudget = readinessScore >= 75 ? 2 : readinessScore >= 55 ? 1 : 0;
  const intensityTypes: WorkoutType[] = readinessScore >= 75 ? ["Threshold", "VO2"] : ["Tempo"];

  const workouts: GeneratedWorkout[] = [];

  for (let week = 0; week < totalWeeks; week++) {
    const weekNumber = week + 1;
    const isTaperWeek = totalWeeks > 1 && week === totalWeeks - 1;
    const isRecoveryWeek = !isTaperWeek && totalWeeks >= 4 && weekNumber % 4 === 0;

    let loadMultiplier: number;
    if (isTaperWeek) loadMultiplier = 0.5;
    else if (isRecoveryWeek) loadMultiplier = 0.7;
    else {
      const buildWeeks = totalWeeks > 1 ? totalWeeks - 1 : 1;
      const progress = buildWeeks > 1 ? week / (buildWeeks - 1) : 1;
      loadMultiplier = 0.85 + progress * 0.45;
    }

    const weekDistance = baseDistance * loadMultiplier;
    const weekElevation = baseElevation * loadMultiplier;

    let longRideDistance: number;
    if (goalDistance) {
      const peak = goalDistance * 0.8;
      if (isTaperWeek) longRideDistance = Math.min(peak, goalDistance * 0.4);
      else if (isRecoveryWeek) longRideDistance = Math.min(peak, weekDistance * 0.45);
      else {
        const buildWeeks = totalWeeks > 1 ? totalWeeks - 1 : 1;
        const progress = buildWeeks > 1 ? week / (buildWeeks - 1) : 1;
        longRideDistance = Math.min(peak, weekDistance * 0.45 * (0.6 + progress * 0.4) + peak * progress * 0.3);
      }
    } else {
      longRideDistance = weekDistance * 0.35;
    }
    longRideDistance = Math.max(longRideDistance, weekDistance * 0.25);

    const weekStart = addDays(startDate, week * 7);
    const weekDates: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      if (trainingDays.includes(date.getDay())) weekDates.push(date);
    }

    if (weekDates.length === 0) continue;

    const assignments: (WorkoutType | null)[] = new Array(weekDates.length).fill(null);

    let longRideIdx = weekDates.findIndex((d) => d.getDay() === 6);
    if (longRideIdx === -1) longRideIdx = weekDates.findIndex((d) => d.getDay() === 0);
    if (longRideIdx === -1) longRideIdx = weekDates.length - 1;
    assignments[longRideIdx] = "Long Ride";

    if (weekDates.length >= 2) {
      const recoveryIdx = (longRideIdx + 1) % weekDates.length;
      if (assignments[recoveryIdx] == null) assignments[recoveryIdx] = "Recovery";
    }

    const remaining = assignments
      .map((value, idx) => (value == null ? idx : -1))
      .filter((idx) => idx !== -1);

    if (isTaperWeek || isRecoveryWeek) {
      remaining.forEach((idx, position) => {
        assignments[idx] = position % 2 === 0 ? "Endurance" : "Recovery";
      });
    } else {
      let placedIntensity = 0;
      let climbingPlaced = !isClimbingFocus;
      remaining.forEach((idx) => {
        if (placedIntensity < intensityBudget && placedIntensity < intensityTypes.length) {
          assignments[idx] = intensityTypes[placedIntensity];
          placedIntensity++;
        } else if (!climbingPlaced) {
          assignments[idx] = "Climbing";
          climbingPlaced = true;
        } else {
          assignments[idx] = "Endurance";
        }
      });
    }

    const enduranceCount = assignments.filter((type) => type === "Endurance").length;
    const climbingDistance = weekDistance * 0.3;
    let nonLongDistance = weekDistance - longRideDistance;
    if (assignments.includes("Climbing")) nonLongDistance -= climbingDistance;
    const enduranceDistance = enduranceCount > 0 ? Math.max(nonLongDistance, 0) / enduranceCount : 0;

    weekDates.forEach((date, idx) => {
      const type = assignments[idx]!;
      const detail = buildWorkoutDetail(type, {
        avgSpeedMph,
        weekElevation,
        longRideDistance,
        enduranceDistance,
        climbingDistance,
        goal,
        isHeatFocus,
        isRun,
        loadMultiplier,
      });

      workouts.push({
        scheduled_date: formatLocalDate(date),
        week_number: weekNumber,
        workout_type: type,
        ...detail,
      });
    });
  }

  const endDate = addDays(startDate, totalWeeks * 7 - 1);

  return {
    totalWeeks,
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
    workouts,
  };
}
