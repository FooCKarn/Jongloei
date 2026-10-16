"use client";
import { useApp } from "@/lib/state";
import { OrgEvent } from "@/components/screens/org";

// subscribes to the demo state so the screen re-renders on every change
export default function Page() {
  useApp();
  return <OrgEvent />;
}
