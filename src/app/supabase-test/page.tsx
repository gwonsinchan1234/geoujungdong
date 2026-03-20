import { notFound } from "next/navigation";
import SupabaseTestClient from "./SupabaseTestClient";

export default function SupabaseTestPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <SupabaseTestClient />;
}
