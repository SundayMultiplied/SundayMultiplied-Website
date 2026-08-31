import { ApprovalPackagesDashboard } from "../../components/approval-packages-dashboard";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await requireChatGPTUser("/approvals");
  return <ApprovalPackagesDashboard />;
}
