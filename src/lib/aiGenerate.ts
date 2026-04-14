import OpenAI from "openai";

export type AiHistoryMessage = { role: "user" | "bot"; text: string };

export async function aiGenerate(
  question: string,
  history: AiHistoryMessage[],
): Promise<string> {
  if (process.env.AI_MODE !== "real") {
    return "AI 기능이 현재 비활성화 상태입니다.";
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
너는 건설현장 관리자다.
답변은 짧고 명확하게, 실무 기준으로 설명한다.
마지막에는 자연스럽게 한 문장 질문을 추가한다.
`,
      },
      ...history.slice(-5).map((m) =>
        m.role === "bot"
          ? ({ role: "assistant", content: m.text } as const)
          : ({ role: "user", content: m.text } as const),
      ),
      {
        role: "user",
        content: question,
      },
    ],
  });

  return res.choices[0].message.content || "";
}
