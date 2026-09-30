/**
 * Turns a job-search email into a structured event the tracker can apply.
 *
 * Pure and dependency-free so it can be tested without Gmail. Detection is
 * pattern-based and deliberately conservative: an email that does not clearly
 * read as a confirmation, rejection, or interview invite is ignored rather
 * than guessed at, because a wrong status change is worse than a missed one.
 */

// Rejections are checked first: most of them open with "thank you for
// applying", which would otherwise read as a confirmation.
const REJECTION_PATTERNS = [
  /\bunfortunately\b/i,
  /\bregret to (inform|let you know|advise)\b/i,
  /\b(not|won't|will not) be (moving|progressing|proceeding|taking)\b.{0,40}\b(forward|further)\b/i,
  /\bdecided (not to|to not) (move|proceed|progress|continue|take)\b/i,
  /\b(move|moving|proceed|proceeding|progress|progressing) forward with (other|another|different) (candidates?|applicants?)\b/i,
  /\bpursue (other|another|different) (candidates?|applicants?)\b/i,
  /\b(your application|you) (was|were|has been|have been) (unsuccessful|not successful|not selected)\b/i,
  /\bnot been (successful|selected|shortlisted)\b/i,
  /\bunsuccessful on this occasion\b/i,
  /\b(position|role|vacancy) has (now )?been filled\b/i,
  /\bwe (will|won't|will not) not be (able to )?(offer|progress|proceed)\b/i,
  /\bother candidates whose (experience|skills|background|qualifications)\b/i,
  /\bnot (a|the right) (fit|match) (for|at) this time\b/i,
];

const INTERVIEW_PATTERNS = [
  /\binvite you (to|for) (an? |the )?(interview|call|chat|conversation|assessment|video)\b/i,
  /\b(like|love|want) to (invite you|schedule|arrange|set up|book) (an? |the )?(interview|call|phone screen|chat|time)\b/i,
  /\b(schedule|book|arrange) (your|an?) (interview|phone screen|screening call)\b/i,
  /\b(move|moving|progress|progressing|advance) (you )?(forward )?to the next (stage|round|step)\b/i,
  /\binterview invitation\b/i,
  /\binvitation to interview\b/i,
];

const APPLICATION_PATTERNS = [
  /\bthank(s| you) for (applying|your application|submitting your application)\b/i,
  /\b(we('ve| have)|we) received your application\b/i,
  /\byour application (was|has been) (sent|submitted|received)\b/i,
  /\bapplication (received|submitted|confirmation)\b/i,
  /\bthank(s| you) for (your )?(interest in|applying to|applying for)\b/i,
  /\bIndeed Application:/i,
  /\bsuccessfully (applied|submitted)\b/i,
];

// Senders that are applicant-tracking systems or job boards rather than the
// hiring company — their domain says nothing about who you applied to.
const PLATFORM_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "myworkday.com", "myworkdayjobs.com",
  "workday.com", "smartrecruiters.com", "ashbyhq.com", "teamtailor.com", "teamtailor-mail.com", "workable.com",
  "workablemail.com", "icims.com", "successfactors.com", "successfactors.eu", "jobvite.com", "bamboohr.com",
  "recruitee.com", "personio.de", "personio.com", "pinpointhq.com", "applytojob.com", "jazzhr.com", "taleo.net",
  "oraclecloud.com", "breezy.hr", "comeet.co", "eightfold.ai", "beamery.com", "phenompeople.com", "avature.net",
  "linkedin.com", "indeed.com", "indeedemail.com", "otta.com", "welcometothejungle.com", "glassdoor.com",
  "wellfound.com", "angel.co", "reed.co.uk", "totaljobs.com", "cv-library.co.uk", "hired.com", "gmail.com",
  "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "hiringthing.com", "rippling.com",
  "gem.com", "dover.com", "workatastartup.com", "hrmdirect.com", "zohorecruit.com", "zoho.com", "tal.net",
];

const SOURCE_BY_DOMAIN = [
  ["linkedin.com", "LinkedIn"],
  ["indeed", "Indeed"],
  ["otta.com", "Otta"],
  ["welcometothejungle.com", "Otta"],
  ["glassdoor", "Glassdoor"],
  ["wellfound.com", "Wellfound"],
  ["angel.co", "Wellfound"],
];

const COMPANY_NOISE = /\b(careers?|jobs?|recruit(ment|ing|er|ers)?|talent( acquisition| team)?|hiring( team)?|people( team| ops)?|hr|team|no-?reply|notifications?|via [\w .-]+|the)\b/gi;
const LEGAL_SUFFIX = /\b(ltd|limited|inc|incorporated|llc|llp|plc|gmbh|corp|corporation|co|group|holdings|uk|u\.k\.|international)\b\.?/gi;

export function normalizeCompany(name) {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tidy(value) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’:\-–—|,.]+|[\s"'“”‘’:\-–—|,.!]+$/g, "")
    .trim();
}

function cleanCompany(value) {
  const cleaned = tidy(
    (value || "")
      .replace(/\b(careers?|jobs|recruiting|recruitment|talent acquisition|talent team|hiring team|people team|hr team|no-?reply)\b/gi, " ")
      .replace(/\bvia\s+\S+.*$/i, " ")
      .replace(/^(the )?team (at|@)\s+/i, "")
      .replace(/\s+(at|@)\s*$/i, ""),
  );
  return cleaned.length >= 2 && cleaned.length <= 60 ? cleaned : "";
}

function cleanRole(value) {
  const cleaned = tidy(
    (value || "")
      .replace(/\s*[([].*?(req|job|id|ref)[^)\]]*[)\]]/gi, "")
      .replace(/\b(position|role|vacancy|opening|job)\b\s*$/i, ""),
  );
  return cleaned.length >= 2 && cleaned.length <= 90 ? cleaned : "";
}

export function parseSender(from) {
  const match = (from || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (match ? match[2] : from || "").trim().toLowerCase();
  const name = match ? match[1].trim() : "";
  const domain = email.includes("@") ? email.split("@")[1] : "";
  return { name, email, domain };
}

function isPlatformDomain(domain) {
  return PLATFORM_DOMAINS.some((platform) => domain === platform || domain.endsWith(`.${platform}`));
}

function companyFromDomain(domain) {
  if (!domain || isPlatformDomain(domain)) return "";
  const parts = domain.split(".").filter((part) => !["mail", "email", "e", "jobs", "careers", "hr", "notifications", "noreply", "talent"].includes(part));
  // Drop the public suffix (co.uk, com, io…) and keep the registrable label.
  const label = parts.length >= 3 && ["co", "com", "org", "ac"].includes(parts[parts.length - 2])
    ? parts[parts.length - 3]
    : parts[parts.length - 2];
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function detectSource(domain) {
  const hit = SOURCE_BY_DOMAIN.find(([needle]) => domain.includes(needle));
  return hit ? hit[1] : "Company Website";
}

// Ordered from most to least specific; the first pattern that yields a value wins.
const COMPANY_PATTERNS = [
  /your application was sent to (.+?)(?:\s*$|[.!\n])/i,
  /has been submitted to (.+?)(?:\s*$|[.!\n])/i,
  /\b(?:position|role|job|opportunity|vacancy)\s+(?:at|with)\s+([A-Z][\w&.,' -]{1,50}?)(?=\s*(?:$|[.!,\n]|\s-\s|\s\|\s|\bhas\b|\bwas\b|\bis\b|\band\b|\bwe\b))/,
  /\b(?:applying|application|applied|apply) (?:to|with|at) ([A-Z][\w&.' -]{1,50}?)(?=\s*(?:$|[.!,\n]|\s-\s|\s\|\s|\bfor\b|\bhas\b|\bwas\b|\band\b|\bwe\b))/,
  /\binterest in (?:joining |working (?:at|for|with) )?([A-Z][\w&.' -]{1,50}?)(?=\s*(?:$|[.!,\n]|\s-\s|\bfor\b|\band\b|\bwe\b|\bas\b))/,
  /\b(?:at|with|from) ([A-Z][\w&.' -]{1,50}?)(?:\s*(?:$|[.!,\n]))/,
];

const ROLE_PATTERNS = [
  /^Indeed Application:\s*(.+)$/i,
  /\bfor (?:the |our |a |an )?(?:position|role|job|vacancy) of ([^.,!\n]{2,80}?)(?=\s*(?:$|[.,!\n]|\bat\b|\bwith\b))/i,
  /\bfor (?:the |our |a |an )?([^.,!\n]{2,80}?) (?:position|role|job|vacancy|opening)\b/i,
  /\b(?:applying|application|applied|interest) (?:for|in) (?:the |our |a |an )?([^.,!\n]{2,80}?)(?=\s+(?:at|with)\b|\s*(?:$|[.,!\n]))/i,
  /^(?:re:\s*)?(?:application (?:received|submitted|confirmation|update)|thank you for applying|your application)\s*[:\-–|]\s*(.+?)(?:\s+(?:at|with)\s+.+)?$/i,
  /^(.+?)\s+(?:at|@)\s+[A-Z][\w&.' -]+$/,
];

const ROLE_BLOCKLIST = /^(us|you|your application|this|it|them|our team|the team|applying|interest|joining|working|the opportunity|our company)$/i;

function firstMatch(patterns, texts, clean) {
  for (const pattern of patterns) {
    for (const text of texts) {
      if (!text) continue;
      const match = text.match(pattern);
      const value = match ? clean(match[1]) : "";
      if (value) return value;
    }
  }
  return "";
}

/**
 * @param {{ id: string, subject: string, from: string, date: string, body: string, snippet?: string }} email
 * @returns {null | { type: "applied"|"rejected"|"interview", company: string, role: string, source: string, date: string, messageId: string, subject: string }}
 */
export function classifyEmail(email) {
  const subject = email.subject || "";
  const body = (email.body || email.snippet || "").slice(0, 6000);
  const haystack = `${subject}\n${body}`;
  const sender = parseSender(email.from);

  let type = null;
  if (REJECTION_PATTERNS.some((pattern) => pattern.test(haystack))) type = "rejected";
  else if (INTERVIEW_PATTERNS.some((pattern) => pattern.test(haystack))) type = "interview";
  else if (APPLICATION_PATTERNS.some((pattern) => pattern.test(haystack))) type = "applied";
  if (!type) return null;

  // First sentence-ish chunk of the body is where companies name themselves;
  // scanning the whole thing picks up footers and legal boilerplate.
  const bodyHead = body.split(/\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12).join("\n");

  const senderName = isPlatformDomain(sender.domain) && /^(linkedin|indeed|glassdoor|otta|wellfound|workday|greenhouse|lever)/i.test(sender.name)
    ? ""
    : cleanCompany(sender.name);

  const company = firstMatch(COMPANY_PATTERNS, [subject, bodyHead], cleanCompany)
    || senderName
    || companyFromDomain(sender.domain);
  const roleCandidate = firstMatch(ROLE_PATTERNS, [subject, bodyHead], cleanRole);
  const role = roleCandidate && !ROLE_BLOCKLIST.test(roleCandidate)
    && normalizeCompany(roleCandidate) !== normalizeCompany(company)
    ? roleCandidate
    : "";

  if (!company) return null;

  return {
    type,
    company,
    role,
    source: detectSource(sender.domain),
    date: email.date,
    messageId: email.id,
    subject,
  };
}
