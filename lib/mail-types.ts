export const MAIL_KINDS = [
  "inquiry",
  "welcome",
  "invite",
  "appraisal",
  "repurchase",
  "financing",
  "membership",
  "test",
] as const;

export type MailKind = (typeof MAIL_KINDS)[number];

export type MailRequest = {
  kind: MailKind;
  name: string;
  email: string;
  message?: string;
  role?: string;
  phone?: string;
  watch?: string;
  amount?: string;
  termMonths?: number;
  delivery?: string;
};

export type OutboxItem = {
  id: string;
  kind: MailKind;
  to: string[];
  subject: string;
  text: string;
  html: string;
  createdAt: string;
  status: "sent" | "preview" | "failed";
  resendId?: string;
  error?: string;
};
