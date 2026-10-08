import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cloudEnabled } from "@/lib/paperflow/cloud/config";
import { LoginView } from "@/components/paperflow/auth/login-view";

export const metadata = { title: "로그인 — PAPERFLOW" };

/** Sign-in / sign-up. Without cloud accounts configured the library is open, so there is nothing to sign in to. */
export default function LoginPage() {
  if (!cloudEnabled) redirect("/library");
  return <Suspense><LoginView/></Suspense>;
}
