import { NextRequest, NextResponse } from "next/server";
import { getAnswer } from "@/components/ai-help/getAnswer";
import { aiRewrite } from "@/lib/aiRewrite";
import { aiGenerate } from "@/lib/aiGenerate";
import type { AiHistoryMessage } from "@/lib/aiGenerate";

export const runtime = "nodejs";

function appendQuestionNudge(text: string): string {
  if (!text.includes("?")) {
    return `${text}\n\n혹시 어느 부분이 궁금하신가요?`;
  }
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question?: string;
      history?: unknown;
    };
    const question = typeof body.question === "string" ? body.question : "";
    const rawHistory = Array.isArray(body.history) ? body.history : [];

    const history: AiHistoryMessage[] = rawHistory
      .filter(
        (m): m is { role: string; text: string } =>
          m != null &&
          typeof m === "object" &&
          typeof (m as { role?: unknown }).role === "string" &&
          typeof (m as { text?: unknown }).text === "string",
      )
      .map((m) => ({
        role: m.role === "bot" ? ("bot" as const) : ("user" as const),
        text: m.text,
      }));

    const baseAnswer = getAnswer(question).trim();

    let finalAnswer: string;

    const useGenerate =
      question.length > 20 || baseAnswer.includes("등록되지 않았습니다");

    try {
      if (useGenerate) {
        const gen = await aiGenerate(question, history);
        finalAnswer = gen?.trim() ? gen.trim() : baseAnswer;
      } else {
        const rewritten = await aiRewrite(baseAnswer);
        finalAnswer =
          typeof rewritten === "string" && rewritten.trim()
            ? rewritten.trim()
            : baseAnswer;
      }
    } catch {
      finalAnswer = baseAnswer;
    }

    finalAnswer = appendQuestionNudge(finalAnswer);

    const mode =
      process.env.AI_MODE === "real" ? ("real" as const) : ("mock" as const);

    return NextResponse.json({ answer: finalAnswer, mode });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
