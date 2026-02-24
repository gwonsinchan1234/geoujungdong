import { redirect } from "next/navigation";

/**
 * 루트(/) 접속 시 서버에서 바로 /intro로 리다이렉트.
 * Vercel에서 인트로가 확실히 보이고, 시작하기로 넘어갈 수 있게 함.
 */
export default function RootPage() {
  redirect("/intro");
}
