import BookingClientPage from "./ui/BookingClientPage";

export const runtime = "edge";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BookingClientPage slug={slug} />;
}
