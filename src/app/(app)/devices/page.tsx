import { DeviceList } from "@/app/(app)/devices/_components/device-list";
import { getDevices } from "@/lib/devices/data-access";

export default async function DevicesPage() {
  const devices = await getDevices();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Devices</h1>
      <DeviceList devices={devices} />
    </div>
  );
}
