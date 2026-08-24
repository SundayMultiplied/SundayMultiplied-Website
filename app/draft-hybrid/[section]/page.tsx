import { notFound } from "next/navigation";
import ServicesPage from "../../services/page";
import WorkshopsPage from "../../workshops/page";
import PricingPage from "../../pricing/page";
import ExamplesPage from "../../examples/page";
import AboutPage from "../../about/page";
import ContactPage from "../../contact/page";

const pages = { services: ServicesPage, workshops: WorkshopsPage, pricing: PricingPage, examples: ExamplesPage, about: AboutPage, contact: ContactPage };

export function generateStaticParams() { return Object.keys(pages).map(section => ({ section })); }

export default async function HybridSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Page = pages[section as keyof typeof pages];
  if (!Page) notFound();
  return <Page />;
}
