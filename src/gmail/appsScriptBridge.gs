/**
 * Job Tracker Gmail bridge — paste this whole file into a new Apps Script
 * project at https://script.google.com, then Deploy → New deployment →
 * Web app, "Execute as: Me", "Who has access: Anyone".
 *
 * It runs inside your own Google account and returns only job-related emails
 * to a caller that presents the key below. Keep the deployment URL private.
 */

const TRACKER_KEY = "__TRACKER_KEY__";

const QUERY = [
  "(",
  'subject:(application OR applying OR applied OR candidacy OR interview OR "your application" OR "thank you for your interest")',
  'OR "thank you for applying" OR "thanks for applying" OR "received your application"',
  'OR "your application was sent" OR "regret to inform" OR "unfortunately"',
  ")",
  "-from:jobalerts-noreply@linkedin.com -from:jobs-listings@linkedin.com -from:alert@indeed.com",
  "-category:promotions -category:social",
].join(" ");

const MAX_EMAILS = 250;

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!TRACKER_KEY || params.key !== TRACKER_KEY) return respond({ ok: false, error: "unauthorized" });

  const since = Math.max(0, Number(params.since) || 0);
  const threads = GmailApp.search(QUERY + " after:" + Math.floor(since / 1000), 0, 100);
  const zone = Session.getScriptTimeZone();
  const emails = [];

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (emails.length >= MAX_EMAILS || message.getDate().getTime() < since) return;
      emails.push({
        id: message.getId(),
        subject: message.getSubject(),
        from: message.getFrom(),
        date: Utilities.formatDate(message.getDate(), zone, "yyyy-MM-dd"),
        body: message.getPlainBody().slice(0, 6000),
      });
    });
  });

  return respond({ ok: true, account: Session.getEffectiveUser().getEmail(), emails: emails });
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
