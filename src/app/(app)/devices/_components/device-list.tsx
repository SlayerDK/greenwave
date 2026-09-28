"use client";

import { CreateDeviceForm } from "@/app/(app)/devices/_components/create-device-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDeleteDevice } from "@/hooks/devices/use-devices";
import { type SerializedDevice } from "@/lib/devices/serialization";
import Link from "next/link";
import { toast } from "sonner";

export const DeviceList = ({ devices }: { devices: SerializedDevice[] }) => {
  const deleteDevice = useDeleteDevice();

  const remove = (id: string) =>
    deleteDevice.mutate(id, {
      onError: (error) => toast.error(error.message),
      onSuccess: () => toast.success("Device removed"),
    });

  return (
    <div className="flex flex-col gap-6">
      <CreateDeviceForm />

      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No devices yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {devices.map((device) => (
            <li key={device.id}>
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>
                      <Link href={`/devices/${device.id}`}>{device.name}</Link>
                    </CardTitle>
                    <CardDescription>
                      {device.location ?? "No location"}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deleteDevice.isPending}
                    onClick={() => remove(device.id)}
                  >
                    Remove
                  </Button>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
