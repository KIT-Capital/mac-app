"use client";

import { Suspense } from "react";
import { ApplicationForm } from "@/components/application-form";

export default function RepurchasePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-mac-faint">Loading</div>}>
      <ApplicationForm />
    </Suspense>
  );
}
