import { redirect } from "next/navigation";

// 루트 접속 시 홈(랜딩)부터 시작
export default function RootPage() {
  redirect("/home");
}
