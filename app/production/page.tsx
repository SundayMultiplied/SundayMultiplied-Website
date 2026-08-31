import { ProductionDashboard } from "../../components/production-dashboard";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  await requireChatGPTUser("/production");
  return <ProductionDashboard />;
}
