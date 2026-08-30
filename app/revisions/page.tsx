import { RevisionQueue } from "../../components/revision-queue";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function RevisionsPage() {
  await requireChatGPTUser("/revisions");
  return <RevisionQueue standalone />;
}
