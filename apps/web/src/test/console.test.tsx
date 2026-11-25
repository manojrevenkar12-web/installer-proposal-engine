import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfferLetter } from "../features/project/OfferLetter.tsx";
import { ProjectsPage } from "../features/projects/ProjectsPage.tsx";
import { StudyPage } from "../features/study/StudyPage.tsx";

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
afterEach(() => vi.unstubAllGlobals());

const project = {
  id: "p1", customerName: "Familie Weber", status: "OFFERED", statedConsumptionKwh: 4100, latDeg: 52, lonDeg: 13, createdAt: "2026-11-25",
  proposals: [{ id: "o1", version: 1, kwp: 9.4, batteryKwh: 5, priceEur: 18350, promisedSavingsEur: 1500, paybackYears: 12.2, status: "DRAFT" }],
  _count: { alarms: 0 },
};

describe("projects", () => {
  it("shows a skeleton while loading, then the projects", async () => {
    let release: (v: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { release = r; })));
    wrap(<ProjectsPage />);
    expect(screen.getByLabelText("Loading projects")).toBeInTheDocument();
    release(new Response(JSON.stringify({ projects: [project] })));
    expect(await screen.findByText("Familie Weber")).toBeInTheDocument();
    expect(screen.getByText("9.4 kWp + 5 kWh")).toBeInTheDocument();
  });

  it("explains an error and retries", async () => {
    const fetch = vi.fn().mockImplementationOnce(() => json({ error: "unknown API key" }, 401)).mockImplementation(() => json({ projects: [project] }));
    vi.stubGlobal("fetch", fetch);
    wrap(<ProjectsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("unknown API key");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Familie Weber")).toBeInTheDocument();
  });

  it("says what to do when there are no projects, and when a filter is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ projects: [] })));
    wrap(<ProjectsPage />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("filters by stage", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ projects: [project] })));
    wrap(<ProjectsPage />);
    await screen.findByText("Familie Weber");
    await userEvent.click(screen.getByRole("tab", { name: /Installed/ }));
    expect(screen.getByText("No project is at this stage.")).toBeInTheDocument();
  });
});

describe("offer letter", () => {
  const facts = [
    { key: "kwp", label: "Anlagenleistung", value: 9.4, unit: "kWp" as const, decimals: 1 },
    { key: "price", label: "Preis", value: 18350, unit: "EUR" as const, decimals: 0 },
  ];
  it("marks checked numbers and flags any number that is not a fact", () => {
    render(<OfferLetter text={"Anlage mit 9,4 kWp. Preis: 18.350 €. Förderung 30 %."} facts={facts} source="model" draftsRejected={2} />);
    expect(screen.getByText("2 of 3 numbers are facts from the simulation")).toBeInTheDocument();
    expect(screen.getByText("30 %").parentElement).toHaveAttribute("title", "Not a fact: this number would be blocked");
    expect(screen.getByText("9,4 kWp").parentElement).toHaveAttribute("title", "Anlagenleistung: from the simulation");
    expect(screen.getByText("2 invented numbers stopped before sending")).toBeInTheDocument();
  });
});

describe("study", () => {
  it("tells you how to produce a missing report", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 404 }))));
    wrap(<StudyPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("npm run lab -- dev"));
  });
});
