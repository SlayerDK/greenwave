-- CreateTable
CREATE TABLE "traffic_stats_route_link" (
    "cityId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "statsRouteId" INTEGER NOT NULL,

    CONSTRAINT "traffic_stats_route_link_pkey" PRIMARY KEY ("cityId","routeId")
);
