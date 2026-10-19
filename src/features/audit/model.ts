export type AuditEntry = {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  details: string | null;
  createdAt: string;
};
