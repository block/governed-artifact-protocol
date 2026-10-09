/** Fictional gummy-worm recall paper and the prior work it builds on. Every number is invented demonstration data, not a research finding. */
import type { PaperPayload, Reference, SourcePayload } from '../src/domains/research/models.js';
// Two previously published works the new paper builds on, each answering a different question from the new paper.
export const studyId = 'paper:zero-gravity-story-pace';
export const methodsId = 'paper:jellybean-quiz';
export const paperId = 'paper:floating-gummy-worm-recall';
export const reviewId = 'review:floating-gummy-worm-recall';
export const editorNotesId = 'editor-notes:floating-gummy-worm-recall';
// The prior study measured only how fast stories are told; it never asked what listeners remembered.
export const study = (corrected = false): SourcePayload => ({
  kind: 'study', title: 'Story pace of gummy worms in zero gravity', authors: ['Fictional Orbital Confectionery Group'], journal: 'Fictional Journal of Orbital Confectionery', year: 2024,
  body: `Aboard the spaceship Sugar Comet, twenty fictional groups of gummy worms told the same tale of a marshmallow moon, half with gravity switched on and half floating. Groups with gravity finished in an average of 60 seconds; floating groups finished in ${corrected ? 45 : 40} seconds. Floating storytellers paused less because nobody had to climb back onto the story rug. The study measured pace only; it did not test what listeners remembered. All results are invented demonstration data.${corrected ? ' Correction: a timing error had shortened the floating average, which is 45 seconds, not 40.' : ''}`,
});
// The prior methods paper defines a memory quiz for any story; it says nothing about gravity or gummy worms.
export const methods: SourcePayload = {
  kind: 'methods-paper', title: 'The Jellybean Quiz: ten questions for testing what a listener remembers of any story', authors: ['Fictional Story Metrics Group'], journal: 'Fictional Journal of Story Metrics', year: 2023,
  body: 'The quiz is ten questions asked one minute after a story ends: five about the plot, three about the characters, and two about the setting. Each correct answer earns one jellybean, for a score from 0 to 10. It works for any story and any audience; ask every listener the same questions in the same order. These demonstration methods describe no real experiment.',
};
export const initialConclusion = 'Because zero gravity speeds up storytelling, it also helps gummy-worm listeners remember more.';
export const revisedConclusion = 'In this synthetic comparison, floating listeners and listeners with gravity recalled stories almost equally. The faster pace reported in earlier work did not come with better recall. These fictional results do not establish that zero gravity makes stories more memorable.';
export const reviewResponse = 'Rewrote the abstract and conclusion to report recall on its own, credit the pace finding to the earlier study, and state the synthetic-data limitation.';
export const editorResponse = 'Updated the background to 45 seconds and pinned corrected study version 2 before publication.';
// The new paper asks a new question (recall), cites the prior study's pace finding as background, and uses the
// quiz as its method. Its results are its own.
export function manuscript(entries: Reference[], revised = false, corrected = false): PaperPayload {
  return {
    title: 'Do floating gummy worms remember stories better?', authors: ['Fictional Gummy-Worm Storytelling Crew'],
    abstract: revised
      ? 'Earlier work found that gummy worms tell stories faster in zero gravity. We asked whether floating listeners also remember more. Twelve new groups of gummy worms aboard the fictional spaceship Sugar Comet heard the same tale, and we tested their memory with the Jellybean Quiz. Recall was nearly equal with and without gravity. All characters, settings, and results are invented.'
      : 'Earlier work found that gummy worms tell stories faster in zero gravity. We ask whether floating listeners also remember more, using twelve new groups of gummy worms aboard the fictional spaceship Sugar Comet.',
    sections: [
      { id: 'background', heading: 'Background', text: `A previous study found that floating groups finish a tale in ${corrected ? 45 : 40} seconds, against 60 seconds with gravity. It did not test whether listeners remembered more of the faster stories.`, citations: ['pace-study'] },
      { id: 'methods', heading: 'Methods', text: 'Six groups with gravity and six floating groups heard the same marshmallow-moon tale. One minute after each story, listeners answered the ten questions of the Jellybean Quiz. We did not re-measure story pace.', citations: ['jellybean-quiz'] },
      { id: 'results', heading: 'Results', text: 'Listeners with gravity averaged 7.1 out of 10 on the quiz; floating listeners averaged 7.0. All results are invented.', citations: [] },
      { id: 'conclusion', heading: 'Conclusion', text: revised ? revisedConclusion : initialConclusion, citations: revised ? ['pace-study', 'jellybean-quiz'] : [] },
    ],
    bibliography: [
      { id: 'pace-study', title: study().title, authors: study().authors, journal: study().journal, year: study().year, sourceArtifactId: studyId },
      { id: 'jellybean-quiz', title: methods.title, authors: methods.authors, journal: methods.journal, year: methods.year, sourceArtifactId: methodsId },
    ],
    reviewResponses: revised ? [{ reviewArtifactId: reviewId, feedbackId: 'comment-1', response: reviewResponse }] : [],
    editorResponses: entries.some((entry) => entry.artifactId === editorNotesId) ? [{ notesArtifactId: editorNotesId, feedbackId: 'editor-comment-1', response: editorResponse }] : [],
    dependencySet: { entries: [...entries].sort((a, b) => a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0) },
  };
}
export const feedback = [{ id: 'comment-1', sectionId: 'conclusion', quotedText: initialConclusion,
  comment: 'Your own results show nearly equal recall: 7.1 with gravity and 7.0 floating. The faster pace comes from the earlier study, not from your groups, and does not show that listeners remember more.',
  requestedChange: 'Report recall on its own and limit the conclusion to what this synthetic comparison measured.' }];
export const editorFeedback = [{ id: 'editor-comment-1', sectionId: 'background', quotedText: 'finish a tale in 40 seconds',
  comment: 'The cited study has been corrected: floating groups finish in 45 seconds, so the pace gap is 15 seconds, not 20. This draft still cites the earlier figure and source version.',
  requestedChange: 'Use 45 seconds and pin corrected study version 2 before the final editorial decision.' }];
