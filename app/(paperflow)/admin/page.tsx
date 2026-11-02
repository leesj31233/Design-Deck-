import { AdminView } from "@/components/paperflow/admin/admin-view";

export const metadata = { title: "관리자 — PAPERFLOW" };

/** Signed-in only (proxy); the data itself is served to administrators only (/api/admin/users). */
export default function AdminPage() { return <AdminView/>; }
