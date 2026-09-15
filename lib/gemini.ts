import "server-only";
import { assistantStage, logGeminiRetry } from "@/lib/assistant-diagnostics";
import { setTimeout as delay } from "node:timers/promises";
export async function geminiJson(
  prompt: string,
  schema: Record<string, unknown>,
  image?: { mimeType: string; data: string },
): Promise<unknown> {
  const response = await assistantStage(
    "gemini_request",
    "geminiJson",
    async () => {
      const key = process.env.GEMINI_API_KEY,
        model = process.env.GEMINI_MODEL;
      if (!key || !model || !/^[a-zA-Z0-9.-]+$/.test(model))
        throw new Error(
          "The assistant is not configured yet. Manual DailyProof controls remain available.",
        );
      const parts: (
        { text: string } | { inlineData: { mimeType: string; data: string } }
      )[] = [{ text: prompt }];
      if (image) parts.push({ inlineData: image });
      // One deadline covers every attempt, backoff, and response body read.
      const signal = AbortSignal.timeout(25000);
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: schema,
                maxOutputTokens: 8192,
              },
            }),
            signal,
          },
        );
        if (!response.ok) {
          if (
            attempt < 2 &&
            [429, 500, 502, 503, 504].includes(response.status)
          ) {
            await response.body?.cancel();
            logGeminiRetry(attempt + 1, response.status);
            await delay(
              500 * 2 ** attempt + Math.floor(Math.random() * 150),
              undefined,
              { signal },
            );
            continue;
          }
          throw Object.assign(
            new Error(
              "The assistant is temporarily unavailable. Please try again later.",
            ),
            { geminiHttpStatus: response.status },
          );
        }
        return response;
      }
    },
  );
  return assistantStage("gemini_response_parsing", "geminiJson", async () => {
    const body = await response.json();
    const text = body.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("");
    if (typeof text !== "string" || text.length > 100000)
      throw new Error("The assistant returned an invalid response.");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        "The assistant response was incomplete. Try a smaller request.",
      );
    }
  });
}
