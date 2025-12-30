// app/api/ask/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { isAdviceQuery, suggestFollowUps } from "@/lib/safety";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

if (!GEMINI_API_KEY) console.error("Missing GEMINI_API_KEY");
if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
  console.error("Missing Supabase env vars");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// v1 models
const embeddingModel = genAI.getGenerativeModel({
  model: "text-embedding-004",
});

const chatModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing 'query' in body" },
        { status: 400 }
      );
    }

    // 1) Guardrail: no direct investment advice
    if (isAdviceQuery(query)) {
      return NextResponse.json({
        answer:
          "I’m here only to explain concepts, not to give investment advice.\n\n" +
          "I can help you understand things like ETFs, mutual funds, risk, diversification, etc., " +
          "but I cannot tell you what to buy, sell, or how much to invest.",
        safe: false,
        citations: [],
        followUps: suggestFollowUps(query),
      });
    }

    // 2) Embedding for query
    const embedResult = await embeddingModel.embedContent(query);
    const queryEmbedding = embedResult.embedding.values;

    // 3) Retrieve top chunks from Supabase
    const { data: matches, error: matchError } = await supabase.rpc(
      "match_chunks",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.05,
        match_count: 5,
      }
    );

    if (matchError) {
      console.error("Supabase match_chunks error:", matchError);
      return NextResponse.json(
        { error: "Error retrieving context from DB" },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        answer:
          "I don’t have enough verified information in my sources to answer this confidently.\n\n" +
          "Try asking about concepts like ETFs, mutual funds, IPOs, basic stock market terms, etc.",
        safe: true,
        citations: [],
        followUps: suggestFollowUps(query),
      });
    }

    // 4) Fetch URLs for citations
    const docsIds = Array.from(
      new Set((matches as any[]).map((m: any) => m.document_id))
    );

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id,url,title")
      .in("id", docsIds);

    if (docsError) {
      console.error("Supabase documents error:", docsError);
    }

    const docsMap = new Map<number, { url: string; title: string | null }>();
    (docs || []).forEach((d: any) =>
      docsMap.set(d.id, { url: d.url, title: d.title })
    );

    // Build context for Gemini
    const contextText = (matches as any[])
      .map(
        (m: any, idx: number) =>
          `Source ${idx + 1}:\n${m.content}`
      )
      .join("\n\n");

    const fullPrompt = `
You are an investment education tutor inside the PhonePe / Share.Market experience.

You must:
- ONLY use the provided context.
- If the answer is not clearly in the context, say: "I don’t know based on my verified sources."
- Never recommend what to buy/sell or how much to invest.
- Answer in simple, clear English for Indian retail investors.
- Format your answer as:

1) 2–3 line explanation.
2) 3 bullet points with key ideas.
3) One simple example (if relevant).

End with this sentence exactly:
"This is educational only, not investment advice."

User question:
${query}

Context from trusted sources:
${contextText}
`;

    const result = await chatModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: fullPrompt }],
        },
      ],
    });

    const answer = result.response.text();

    // Clean citations: just label + URL
    const citations = (matches as any[]).slice(0, 3).map((m: any, i: number) => {
      const doc = docsMap.get(m.document_id);
      return {
        label: `Source ${i + 1}`,
        url: doc?.url || "",
      };
    });

    const followUps = suggestFollowUps(query);

    return NextResponse.json({
      answer,
      safe: true,
      citations,
      followUps,
    });
  } catch (err: any) {
    console.error("Error in /api/ask:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
