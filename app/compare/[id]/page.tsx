import { ComparisonReview } from "../../../components/comparison-review";

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ComparisonReview id={id} />;
}
