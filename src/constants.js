export const GHOST_DAYS = 21;

/**
 * Status metadata.
 *
 * Colour deliberately lives in CSS, not here. Each status carries the name of
 * its token so a component can either stamp `data-status` (styling resolves in
 * the stylesheet) or read `cssVar` at runtime for canvas/SVG contexts like
 * Recharts that cannot consume a CSS class. That keeps light and dark in step
 * from a single definition.
 *
 * `emoji` is not decoration: the status scale always ships colour alongside an
 * icon and a text label so meaning never rests on hue alone.
 */
export const STATUS_CONFIG = {
  Applied: { emoji: "📤", cssVar: "--status-applied" },
  "Follow-Up": { emoji: "🔔", cssVar: "--status-followup" },
  Interview: { emoji: "🗣️", cssVar: "--status-interview" },
  Offer: { emoji: "🎉", cssVar: "--status-offer" },
  Rejected: { emoji: "❌", cssVar: "--status-rejected" },
  Ghosted: { emoji: "👻", cssVar: "--status-ghosted" },
  Withdrawn: { emoji: "↩️", cssVar: "--status-withdrawn" },
};

export const INTERVIEW_STAGES = ["", "1st Interview", "2nd Interview", "3rd Interview", "Home Assignment", "Final Interview"];

export const APPLICATION_SOURCES = [
  "",
  "LinkedIn",
  "Company Website",
  "Recruiter",
  "Referral",
  "Indeed",
  "Otta",
  "Glassdoor",
  "Wellfound",
  "Other",
];

export const EMPTY_FORM = {
  company: "",
  role: "",
  location: "",
  source: "",
  dateApplied: "",
  status: "Applied",
  jobUrl: "",
  hiringManager: "",
  hmLinkedIn: "",
  followUpDate: "",
  notes: "",
  interviewStage: "",
  followUpStatus: "",
  followUpOutcome: "",
  followUpNote: "",
  followUpHistory: [],
  hmAvailable: true,
  hmLinkedInAvailable: true,
};

/**
 * Follow-up outcomes borrow the status palette rather than defining a second
 * one — `statusToken` names the status whose colour each outcome adopts, so
 * both scales stay consistent and theme together.
 */
export const FOLLOWUP_STATUS = {
  "": { label: "Pending", emoji: "🔔", statusToken: "Follow-Up" },
  messaged: { label: "Messaged", emoji: "✅", statusToken: "Offer" },
  premium: { label: "Premium Required", emoji: "🔒", statusToken: "Interview" },
  no_linkedin: { label: "No LinkedIn", emoji: "🚫", statusToken: "Withdrawn" },
  email_instead: { label: "Emailed Instead", emoji: "📧", statusToken: "Applied" },
};

export const FOLLOWUP_METHODS = {
  messaged: "LinkedIn message",
  premium: "LinkedIn premium required",
  no_linkedin: "No LinkedIn available",
  email_instead: "Email",
};

export const CLOSED_STATUSES = ["Rejected", "Withdrawn", "Offer", "Ghosted"];
