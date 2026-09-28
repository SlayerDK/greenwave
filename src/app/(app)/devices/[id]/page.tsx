import { RenameDeviceForm } from "@/app/(app)/devices/[id]/_components/rename-device-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDevice } from "@/lib/devices/data-access";
import { notFound } from "next/navigation";

export default async function DevicePage({
  params,
}: PageProps<"/devices/[id]">) {
  const { id } = await params;
  const device = await getDevice(id);
  if (!device) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{device.name}</h1>
        <p className="text-sm text-muted-foreground">
          {device.location ?? "No location"}
        </p>
      </div>

      <RenameDeviceForm id={device.id} name={device.name} />

      <Card>
        <CardHeader>
          <CardTitle>Recent readings</CardTitle>
          <CardDescription>
            Latest {device.readings.length} samples
          </CardDescription>
        </CardHeader>
        <CardContent>
          {device.readings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No readings yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {device.readings.map((reading) => (
                <li key={reading.id} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    {reading.recordedAt}
                  </span>
                  <span>
                    {reading.temperature} °C · {reading.humidity} %
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
