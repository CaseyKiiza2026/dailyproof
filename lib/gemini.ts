import "server-only";
import {
  assistantStage,
  geminiCorrelationId,
  logGeminiEvent,
} from "@/lib/assistant-diagnostics";
import { setTimeout as delay } from "node:timers/promises";

const transientStatuses = [500, 502, 503, 504];
// Server-process circuit breaker. Never retain prompts, account data, or keys.
const quotaCooldowns = new Map<string, number>();
function quotaCooldown(response: Response): number {
  const value = response.headers?.get("retry-after");
  const seconds = value && /^\d+$/.test(value) ? Number(value) : null;
  const until = value && seconds === null ? Date.parse(value) : NaN;
  return Math.min(
    86400000,
    Math.max(
      60000,
      seconds !== null
        ? seconds * 1000
        : Number.isFinite(until)
          ? until - Date.now()
          : 300000,
    ),
  );
}
const unavailable = (status?: number) =>
  Object.assign(
    new Error(
      status === 429
        ? "The AI provider quota is exhausted. Live AI is blocked for now; wait before retrying. Manual DailyProof controls remain available."
        : "The assistant is temporarily unavailable. Please try again later.",
    ),
    { geminiHttpStatus: status },
  );

export async function geminiJson(
  prompt: string,
  schema: Record<string, unknown>,
  image?: { mimeType: string; data: string },
): Promise<unknown> {
  const body = await assistantStage(
    "gemini_request",
    "geminiJson",
    async () => {
      const key = process.env.GEMINI_API_KEY;
      const primary = process.env.GEMINI_MODEL;
      const fallback = process.env.GEMINI_FALLBACK_MODEL;
      if (
        !key ||
        !primary ||
        !/^[a-zA-Z0-9.-]+$/.test(primary) ||
        (fallback && !/^[a-zA-Z0-9.-]+$/.test(fallback))
      ) {
        throw new Error(
          "The assistant is not configured yet. Manual DailyProof controls remain available.",
        );
      }
      const models =
        fallback && fallback !== primary ? [primary, fallback] : [primary];
      const parts: (
        { text: string } | { inlineData: { mimeType: string; data: string } }
      )[] = [{ text: prompt }];
      if (image) parts.push({ inlineData: image });
      const payload = JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens: 8192,
        },
      });
      // One overall deadline includes both models, backoff, and response body reads.
      const overall = AbortSignal.timeout(25000);
      const correlationId = geminiCorrelationId();
      let lastStatus: number | undefined;
      for (const [index, model] of models.entries()) {
        const cooldown = quotaCooldowns.get(model);
        if (cooldown && cooldown > Date.now()) {
          lastStatus = 429;
          continue;
        }
        quotaCooldowns.delete(model);
        const role = index === 0 ? "primary" : "fallback";
        if (index > 0)
          logGeminiEvent("GEMINI_FALLBACK", {
            correlationId,
            role,
            model,
            attempt: 1,
            httpStatus: lastStatus ?? null,
            fallbackActivated: true,
            status: "activated",
          });
        // Reserve time for fallback even when the primary hangs.
        const signal =
          index === 0 && models.length > 1
            ? AbortSignal.any([overall, AbortSignal.timeout(12500)])
            : overall;
        for (let attempt = 1; attempt <= 3; attempt++) {
          overall.throwIfAborted();
          let status: number | null = null;
          let transient = false;
          let timedOut = false;
          let succeeded = false;
          try {
            signal.throwIfAborted();
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": key,
                },
                body: payload,
                signal,
              },
            );
            status = response.status;
            if (response.ok) {
              const text = await response.text();
              signal.throwIfAborted();
              succeeded = true;
              return text;
            }
            // Do not read or log provider error bodies.
            void response.body?.cancel().catch(() => {});
            if (status === 429) {
              quotaCooldowns.set(model, Date.now() + quotaCooldown(response));
            }
            transient = transientStatuses.includes(status);
            if (!transient && status !== 429) throw unavailable(status);
          } catch (error) {
            timedOut =
              signal.aborted ||
              (error as { name?: string })?.name === "TimeoutError";
            if (!timedOut) throw error;
            transient = true;
          } finally {
            lastStatus = status ?? undefined;
            logGeminiEvent("GEMINI_ATTEMPT", {
              correlationId,
              role,
              model,
              attempt,
              httpStatus: status,
              fallbackActivated: index > 0,
              status: succeeded ? "success" : "failure",
              errorName: timedOut ? "TimeoutError" : undefined,
            });
          }
          overall.throwIfAborted();
          if (status === 429) break;
          if (!transient) throw unavailable(status ?? undefined);
          if (attempt === 3 || signal.aborted) break;
          logGeminiEvent("ASSISTANT_RETRY", {
            correlationId,
            role,
            model,
            attempt: attempt + 1,
            httpStatus: status,
            fallbackActivated: index > 0,
            status: "retry",
          });
          try {
            await delay(
              500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150),
              undefined,
              { signal },
            );
          } catch (error) {
            overall.throwIfAborted();
            if (!signal.aborted) throw error;
            break;
          }
        }
      }
      throw unavailable(lastStatus);
    },
  );
  return assistantStage("gemini_response_parsing", "geminiJson", async () => {
    const parsed = JSON.parse(body);
    const text = parsed.candidates?.[0]?.content?.parts
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
