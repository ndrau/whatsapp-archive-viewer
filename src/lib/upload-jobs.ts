import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type UploadJobStatus = "uploading" | "extracting" | "building" | "done" | "error";

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  slug: string;
  title?: string;
  message: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  mediaCount?: number;
}

const BUILT_ROOT = path.join(process.cwd(), ".built");
const JOBS_DIR = path.join(BUILT_ROOT, "upload-jobs");
const TMP_DIR = path.join(BUILT_ROOT, "upload-tmp");

export function getUploadJobsDir(): string {
  return JOBS_DIR;
}

export function getUploadTmpDir(): string {
  return TMP_DIR;
}

export function createJobId(): string {
  return randomUUID();
}

function jobPath(jobId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error("Ungültige Job-ID.");
  }
  return path.join(JOBS_DIR, `${jobId}.json`);
}

export async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
}

export async function writeUploadJob(job: UploadJob): Promise<void> {
  await ensureUploadDirs();
  const next = { ...job, updatedAt: new Date().toISOString() };
  await fs.writeFile(jobPath(job.id), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

export async function readUploadJob(jobId: string): Promise<UploadJob | null> {
  try {
    const raw = await fs.readFile(jobPath(jobId), "utf-8");
    return JSON.parse(raw) as UploadJob;
  } catch {
    return null;
  }
}

export async function updateUploadJob(
  jobId: string,
  patch: Partial<Omit<UploadJob, "id" | "createdAt">>,
): Promise<UploadJob | null> {
  const current = await readUploadJob(jobId);
  if (!current) return null;
  const next: UploadJob = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeUploadJob(next);
  return next;
}
