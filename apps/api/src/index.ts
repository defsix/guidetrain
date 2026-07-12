import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/muscle-groups", async (_req, res) => {
  const groups = await prisma.muscleGroup.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(groups);
});

app.get("/api/muscle-groups/:slug", async (req, res) => {
  const group = await prisma.muscleGroup.findUnique({ where: { slug: req.params.slug } });
  if (!group) {
    res.status(404).json({ error: "Muscle group not found" });
    return;
  }
  res.json(group);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
