/*
 * Shared example-record shapes and helpers: classify a record and identify
 * the artifact version it describes.
 * Everything here is derived from the records' JSON. Nothing is hand-coded
 * per example, so a new record set works without changes to this file.
 */

export type Json = Record<string, unknown>;
export type RecordFile = { name: string; path: string; github: string; json: Json };
export type RecordSet = { set: string; files: RecordFile[] };

export type Kind =
  | "profile-revision"
  | "artifact-version"
  | "release-approval"
  | "release-rejection"
  | "release-authorization"
  | "release-withdrawal"
  | "release"
  | "release-proof"
  | "release-proof-withdrawn"
  | "trust-store"
  | "unknown";

export const KIND: Record<Kind, { title: string }> = {
  "profile-revision": { title: "Profile revision" },
  "artifact-version": { title: "Artifact version" },
  "release-approval": { title: "Release approval" },
  "release-rejection": { title: "Release rejection" },
  "release-authorization": { title: "Release authorization" },
  "release-withdrawal": { title: "Release withdrawal" },
  release: { title: "Release" },
  "release-proof": { title: "Release proof" },
  "release-proof-withdrawn": { title: "Release proof, with withdrawal" },
  "trust-store": { title: "Trust store" },
  unknown: { title: "Record" },
};

const isObj = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Longest matching file-name prefix, used only when the JSON shape is not recognized. */
const KIND_BY_PREFIX = (Object.keys(KIND) as Kind[]).filter((k) => k !== "unknown").sort((a, b) => b.length - a.length);

/** Decide a record's kind from its shape; fall back to the file name. */
export function kindOf(rec: RecordFile): Kind {
  const j = rec.json;
  if (isObj(j.authorization) && isObj(j.release)) return isObj(j.withdrawal) ? "release-proof-withdrawn" : "release-proof";
  if ("payloadContract" in j && isStr(j.digest)) return "profile-revision";
  if (isObj(j.authorizedBy)) return "release-authorization";
  if (isObj(j.approvedBy)) return "release-approval";
  if (isObj(j.rejectedBy)) return "release-rejection";
  if (isObj(j.withdrawnBy)) return "release-withdrawal";
  if (isObj(j.authoredBy)) return "artifact-version";
  if ("payload" in j && isObj(j.profile)) return "release";
  const entries = Object.values(j);
  if (entries.length && entries.every((v) => isObj(v) && isStr(v.publicKey))) return "trust-store";
  return KIND_BY_PREFIX.find((k) => rec.name.startsWith(k)) ?? "unknown";
}

export type Subject = { artifactId: string; artifactVersion: number };

/** The artifact and version a record is about, if it is about one. */
export function subjectOf(rec: RecordFile): Subject | null {
  const j = rec.json;
  const pick = (o: unknown): Subject | null =>
    isObj(o) && isStr(o.artifactId) && isInt(o.artifactVersion) ? { artifactId: o.artifactId, artifactVersion: o.artifactVersion } : null;
  return pick(j) ?? pick(j.release) ?? pick(j.authorization);
}
