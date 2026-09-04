import { ChurchDashboard } from "../../../components/church-dashboard";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ChurchDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireChatGPTUser(`/church/${encodeURIComponent(slug)}`);

  return <ChurchDashboard slug={slug} />;
}
