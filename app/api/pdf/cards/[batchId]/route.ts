import { NextResponse, type NextRequest } from "next/server";
import { renderCardSheet } from "@/lib/pdf/card-sheet";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Doc 08 §3: the card sheet download. P-64 limits it to owners, managers and admins,
// and RLS limits the batch to their own gym.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const staff = await getStaff();
  if (!staff || staff.role === "receptionist")
    return new NextResponse(null, { status: 404 });

  const { batchId } = await params;
  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("card_batches")
    .select("id, gym_id, created_at")
    .eq("id", batchId)
    .maybeSingle<{ id: string; gym_id: string; created_at: string }>();
  if (!batch) return new NextResponse(null, { status: 404 });

  const { data: cards } = await supabase
    .from("cards")
    .select("code")
    .eq("batch_id", batch.id)
    .order("code")
    .returns<{ code: string }[]>();
  if (!cards?.length) return new NextResponse(null, { status: 404 });

  const { data: gym } = await supabase
    .from("gyms")
    .select("name")
    .eq("id", staff.gym_id)
    .maybeSingle<{ name: string }>();

  // S-28: the gym logo if one is uploaded. The bucket is private, so the bytes are
  // fetched server-side and embedded rather than linked.
  const { data: settings } = await supabase
    .from("gym_settings")
    .select("logo_path")
    .eq("gym_id", staff.gym_id)
    .maybeSingle<{ logo_path: string | null }>();

  let logo: string | undefined;
  if (settings?.logo_path) {
    const file = await createAdminClient()
      .storage.from("gym-assets")
      .download(settings.logo_path);
    if (file.data) {
      const bytes = Buffer.from(await file.data.arrayBuffer());
      logo = `data:${file.data.type || "image/png"};base64,${bytes.toString("base64")}`;
    }
  }

  const pdf = await renderCardSheet({
    codes: cards.map((card) => card.code),
    gymName: gym?.name ?? "",
    logo,
  });

  const day = batch.created_at.slice(0, 10);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kartice-${day}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
