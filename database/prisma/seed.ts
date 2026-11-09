import { createPrismaClient } from "../src/index";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = createPrismaClient(connectionString);

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
