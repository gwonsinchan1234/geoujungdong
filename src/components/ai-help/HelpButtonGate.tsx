"use client";

import { usePathname } from "next/navigation";
import HelpButton from "./HelpButton";

export default function HelpButtonGate() {
  const pathname = usePathname();
  if (pathname === "/home" || pathname === "/") return null;
  return <HelpButton />;
}
