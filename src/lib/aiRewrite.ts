import OpenAI from "openai";

export async function aiRewrite(text: string): Promise<string> {
  if (process.env.AI_MODE !== "real") {
    return text; // AI OFF → 원본 그대로
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
너는 건설현장 실무 관리자다.
답변을 자연스럽고 이해하기 쉽게 설명하되,
불필요한 말은 제거하고 핵심만 정리해서 말한다.
`,
      },
      {
        role: "user",
        content: `아래 내용을 자연스럽게 설명 형태로 바꿔줘:\n\n${text}`,
      },
    ],
  });

  return res.choices[0].message.content || text;
}
