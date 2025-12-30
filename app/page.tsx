"use client";

import { useState } from "react";

type Citation = {
  label: string;
  url: string;
};

type Message = {
  from: "user" | "bot";
  text: string;
  citations?: Citation[];
};

export default function HomePage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([
    "What is an ETF?",
    "ETF vs mutual fund?",
    "What is diversification?"
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { from: "user", text: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            from: "bot",
            text: `Server error: ${data.error}`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            from: "bot",
            text: data.answer,
            citations: data.citations || [],
          },
        ]);

        if (Array.isArray(data.followUps) && data.followUps.length > 0) {
          setSuggestions(data.followUps);
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          from: "bot",
          text:
            "Network error. Please check your connection and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function useSuggestion(q: string) {
    setInput(q);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold">
              ₹
            </div>
            <div>
              <div className="text-xs text-slate-400">PhonePe Labs</div>
              <div className="text-sm font-semibold">Investment Tutor</div>
            </div>
          </div>
          <div className="text-xs text-slate-400">Powered by Gemini</div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4 h-full">
          {/* Intro */}
          <section className="space-y-2">
            <h1 className="text-lg font-semibold">
              Simplify investing with a personal tutor
            </h1>
            <p className="text-xs text-slate-300">
              Ask questions about ETFs, mutual funds, IPOs, risk,
              diversification and more. The tutor uses verified sources and
              will not tell you what to buy, sell, or how much to invest.
            </p>
            <div className="text-[10px] bg-slate-900 border border-slate-800 rounded-lg p-2">
              <span className="font-semibold">Disclaimer:</span>{" "}
              This is for education only, not investment advice.
            </div>
          </section>

          {/* Suggestions */}
          <section className="flex flex-wrap gap-2 text-[11px]">
            {suggestions.map((s) => (
              <button
                key={s}
                className="bg-slate-900 border border-slate-800 hover:border-purple-500 px-3 py-1 rounded-full"
                onClick={() => useSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </section>

          {/* Chat area */}
          <section className="flex-1 min-h-[300px] border border-slate-800 rounded-xl bg-slate-900 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
              {messages.length === 0 && (
                <p className="text-slate-400">
                  Start with a simple question like{" "}
                  <span className="font-semibold">“What is an ETF?”</span> or{" "}
                  <span className="font-semibold">
                    “What is diversification?”
                  </span>
                  .
                </p>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${
                    m.from === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[80%] space-y-1">
                    <div
                      className={`rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                        m.from === "user"
                          ? "bg-purple-600 text-white"
                          : "bg-slate-800 text-slate-100"
                      }`}
                    >
                      {m.text}
                    </div>

                    {/* Hyperlink citations */}
                    {m.from === "bot" &&
                      m.citations &&
                      m.citations.length > 0 && (
                        <div className="text-[10px] text-slate-400">
                          <span className="font-semibold mr-1">
                            Sources:
                          </span>
                          {m.citations
                            .filter((c) => !!c.url)
                            .map((c, idx) => (
                              <span key={c.url}>
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline hover:text-purple-300"
                                >
                                  {c.label}
                                </a>
                                {idx <
                                  m.citations!.filter((x) => x.url).length -
                                    1 && <span> • </span>}
                              </span>
                            ))}
                        </div>
                      )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="text-[11px] text-slate-400">
                  Thinking…
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-slate-800 px-3 py-2 flex items-center gap-2 text-xs"
            >
              <input
                className="flex-1 bg-transparent border border-slate-700 rounded-full px-3 py-1 outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                placeholder="Ask about ETFs, mutual funds, IPOs…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-1 rounded-full"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
