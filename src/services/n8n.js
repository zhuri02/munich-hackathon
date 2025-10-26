const N8N_WEBHOOK_URL = "https://customm.app.n8n.cloud/webhook/0f07e71e-d3c2-4cd2-a070-e9679bade170";
//https://customm.app.n8n.cloud/webhook/b787719b-fce6-4896-94d7-51bb862af30f';

/**
 * Sends text to N8N webhook with conversation history
 */
export async function sendTextToN8N(textPrompt, metadata = {}, conversationHistory = []) {
  try {
    const payload = {
      textPrompt: textPrompt || "",
      textType: "text",
      conversationHistory: conversationHistory, // Add full conversation history
      metadata: {
        timestamp: new Date().toISOString(),
        uploadId: `upload_${Date.now()}`,
        userAgent: navigator.userAgent,
        ...metadata,
      },
    };

    console.log("🚀 Sending to N8N Webhook URL:", N8N_WEBHOOK_URL);
    console.log("📦 Payload being sent:", JSON.stringify(payload, null, 2));
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("📡 Response status:", response.status, response.statusText);
    console.log("📡 Response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();
    console.log("📨 Raw response text:", responseText);
    
    let data;
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.warn("⚠️ Failed to parse JSON response:", parseError);
        data = null;
      }
    } else {
      console.warn("⚠️ Empty response from N8N");
      data = null;
    }

    return {
      success: true,
      message: "Data successfully sent to N8N",
      data,
    };
  } catch (error) {
    console.error("Error sending data to N8N:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `N8N Error: ${errorMessage}`,
    };
  }
}
