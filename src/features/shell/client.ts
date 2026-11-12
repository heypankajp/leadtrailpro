import { api } from "@/lib/api";
import type { ListValuesByKey } from "@/features/list-values/model";
import type { PipelineSettings } from "@/features/settings/model";
import type { TargetTemplate } from "@/features/targets/model";
import type { SystemRole, UserSummary } from "@/features/users/model";

export type ReferenceData = {
  listValues: ListValuesByKey;
  users: UserSummary[];
  roleLabels: Record<SystemRole, string>;
  inactivityDays: number;
  /** PIPE-09: the next step each stage suggests and whether the app asks for one. */
  pipeline: PipelineSettings;
  /** Holiday dates (`YYYY-MM-DD`) from the business calendar; weekends are always non-working. */
  holidays: string[];
  targetTemplates: TargetTemplate[];
  mailerConfigured: boolean;
  /** False when a Google client is configured: no passwords, resets, or two-factor codes anywhere. */
  passwordSignIn: boolean;
  today: string;
  timeZone: string;
};

export function fetchReference(): Promise<ReferenceData> {
  return api<ReferenceData>("/api/reference");
}
