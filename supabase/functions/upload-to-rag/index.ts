import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASS_NAME = "Text";

// Chunk text into smaller pieces with overlap
function chunkText(text: string, chunkSize: number = 220, overlap: number = 40): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    chunks.push(chunk);
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const weaviateUrl = Deno.env.get("WEAVIATE_URL");
    const weaviateApiKey = Deno.env.get("WEAVIATE_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!weaviateUrl || !weaviateApiKey || !openaiApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }

    // Get user ID from auth header
    const authHeader = req.headers.get("Authorization");
    let userId = null;

    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id;
    }

    console.log("Connecting to Weaviate...");

    // Prepare Weaviate URL
    let formattedUrl = weaviateUrl;
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("Formatted Weaviate URL:", formattedUrl);

    // Check if schema exists
    const schemaCheckResponse = await fetch(`${formattedUrl}/v1/schema/${CLASS_NAME}`, {
      headers: {
        Authorization: `Bearer ${weaviateApiKey}`,
      },
    });

    if (schemaCheckResponse.status === 404) {
      console.log(`Creating class: ${CLASS_NAME}`);

      const createSchemaResponse = await fetch(`${formattedUrl}/v1/schema`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${weaviateApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class: CLASS_NAME,
          description: "Chunks of documents for RAG",
          vectorizer: "text2vec-openai",
          moduleConfig: {
            "text2vec-openai": {
              model: "text-embedding-3-large",
              modelVersion: "ada-003",
              type: "text",
            },
          },
          properties: [
            {
              name: "text",
              dataType: ["text"],
              description: "Chunk text content",
            },
            {
              name: "source",
              dataType: ["text"],
              description: "Source of the text",
            },
            {
              name: "blobType",
              dataType: ["text"],
              description: "Type of blob/content",
            },
            {
              name: "loc_lines_from",
              dataType: ["number"],
              description: "Starting line number",
            },
            {
              name: "loc_lines_to",
              dataType: ["number"],
              description: "Ending line number",
            },
            {
              name: "document_name",
              dataType: ["text"],
              description: "Source filename",
            },
            {
              name: "chunk_index",
              dataType: ["int"],
              description: "Chunk index",
            },
          ],
        }),
      });

      if (!createSchemaResponse.ok) {
        const errorText = await createSchemaResponse.text();
        throw new Error(`Failed to create schema: ${errorText}`);
      }

      console.log("Schema created successfully");
    } else if (!schemaCheckResponse.ok) {
      const errorText = await schemaCheckResponse.text();
      throw new Error(`Failed to check schema: ${errorText}`);
    } else {
      console.log(`Class ${CLASS_NAME} already exists`);
    }

    // Parse request body
    const { files } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("No files provided");
    }

    console.log(`Processing ${files.length} files...`);

    const uploadedFiles = [];
    const binaryFiles = [];

    for (const file of files) {
      const { name, content, isTextFile = true, fileType, fileSize } = file;

      if (!name || !content) {
        console.warn("Skipping invalid file:", name);
        continue;
      }

      // Handle binary files
      if (!isTextFile) {
        console.log(`Binary file detected: ${name}, storing in Supabase Storage...`);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Decode base64 content
        const binaryData = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));

        // Create user-specific path
        const storagePath = userId ? `${userId}/${name}` : `anonymous/${Date.now()}_${name}`;

        // Upload to storage (upsert allows overwriting existing files)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("uploaded-files")
          .upload(storagePath, binaryData, {
            contentType: fileType,
            upsert: true,
          });

        if (uploadError) {
          console.error(`Failed to upload binary file ${name}:`, uploadError);
          throw new Error(`Failed to upload binary file ${name}: ${uploadError.message}`);
        }

        console.log(`Binary file uploaded to: ${storagePath}`);

        // Store metadata in database
        if (userId) {
          const { data: insertedFile, error: dbError } = await supabase
            .from("uploaded_files")
            .insert({
              user_id: userId,
              file_name: name,
              file_type: fileType,
              file_size: fileSize,
              storage_path: storagePath,
              is_text_file: false,
              rag_processed: false,
            })
            .select()
            .single();

          if (dbError) {
            console.error(`Failed to store file metadata:`, dbError);
          } else {
            binaryFiles.push({
              id: insertedFile.id,
              name,
              storagePath,
            });
          }
        } else {
          binaryFiles.push({
            name,
            storagePath,
          });
        }

        continue;
      }

      console.log(`Processing file: ${name}`);

      // Get user information for sender_name
      let senderName = "User";
      if (userId && authHeader) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        senderName = user?.email?.split('@')[0] || user?.user_metadata?.name || "User";
      }

      const chunksForInsert: Array<{ content: string; title: string }> = [];

      const ext = name.toLowerCase();

      // Handle JSON files (both standard and JSONL format)
      if (ext.endsWith(".json") || ext.endsWith(".jsonl")) {
        try {
          let items;

          // First try to parse as standard JSON
          try {
            items = JSON.parse(content);
            // Handle both array and single object
            if (!Array.isArray(items)) {
              items = [items];
            }
          } catch (parseError) {
            // If standard JSON fails, try JSONL format (one JSON object per line)
            console.log(`Standard JSON parse failed for ${name}, trying JSONL format...`);
            const lines = content
              .trim()
              .split("\n")
              .filter((line: string) => line.trim());
            items = [];

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
              const line = lines[lineNum].trim();
              if (!line) continue;

              try {
                const obj = JSON.parse(line);
                items.push(obj);
              } catch (lineError) {
                console.warn(`Skipping invalid JSON at line ${lineNum + 1}: ${line.substring(0, 50)}...`);
              }
            }

            if (items.length === 0) {
              throw new Error(
                `Could not parse ${name} as JSON or JSONL format. Please ensure the file contains valid JSON.`,
              );
            }
          }

          console.log(`JSON file with ${items.length} items`);

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // Support multiple field names for content
            const text = item.content || item.text || "";
            const title = item.title || item.name || `Item ${i + 1}`;
            const sender_name = item.sender_name || "User";
            const receiver_name = item.receiver_name || "ChatBot";
            const category = item.category || "General";
            const department = item.department || "Support";
            const effective_date = item.effective_date || new Date().toISOString().split('T')[0];

            if (!text) {
              console.warn(`Skipping item ${i} in ${name}: no content found`);
              continue;
            }

            // Format as structured text
            const formattedText = `sender_name: "${sender_name}", receiver_name: "${receiver_name}", title: "${title}"; content: "${text}"; category: "${category}"; department: "${department}"; effective_date: "${effective_date}";`;

            const chunks = chunkText(formattedText);
            chunks.forEach((chunk, j) => {
              chunksForInsert.push({
                content: chunk,
                title: j === 0 ? title : `${title} (Part ${j + 1})`,
              });
            });
          }
        } catch (e) {
          console.error(`JSON processing error for ${name}:`, e);
          throw new Error(e instanceof Error ? e.message : `Failed to process JSON file ${name}`);
        }
      }
      // Handle CSV files
      else if (ext.endsWith(".csv")) {
        const lines = content.trim().split("\n");
        const headers = lines[0]?.split(",") || [];
        console.log(`CSV file with ${lines.length - 1} rows`);

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(",");
          const rowText = headers.map((h: string, idx: number) => `${h}: ${row[idx]}`).join("; ");

          const chunks = chunkText(rowText);
          chunks.forEach((chunk, j) => {
            chunksForInsert.push({
              content: chunk,
              title: j === 0 ? `${name} - Row ${i}` : `${name} - Row ${i} (Part ${j + 1})`,
            });
          });
        }
      }
      // Handle all other text-based files (.txt, .md, .xml, .yaml, .log, .html, .css, .js, .ts, etc.)
      else {
        console.log(`Processing text file: ${name} with LLM metadata generation`);
        
        // Use LLM to generate metadata for the document
        const metadataPrompt = `Analyze this document and provide:
1. A brief title (max 10 words) that captures the essence
2. A category (1-2 words like "Technical", "Report", "Documentation", etc.)
3. A department (1-2 words like "Engineering", "Sales", "Support", etc.)

Document name: ${name}
Content preview: ${content.substring(0, 500)}...

Respond ONLY with a JSON object in this format:
{"title": "...", "category": "...", "department": "..."}`;

        const metadataResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: metadataPrompt }],
            temperature: 0.3,
          }),
        });

        let metadata = {
          title: name,
          category: "General",
          department: "Support"
        };

        if (metadataResponse.ok) {
          const metadataResult = await metadataResponse.json();
          try {
            const parsed = JSON.parse(metadataResult.choices[0].message.content);
            metadata = { ...metadata, ...parsed };
          } catch (e) {
            console.warn("Failed to parse LLM metadata response, using defaults");
          }
        }

        const effectiveDate = new Date().toISOString().split('T')[0];
        
        // Format the entire content in the structured format
        const formattedContent = `sender_name: "${senderName}", receiver_name: "ChatBot", title: "${metadata.title}"; content: "${content.replace(/"/g, '\\"')}"; category: "${metadata.category}"; department: "${metadata.department}"; effective_date: "${effectiveDate}";`;
        
        const chunks = chunkText(formattedContent);
        console.log(`${name} split into ${chunks.length} chunks`);

        chunks.forEach((chunk) => {
          chunksForInsert.push({
            content: chunk,
            title: metadata.title,
          });
        });
      }

      console.log(`Inserting ${chunksForInsert.length} chunks for ${name}`);

      // Insert chunks in batches of 100
      const batchSize = 100;
      for (let i = 0; i < chunksForInsert.length; i += batchSize) {
        const batch = chunksForInsert.slice(i, i + batchSize);
        console.log(
          `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunksForInsert.length / batchSize)}`,
        );

        const objects = batch.map((chunk, idx) => ({
          class: CLASS_NAME,
          properties: {
            text: chunk.content,
            source: "upload",
            blobType: ext.endsWith(".json") || ext.endsWith(".jsonl") ? "json" : ext.endsWith(".csv") ? "csv" : "text",
            loc_lines_from: i + idx,
            loc_lines_to: i + idx + 1,
            document_name: name,
            chunk_index: i + idx,
          },
        }));

        const batchResponse = await fetch(`${formattedUrl}/v1/batch/objects`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${weaviateApiKey}`,
            "Content-Type": "application/json",
            "X-OpenAI-Api-Key": openaiApiKey,
          },
          body: JSON.stringify({ objects }),
        });

        if (!batchResponse.ok) {
          const errorText = await batchResponse.text();
          console.error(`Batch insert failed: ${errorText}`);
          throw new Error(`Failed to insert batch: ${errorText}`);
        }

        const batchResult = await batchResponse.json();
        console.log(`Batch ${Math.floor(i / batchSize) + 1} completed:`, batchResult.length, "objects");
      }

      uploadedFiles.push({
        name,
        chunks: chunksForInsert.length,
      });

      console.log(`Successfully uploaded ${name}`);
    }

    return new Response(
      JSON.stringify({
        message: "Files processed successfully",
        textFiles: uploadedFiles,
        binaryFiles,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Upload failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
