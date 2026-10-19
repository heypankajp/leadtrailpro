import { api } from "@/lib/api";
import type { ListValuesByKey } from "@/features/list-values/model";
import type { TargetTemplate } from "@/features/targets/model";
import type { SystemRole, UserSummary } from "@/features/users/model";

export type ReferenceData = {
  listValues: ListValuesByKey;
  users: UserSummary[];
  roleLabels: Record<SystemRole, string>;
  inactivityDays: number;
  /** Holiday dates (`YYYY-MM-DD`) from the business calendar; weekends are always non-working. */
  holidays: string[];
  targetTemplates: TargetTemplate[];
  mailerConfigured: boolean;
  today: string;
  timeZone: string;
};

export function fetchReference(): Promise<ReferenceData> {
  return api<ReferenceData>("/api/reference");
}
