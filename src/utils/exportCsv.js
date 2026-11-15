const COLUMNS = [
  ["Company", "company"],
  ["Role", "role"],
  ["Status", "status"],
  ["Interview Stage", "interviewStage"],
  ["Interview Date", "interviewDate"],
  ["Date Applied", "dateApplied"],
  ["Location", "location"],
  ["Source", "source"],
  ["Salary", "salary"],
  ["Follow-Up Date", "followUpDate"],
  ["Hiring Manager", "hiringManager"],
  ["Job URL", "jobUrl"],
  ["Start Date", "startDate"],
  ["End Date", "endDate"],
  ["Notes", "notes"],
];

function cell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas: a note starting with = + - @ would execute.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Applications as CSV text that opens cleanly in Excel, Numbers and Google Sheets. */
export function toCSV(apps) {
  const rows = [COLUMNS.map(([header]) => header), ...apps.map((app) => COLUMNS.map(([, key]) => app[key]))];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
