import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLASS_NAME = "SeymenTest";

// Chunk text into smaller pieces with overlap
function chunkText(text: string, chunkSize: number = 220, overlap: number = 40): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
  }
  
  return chunks;
}

// Extract text from PDF using basic text extraction
async function extractTextFromPDF(base64Data: string): Promise<string> {
  console.log('Extracting text from PDF...');
  
  try {
    // Decode base64
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Convert to text with better encoding handling
    let text = '';
    for (let i = 0; i < binaryData.length; i++) {
      const byte = binaryData[i];
      if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
        text += String.fromCharCode(byte);
      } else {
        text += ' ';
      }
    }
    
    // Extract text between stream markers (common in PDFs)
    const extractedChunks: string[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      // Look for readable text (sequences of printable characters)
      const matches = line.match(/[a-zA-Z0-9\s.,!?;:'"()-]{10,}/g);
      if (matches) {
        extractedChunks.push(...matches);
      }
    }
    
    if (extractedChunks.length > 0) {
      const extractedText = extractedChunks.join(' ').trim();
      console.log(`Extracted ${extractedText.length} characters from PDF`);
      return extractedText;
    }
    
    throw new Error('Could not extract sufficient text from PDF');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('PDF extraction error:', errorMessage);
    throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
  }
}

// Extract text from image using OpenAI vision
async function extractTextFromImage(base64Data: string, mimeType: string, openaiApiKey: string): Promise<string> {
  console.log('Extracting text from image using OpenAI vision...');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
            {
              type: 'text',
              text: 'Extract all text from this image using OCR. If there is no text, describe what you see in the image. Return only the extracted text or description.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`Failed to extract text from image: ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
    console.error('Unexpected OpenAI response:', JSON.stringify(data));
    throw new Error('Invalid response from OpenAI API');
  }
  
  return data.choices[0].message.content;
}

// Extract text from DOCX or other office files
async function extractTextFromDocument(base64Data: string, fileName: string): Promise<string> {
  console.log(`Extracting text from ${fileName}...`);
  
  try {
    // Decode base64
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: false }).decode(binaryData);
    
    // Simple text extraction (works for some formats)
    const extractedText = text.replace(/[^\x20-\x7E\n]/g, ' ').trim();
    
    if (extractedText.length > 100) {
      return extractedText;
    }
    
    // If simple extraction fails, return a placeholder
    return `Document: ${fileName} (Basic text extraction - may not capture all content)`;
  } catch (error) {
    console.error('Document extraction error:', error);
    return `Document: ${fileName} (Text extraction failed)`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const weaviateUrl = Deno.env.get('WEAVIATE_URL');
    const weaviateApiKey = Deno.env.get('WEAVIATE_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('VITE_SUPABASE_SERVICE_ROLE_KEY');

    if (!weaviateUrl || !weaviateApiKey || !openaiApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Get user ID from auth header
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    
    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id;
    }

    // Parse request body
    const { fileIds } = await req.json();

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('No file IDs provided');
    }

    console.log(`Processing ${fileIds.length} binary files...`);

    // Prepare Weaviate URL
    let formattedUrl = weaviateUrl;
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const processedFiles = [];

    for (const fileId of fileIds) {
      // Get file metadata from database
      const { data: fileData, error: fileError } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData) {
        console.error(`File not found: ${fileId}`);
        continue;
      }

      console.log(`Processing file: ${fileData.file_name}`);

      // Download file from storage
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('uploaded-files')
        .download(fileData.storage_path);

      if (downloadError || !fileBlob) {
        console.error(`Failed to download file: ${fileData.file_name}`);
        continue;
      }

      // Convert blob to base64
      const arrayBuffer = await fileBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64 = btoa(String.fromCharCode(...uint8Array));

      let extractedText = '';
      const fileType = fileData.file_type.toLowerCase();

      // Extract text based on file type
      if (fileType.includes('pdf')) {
        extractedText = await extractTextFromPDF(base64);
      } else if (fileType.includes('image')) {
        extractedText = await extractTextFromImage(base64, fileData.file_type, openaiApiKey);
      } else if (
        fileType.includes('word') || 
        fileType.includes('document') || 
        fileType.includes('presentation') || 
        fileType.includes('spreadsheet')
      ) {
        extractedText = await extractTextFromDocument(base64, fileData.file_name);
      } else {
        console.warn(`Unsupported file type: ${fileData.file_type}`);
        continue;
      }

      if (!extractedText || extractedText.trim().length === 0) {
        console.warn(`No text extracted from: ${fileData.file_name}`);
        continue;
      }

      console.log(`Extracted ${extractedText.length} characters from ${fileData.file_name}`);

      // Save extracted text as TXT file
      const txtFileName = fileData.file_name.replace(/\.[^/.]+$/, '.txt');
      const txtPath = userId ? `${userId}/${txtFileName}` : `anonymous/${txtFileName}`;
      
      const txtBlob = new Blob([extractedText], { type: 'text/plain' });
      
      const { error: txtUploadError } = await supabase.storage
        .from('uploaded-files')
        .upload(txtPath, txtBlob, {
          contentType: 'text/plain',
          upsert: true,
        });

      if (txtUploadError) {
        console.error(`Failed to save TXT file: ${txtUploadError.message}`);
      } else {
        console.log(`Saved extracted text as: ${txtPath}`);
      }

      // Upload complete text to Weaviate (without chunking)
      const weaviateObject = {
        class: CLASS_NAME,
        properties: {
          content: extractedText,
          title: fileData.file_name,
          document_name: fileData.file_name,
          chunk_index: 0,
        },
      };

      const weaviateResponse = await fetch(`${formattedUrl}/v1/objects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${weaviateApiKey}`,
          'Content-Type': 'application/json',
          'X-OpenAI-Api-Key': openaiApiKey,
        },
        body: JSON.stringify(weaviateObject),
      });

      if (!weaviateResponse.ok) {
        const errorText = await weaviateResponse.text();
        console.error(`Weaviate insert failed: ${errorText}`);
        throw new Error(`Failed to insert to Weaviate: ${errorText}`);
      }

      // Update file metadata
      await supabase
        .from('uploaded_files')
        .update({ rag_processed: true })
        .eq('id', fileId);

      processedFiles.push({
        id: fileId,
        name: fileData.file_name,
        txtFile: txtFileName,
        extractedLength: extractedText.length,
      });

      console.log(`Successfully processed ${fileData.file_name}`);
    }

    return new Response(
      JSON.stringify({
        message: 'Binary files processed successfully',
        files: processedFiles,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Processing error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Processing failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
