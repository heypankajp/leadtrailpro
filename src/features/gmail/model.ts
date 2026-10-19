/** One message read from a connected Gmail mailbox for the lead Emails tab (MAIL-01, MAIL-03). */
export type LeadEmail = {
  id: string;
  direction: "sent" | "received";
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  date: string;
  /** The Google account the message was read from. */
  mailbox: string;
};

export type GmailStatus = {
  /** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_TOKEN_KEY are set on the server. */
  configured: boolean;
  /** The signed-in user's connected Google account, if any. */
  connectedEmail: string | null;
  /** Team-report viewers (administrators) read every connected mailbox. */
  allMailboxes: boolean;
};
