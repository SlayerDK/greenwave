import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const seed = async () => {
  const owner = await prisma.user.upsert({
    where: { email: "demo@greenwave.local" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@greenwave.local",
      emailVerified: true,
    },
  });

  await prisma.device.deleteMany({ where: { ownerId: owner.id } });

  await prisma.device.create({
    data: {
      name: "Greenhouse A",
      location: "Roof",
      ownerId: owner.id,
      readings: {
        create: [
          { temperature: 21.4, humidity: 58.2 },
          { temperature: 22.1, humidity: 55.9 },
        ],
      },
    },
  });

  console.log("Seeded demo data for", owner.email);
};

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
