import { PageSkeleton } from "@/components/common/skeleton";
import { me } from "@/lib/i18n/me";

// Doc 06 §1: every screen under the application layout shows placeholders while its data
// is on the way. The header and the navigation stay put, because they belong to the
// layout and are already rendered by the time this appears.
export default function AppLoading() {
  return <PageSkeleton label={me.common.loading} />;
}
