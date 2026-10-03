import { accountPlan, currentUser } from "@/lib/paperflow/cloud/server";
import { cloudEnabled } from "@/lib/paperflow/cloud/config";

/** The signed-in user's storage plan: mode (cloud/local), quota (null = unlimited) and bytes used. */
export async function GET() {
  if (!cloudEnabled) return Response.json({ enabled: false });
  const user = await currentUser();
  if (!user) return Response.json({ enabled: true, signedIn: false });
  return Response.json({ enabled: true, signedIn: true, email: user.email, plan: await accountPlan(user) });
}
