import { notFound } from "next/navigation";
import PhotosTestClient from "./PhotosTestClient";

export default function PhotosTestPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <PhotosTestClient />;
}
