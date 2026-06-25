import {
  addEquipment,
  addReservation,
  completeJob,
  deleteEquipment,
  getEquipmentState,
  RepositoryError,
  removeReservation,
  restoreDefaultEquipments,
  setMaintenance,
  startJob,
  startReservation,
} from "@/db/equipmentRepository";

export const dynamic = "force-dynamic";

type ActionBody = {
  action?: string;
  equipmentId?: string;
  reservationId?: string;
  name?: string;
  category?: string;
  title?: string;
  team?: string;
  durationMinutes?: number;
  maintenance?: boolean;
};

function errorResponse(error: unknown) {
  if (error instanceof RepositoryError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return Response.json({ error: "장비 데이터를 처리하는 중 오류가 발생했습니다." }, { status: 500 });
}

export async function GET() {
  try {
    return Response.json(await getEquipmentState());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActionBody;

    switch (body.action) {
      case "addEquipment":
        return Response.json(await addEquipment(body.name, body.category));
      case "deleteEquipment":
        return Response.json(await deleteEquipment(body.equipmentId));
      case "startJob":
        return Response.json(
          await startJob(body.equipmentId, {
            title: body.title,
            team: body.team,
            durationMinutes: body.durationMinutes,
          }),
        );
      case "completeJob":
        return Response.json(await completeJob(body.equipmentId));
      case "addReservation":
        return Response.json(
          await addReservation(body.equipmentId, {
            title: body.title,
            team: body.team,
            durationMinutes: body.durationMinutes,
          }),
        );
      case "startReservation":
        return Response.json(await startReservation(body.equipmentId, body.reservationId));
      case "removeReservation":
        return Response.json(await removeReservation(body.equipmentId, body.reservationId));
      case "setMaintenance":
        return Response.json(await setMaintenance(body.equipmentId, body.maintenance));
      case "restoreDefaultEquipments":
        return Response.json(await restoreDefaultEquipments());
      default:
        return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
