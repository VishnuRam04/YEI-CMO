import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  CmoResponseSchema,
  type CmoClarification,
  type CmoResponse,
  type CmoStoredMessage,
} from "./schema";

const MAX_CONTEXT_MESSAGES = 20;
const MAX_HISTORY_MESSAGES = 100;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function getOrCreateCmoConversation(
  brandId: string,
  requestedId?: string,
): Promise<string> {
  const db = getDb();

  if (requestedId) {
    const existing = await db.cmoConversation.findFirst({
      where: { id: requestedId, brandId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const conversation = await db.cmoConversation.create({
    data: { brandId },
    select: { id: true },
  });
  return conversation.id;
}

export async function loadCmoContext(conversationId: string): Promise<string[]> {
  const messages = await getDb().cmoMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MAX_CONTEXT_MESSAGES,
    select: { role: true, text: true },
  });

  return messages.reverse().map((message: { role: string; text: string }) => `${message.role}: ${message.text}`);
}

export async function loadPendingClarification(
  conversationId: string,
): Promise<CmoClarification | null> {
  const latestAssistant = await getDb().cmoMessage.findFirst({
    where: { conversationId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    select: { response: true },
  });
  if (!latestAssistant?.response) return null;
  const parsed = CmoResponseSchema.safeParse(latestAssistant.response);
  return parsed.success ? parsed.data.clarification ?? null : null;
}

/** True when the previous assistant turn offered to build the detailed plan. */
/**
 * Whether the CMO has recently offered to build the plan.
 *
 * Looks back over the last few assistant turns rather than only the last one.
 * A clarifying question in between sets planOffer false, and reading only the
 * latest message meant an intervening question silently cancelled the user's
 * agreement — so they said yes and were asked again.
 */
export async function loadPendingPlanOffer(
  conversationId: string,
): Promise<boolean> {
  const recent = await getDb().cmoMessage.findMany({
    where: { conversationId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { response: true },
  });
  return recent.some((message) => {
    if (!message.response) return false;
    const parsed = CmoResponseSchema.safeParse(message.response);
    return parsed.success && parsed.data.planOffer;
  });
}

export async function saveCmoExchange(input: {
  conversationId: string;
  userMessage: string;
  assistantText: string;
  presentation: "conversation" | "brief";
  response: CmoResponse;
  delegations: string[];
}): Promise<void> {
  const db = getDb();
  await db.$transaction([
    db.cmoMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "user",
        text: input.userMessage,
      },
    }),
    db.cmoMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "assistant",
        text: input.assistantText,
        presentation: input.presentation,
        response: jsonValue(input.response),
        delegations: jsonValue(input.delegations),
      },
    }),
    db.cmoConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

export async function loadCmoHistory(
  brandId: string,
  conversationId: string,
): Promise<CmoStoredMessage[] | null> {
  const conversation = await getDb().cmoConversation.findFirst({
    where: { id: conversationId, brandId },
    select: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: MAX_HISTORY_MESSAGES,
        select: {
          id: true,
          role: true,
          text: true,
          presentation: true,
          response: true,
          delegations: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) return null;

  return conversation.messages.flatMap((message: {
    id: string;
    role: string;
    text: string;
    presentation: string | null;
    response: unknown;
    delegations: unknown;
    createdAt: Date;
  }) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const response = message.response
      ? CmoResponseSchema.safeParse(message.response)
      : null;

    return [{
      id: message.id,
      role: message.role,
      text: message.text,
      presentation: message.presentation === "conversation"
        ? "conversation"
        : "brief",
      response: response?.success ? response.data : null,
      delegations: stringArray(message.delegations),
      createdAt: message.createdAt.toISOString(),
    }];
  });
}
