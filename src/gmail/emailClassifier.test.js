import { describe, expect, it } from "vitest";
import { classifyEmail, normalizeCompany, parseSender } from "./emailClassifier";

const email = (overrides) => ({ id: "m1", date: "2026-09-20", subject: "", from: "", body: "", ...overrides });

describe("classifyEmail", () => {
  it("reads a LinkedIn Easy Apply confirmation", () => {
    const result = classifyEmail(email({
      subject: "Adil, your application was sent to Monzo",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
      body: "Your application was sent to Monzo\nData Analyst\nMonzo · London",
    }));
    expect(result).toMatchObject({ type: "applied", company: "Monzo", source: "LinkedIn" });
  });

  it("reads an Indeed confirmation", () => {
    const result = classifyEmail(email({
      subject: "Indeed Application: Junior Data Engineer",
      from: "Indeed Apply <indeedapply@indeed.com>",
      body: "Your application has been submitted to Ocado Technology.",
    }));
    expect(result).toMatchObject({ type: "applied", company: "Ocado Technology", role: "Junior Data Engineer", source: "Indeed" });
  });

  it("reads a Greenhouse confirmation using the sender name as the company", () => {
    const result = classifyEmail(email({
      subject: "Thank you for applying!",
      from: "Wise Careers <no-reply@us.greenhouse-mail.io>",
      body: "Hi Adil,\nThanks for applying for the Data Analyst role. We will review your application shortly.",
    }));
    expect(result).toMatchObject({ type: "applied", company: "Wise", role: "Data Analyst", source: "Company Website" });
  });

  it("pulls company and role from a subject like 'role at company'", () => {
    const result = classifyEmail(email({
      subject: "Thank you for your application to Revolut",
      from: "Revolut <careers@revolut.com>",
      body: "We have received your application for the Business Intelligence Analyst position.",
    }));
    expect(result).toMatchObject({ type: "applied", company: "Revolut", role: "Business Intelligence Analyst" });
  });

  it("treats a polite 'thank you for applying … unfortunately' email as a rejection", () => {
    const result = classifyEmail(email({
      subject: "Your application to Deliveroo",
      from: "Deliveroo Talent <talent@deliveroo.co.uk>",
      body: "Thank you for applying for the Data Analyst role. Unfortunately, we have decided to move forward with other candidates.",
    }));
    expect(result).toMatchObject({ type: "rejected", company: "Deliveroo", role: "Data Analyst" });
  });

  it("detects 'not be moving forward' rejections", () => {
    const result = classifyEmail(email({
      subject: "Update on your application",
      from: "Starling Bank <recruitment@starlingbank.com>",
      body: "After careful consideration we will not be moving forward with your application at this time.",
    }));
    expect(result).toMatchObject({ type: "rejected", company: "Starling Bank" });
  });

  it("detects interview invitations", () => {
    const result = classifyEmail(email({
      subject: "Interview invitation - Data Analyst at Skyscanner",
      from: "Skyscanner Recruiting <jobs@skyscanner.net>",
      body: "We'd love to invite you to an interview for the Data Analyst role.",
    }));
    expect(result).toMatchObject({ type: "interview", company: "Skyscanner" });
  });

  it("falls back to the sender domain when nothing else names the company", () => {
    const result = classifyEmail(email({
      subject: "Application received",
      from: "no-reply@careers.octopus.energy",
      body: "We have received your application.",
    }));
    expect(result?.type).toBe("applied");
    expect(result?.company).toBeTruthy();
  });

  it("ignores unrelated email", () => {
    expect(classifyEmail(email({ subject: "Your weekly newsletter", from: "news@medium.com", body: "Top stories for you" }))).toBeNull();
    expect(classifyEmail(email({ subject: "New jobs for you: Data Analyst", from: "LinkedIn <jobalerts-noreply@linkedin.com>", body: "10 new jobs match your preferences" }))).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizes company names for matching", () => {
    expect(normalizeCompany("Monzo Bank Ltd.")).toBe("monzo bank");
    expect(normalizeCompany("Wise Careers")).toBe("wise");
    expect(normalizeCompany("Marks & Spencer PLC")).toBe("marks and spencer");
  });

  it("parses sender headers", () => {
    expect(parseSender('"Wise Careers" <no-reply@wise.com>')).toEqual({ name: "Wise Careers", email: "no-reply@wise.com", domain: "wise.com" });
    expect(parseSender("jobs@acme.io")).toEqual({ name: "", email: "jobs@acme.io", domain: "acme.io" });
  });
});
