import { MobileQuickEntry } from "@/components/MobileQuickEntry";

export default async function MobileEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <MobileQuickEntry equipmentId={id} />;
}
