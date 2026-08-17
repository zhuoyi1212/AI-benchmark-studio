import "server-only";

import { AIConfigurationError } from "@/lib/ai/errors";
import type { AIProviderName } from "@/lib/ai/types";

export type ServerEnvironment = {
  supabaseUrl: string;
  supabaseSecretKey: string;
};

let cachedEnvironment: ServerEnvironment | undefined;

export type AIModelEnvironment = {
  zhipuTextModel: string;
  zhipuVisionModel: string;
  zhipuOcrModel: string;
  deepSeekReasoningModel: string;
};

let cachedAIModels: AIModelEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (cachedEnvironment) return cachedEnvironment;

  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error("Missing required server environment variable: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseSecretKey) throw new Error("Missing required server environment variable: SUPABASE_SECRET_KEY");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error("SUPABASE_URL must be an HTTP(S) URL without embedded credentials");
  }
  if (!isSupportedServerKey(supabaseSecretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a Supabase secret key or legacy service-role JWT");
  }

  cachedEnvironment = { supabaseUrl: parsedUrl.toString().replace(/\/$/, ""), supabaseSecretKey };
  return cachedEnvironment;
}

export function getAIModelEnvironment(): AIModelEnvironment {
  if (cachedAIModels) return cachedAIModels;
  const deepSeekReasoningModel = process.env.DEEPSEEK_REASONING_MODEL?.trim() || "deepseek-v4-pro";
  if (["deepseek-chat", "deepseek-reasoner"].includes(deepSeekReasoningModel)) {
    throw new AIConfigurationError("DEEPSEEK_REASONING_MODEL uses a retired model alias");
  }

  cachedAIModels = {
    zhipuTextModel: process.env.ZAI_TEXT_MODEL?.trim() || "glm-5.2",
    zhipuVisionModel: process.env.ZAI_VISION_MODEL?.trim() || "glm-4.6v",
    zhipuOcrModel: process.env.ZAI_OCR_MODEL?.trim() || "glm-ocr",
    deepSeekReasoningModel,
  };
  return cachedAIModels;
}

export function getAIProviderKey(provider: AIProviderName): string {
  const variableName = provider === "zhipu" ? "ZAI_API_KEY" : "DEEPSEEK_API_KEY";
  const value = process.env[variableName]?.trim();
  if (!value) throw new AIConfigurationError(`Missing required server environment variable: ${variableName}`);
  return value;
}

function isSupportedServerKey(value: string) {
  return (value.startsWith("sb_secret_") && value.length > 20) || isLegacyServiceRoleJwt(value);
}

function isLegacyServiceRoleJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return isRecord(payload) && payload.role === "service_role";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
