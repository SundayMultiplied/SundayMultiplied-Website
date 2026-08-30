import { ApprovalDashboard } from "../../components/approval-dashboard";
import { RevisionQueue } from "../../components/revision-queue";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await requireChatGPTUser("/approvals");
  return <>
    <RevisionQueue />
    <ApprovalDashboard />
  </>;
}
