import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MetadataResult {
  title: string;
  category: string;
  department: string;
}

function buildDefaultMetadata(): MetadataResult {
  return {
    title: "Chat Message",
    category: "General",
    department: "Support",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text, userName } = await req.json();

    if (!text || typeof text !== "string") {
      throw new Error("Missing text input");
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const prompt = `You are given a chat message from a user${userName ? ` named "${userName}"` : ""}.

Message:
"""
${text}
"""

Return a JSON object with the following keys:
- "title": A short (max 8 words) gist of the message written in sentence case.
- "category": A concise (1-2 words) label that best represents the message topic.
- "department": The most relevant business department (1-2 words, like Support, Logistics, Finance, Sales, Operations).

Only return valid JSON with double quotes around keys and string values.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return new Response(
        JSON.stringify({
          metadata: buildDefaultMetadata(),
          warning: "Failed to generate metadata via OpenAI",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = await response.json();
    const rawContent = result?.choices?.[0]?.message?.content;

    let metadata = buildDefaultMetadata();

    if (rawContent && typeof rawContent === "string") {
      try {
        const parsed = JSON.parse(rawContent);
        metadata = {
          title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : metadata.title,
          category: typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim() : metadata.category,
          department:
            typeof parsed.department === "string" && parsed.department.trim() ? parsed.department.trim() : metadata.department,
        };
      } catch (error) {
        console.warn("Failed to parse metadata response, using defaults", error);
      }
    }

    return new Response(
      JSON.stringify({ metadata }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Metadata generation error:", error);

    return new Response(
      JSON.stringify({
        metadata: buildDefaultMetadata(),
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

