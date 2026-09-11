import { ManualProductionImport } from "../../components/manual-production-import";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ProductionImportPage() {
  await requireChatGPTUser("/production-import");
  return <ManualProductionImport />;
}
