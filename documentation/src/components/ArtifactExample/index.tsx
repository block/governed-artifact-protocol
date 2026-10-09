import React, { useEffect, useRef, useState } from "react";
import CodeBlock from "@theme/CodeBlock";
import cms from "@site/src/data/records/cms.json";
import issueTracking from "@site/src/data/records/issue-tracking.json";
import research from "@site/src/data/records/research.json";
import { KIND, kindOf, subjectOf, type RecordFile, type RecordSet } from "../RecordModel";
import s from "./styles.module.css";

const SETS: Record<string, RecordSet> = { cms: cms as RecordSet, "issue-tracking": issueTracking as RecordSet, "research": research as RecordSet };
type Props = { set: keyof typeof SETS; artifactId: string; id: string };
type Json = Record<string, unknown>;
const object = (value: unknown): Json | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
const versionAnchor = (artifactId: string, version: number) => `example-${artifactId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${version}`;
const sectionAnchor = (artifactId: string, version: number, sectionId: string) => `${versionAnchor(artifactId, version)}-section-${encodeURIComponent(sectionId)}`;
const feedbackAnchor = (artifactId: string, version: number, feedbackId: string) => `${versionAnchor(artifactId, version)}-comment-${encodeURIComponent(feedbackId)}`;
function QuotedPassage({ text, quotes }: { text: string; quotes: string[] }): React.JSX.Element {
  const ranges = quotes.filter(Boolean).map((quote) => [text.indexOf(quote), quote.length] as const).filter(([index]) => index >= 0).sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [index, length] of ranges) {
    if (index < at) continue;
    parts.push(text.slice(at, index), <mark key={index}>{text.slice(index, index + length)}</mark>);
    at = index + length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}


function RecordLink({ file, showVersion = true }: { file: RecordFile; showVersion?: boolean }): React.JSX.Element {
  const kind = kindOf(file);
  const subject = subjectOf(file);
  const label = `${KIND[kind].title}${showVersion && subject ? ` · v${subject.artifactVersion}` : ""}`;
  return (
    <details className={s.record}>
      <summary>{label}</summary>
      <div className={s.recordBody}>
        <a href={file.github}>Source file ↗</a>
        <CodeBlock language="json">{JSON.stringify(file.json, null, 2)}</CodeBlock>
      </div>
    </details>
  );
}

function VersionRecords({ file, records, selectedVersion }: { file: RecordFile; records: RecordFile[]; selectedVersion: number }): React.JSX.Element {
  const version = Number(file.json.artifactVersion);
  const anchor = versionAnchor(String(file.json.artifactId), version);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      try {
        if (decodeURIComponent(window.location.hash.slice(1)) === anchor && details.current) details.current.open = true;
      } catch { /* An unrelated malformed fragment cannot identify this record. */ }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [anchor]);
  const state = records.some((record) => kindOf(record) === "release-withdrawal") ? "Withdrawn"
    : records.some((record) => kindOf(record) === "release") ? "Released" : "Saved";
  return (
    <details className={s.versionRecords} id={anchor} ref={details}>
      <summary>Version {version} · {state}{version === selectedVersion ? " · shown above" : ""}</summary>
      <div className={s.versionRecordsBody}>
        <RecordLink file={file} showVersion={false} />
        {records.map((record) => <RecordLink key={record.name} file={record} showVersion={false} />)}
      </div>
    </details>
  );
}

function Group({ title, files }: { title: string; files: RecordFile[] }): React.JSX.Element | null {
  if (!files.length) return null;
  return (
    <section className={s.group}>
      <h4>{title}</h4>
      {files.map((file) => <RecordLink key={file.name} file={file} />)}
    </section>
  );
}

function ArtifactContent({ text, lang, id, expanded, onToggle }: { text: string; lang?: string; id: string; expanded: boolean; onToggle: () => void }): React.JSX.Element {
  const canExpand = /\n\s*\n/.test(text) || text.length > 320;
  return (
    <div className={s.content}>
      <p id={id} className={`${s.bodyText} ${canExpand && !expanded ? s.bodyPreview : ""}`} lang={lang}>{text}</p>
      {canExpand && <button type="button" className={s.contentToggle} aria-controls={id} aria-expanded={expanded} onClick={onToggle}>
        {expanded ? "Collapse content" : "Read full content"}
      </button>}
    </div>
  );
}

export default function ArtifactExample({ set, artifactId, id }: Props): React.JSX.Element {
  const data = SETS[set];
  if (!data) throw new Error(`Unknown example set: ${set}`);
  const versions = data.files.filter((file) => kindOf(file) === "artifact-version" && file.json.artifactId === artifactId)
    .sort((a, b) => Number(b.json.artifactVersion) - Number(a.json.artifactVersion));
  const latest = versions[0];
  if (!latest) throw new Error(`Missing saved version for ${artifactId}`);
  const [selectedVersion, setSelectedVersion] = useState(Number(latest.json.artifactVersion));
  const [contentExpanded, setContentExpanded] = useState(false);
  const [activePassage, setActivePassage] = useState("");
  const selected = versions.find((file) => Number(file.json.artifactVersion) === selectedVersion) ?? latest;
  const version = Number(selected.json.artifactVersion);
  const matches = data.files.filter((file) => {
    const subject = subjectOf(file);
    return subject?.artifactId === artifactId;
  });
  const release = matches.find((file) => kindOf(file) === "release" && subjectOf(file)?.artifactVersion === version);
  const payload = object((release ?? selected).json.payload);
  if (!payload) throw new Error(`Missing payload for ${artifactId} v${version}`);
  const profilePin = object(selected.json.profile);
  const profile = data.files.find((file) => kindOf(file) === "profile-revision" &&
    file.json.profileId === profilePin?.profileId && file.json.revision === profilePin.revision && file.json.digest === profilePin.digest);
  const decisions = matches.filter((file) => ["release-rejection", "release-approval"].includes(kindOf(file)))
    .sort((a, b) => (subjectOf(b)?.artifactVersion ?? 0) - (subjectOf(a)?.artifactVersion ?? 0) || (kindOf(a) === "release-rejection" ? 0 : 1) - (kindOf(b) === "release-rejection" ? 0 : 1));
  const evidence = matches.filter((file) => ["release-authorization", "release", "release-proof", "release-withdrawal", "release-proof-withdrawn"].includes(kindOf(file)))
    .sort((a, b) => (subjectOf(b)?.artifactVersion ?? 0) - (subjectOf(a)?.artifactVersion ?? 0) || ["release-authorization", "release", "release-proof", "release-withdrawal", "release-proof-withdrawn"].indexOf(kindOf(a)) - ["release-authorization", "release", "release-proof", "release-withdrawal", "release-proof-withdrawn"].indexOf(kindOf(b)));
  // A set can configure several trust contexts; show the store that trusts this artifact's release authority.
  const trustStores = data.files.filter((file) => kindOf(file) === "trust-store");
  const releasers = evidence.filter((file) => kindOf(file) === "release-authorization").map((file) => String(object(file.json.authorizedBy)?.actorId));
  const scoped = trustStores.filter((file) => releasers.some((actorId) => Object.hasOwn(file.json, actorId)));
  const trust = trustStores.length > 1 && scoped.length ? scoped : trustStores;
  const content = object(payload.content);
  const locales = content ? Object.keys(content).filter((key) => object(content[key])?.headline)
    .sort((a, b) => ["en-US", "es-US", "en-MX", "es-MX"].indexOf(a) - ["en-US", "es-US", "en-MX", "es-MX"].indexOf(b)) : [];
  const [locale, setLocale] = useState(locales.includes("en-US") ? "en-US" : locales[0] ?? "");
  const activeLocale = locales.includes(locale) ? locale : locales.includes("en-US") ? "en-US" : locales[0] ?? "";
  const localized = object(content?.[activeLocale]);
  const manuscriptTarget = object(payload.manuscript);
  const targetRecord = manuscriptTarget ? data.files.find((file) => kindOf(file) === "artifact-version" && file.json.artifactId === manuscriptTarget.artifactId && file.json.artifactVersion === manuscriptTarget.artifactVersion) : undefined;
  const targetPayload = object(targetRecord?.json.payload);
  const targetSections = Array.isArray(targetPayload?.sections) ? targetPayload.sections.map(object).filter((section) => section !== null) : [];
  const isEditorNotes = profilePin?.profileId === "research-editor-notes";
  const fallbackTitle = manuscriptTarget ? `${isEditorNotes ? "Editor notes on" : "Peer review of"} manuscript version ${String(manuscriptTarget.artifactVersion)}` : artifactId;
  const title = String(localized?.headline ?? payload.title ?? fallbackTitle);
  const sections = Array.isArray(payload.sections) ? payload.sections.map(object).filter((section) => section !== null) : [];
  const feedback = Array.isArray(payload.feedback) ? payload.feedback.map(object).filter((comment) => comment !== null) : [];
  const bibliography = Array.isArray(payload.bibliography) ? payload.bibliography.map(object).filter((entry) => entry !== null) : [];
  const citationMarkers = (section: Json) => Array.isArray(section.citations) ? section.citations.map((citation) => {
    const number = bibliography.findIndex((entry) => entry.id === citation) + 1;
    return number ? `[${number}]` : String(citation);
  }).join(" ") : "";
  const researchBody = sections.length ? [payload.abstract, ...sections.map((section) => `${section.heading}: ${section.text}${citationMarkers(section) ? ` ${citationMarkers(section)}` : ""}`)].join("\n\n")
    : feedback.length ? feedback.map((comment) => `${comment.sectionId}: ${comment.comment} ${comment.requestedChange}`).join("\n\n") : payload.body;
  const body = sections.length || feedback.length ? null : localized?.body ?? payload.description ?? researchBody;
  const bodyText = body == null ? null : String(body);
  const status = payload.status === "to_do" ? "To do" : payload.status === "in_progress" ? "In progress" : payload.status === "done" ? "Done" : payload.status == null ? null : String(payload.status);
  const acceptanceCriteria = Array.isArray(payload.acceptanceCriteria) ? payload.acceptanceCriteria.filter((item): item is string => typeof item === "string") : [];
  const dependencies = object(payload.dependencySet)?.entries as Json[] | undefined;
  const withdrawn = matches.some((file) => kindOf(file) === "release-withdrawal" && subjectOf(file)?.artifactVersion === version);
  const recordCount = (profile ? 1 : 0) + versions.length + decisions.length + evidence.length + trust.length;
  const recordAnchors = versions.map((file) => versionAnchor(artifactId, Number(file.json.artifactVersion)));
  const contextRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const revealLinkedRecord = () => {
      let hash: string;
      try { hash = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      const passageVersion = versions.find((file) => {
        const versionPayload = object(file.json.payload);
        return Array.isArray(versionPayload?.sections) && versionPayload.sections.some((section) => {
          const entry = object(section);
          return entry && sectionAnchor(artifactId, Number(file.json.artifactVersion), String(entry.id)) === hash;
        });
      });
      if (passageVersion) {
        setSelectedVersion(Number(passageVersion.json.artifactVersion));
        setContentExpanded(true);
        setActivePassage(hash);
        requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
        return;
      }
      if (!recordAnchors.includes(hash) || !contextRef.current) return;
      const linkedVersion = versions.find((file) => versionAnchor(artifactId, Number(file.json.artifactVersion)) === hash);
      if (linkedVersion) setSelectedVersion(Number(linkedVersion.json.artifactVersion));
      contextRef.current.open = true;
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    };
    revealLinkedRecord();
    window.addEventListener("hashchange", revealLinkedRecord);
    return () => window.removeEventListener("hashchange", revealLinkedRecord);
  }, [artifactId]);

  return (
    <article id={id} className={s.example}>
      <div className={s.artifact}>
        <div className={s.cardTop}>
          <div className={s.cardIdentity}>
            <span className={s.kicker}>Artifact preview</span>
            {profilePin?.profileId != null && <span className={s.profileName}>Profile: <strong>{String(profilePin.profileId)}</strong></span>}
          </div>
          {versions.length > 1 ? (
            <label className={s.versionSelect}>
              <span className={s.visuallyHidden}>Preview version</span>
              <select value={version} onChange={(event) => setSelectedVersion(Number(event.target.value))}>
                {versions.map((file) => {
                  const number = Number(file.json.artifactVersion);
                  const isReleased = matches.some((record) => kindOf(record) === "release" && subjectOf(record)?.artifactVersion === number);
                  const isWithdrawn = matches.some((record) => kindOf(record) === "release-withdrawal" && subjectOf(record)?.artifactVersion === number);
                  return <option key={number} value={number}>{isWithdrawn ? "Withdrawn" : isReleased ? "Released" : "Saved"} · v{number}</option>;
                })}
              </select>
              <svg className={s.versionChevron} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <path d="m2 4 4 4 4-4" />
              </svg>
            </label>
          ) : <span className={s.version}>{withdrawn ? "Withdrawn" : release ? "Released" : "Saved"} · v{version}</span>}
        </div>
        {locales.length > 0 && <label className={s.locale}>Language and country <select value={activeLocale} onChange={(event) => setLocale(event.target.value)}>{locales.map((key) => <option key={key}>{key}</option>)}</select></label>}
        <h3 lang={activeLocale || undefined}>{title}</h3>
        {payload.author != null && <p className={s.byline}>By {String(payload.author)}</p>}
        {Array.isArray(payload.authors) && <p className={s.byline}>By {payload.authors.join(", ")}</p>}
        {payload.journal != null && <p className={s.byline}>{String(payload.journal)} · {String(payload.year)}</p>}
        {status != null && <p className={s.byline}>Status: {status}</p>}
        {manuscriptTarget && <div className={s.reviewTarget}>
          <span>{isEditorNotes ? "Notes on" : "Review of"}</span>
          <a href={`#${versionAnchor(String(manuscriptTarget.artifactId), Number(manuscriptTarget.artifactVersion))}`}>{String(manuscriptTarget.artifactId)} · v{String(manuscriptTarget.artifactVersion)}</a>
          {targetPayload?.title != null && <span>{String(targetPayload.title)}</span>}
          <span>By {String(payload.reviewer ?? payload.editor)}</span>
          {payload.recommendation != null && <span>Recommendation: {String(payload.recommendation)}</span>}
        </div>}
        {sections.length > 0 && <div className={s.content}>
          <div id={`${id}-content`} className={!contentExpanded ? s.bodyPreview : undefined}>
            <p className={s.bodyText}>{String(payload.abstract)}</p>
            {sections.map((section) => {
              const anchor = sectionAnchor(artifactId, version, String(section.id));
              const linkedFeedback = data.files.filter((file) => kindOf(file) === "artifact-version").flatMap((file) => {
                const report = object(file.json.payload); const target = object(report?.manuscript);
                return target?.artifactId === artifactId && target.artifactVersion === version && Array.isArray(report?.feedback) ? report.feedback.map(object).filter((comment) => comment?.sectionId === section.id) : [];
              });
              // Every comment on this section links here, so mark each quoted passage rather than guess which link was followed.
              const quotes = activePassage === anchor ? linkedFeedback.map((comment) => String(comment?.quotedText ?? "")) : [];
              return <section className={s.paperSection} key={String(section.id)} id={anchor}>
                <h4>{String(section.heading)}</h4>
                <p className={s.bodyText}><QuotedPassage text={String(section.text)} quotes={quotes} /> {citationMarkers(section)}</p>
              </section>;
            })}
          </div>
          <button type="button" className={s.contentToggle} aria-controls={`${id}-content`} aria-expanded={contentExpanded} onClick={() => setContentExpanded((value) => !value)}>{contentExpanded ? "Collapse paper" : "Read full paper"}</button>
        </div>}
        {feedback.length > 0 && <div className={s.feedbackList}>
          {feedback.map((comment) => {
            const original = targetSections.find((section) => section.id === comment.sectionId);
            const href = manuscriptTarget ? `#${sectionAnchor(String(manuscriptTarget.artifactId), Number(manuscriptTarget.artifactVersion), String(comment.sectionId))}` : undefined;
            return <section className={s.feedback} key={String(comment.id)} id={feedbackAnchor(artifactId, version, String(comment.id))}>
              <h4>{String(original?.heading ?? comment.sectionId)} · {String(comment.id)}</h4>
              <p className={s.feedbackLabel}>Original text · manuscript v{String(manuscriptTarget?.artifactVersion)}</p>
              <blockquote><QuotedPassage text={String(original?.text ?? comment.quotedText)} quotes={[String(comment.quotedText)]} /></blockquote>
              <p className={s.feedbackLabel}>{isEditorNotes ? "Editor note" : "Peer comment"}</p>
              <p>{String(comment.comment)}</p>
              <p className={s.feedbackLabel}>Requested change</p>
              <p>{String(comment.requestedChange)}</p>
              {href && <a href={href}>View original passage in manuscript v{String(manuscriptTarget?.artifactVersion)}</a>}
            </section>;
          })}
        </div>}
        {bodyText != null && <ArtifactContent id={`${id}-content`} text={bodyText} lang={activeLocale || undefined} expanded={contentExpanded} onToggle={() => setContentExpanded((value) => !value)} />}
        {bibliography.length > 0 && <section className={s.references} aria-label="Bibliography">
          <h4>Bibliography</h4>
          <ol>{bibliography.map((citation) => {
            const reference = dependencies?.find((entry) => entry.artifactId === citation.sourceArtifactId);
            const href = reference ? `#${versionAnchor(String(reference.artifactId), Number(reference.artifactVersion))}` : undefined;
            return <li key={String(citation.id)}>
              {Array.isArray(citation.authors) ? `${citation.authors.join(", ")}. ` : ""}
              {citation.year != null ? `(${String(citation.year)}). ` : ""}
              {href ? <a href={href}>{String(citation.title)}</a> : String(citation.title)}.
              {citation.journal != null && <> <em>{String(citation.journal)}</em>.</>}
            </li>;
          })}</ol>
        </section>}
        {acceptanceCriteria.length > 0 && <section className={s.criteria} aria-label="Acceptance criteria">
          <h4>Acceptance criteria</h4>
          <ul>{acceptanceCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
        </section>}
        {withdrawn && <div className={s.withdrawn} role="note">
          <strong>Withdrawn</strong>
          <span>This version was later withdrawn. Its release and withdrawal remain in the records below.</span>
        </div>}
        <div className={s.cardFoot}>
          <div>{artifactId}</div>
          {dependencies?.length ? <div className={s.dependencies}>
            <span className={s.dependencyLabel}>Depends on</span>
            <div className={s.dependencyLinks}>{dependencies.map((entry) => {
              const sourceId = String(entry.artifactId);
              const sourceVersion = Number(entry.artifactVersion);
              return <a key={`${sourceId}-${sourceVersion}`} href={`#${versionAnchor(sourceId, sourceVersion)}`}>{sourceId} · v{sourceVersion}</a>;
            })}</div>
          </div> : null}
        </div>
      </div>
      <details className={s.context} ref={contextRef}>
        <summary className={s.contextSummary}><span>Records for this artifact</span><span className={s.recordCount}>{recordCount} records</span></summary>
        <div className={s.contextBody}>
          <Group title="Content model" files={profile ? [profile] : []} />
          <section className={s.group}>
            <h4>Version history</h4>
            {versions.map((file) => <VersionRecords key={file.name} file={file} selectedVersion={version}
              records={[...decisions, ...evidence].filter((record) => subjectOf(record)?.artifactVersion === file.json.artifactVersion)} />)}
          </section>
          <Group title="Reader trust · outside the proof" files={trust} />
        </div>
      </details>
    </article>
  );
}
