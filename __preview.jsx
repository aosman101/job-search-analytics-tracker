const __t = new URLSearchParams(location.search).get("theme"); if (__t) localStorage.setItem("adil-job-tracker-theme", __t);
import React from "react";
import { createRoot } from "react-dom/client";
import "./src/styles.css";
import JobTracker from "./src/JobTracker";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const companies = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Wonka", "Soylent", "Tyrell", "Cyberdyne", "Aperture"];
const apps = [];
for (let i = 0; i < 70; i++) {
  const age = Math.floor(rnd() * 150);
  const source = pick(["LinkedIn", "LinkedIn", "LinkedIn", "Referral", "Company Website", "Recruiter", "Indeed"]);
  const a = { id: i + 1, company: `${pick(companies)} ${i}`, role: pick(["Data Engineer", "Data Analyst", "Analytics Engineer", "BI Developer"]), location: pick(["London", "Remote", "Manchester"]), source, dateApplied: ago(age), status: "Applied", followUpHistory: [] };
  const r = rnd() + (source === "Referral" ? 0.25 : 0);
  if (age > 8 && rnd() < 0.4) a.followUpHistory = [{ id: i, date: ago(age - 8), method: pick(["LinkedIn message", "Email"]), outcome: "Messaged" }];
  if (r > 0.82) { a.status = pick(["Interview", "Interview", "Rejected", "Offer"]); a.interviewStage = pick(["1st Interview", "2nd Interview", "Final Interview"]); a.interviewStartedAt = ago(Math.max(0, age - 3 - Math.floor(rnd() * 14))); if (a.status === "Rejected") a.rejectedAt = ago(Math.max(0, age - 20)); if (a.status === "Interview" && rnd() < 0.6) a.interviewDate = ago(-Math.floor(rnd() * 6)); }
  else if (r > 0.5 && age > 4) { a.status = "Rejected"; a.rejectedAt = ago(Math.max(0, age - 2 - Math.floor(rnd() * 20))); }
  else if (age > 21 && !a.followUpHistory.length) a.status = "Ghosted";
  else if (age <= 21) { if (rnd() < 0.3) a.followUpDate = ago(Math.floor(rnd() * 5) - 2); else if (rnd() < 0.3) a.followUpDate = ago(-3); }
  apps.push(a);
}
apps.push({ id: 900, company: "Oldco", role: "Data Engineer", source: "Referral", dateApplied: ago(400), status: "Job Secured", startDate: ago(360), endDate: ago(60), securedAt: ago(370), interviewStartedAt: ago(390), offerAt: ago(372) });
createRoot(document.getElementById("root")).render(<JobTracker initialApps={apps} />);
const params = new URLSearchParams(location.search);
if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");
const press = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
setTimeout(() => { if (params.get("tab")) press(params.get("tab")); }, 1500);
setTimeout(() => { const label = params.get("click"); if (label) [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label))?.click(); }, 2500);
setTimeout(() => { const n = Number(params.get("dismiss") || 0); for (let i = 0; i < n; i++) document.querySelector(".pipe-row__dismiss")?.click(); }, 3500);
