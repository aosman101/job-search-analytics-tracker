export const GHOST_DAYS = 21;

export const STATUS_CONFIG = {
  Applied: { color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", emoji: "📤" },
  "Follow-Up": { color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", emoji: "🔔" },
  Interview: { color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", emoji: "🗣️" },
  Offer: { color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", emoji: "🎉" },
  Rejected: { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", emoji: "❌" },
  Ghosted: { color: "#9CA3AF", bg: "#F9FAFB", border: "#E5E7EB", emoji: "👻" },
  Withdrawn: { color: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB", emoji: "↩️" },
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

export const FOLLOWUP_STATUS = {
  "": { label: "Pending", color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", emoji: "🔔" },
  messaged: { label: "Messaged", color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", emoji: "✅" },
  premium: { label: "Premium Required", color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", emoji: "🔒" },
  no_linkedin: { label: "No LinkedIn", color: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB", emoji: "🚫" },
  email_instead: { label: "Emailed Instead", color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", emoji: "📧" },
};

export const FOLLOWUP_METHODS = {
  messaged: "LinkedIn message",
  premium: "LinkedIn premium required",
  no_linkedin: "No LinkedIn available",
  email_instead: "Email",
};

export const CLOSED_STATUSES = ["Rejected", "Withdrawn", "Offer", "Ghosted"];
