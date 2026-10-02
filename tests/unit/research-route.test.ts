import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/research/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("translates several page paragraphs in one upstream request and checks the count", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const upstream = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: '["첫 문단이다.","둘째 문단이다."]' }] }] }));
  vi.stubGlobal("fetch", upstream);
  const request = new Request("http://localhost:3000/api/research", { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_batch", sources: ["First paragraph.", "Second paragraph."] }) });
  const response = await POST(request);
  expect(response.status).toBe(200);
  expect((await response.json()).translations).toEqual(["첫 문단이다.", "둘째 문단이다."]);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("requests structured IDs and rejects missing results", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const passages = [{ id: "a".repeat(32), text: "Boiler heat transfer is increased." }, { id: "b".repeat(32), text: "NOx emissions decrease." }];
  const upstream = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ translations: [{ id: passages[0].id, text: "보일러 열전달이 증가한다." }] }) }] }] }));
  vi.stubGlobal("fetch", upstream);
  const request = new Request("http://localhost:3000/api/research", { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ task: "translate_blocks", passages }) });
  const response = await POST(request);
  expect(response.status).toBe(502);
  expect(JSON.parse(upstream.mock.calls[0][1].body).text.format.type).toBe("json_schema");
});
