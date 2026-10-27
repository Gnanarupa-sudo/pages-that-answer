import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { embedTexts, answerQuestion } from "@/lib/rag.functions";
import { chunkText, cosine, extractText } from "@/lib/doc-parse";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Folio — Ask your documents" },
      { name: "description", content: "Upload any document and get precise, cited answers to your questions." },
      { property: "og:title", content: "Folio — Ask your documents" },
      { property: "og:description", content: "Upload any document and get precise, cited answers to your questions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Chunk = { source: string; text: string; vec: number[] };
type Doc = { name: string; chunks: number; status: "reading" | "ready" | "error"; error?: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: { source: string; text: string }[] };

function Index() {
  const embed = useServerFn(embedTexts);
  const ask = useServerFn(answerQuestion);
  const [docs, setDocs] = useState<Doc[]>([]);
  const store = useRef<Chunk[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setDocs((d) => [...d, { name: file.name, chunks: 0, status: "reading" }]);
      const upd = (p: Partial<Doc>) => setDocs((d) => d.map((x) => (x.name === file.name ? { ...x, ...p } : x)));
      try {
        const text = await extractText(file);
        const chunks = chunkText(text);
        if (!chunks.length) throw new Error("No readable text found");
        for (let i = 0; i < chunks.length; i += 64) {
          const batch = chunks.slice(i, i + 64);
          const { vectors } = await embed({ data: { texts: batch } });
          batch.forEach((t, j) => store.current.push({ source: file.name, text: t, vec: vectors[j] }));
        }
        upd({ status: "ready", chunks: chunks.length });
      } catch (e) {
        upd({ status: "error", error: e instanceof Error ? e.message : "Could not read file" });
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    if (!store.current.length) {
      setMsgs((m) => [...m, { role: "assistant", content: "Please add a document first." }]);
      return;
    }
    setQ("");
    const history = msgs.slice(-6).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const { vectors } = await embed({ data: { texts: [question] } });
      const top = store.current
        .map((c) => ({ c, s: cosine(vectors[0], c.vec) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map(({ c }) => ({ source: c.source, text: c.text }));
      const { answer } = await ask({ data: { question, contexts: top, history } });
      setMsgs((m) => [...m, { role: "assistant", content: answer, sources: top }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Something went wrong answering that. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground grid lg:grid-cols-[360px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r border-border bg-sidebar p-6 flex flex-col gap-6">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Folio</h1>
          <p className="text-sm text-muted-foreground mt-1">Ask questions. Get cited answers from your documents.</p>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-border hover:border-primary"}`}
        >
          <input type="file" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <div className="font-display text-xl">Drop documents</div>
          <div className="text-xs text-muted-foreground mt-2">PDF, Word, Excel, CSV, TXT, Markdown, HTML, JSON, code…</div>
        </label>
        <ul className="flex flex-col gap-2">
          {docs.map((d) => (
            <li key={d.name} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
              <div className="truncate font-medium">{d.name}</div>
              <div className={`text-xs ${d.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {d.status === "reading" ? "Reading & indexing…" : d.status === "error" ? d.error : `${d.chunks} passages indexed`}
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-col h-screen">
        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {msgs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
              <p className="font-display text-5xl leading-tight">What would you like to know?</p>
              <p className="text-muted-foreground mt-4">Add a document on the left, then ask anything about it.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "self-end max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-3" : "self-start w-full"}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  {m.sources && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted-foreground">Sources ({m.sources.length})</summary>
                      <ol className="mt-2 flex flex-col gap-2">
                        {m.sources.map((s, j) => (
                          <li key={j} className="rounded-md border border-border bg-card p-3">
                            <div className="text-xs font-medium text-primary">[{j + 1}] {s.source}</div>
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-4">{s.text}</div>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              ))}
              {busy && <div className="text-muted-foreground animate-pulse">Searching your documents…</div>}
            </div>
          )}
        </div>
        <form onSubmit={submit} className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask a question about your documents…"
              className="flex-1 rounded-lg border border-input bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <button disabled={busy} className="rounded-lg bg-primary text-primary-foreground px-6 font-medium disabled:opacity-50">
              Ask
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
