export const MODES = ["listen", "solve", "teacher"] as const;
export type Mode = (typeof MODES)[number];
export type ChatMode = "listen" | "solve";
export type ChatReply = {
  reply: string;
  suggestedActions: string[];
  recommendTeacher: boolean;
};
export const SAFETY_CATEGORIES = [
  "self_harm",
  "threatened",
  "repeated_harm",
  "harm_others",
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];
export type SafetySignal = { category: SafetyCategory; evidence: string[] };
export const SAFETY_LABELS: Record<SafetyCategory, string> = {
  self_harm: "涉及自伤的表达",
  threatened: "受到威胁的表达",
  repeated_harm: "反复受到伤害的表达",
  harm_others: "涉及伤害他人或报复社会的表达",
};
export type InboxItem = {
  id: string;
  conversationCode: string;
  grade: number;
  signals: SafetySignal[];
  source: "rule" | "model";
  status: "unread" | "read" | "handled";
  createdAt: string;
  readAt: string | null;
  handledAt: string | null;
};
export const conversationCode = (id: string) => id.slice(-8).toUpperCase();
export const CARD_FIELDS = [
  "studentDescription",
  "feelingsAndNeeds",
  "uncertainPoints",
  "attempts",
  "requestedHelp",
] as const;
export type CardField = (typeof CARD_FIELDS)[number];
export type HelpCardDraft = { sessionId?: string; grade: number } & Record<
  CardField,
  string
>;
export const FIELD_LABELS: Record<CardField, string> = {
  studentDescription: "发生了什么",
  feelingsAndNeeds: "我的感受和需要",
  uncertainPoints: "我还不确定的事",
  attempts: "我已经试过的办法",
  requestedHelp: "我希望老师怎样帮助我",
};
