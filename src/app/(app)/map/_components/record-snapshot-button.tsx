"use client";

import { Button } from "@/components/ui/button";
import { useRecordRouteSnapshot } from "@/hooks/traffic/use-traffic";
import { toast } from "sonner";

/** The only trigger for the snapshot ingest path, which `/api/traffic/history`
 * reads back. */
export const RecordSnapshotButton = ({ routeId }: { routeId: number }) => {
  const recordSnapshot = useRecordRouteSnapshot(routeId);

  const record = () =>
    recordSnapshot.mutate(undefined, {
      onError: (error) => toast.error(error.message),
      onSuccess: ({ segmentCount }) =>
        toast.success(`Snapshot recorded (${segmentCount} segments)`),
    });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={recordSnapshot.isPending}
      onClick={record}
    >
      {recordSnapshot.isPending ? "Recording…" : "Record snapshot"}
    </Button>
  );
};
