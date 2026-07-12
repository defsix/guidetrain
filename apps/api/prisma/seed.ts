import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const muscleGroups = [
  { slug: "chest", name: "Chest", latinName: "Pectoralis major", description: "Presses the arm across the body; drives pushing movements like bench press and push-ups." },
  { slug: "back", name: "Back (Lats)", latinName: "Latissimus dorsi", description: "The broad back muscle that pulls the arm down and in; drives pull-ups and rows." },
  { slug: "upper-back", name: "Upper Back", latinName: "Rhomboids, Infraspinatus, Teres major", description: "Retracts and stabilizes the shoulder blades; supports posture and pulling strength." },
  { slug: "shoulders", name: "Shoulders", latinName: "Deltoid", description: "Caps the shoulder and lifts the arm in every direction; drives presses and raises." },
  { slug: "traps", name: "Trapezius", latinName: "Trapezius", description: "Runs from the neck to mid-back; shrugs the shoulders and stabilizes the shoulder blades." },
  { slug: "biceps", name: "Biceps", latinName: "Biceps brachii", description: "Bends the elbow and rotates the forearm; drives curls and pulling movements." },
  { slug: "triceps", name: "Triceps", latinName: "Triceps brachii", description: "Straightens the elbow; drives pressing and pushdown movements." },
  { slug: "forearms", name: "Forearms", latinName: "Brachioradialis, wrist flexors/extensors", description: "Controls the wrist and grip; built up by carries, curls, and grip work." },
  { slug: "abs", name: "Abs", latinName: "Rectus abdominis", description: "Flexes the spine; the 'six-pack' muscle worked by crunches and leg raises." },
  { slug: "obliques", name: "Obliques", latinName: "External oblique", description: "Rotates and side-bends the torso; worked by twisting and anti-rotation exercises." },
  { slug: "glutes", name: "Glutes", latinName: "Gluteus maximus", description: "The largest hip muscle; extends the hip and drives squats, deadlifts, and lunges." },
  { slug: "quads", name: "Quads", latinName: "Quadriceps femoris", description: "Straightens the knee; the primary muscle group in squats, lunges, and leg press." },
  { slug: "hamstrings", name: "Hamstrings", latinName: "Biceps femoris, Semitendinosus, Semimembranosus", description: "Bends the knee and extends the hip; worked by deadlifts, leg curls, and sprints." },
  { slug: "calves", name: "Calves", latinName: "Gastrocnemius, Soleus", description: "Points the foot downward; built up by calf raises and jumping/sprinting." },
];

async function main() {
  for (const [index, group] of muscleGroups.entries()) {
    await prisma.muscleGroup.upsert({
      where: { slug: group.slug },
      update: { ...group, sortOrder: index },
      create: { ...group, sortOrder: index },
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
