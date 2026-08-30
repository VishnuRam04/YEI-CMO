import { redirect } from "next/navigation";

/**
 * The overview dashboard was demo data and has been removed. The root still
 * needs to resolve — the sidebar logo points here — so it sends people to the
 * CMO, which is where work actually starts.
 */
export default function RootPage() {
  redirect("/cmo");
}
