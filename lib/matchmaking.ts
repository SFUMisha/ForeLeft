export type CompatibilityBreakdownKey =
  | "skill"
  | "handicap"
  | "interests"
  | "goals"
  | "traits"
  | "pace"
  | "round_time"
  | "frequency"
  | "swing"
  | "group"

export type Compatibility = {
  score: number
  breakdown: Partial<Record<CompatibilityBreakdownKey, number>>
}

const SKILL_ORDER: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3,
}

const ROUND_TIME_ORDER: Record<string, number> = {
  dawn: 0,
  morning: 1,
  midday: 2,
  afternoon: 3,
  evening: 4,
}

const FREQUENCY_ORDER: Record<string, number> = {
  monthly: 0,
  twice_per_month: 1,
  weekly: 2,
  multiple_per_week: 3,
}

const BREAKDOWN_LABEL_MAP: Record<CompatibilityBreakdownKey, string> = {
  skill: "Skill level",
  handicap: "Handicap fit",
  interests: "Shared interests",
  goals: "Match goals",
  traits: "Personality fit",
  pace: "Pace preference",
  round_time: "Tee time fit",
  frequency: "Play frequency",
  swing: "Swing tendency",
  group: "Group preference",
}

const clampScore = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return null
  }
  return Math.max(0, Math.min(1, value))
}

const overlapScore = (a?: string[] | null, b?: string[] | null): number | null => {
  if (!a || !b || a.length === 0 || b.length === 0) {
    return null
  }

  const setA = new Set(a)
  let overlap = 0

  for (const value of b) {
    if (setA.has(value)) {
      overlap += 1
    }
  }

  const unionSize = new Set([...a, ...b]).size
  if (unionSize === 0) {
    return null
  }

  return overlap / unionSize
}

export const computeCompatibility = (self: any, other: any): Compatibility => {
  if (!self || !other) {
    return { score: 0, breakdown: {} }
  }

  const breakdown: Partial<Record<CompatibilityBreakdownKey, number>> = {}
  let weightedScore = 0
  let weightTotal = 0

  const applyScore = (key: CompatibilityBreakdownKey, value: number | null, weight: number) => {
    const clamped = clampScore(value)
    if (clamped === null) {
      return
    }

    weightedScore += clamped * weight
    weightTotal += weight
    breakdown[key] = Math.round(clamped * 100)
  }

  const selfSkill = self?.skill_level ? SKILL_ORDER[self.skill_level] : undefined
  const otherSkill = other?.skill_level ? SKILL_ORDER[other.skill_level] : undefined
  if (selfSkill !== undefined && otherSkill !== undefined) {
    const diff = Math.abs(selfSkill - otherSkill)
    applyScore("skill", 1 - diff / 3, 0.18)
  }

  if (typeof self?.average_handicap === "number" && typeof other?.average_handicap === "number") {
    const diff = Math.abs(self.average_handicap - other.average_handicap)
    applyScore("handicap", 1 - Math.min(diff, 20) / 20, 0.12)
  }

  applyScore("interests", overlapScore(self?.interests, other?.interests), 0.12)
  applyScore("goals", overlapScore(self?.match_goals, other?.match_goals), 0.18)
  applyScore("traits", overlapScore(self?.personality_traits, other?.personality_traits), 0.15)

  if (self?.pace_of_play && other?.pace_of_play) {
    const paceScore = self.pace_of_play === other.pace_of_play ? 1 : 0.4
    applyScore("pace", paceScore, 0.1)
  }

  const selfRound = self?.preferred_round_time ? ROUND_TIME_ORDER[self.preferred_round_time] : undefined
  const otherRound = other?.preferred_round_time ? ROUND_TIME_ORDER[other.preferred_round_time] : undefined
  if (selfRound !== undefined && otherRound !== undefined) {
    const diff = Math.abs(selfRound - otherRound)
    const roundScore = diff === 0 ? 1 : diff === 1 ? 0.7 : diff === 2 ? 0.4 : 0.2
    applyScore("round_time", roundScore, 0.05)
  }

  const selfFreq = self?.play_frequency ? FREQUENCY_ORDER[self.play_frequency] : undefined
  const otherFreq = other?.play_frequency ? FREQUENCY_ORDER[other.play_frequency] : undefined
  if (selfFreq !== undefined && otherFreq !== undefined) {
    const diff = Math.abs(selfFreq - otherFreq)
    applyScore("frequency", 1 - diff / 3, 0.05)
  }

  if (self?.swing_tendency && other?.swing_tendency) {
    let swingScore = 0.4
    if (self.swing_tendency === other.swing_tendency) {
      swingScore = 1
    } else if (self.swing_tendency === "straight" || other.swing_tendency === "straight") {
      swingScore = 0.7
    }
    applyScore("swing", swingScore, 0.03)
  }

  if (self?.group_preference && other?.group_preference) {
    let groupScore = 0.6
    if (self.group_preference === "flexible" || other.group_preference === "flexible") {
      groupScore = 1
    } else if (self.group_preference === other.group_preference) {
      groupScore = 1
    }
    applyScore("group", groupScore, 0.02)
  }

  const normalized = weightTotal > 0 ? Math.round((weightedScore / weightTotal) * 100) : 0

  return {
    score: normalized,
    breakdown,
  }
}

export const BREAKDOWN_LABELS = BREAKDOWN_LABEL_MAP

export const formatLabel = (value?: string | null) => {
  if (!value) {
    return ""
  }

  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => (segment ? segment[0].toUpperCase() + segment.slice(1) : ""))
    .join(" ")
}
