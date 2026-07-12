import { PrismaClient } from "@prisma/client";
import muscleGroups from "../../../data/muscle-groups.json" with { type: "json" };

const prisma = new PrismaClient();

async function main() {
  for (const group of muscleGroups) {
    await prisma.muscleGroup.upsert({
      where: { slug: group.slug },
      update: group,
      create: group,
    });
  }
  console.log(`Seeded ${muscleGroups.length} muscle groups.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
