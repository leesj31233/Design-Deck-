/**
 * Mock library data for Phase 1 layout work.
 *
 * Everything here is synthetic and labelled as such in the UI. There are no DOIs,
 * authors or journal names, so nothing can be mistaken for a real citation.
 */

export type MockPaper = {
  id: string;
  title: string;
  venue: string;
  year: number;
  progress: number;
  notes: number;
  questions: number;
  source: "no-pdf" | "metadata-only";
  topics: string[];
  poolId: string;
};

export type ResearchPool = {
  id: string;
  name: string;
  focus: string;
  papers: number;
  openQuestions: number;
  concepts: string[];
};

export type EvidenceSignalType = "contradiction" | "new-link" | "unresolved" | "method-overlap" | "weak-link";

export type EvidenceSignal = {
  id: string;
  type: EvidenceSignalType;
  summary: string;
  detail: string;
  papers: number;
  poolId: string;
};

export const RESEARCH_POOLS: ResearchPool[] = [
  { id: "efb-torrefaction", name: "EFB torrefaction", focus: "Pretreatment → grindability, HHV", papers: 14, openQuestions: 5, concepts: ["EFB", "torrefaction", "HHV"] },
  { id: "cofiring-cfd", name: "Co-firing CFD", focus: "Boiler-scale RANS modelling", papers: 22, openQuestions: 8, concepts: ["realizable k-ε", "DPM", "DO radiation"] },
  { id: "nox-control", name: "NOx formation & control", focus: "Fuel-N partitioning, reburning", papers: 11, openQuestions: 4, concepts: ["NOx", "fuel-N", "SOFA"] },
  { id: "heat-flux", name: "Heat flux & efficiency", focus: "Radiant/convective split, FEGT", papers: 9, openQuestions: 3, concepts: ["heat flux", "FEGT", "boiler efficiency"] },
];

export const MOCK_PAPERS: MockPaper[] = [
  { id: "m1", title: "Grindability and energy densification of torrefied empty fruit bunch pellets", venue: "Sample venue · Fuel processing", year: 2024, progress: 62, notes: 7, questions: 2, source: "no-pdf", topics: ["EFB", "torrefaction"], poolId: "efb-torrefaction" },
  { id: "m2", title: "Realizable k-ε versus SST k-ω for swirling flow in tangentially fired furnaces", venue: "Sample venue · Applied thermal", year: 2023, progress: 35, notes: 4, questions: 3, source: "metadata-only", topics: ["realizable k-ε", "CFD"], poolId: "cofiring-cfd" },
  { id: "m3", title: "Lagrangian DPM treatment of non-spherical biomass particles in PC boilers", venue: "Sample venue · Combustion modelling", year: 2022, progress: 18, notes: 2, questions: 1, source: "no-pdf", topics: ["DPM", "biomass"], poolId: "cofiring-cfd" },
  { id: "m4", title: "Fuel-nitrogen partitioning and NOx reduction during coal–biomass co-firing", venue: "Sample venue · Emissions", year: 2024, progress: 80, notes: 11, questions: 0, source: "metadata-only", topics: ["NOx", "co-firing"], poolId: "nox-control" },
  { id: "m5", title: "Wall heat flux redistribution under high-volatile fuel blends", venue: "Sample venue · Heat transfer", year: 2021, progress: 5, notes: 0, questions: 2, source: "no-pdf", topics: ["heat flux"], poolId: "heat-flux" },
  { id: "m6", title: "Boiler efficiency accounting for moisture and unburned carbon at partial biomass load", venue: "Sample venue · Energy systems", year: 2023, progress: 44, notes: 3, questions: 1, source: "metadata-only", topics: ["boiler efficiency"], poolId: "heat-flux" },
];

export const EVIDENCE_SIGNALS: EvidenceSignal[] = [
  { id: "s1", type: "contradiction", summary: "NOx trend with co-firing ratio", detail: "Two sources report opposite NOx trends above 20% thermal share.", papers: 2, poolId: "nox-control" },
  { id: "s2", type: "new-link", summary: "Torrefaction temperature ↔ ignition delay", detail: "A new highlight links pretreatment severity to burner-zone ignition.", papers: 3, poolId: "efb-torrefaction" },
  { id: "s3", type: "unresolved", summary: "Particle shape factor for torrefied EFB", detail: "Open question: sphericity assumption in DPM drag law.", papers: 1, poolId: "cofiring-cfd" },
  { id: "s4", type: "method-overlap", summary: "Same DO + WSGGM radiation set-up", detail: "Three papers share radiation settings — results comparable.", papers: 3, poolId: "heat-flux" },
  { id: "s5", type: "weak-link", summary: "Heat flux ↔ boiler efficiency", detail: "Only one note connects radiant heat absorption to efficiency loss.", papers: 1, poolId: "heat-flux" },
];

const TOPICS = ["EFB", "torrefaction", "coal co-firing", "realizable k-ε", "DPM", "NOx", "heat flux", "boiler efficiency"];
const SUBJECTS = [
  "Kinetic parameters for",
  "Experimental validation of",
  "Sensitivity of",
  "Scale-up considerations for",
  "Uncertainty in",
  "Parametric study of",
  "Review notes on",
  "Measurement campaign for",
];

/** Long, deterministic list used to exercise list virtualization. */
export const MOCK_ARCHIVE = Array.from({ length: 240 }, (_, i) => {
  const topic = TOPICS[i % TOPICS.length];
  const subject = SUBJECTS[Math.floor(i / TOPICS.length) % SUBJECTS.length];
  return {
    id: `a${i + 1}`,
    title: `${subject} ${topic} (sample entry ${i + 1})`,
    year: 2014 + (i % 11),
    topic,
    notes: (i * 7) % 9,
    progress: (i * 37) % 101,
  };
});
