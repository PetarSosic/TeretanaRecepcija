import { NextResponse, type NextRequest } from "next/server";
import { isJobName, runJob } from "@/lib/jobs";

// Doc 08 §8: pg_cron posts here every five minutes with the shared secret; each handler
// decides for itself whether its job is due. The work can outlast the default budget of
// a serverless function, so the route is dynamic and given room.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Doc 08 §8 and doc 04: the secret is the only credential, so it is compared in constant
 * time and a wrong or missing one gets 401 with no hint about which job exists.
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret");
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1)
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> },
) {
  if (!authorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { job } = await params;
  if (!isJobName(job))
    return NextResponse.json({ error: "unknown job" }, { status: 404 });

  try {
    const report = await runJob(job);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // The next run tries again; the message stays in the server log, never in the body.
    console.error(
      `Job ${job} failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return NextResponse.json({ job, error: "failed" }, { status: 500 });
  }
}

// A browser visit must not run a job, and must not reveal that the route exists.
export async function GET() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
