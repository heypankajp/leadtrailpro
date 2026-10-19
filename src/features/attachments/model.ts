export const attachmentCategories = ["document", "profile"] as const;
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
