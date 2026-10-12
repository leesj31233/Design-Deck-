"use client";
import * as React from "react";
import { EngFlowApp } from "./app";
import { webPlatform } from "../platform/web";
import type { Platform } from "../platform/types";

/** Next.js entry: resolve server capabilities (database, AI) then mount the shared app. */
export function EngFlowWeb() {
  const [platform, setPlatform] = React.useState<Platform | null>(null);
  React.useEffect(() => {
    webPlatform().then(setPlatform);
  }, []);
  if (!platform) {
    return (
      <div className="ef-root grid min-h-[100dvh] place-items-center" lang="ko">
        <div className="w-64 space-y-3" aria-label="불러오는 중">
          <div className="ef-skeleton h-6 w-40" />
          <div className="ef-skeleton h-24 w-full" />
          <div className="ef-skeleton h-10 w-full" />
        </div>
      </div>
    );
  }
  return (
    <div lang="ko">
      <EngFlowApp platform={platform} />
    </div>
  );
}
