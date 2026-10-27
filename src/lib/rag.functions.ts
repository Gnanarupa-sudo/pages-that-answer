import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const embedTexts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ texts: z.array(z.string().min(1)).min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { generateEmbeddings } = await import("@lovable.dev/ai-gateway");
    const res = await generateEmbeddings({ model: "google/gemini-embedding-2", input: data.texts });
    return { vectors: res.data.map((d) => d.embedding as number[]) };
  });

export const answerQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        question: z.string().min(1).max(4000),
        contexts: z.array(z.object({ source: z.string(), text: z.string() })).max(12),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const ctx = data.contexts.map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.text}`).join("\n\n---\n\n");
    const hist = data.history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions:
        "You are a precise document question-answering assistant. Answer ONLY using the provided context excerpts. Cite excerpts inline like [1], [2]. If the answer is not in the context, say clearly that the documents don't contain that information. Write concise plain text without markdown symbols like ** or #; use simple dashes for lists. When the answer involves numbers that can be compared (amounts, counts, percentages, trends over time, breakdowns), also provide a chart using ONLY numbers found in the context: pick 'line' for trends over time, 'pie' for parts of a whole, otherwise 'bar'. Each series is a named numeric column; each point has a label and one value per series in the same order. If no chart fits, set chart to null.",
      input: `${hist ? `Conversation so far:\n${hist}\n\n` : ""}Context excerpts:\n${ctx}\n\nQuestion: ${data.question}\n\nReturn JSON.`,
      text: {
        format: {
          type: "json_schema",
          name: "rag_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["answer", "chart"],
            properties: {
              answer: { type: "string" },
              chart: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "title", "series", "points"],
                    properties: {
                      type: { type: "string", enum: ["bar", "line", "pie"] },
                      title: { type: "string" },
                      series: { type: "array", items: { type: "string" } },
                      points: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["label", "values"],
                          properties: { label: { type: "string" }, values: { type: "array", items: { type: "number" } } },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    } as any);
    const text = ((res as any).output ?? [])
      .flatMap((o: any) => (o.type === "message" ? o.content ?? [] : []))
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("");
    try {
      const parsed = JSON.parse(text) as { answer: string; chart: Chart | null };
      const chart = parsed.chart && parsed.chart.points.length > 0 && parsed.chart.series.length > 0 ? parsed.chart : null;
      return { answer: parsed.answer || "No answer was produced.", chart };
    } catch {
      return { answer: text || "No answer was produced.", chart: null as Chart | null };
    }
  });

export type Chart = {
  type: "bar" | "line" | "pie";
  title: string;
  series: string[];
  points: { label: string; values: number[] }[];
};
