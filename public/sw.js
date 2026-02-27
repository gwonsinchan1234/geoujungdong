// Service Worker — Share Target 파일 수신 처리
const SHARE_CACHE = "share-file-v1";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // POST /workspace/fill → share_target 수신
  if (
    event.request.method === "POST" &&
    url.pathname === "/workspace/fill"
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const file = formData.get("file");
          if (file instanceof File) {
            const cache = await caches.open(SHARE_CACHE);
            // 파일을 캐시에 저장 (페이지에서 꺼내 씀)
            await cache.put(
              "/shared-excel",
              new Response(file, {
                headers: {
                  "Content-Type": file.type,
                  "X-File-Name": encodeURIComponent(file.name),
                },
              })
            );
          }
        } catch (e) {
          console.error("[SW] share target error", e);
        }
        // 파일 저장 후 fill 페이지로 리다이렉트
        return Response.redirect("/workspace/fill?shared=1", 303);
      })()
    );
  }
});
