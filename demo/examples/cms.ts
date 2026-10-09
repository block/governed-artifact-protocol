/**
 * The CMS example set (specification/draft/examples/cms): one monarch migration post in
 * four locales. A reviewer agent rejects version 1, an editor approves that same version,
 * and a publisher authorizes its release, so the proof carries both decisions.
 *
 * Every actor, time, reason, and line of content is fixed here. Every record comes from
 * the CMS's own functions, run against the scratch workspace the generator passes in.
 */
import {
  approvePost, previewAuthorization, previewProfileRatification, previewReleaseApproval, proposeBlogModel, publishPost, ratifyProfile, readRelease, rejectPost, saveBlogPost,
} from '../src/domains/cms/cms.js';
import { BLOG_PROFILE_ID, type Actor, type BlogPostContent } from '../src/domains/cms/domain.js';
import type { ExampleSet } from './records.js';

const designer: Actor = { actorId: 'agent:content-designer', actorKind: 'agent' };
const modelOwner: Actor = { actorId: 'human:content-model-owner', actorKind: 'human' };
const writer: Actor = { actorId: 'agent:writer', actorKind: 'agent' };
const reviewer: Actor = { actorId: 'agent:local-reviewer', actorKind: 'agent' };
const editor: Actor = { actorId: 'human:editor', actorKind: 'human' };
const publisher: Actor = { actorId: 'human:publisher', actorKind: 'human' };

const postId = 'blog-post:monarch-migration';
const suffix = '_four-locale-post';

const englishOpening = 'The monarchs passing through our public garden are on their way to the mountain forests of central Mexico, where they spend the winter. In the garden, they stop to feed on nectar before continuing south.\n\nVolunteers record sightings along the garden paths. These observations help us follow the migration from year to year.';
const spanishOpening = 'Las monarcas que pasan por nuestro jardín público van rumbo a los bosques de montaña del centro de México, donde pasan el invierno. En el jardín, se detienen para alimentarse de néctar antes de continuar hacia el sur.\n\nUn grupo de voluntarios registra los avistamientos en los senderos del jardín. Estas observaciones nos ayudan a seguir la migración de un año a otro.';
const content: Record<string, BlogPostContent> = {
  'en-US': { headline: 'Following the monarch migration', body: `${englishOpening}\n\nIn the US, visit our garden during the autumn migration to see monarchs on their journey south. Check current opening dates and visitor guidance before planning your visit.` },
  'es-US': { headline: 'Siguiendo la migración de las monarcas', body: `${spanishOpening}\n\nEn Estados Unidos, visita nuestro jardín durante la migración de otoño para observar a las monarcas en su viaje hacia el sur. Consulta las fechas de apertura y las recomendaciones para visitantes antes de planear tu visita.` },
  'en-MX': { headline: 'Following the monarch migration', body: `${englishOpening}\n\nIn Mexico, visit the monarch sanctuaries in Michoacán and the State of Mexico during winter to see the overwintering colonies. Check current opening dates and visitor guidance before planning your visit.` },
  'es-MX': { headline: 'Siguiendo la migración de las monarcas', body: `${spanishOpening}\n\nEn México, visita los santuarios de la monarca en Michoacán y el Estado de México durante el invierno para observar las colonias que pasan allí la temporada. Consulta las fechas de apertura y las recomendaciones para visitantes antes de planear tu visita.` },
};

export async function cmsExamples(root: string): Promise<ExampleSet> {
  const proposal = await proposeBlogModel(designer, root);
  const ratificationPreview = await previewProfileRatification(BLOG_PROFILE_ID, proposal.revision, root);
  const { profile } = await ratifyProfile({
    profileId: BLOG_PROFILE_ID, revision: proposal.revision, ratifiedBy: modelOwner, confirmation: ratificationPreview.confirmation, ratifiedAt: '2026-08-26T00:00:00Z',
    reason: 'The model supports English and Spanish for readers in the US and Mexico, requiring US English and Mexican Spanish, with fallback within each country.',
  }, root);

  const artifact = await saveBlogPost({ artifactId: postId, expectedVersion: 0, author: 'Grounds staff', date: '2026-10-26T09:30:00Z', audience: 'public', content, authoredBy: writer }, root);
  const version = artifact.artifactVersion;

  const rejection = await rejectPost({
    artifactId: postId, artifactVersion: version, rejectedBy: reviewer, rejectedAt: '2026-10-26T08:30:00Z',
    reason: 'The sentence about where to see monarchs gives different places and seasons for the US and Mexico. Please use the same advice in all four versions.',
  }, root);
  const approvalPreview = await previewReleaseApproval(postId, version, root);
  const approval = await approvePost({
    artifactId: postId, artifactVersion: version, approvedBy: editor, confirmation: approvalPreview.confirmation, approvedAt: '2026-10-26T09:00:00Z',
    reason: 'The viewing advice should differ: readers in the US can visit the garden during autumn migration, while readers in Mexico can visit the sanctuaries during winter. The headline and the rest of the article match within each language. Approving all four versions as written.',
  }, root);
  const authorizationPreview = await previewAuthorization(postId, version, root);
  await publishPost({
    artifactId: postId, artifactVersion: version, authorizedBy: publisher, confirmation: authorizationPreview.confirmation, authorizedAt: '2026-10-26T09:30:00Z',
    reason: 'The editor has reviewed the regional advice for both countries. Publish all four versions together.',
  }, root);
  // The proof as a reader receives it: read back through the release boundary, which verifies it before serving it.
  const proof = await readRelease(postId, 'public', root);

  return {
    set: 'cms',
    files: {
      'profile-revision.json': profile,
      [`artifact-version${suffix}.json`]: artifact,
      [`release-rejection${suffix}.json`]: rejection,
      [`release-approval${suffix}.json`]: approval,
      [`release-authorization${suffix}.json`]: proof.authorization,
      [`release${suffix}.json`]: proof.release,
      [`release-proof${suffix}.json`]: proof,
    },
  };
}
