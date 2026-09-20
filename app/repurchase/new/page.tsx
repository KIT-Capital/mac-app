"use client";

import { Suspense } from "react";
import { RequestBuilder } from "@/components/application-form";

export default function NewRepurchasePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-mac-faint">Loading</div>}>
      <RequestBuilder backHref="/collection" />
    </Suspense>
  );
}
