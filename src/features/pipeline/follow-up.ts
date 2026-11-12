import { todayYmd, zonedDateTimeToUtc } from "@/lib/dates";
import type { LeadSummary } from "@/features/leads/model";
import { updateLead } from "@/features/leads/repository";
import { getSettings } from "@/features/settings/repository";
import type { Task } from "@/features/tasks/model";
import { createTask } from "@/features/tasks/repository";
import type { UserAccount } from "@/features/users/model";
import { defaultNextStep } from "./model";

/**
 * PIPE-09 with Settings → Pipeline "create automatically" on: when a lead reaches a stage that suggests a next step, the task is
 * created for the owner without asking (Pipedrive's "deal moved → schedule a call"), due at 09:00 business time the given number
 * of working days later, and the lead's follow-up date moves to that day unless a later one is set. Called by the routes after
 * the stage changed, outside the move's transaction, so a failure here never undoes the move. Returns the task, or null when the
 * switch is off or the stage has no suggestion.
 */
export async function createStageFollowUp(lead: LeadSummary, actor: UserAccount): Promise<Task | null> {
  const settings = await getSettings();
  if (!settings.pipeline.autoFollowUp || !lead.stageCode || !settings.pipeline.followUps[lead.stageCode] || lead.recordState !== "active") return null;
  const today = todayYmd();
  const step = defaultNextStep(lead.stageCode, settings.pipeline, today, settings.holidays.map((holiday) => holiday.date), { executive: lead.clientExecutive, client: lead.clientName });
  const task = await createTask({
    leadId: lead.id, title: step.title, description: `Suggested next step after reaching ${lead.stage ?? "the stage"}.`, assigneeId: lead.ownerId,
    dueAt: zonedDateTimeToUtc(step.date, 9, 0).toISOString(), priority: "normal", checklist: [],
  }, actor);
  if (!lead.followUpDate || lead.followUpDate < step.date) await updateLead(lead.id, { followUpDate: step.date }, actor);
  return task;
}
