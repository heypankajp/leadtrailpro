import type { UserStage } from "@/features/users/model";

export type TargetTemplate = {
  id: number;
  name: string;
  stage: UserStage;
  dailyLeads: number;
  weeklyLeads: number;
  dailyVisits: number;
  weeklyVisits: number;
  monthlyConversions: number;
};

export type TargetTemplateInput = Omit<TargetTemplate, "id">;

const nonNegativeInt = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100000;

export function parseTargetTemplate(value: unknown, partial = false): Partial<TargetTemplateInput> | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const input: Partial<TargetTemplateInput> = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) return null;
    input.name = body.name.trim();
  }
  if (body.stage !== undefined || !partial) {
    if (body.stage !== "onboarding" && body.stage !== "training" && body.stage !== "full_productive") return null;
    input.stage = body.stage;
  }
  for (const key of ["dailyLeads", "weeklyLeads", "dailyVisits", "weeklyVisits", "monthlyConversions"] as const) {
    if (body[key] !== undefined || !partial) {
      const number = typeof body[key] === "string" ? Number(body[key]) : body[key];
      if (!nonNegativeInt(number)) return null;
      input[key] = Number(number);
    }
  }
  return input;
}
