import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/research/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const post = (body: unknown) => POST(new Request("http://localhost:3000/api/research", { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const upstreamText = (text: string, status = "completed") => vi.fn().mockResolvedValue(Response.json({ status, output: [{ content: [{ type: "output_text", text }] }], usage: { input_tokens: 120, output_tokens: 90 } }));
const passages = [{ id: "p0", text: "Alkali chlorides cause slagging on the superheater tubes of the boiler.", role: "body" }, { id: "p1", text: "2.1. Fuel properties", role: "heading" }];

it("constrains ids with an enum schema and returns every valid translation", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const upstream = upstreamText(JSON.stringify({ translations: [{ id: "p0", text: "Alkali chloride는 boiler의 superheater tube에 slagging을 일으킨다." }, { id: "p1", text: "2.1. 연료 특성" }] }));
  vi.stubGlobal("fetch", upstream);
  const response = await post({ task: "translate_blocks", passages });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.translations).toHaveLength(2); expect(body.missing).toEqual([]); expect(body.usage).toEqual({ input: 120, output: 90, cached: 0 });
  const sent = JSON.parse(upstream.mock.calls[0][1].body);
  expect(sent.text.format.schema.properties.translations.items.properties.id.enum).toEqual(["p0", "p1"]);
  expect(sent.input).toContain("heading");
});

it("keeps the valid half of a partial answer instead of failing the batch", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", upstreamText(JSON.stringify({ translations: [{ id: "p1", text: "2.1. 연료 특성" }] })));
  const body = await (await post({ task: "translate_blocks", passages })).json();
  expect(body.translations.map((item: { id: string }) => item.id)).toEqual(["p1"]);
  expect(body.missing).toEqual(["p0"]);
});

it("salvages complete items from a truncated JSON answer", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", upstreamText(`{"translations":[{"id":"p1","text":"2.1. 연료 특성"},{"id":"p0","text":"Alkali chloride는`, "incomplete"));
  const response = await post({ task: "translate_blocks", passages });
  expect(response.status).toBe(200);
  expect((await response.json()).missing).toEqual(["p0"]);
});

it("answers 502 only when nothing usable came back", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", upstreamText("not json"));
  expect((await post({ task: "translate_blocks", passages })).status).toBe(502);
});

it("rejects cross-site use and missing configuration", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect((await post({ task: "translate_blocks", passages })).status).toBe(503);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const response = await POST(new Request("http://localhost:3000/api/research", { method: "POST", headers: { origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_blocks", passages }) }));
  expect(response.status).toBe(403);
});

it("passes paper keywords to the model as terms to keep in English", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const upstream = upstreamText(JSON.stringify({ translations: [{ id: "p0", text: "Alkali chloride는 cofiring 시 slagging을 일으킨다." }, { id: "p1", text: "2.1. 연료 특성" }] }));
  vi.stubGlobal("fetch", upstream);
  await post({ task: "translate_blocks", passages, glossary: ["cofiring", "pulverized-coal", "<script>"] });
  const instructions: string = JSON.parse(upstream.mock.calls[0][1].body).instructions;
  expect(instructions).toContain("cofiring, pulverized-coal");
  expect(instructions).not.toContain("<script>");
});
