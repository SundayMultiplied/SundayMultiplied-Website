import { ApprovalReview } from "../../../components/approval-review";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ApprovalReview token={token} />;
}
