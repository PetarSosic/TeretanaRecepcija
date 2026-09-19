import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * S-19 [PDF] (BR-117): the stored shift report. The bucket is private to the owner
 * (doc 07 §6), so the file is fetched server-side and streamed back rather than linked;
 * the shift is checked against the caller's own gym first.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaff();
  if (!staff || (staff.role !== "owner" && staff.role !== "admin"))
    return new NextResponse(null, { status: 404 });

  const { id } = await params;
  const supabase = await createClient();
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, report_path, started_at")
    .eq("id", id)
    .eq("gym_id", staff.gym_id)
    .maybeSingle<{ id: string; report_path: string | null; started_at: string }>();
  if (!shift?.report_path) return new NextResponse(null, { status: 404 });

  const file = await createAdminClient()
    .storage.from("shift-reports")
    .download(shift.report_path);
  if (file.error || !file.data) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await file.data.arrayBuffer());
  const day = shift.started_at.slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="smjena-${day}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
