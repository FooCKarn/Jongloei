"use client";
import { useApp } from "@/lib/state";
import { OrgAdmin } from "@/components/screens/org";

// subscribes to the app state so the screen re-renders on every change
export default function Page() {
  useApp();
  return <OrgAdmin />;
}
