import { redirect } from "next/navigation";
import { getStaff, homeRoute } from "@/lib/auth";

// Doc 06 §2: the root sends each role to its own home screen.
export default async function Home() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.must_change_password) redirect("/change-password");
  redirect(homeRoute(staff.role));
}
