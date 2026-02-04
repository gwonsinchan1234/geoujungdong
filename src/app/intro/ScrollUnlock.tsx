"use client";

import { useEffect } from "react";

export default function ScrollUnlock(): null {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevOverscroll = (body.style as any).overscrollBehavior;
    const prevTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    (body.style as any).overscrollBehavior = "none";
    body.style.touchAction = "none";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
      (body.style as any).overscrollBehavior = prevOverscroll;
      body.style.touchAction = prevTouchAction;
    };
  }, []);

  return null;
}
