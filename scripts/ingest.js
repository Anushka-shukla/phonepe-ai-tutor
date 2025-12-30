// scripts/ingest.js
// Usage: npm run ingest

import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Load env vars from .env.local
dotenv.config({ path: ".env.local" });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({
  model: "text-embedding-004",
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- Utility helpers ----------

function readUrlsFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function fetchHtml(url) {
  console.log(`\n[fetch] ${url}`);
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; InvestmentTutorBot/1.0; +https://example.com)",
    },
  });
  return res.data;
}

// Extract readable text from HTML using cheerio
function extractTextFromHtml(html) {
  const $ = cheerio.load(html);

  ["script", "style", "nav", "footer", "noscript"].forEach((tag) =>
    $(tag).remove()
  );

  const title = $("title").first().text().trim();

  let main = $("main");
  if (!main.length) {
    main = $("body");
  }

  const text = main
    .text()
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();

  return { title, text };
}

// Simple text chunking
function chunkText(text, maxChars = 1200, overlap = 200) {
  if (!text) return [];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    let chunk = text.slice(start, end);

    const lastPunct = Math.max(
      chunk.lastIndexOf("."),
      chunk.lastIndexOf("!"),
      chunk.lastIndexOf("?")
    );
    if (lastPunct > 0 && end !== text.length) {
      chunk = chunk.slice(0, lastPunct + 1);
    }

    chunks.push(chunk.trim());

    if (end === text.length) break;
    start = start + maxChars - overlap;
  }

  return chunks.filter((c) => c.length > 50);
}

// Gemini embeddings
async function embedText(text) {
  const result = await embeddingModel.embedContent(text);
  // Gemini returns { embedding: { values: number[] } }
  return result.embedding.values;
}

// Upsert document row
async function upsertDocument(url, title) {
  const { data: existing, error: existingError } = await supabase
    .from("documents")
    .select("id")
    .eq("url", url)
    .maybeSingle();

  if (existingError) {
    console.error("[supabase] error checking document:", existingError);
    throw existingError;
  }

  if (existing?.id) {
    console.log(`[doc] Found existing document id=${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({ url, title })
    .select("id")
    .single();

  if (error) {
    console.error("[supabase] error inserting document:", error);
    throw error;
  }

  console.log(`[doc] Inserted new document id=${data.id}`);
  return data.id;
}

// Delete old chunks for re-ingestion
async function deleteChunksForDocument(documentId) {
  const { error } = await supabase
    .from("chunks")
    .delete()
    .eq("document_id", documentId);

  if (error) {
    console.error("[supabase] error deleting old chunks:", error);
    throw error;
  }
}

// Insert chunks with embeddings
async function insertChunks(documentId, chunks) {
  console.log(`[chunks] Embedding & inserting ${chunks.length} chunks...`);
  const rows = [];

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    console.log(
      `[embed] chunk ${i + 1}/${chunks.length} (${content.length} chars)`
    );

    const embedding = await embedText(content);
    rows.push({
      document_id: documentId,
      content,
      embedding,
      chunk_index: i,
    });

    await new Promise((r) => setTimeout(r, 300)); // small delay
  }

  const { error } = await supabase.from("chunks").insert(rows);

  if (error) {
    console.error("[supabase] error inserting chunks:", error);
    throw error;
  }

  console.log("[chunks] Inserted all chunks successfully.");
}

// ---------- Main runner ----------

async function ingestOneUrl(url) {
  try {
    const html = await fetchHtml(url);
    const { title, text } = extractTextFromHtml(html);

    console.log(`[parse] title="${title}"`);
    console.log(`[parse] text length=${text.length} chars`);

    if (!text || text.length < 200) {
      console.warn("[warn] Text too short, skipping:", url);
      return;
    }

    const chunks = chunkText(text, 1200, 200);
    console.log(`[chunk] Generated ${chunks.length} chunks`);

    const documentId = await upsertDocument(url, title || url);

    await deleteChunksForDocument(documentId);
    await insertChunks(documentId, chunks);
  } catch (err) {
    console.error(`[error] Failed to ingest ${url}:`, err.message);
  }
}

async function main() {
  const urlsFile = path.join(process.cwd(), "sources", "urls.txt");
  const urls = readUrlsFromFile(urlsFile);

  console.log(`Found ${urls.length} URLs to ingest.`);

  for (const url of urls) {
    await ingestOneUrl(url);
  }

  console.log("\n✅ Ingestion complete.");
}

main().catch((err) => {
  console.error("Fatal error in ingestion:", err);
  process.exit(1);
});
