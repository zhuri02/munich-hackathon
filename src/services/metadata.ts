export interface ChatMetadata {
  title: string;
  category: string;
  department: string;
}

interface MetadataResponse {
  metadata?: Partial<ChatMetadata>;
  warning?: string;
  error?: string;
}

export async function getChatMetadata(text: string, userName?: string): Promise<ChatMetadata | null> {
  if (!text?.trim()) {
    return null;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn("Missing VITE_SUPABASE_URL, cannot call metadata function");
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-chat-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, userName }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("Metadata function failed:", errorText);
      return null;
    }

    const data = (await response.json()) as MetadataResponse;

    if (data.warning) {
      console.warn("Metadata function warning:", data.warning);
    }

    if (data.error) {
      console.warn("Metadata function error payload:", data.error);
    }

    if (!data?.metadata) {
      return null;
    }

    const { title, category, department } = data.metadata;
    if (!title && !category && !department) {
      return null;
    }

    return {
      title: typeof title === "string" ? title : "",
      category: typeof category === "string" ? category : "",
      department: typeof department === "string" ? department : "",
    };
  } catch (error) {
    console.warn("Metadata request error:", error);
    return null;
  }
}

