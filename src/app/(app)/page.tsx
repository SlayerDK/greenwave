import { getDevices } from "@/lib/devices/data-access";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const devices = await getDevices();
  const latestReadings = devices.flatMap((device) => device.readings);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Devices</CardDescription>
            <CardTitle className="text-3xl">{devices.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Devices reporting</CardDescription>
            <CardTitle className="text-3xl">{latestReadings.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
