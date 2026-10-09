// This journal's content models and cross-reference vocabulary are local choices.
// GAP defines the envelope, dependency set, and decision records, not academic review policy.
import { z } from 'zod';
export const actorSchema = z.object({ actorId: z.string().min(1), actorKind: z.enum(['human', 'agent']) }).strict();
export type Actor = z.infer<typeof actorSchema>;
const text = z.string().min(1).max(5000).regex(/\S/);
const publicationYear = z.number().int().min(1900).max(2100);
const id = z.string().min(1).max(200).regex(/\S/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sha = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const pinSchema = z.object({ profileId: id, revision: version, digest: sha }).strict();
export const referenceSchema = z.object({ artifactId: id, artifactVersion: version, payloadDigest: sha }).strict();
export type Reference = z.infer<typeof referenceSchema>;
export const sourceSchema = z.object({ kind: z.enum(['study', 'methods-paper']), title: text, authors: z.array(text).min(1).max(20), journal: text, year: publicationYear, body: text }).strict();
export const reviewSchema = z.object({
  manuscript: referenceSchema.extend({ profile: pinSchema }).strict(),
  reviewer: text,
  recommendation: z.enum(['revise', 'accept']),
  feedback: z.array(z.object({ id, sectionId: id, quotedText: text, comment: text, requestedChange: text }).strict()).min(1).max(20),
}).strict();
export const editorNotesSchema = z.object({
  manuscript: referenceSchema.extend({ profile: pinSchema }).strict(),
  editor: text,
  feedback: z.array(z.object({ id, sectionId: id, quotedText: text, comment: text, requestedChange: text }).strict()).min(1).max(20),
}).strict();
export const paperSchema = z.object({
  title: text, authors: z.array(text).min(1).max(20), abstract: text,
  sections: z.array(z.object({ id, heading: text, text, citations: z.array(id).max(20) }).strict()).min(1).max(20),
  bibliography: z.array(z.object({ id, title: text, authors: z.array(text).min(1).max(20), journal: text, year: publicationYear, sourceArtifactId: id }).strict()).min(1).max(20),
  reviewResponses: z.array(z.object({ reviewArtifactId: id, feedbackId: id, response: text }).strict()).max(40),
  editorResponses: z.array(z.object({ notesArtifactId: id, feedbackId: id, response: text }).strict()).max(40),
  dependencySet: z.object({ entries: z.array(referenceSchema).min(1).max(20) }).strict(),
}).strict();
export type Kind = 'source' | 'paper' | 'review' | 'editor-notes';
export const models = { source: sourceSchema, paper: paperSchema, review: reviewSchema, 'editor-notes': editorNotesSchema };
export type SourcePayload = z.infer<typeof sourceSchema>;
export type PaperPayload = z.infer<typeof paperSchema>;
export type ReviewPayload = z.infer<typeof reviewSchema>;
export type EditorNotesPayload = z.infer<typeof editorNotesSchema>;
