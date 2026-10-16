"use client";
import { useApp } from "@/lib/state";
import { Profile } from "@/components/screens/buyer";

// subscribes to the demo state so the screen re-renders on every change
export default function Page() {
  useApp();
  return <Profile />;
}
