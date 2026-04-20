import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type VideoJobStatus = "queued" | "processing" | "done" | "failed";

type VideoJobResult =
  | { kind: "video"; url: string }
  | { kind: "physics"; payload: string };

export interface VideoJobRecord {
  id: string;
  prompt: string;
  model: string;
  userId?: string;
  status: VideoJobStatus;
  createdAt: number;
  updatedAt: number;
  result?: VideoJobResult;
  error?: string;
}

const STORE_DIR = path.join(os.tmpdir(), "leopard-video-jobs");
const jobs = new Map<string, VideoJobRecord>();

function now() {
  return Date.now();
}

function createId() {
  return crypto.randomUUID();
}

function getJobPath(id: string) {
  return path.join(STORE_DIR, `${id}.json`);
}

async function ensureStoreDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

async function writeJob(record: VideoJobRecord) {
  jobs.set(record.id, record);
  await ensureStoreDir();
  await fs.writeFile(getJobPath(record.id), JSON.stringify(record), "utf8");
}

async function readJob(id: string): Promise<VideoJobRecord | null> {
  const inMemory = jobs.get(id);
  if (inMemory) return inMemory;

  try {
    const raw = await fs.readFile(getJobPath(id), "utf8");
    const parsed = JSON.parse(raw) as VideoJobRecord;
    jobs.set(parsed.id, parsed);
    return parsed;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function enqueueVideoJob(input: {
  prompt: string;
  model: string;
  userId?: string;
}): Promise<VideoJobRecord> {
  const id = createId();
  const created = now();

  const record: VideoJobRecord = {
    id,
    prompt: input.prompt,
    model: input.model,
    userId: input.userId,
    status: "queued",
    createdAt: created,
    updatedAt: created,
  };

  await writeJob(record);
  return record;
}

export async function setVideoJobProcessing(id: string): Promise<void> {
  const current = await readJob(id);
  if (!current) return;
  current.status = "processing";
  current.updatedAt = now();
  await writeJob(current);
}

export async function completeVideoJob(id: string, result: VideoJobResult): Promise<void> {
  const current = await readJob(id);
  if (!current) return;
  current.status = "done";
  current.result = result;
  current.error = undefined;
  current.updatedAt = now();
  await writeJob(current);
}

export async function failVideoJob(id: string, error: string): Promise<void> {
  const current = await readJob(id);
  if (!current) return;
  current.status = "failed";
  current.error = error;
  current.updatedAt = now();
  await writeJob(current);
}

export async function getVideoJob(id: string): Promise<VideoJobRecord | null> {
  return readJob(id);
}
