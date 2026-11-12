import { z } from "zod";

/**
 * Life's domains: one per space with data (Dinero, Agenda, later Salud) plus
 * `life`, the platform's own operations, and `telar`, Life driving the
 * person's Telar (no space of its own). Each owns its operations, its
 * SQLite file and its `/api/v1/<domain>/…` routes. Adding one: an id here,
 * then the hooks listed in CLAUDE.md («Adding a domain»).
 */
export const DOMAINS = ["life", "dinero", "agenda", "salud", "telar"] as const;
export const Domain = z.enum(DOMAINS);
export type Domain = z.infer<typeof Domain>;

/** What a model and the OpenAPI tags read about each domain. */
export const DOMAIN_INFO: Record<Domain, { label: string; description: string }> = {
  life: { label: "Life", description: "The app itself: the person's profile and what spans every space." },
  dinero: { label: "Dinero", description: "Personal finances: accounts, categories, transactions, budgets, recurring payments, credit cards and investments." },
  agenda: { label: "Agenda", description: "Personal organization: an inbox of quick captures, tasks, projects and day plans." },
  salud: { label: "Salud", description: "Health: training (plans, routines, sessions, live workouts), workouts from Apple Health, nutrition, body, sleep, medication and the daily check-in." },
  telar: { label: "Telar", description: "The person's agent cockpit on this Mac, through its connector: its projects and sessions (agents working in them); start, message, stop and settle sessions, and answer their permission prompts." },
};
