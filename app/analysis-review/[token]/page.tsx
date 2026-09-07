import type { Metadata } from "next";
import { AnalysisReviewShare } from "../../../components/analysis-review-share";

export const metadata: Metadata = {
  title: "Sermon Analysis Review · Sunday Multiplied",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AnalysisReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AnalysisReviewShare token={token} />;
}
