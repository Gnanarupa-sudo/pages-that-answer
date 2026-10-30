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
    const instructions =
      "You are a precise document question-answering assistant. Answer ONLY using the provided context excerpts. Cite excerpts inline like [1], [2]. Read tables and number lists in the excerpts carefully. If the answer is not in the context, say clearly that the documents don't contain that information. Write concise plain text without markdown symbols like ** or #; use simple dashes for lists.";
    const input = `${hist ? `Conversation so far:\n${hist}\n\n` : ""}Context excerpts:\n${ctx}\n\nQuestion: ${data.question}`;
    const readText = (res: any) =>
      ((res as any).output ?? [])
        .flatMap((o: any) => (o.type === "message" ? o.content ?? [] : []))
        .filter((c: any) => c.type === "output_text")
        .map((c: any) => c.text)
        .join("") as string;

    // Attempt 1-2: primary model. Attempt 3: fallback model.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await generateResponse({ model: "openai/gpt-6-astra", instructions, input } as any);
        const text = readText(res);
        if (text.trim()) return { answer: text };
      } catch (e) {
        console.error("answer attempt failed", attempt, e);
      }
    }
    const res = await generateResponse({ model: "google/gemini-3-flash-preview", instructions, input } as any);
    return { answer: readText(res) || "No answer was produced." };
  });
