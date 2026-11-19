/** "contract": the signed contract of a deal or client (request of November 19, 2026). */
export const attachmentCategories = ["document", "profile", "contract"] as const;
export type AttachmentCategory = (typeof attachmentCategories)[number];

export type LeadAttachment = {
  id: number;
  leadId: number;
  category: AttachmentCategory;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  replacesId: number | null;
  uploadedById: number;
  uploadedByName: string;
  deletedAt: string | null;
  deletedByName: string | null;
  createdAt: string;
};

/** Document labels offered in the upload form; "Other" lets the user type a name. */
export const documentLabels = ["JD", "Agreement", "Proposal", "Brochure", "Other"] as const;
export const previewableMimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"];
