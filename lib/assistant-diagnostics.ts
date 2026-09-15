import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Context = { correlationId: string; stage: string; failedStage?: string };
const storage = new AsyncLocalStorage<Context>();
export type AssistantFailure = {
  ok: false;
  error: string;
  correlationId: string;
};
function safeError(error: unknown) {
  const value = error as {
    name?: unknown;
    code?: unknown;
    cause?: { code?: unknown };
    geminiHttpStatus?: unknown;
  } | null;
  const names = [
    "Error",
    "TypeError",
    "SyntaxError",
    "RangeError",
    "AbortError",
    "TimeoutError",
  ];
  const errorName =
    typeof value?.name === "string" && names.includes(value.name)
      ? value.name
      : "Error";
  const code = value?.code ?? value?.cause?.code;
  const safeCode =
    typeof code === "string" &&
    /^(?:[0-9][0-9A-Z]{4}|PGRST[0-9]{3})$/.test(code)
      ? code
      : "UNCLASSIFIED";
  const status = value?.geminiHttpStatus;
  return {
    errorName,
    safeCode,
    ...(typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? { geminiHttpStatus: status }
      : {}),
  };
}
export async function assistantStage<T>(
  stage: string,
  functionName: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const context = storage.getStore();
  if (!context) return work();
  context.stage = stage;
  try {
    const result = await work();
    console.info(
      JSON.stringify({
        event: "ASSISTANT_STAGE",
        correlationId: context.correlationId,
        stage,
        functionName,
        status: "success",
      }),
    );
    return result;
  } catch (error) {
    context.failedStage ??= stage;
    console.error(
      JSON.stringify({
        event: "ASSISTANT_STAGE",
        correlationId: context.correlationId,
        stage,
        functionName,
        status: "failure",
        ...safeError(error),
      }),
    );
    throw error;
  }
}
export async function diagnoseAssistant<T extends object>(
  work: () => Promise<T>,
): Promise<({ ok: true } & T) | AssistantFailure> {
  const context: Context = {
    correlationId: randomUUID(),
    stage: "input_validation",
  };
  return storage.run(context, async () => {
    try {
      const result = await work();
      return await assistantStage("final_return", "askAssistant", () => ({
        ...result,
        ok: true as const,
      }));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "ASSISTANT_ERROR",
          correlationId: context.correlationId,
          stage: context.failedStage ?? context.stage,
          functionName: "askAssistant",
          status: "failure",
          ...safeError(error),
        }),
      );
      return {
        ok: false as const,
        correlationId: context.correlationId,
        error:
          "DailyProof Assistant couldn't complete that request. Reference: " +
          context.correlationId,
      };
    }
  });
}
