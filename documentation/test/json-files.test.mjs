import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, test } from "node:test";
import { bundleJsonFiles, cleanLegacyDocs, collectJsonFiles, jsonFileAnchor, planFiles } from "../scripts/sync-repo-docs.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const docs = path.join(root, "documentation/docs");
const repoUrl = "https://github.com/example/renamed-gap";
const repoBranch = "docs/preview";
let inventory;

async function jsonPaths(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await jsonPaths(file));
    else if (entry.name.endsWith(".json")) files.push(file);
  }
  return files.sort();
}

before(async () => {
  inventory = await collectJsonFiles({ repoUrl: `${repoUrl}/`, repoBranch });
});

test("the inventory covers every maintained schema and example, with exact source text", async () => {
  const expected = [
    ...await jsonPaths(path.join(root, "specification/draft/schemas")),
    ...await jsonPaths(path.join(root, "specification/draft/examples")),
  ].map((file) => path.relative(root, file).split(path.sep).join("/")).sort();
  assert.deepEqual(inventory.files.map((file) => file.path).sort(), expected);
  assert.equal(new Set(inventory.files.map((file) => file.anchor)).size, expected.length);
  for (const file of inventory.files) {
    assert.equal(file.source, await readFile(path.join(root, file.path), "utf8"), file.path);
    assert.equal(file.anchor, jsonFileAnchor(file.collection, file.relativePath));
    assert.equal(file.github, `${repoUrl}/blob/${repoBranch}/${file.path}`);
    assert.ok(file.title && file.description, file.path);
    assert.equal(decodeURIComponent(encodeURIComponent(file.anchor)), file.anchor);
  }
});

test("schema descriptions come from the source; example descriptions identify actual schema definitions", () => {
  const core = inventory.files.find((file) => file.path.endsWith("/schemas/core.schema.json"));
  const definitions = JSON.parse(core.source).$defs;
  for (const file of inventory.files) {
    if (file.collection === "schemas") {
      const schema = JSON.parse(file.source);
      assert.equal(file.title, schema.title ?? file.name);
      if (schema.description) assert.equal(file.description, schema.description);
    } else {
      assert.notEqual(file.kind, "unknown", file.path);
      assert.ok(definitions[file.definition], `${file.path}: ${file.definition}`);
    }
  }
  const trustStore = inventory.files.find((file) => file.kind === "trust-store");
  assert.match(trustStore.title, /configuration/i);
  assert.match(trustStore.description, /not a GAP record/);
});

test("new files and nested sets are discovered, not manually enumerated; bundle preserves whitespace", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "gap-json-files-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const schemas = path.join(temporary, "specification/draft/schemas/nested");
  const examples = path.join(temporary, "specification/draft/examples/new-set/nested");
  await mkdir(schemas, { recursive: true });
  await mkdir(examples, { recursive: true });
  const schemaText = '{\r\n\t"title": "Future schema",\r\n  "description": "Description from maintained source"\r\n}\r\n';
  const exampleText = '{ "content": "<tag> & {braces}", "number": 1.00 }\n\n';
  await writeFile(path.join(schemas, "another.schema.json"), schemaText);
  await writeFile(path.join(examples, "future-example.json"), exampleText);
  await writeFile(path.join(examples, "ignored.md"), "Not JSON");
  const output = path.join(temporary, "output/json-files.json");
  await bundleJsonFiles({ repoRoot: temporary, repoUrl, repoBranch }, output);
  const bundled = JSON.parse(await readFile(output, "utf8"));
  assert.equal(bundled.files.length, 2);
  assert.equal(bundled.files.find((file) => file.collection === "schemas").source, schemaText);
  assert.equal(bundled.files.find((file) => file.collection === "examples").source, exampleText);
  assert.equal(bundled.files.find((file) => file.collection === "examples").group, "new-set/nested");
  assert.equal(bundled.files.find((file) => file.collection === "schemas").anchor, "json-schemas/nested/another.schema.json");
});

test("sync plans only specification pages with stable IDs and the new titles and slugs", async () => {
  const plan = await planFiles();
  const expected = [
    ["specification/README.md", "specification/README.md", "Specification", "/specification"],
    ["specification/draft/README.md", "specification/draft/README.md", "Working draft", "/specification/working-draft"],
    ["specification/draft/schemas/README.md", "specification/draft/schemas.mdx", "Record schemas", "/specification/record-schemas"],
    ["specification/draft/examples/README.md", "specification/draft/examples.mdx", "Example records", "/specification/example-records"],
    ["specification/draft/conformance/README.md", "specification/draft/conformance.mdx", "Requirements and coverage", "/specification/requirements-and-coverage"],
  ];
  assert.deepEqual([...plan.keys()].sort(), expected.map(([source]) => source).sort());
  for (const [source, destination, title, slug] of expected) {
    assert.equal(plan.get(source).dest, destination);
    assert.deepEqual(plan.get(source).frontMatter, { title, slug });
  }
});

test("cleanup removes retired generated copies while preserving authored and local files", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "gap-old-docs-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = path.join(temporary, "documentation/docs");
  const old = ["project/deferred.md", "project/contributing.md", "index.md", "reference-implementations/index.md", "examples/index.md"];
  const keep = ["project/local-notes.md", "project/index.md", "deferred.md", "contributing.mdx", "examples/authored.md", "intro/index.md", "domains/index.mdx"];
  for (const file of [...old, ...keep]) {
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await writeFile(path.join(output, file), old.includes(file)
      ? `<!-- GENERATED by documentation/scripts/sync-repo-docs.mjs from ${file}. Edit the source file, not this copy. -->\n`
      : file);
  }
  for (const file of ["DEFERRED.md", "CONTRIBUTING.md"]) await writeFile(path.join(temporary, file), "Keep repository guidance");
  await cleanLegacyDocs(output);
  await cleanLegacyDocs(output);
  for (const file of old) await assert.rejects(readFile(path.join(output, file)), { code: "ENOENT" });
  for (const file of keep) assert.equal(await readFile(path.join(output, file), "utf8"), file);
  // Even a known old destination must be preserved if it is not marked generated.
  await writeFile(path.join(output, "project/deferred.md"), "Local work");
  await cleanLegacyDocs(output);
  assert.equal(await readFile(path.join(output, "project/deferred.md"), "utf8"), "Local work");
  for (const file of ["DEFERRED.md", "CONTRIBUTING.md"]) assert.equal(await readFile(path.join(temporary, file), "utf8"), "Keep repository guidance");
});

test("real sync writes front matter, exact JSON bundles, and artifact examples in place", async () => {
  execFileSync(process.execPath, ["documentation/scripts/sync-repo-docs.mjs"], { cwd: root, stdio: "pipe" });
  const plan = await planFiles();
  for (const page of plan.values()) {
    const generated = await readFile(path.join(docs, page.dest), "utf8");
    for (const [key, value] of Object.entries(page.frontMatter)) assert.ok(generated.includes(`${key}: ${JSON.stringify(value)}\n`));
  }
  const schemas = await readFile(path.join(docs, "specification/draft/schemas.mdx"), "utf8");
  const examples = await readFile(path.join(docs, "specification/draft/examples.mdx"), "utf8");
  const conformance = await readFile(path.join(docs, "specification/draft/conformance.mdx"), "utf8");
  assert.ok(schemas.includes('<JsonFiles collection="schemas" />'));
  assert.ok(!schemas.includes('## Core schema file'));
  assert.ok(!schemas.includes('Browse all schema files'));
  assert.ok(!examples.includes('<JsonFiles collection="examples" />'));
  assert.ok(!examples.includes('Browse all example files'));
  assert.ok(conformance.includes('<RequirementsCoverage />'));
  assert.ok(!conformance.includes('1. **Separated authority**'));
  const requirementSource = JSON.parse(await readFile(path.join(root, "specification/draft/conformance/core-requirements.json"), "utf8"));
  const requirementBundle = JSON.parse(await readFile(path.join(root, "documentation/src/data/core-requirements.json"), "utf8"));
  assert.deepEqual(requirementBundle.requirements, requirementSource.requirements);
  const bundled = JSON.parse(await readFile(path.join(root, "documentation/src/data/json-files.json"), "utf8"));
  assert.deepEqual(bundled.files.map((file) => [file.path, file.source]), inventory.files.map((file) => [file.path, file.source]));
  for (const set of ["cms", "issue-tracking", "research"]) {
    assert.ok(examples.includes(`<ArtifactExample set="${set}"`));
    const records = JSON.parse(await readFile(path.join(root, `documentation/src/data/records/${set}.json`), "utf8"));
    const sourceFiles = inventory.files.filter((file) => file.collection === "examples" && file.group === set);
    assert.deepEqual(records.files.map((file) => file.path).sort(), sourceFiles.map((file) => file.path).sort());
    for (const record of records.files) assert.deepEqual(record.json, JSON.parse(sourceFiles.find((file) => file.path === record.path).source));
  }
  assert.equal((examples.match(/<ArtifactExample /g) ?? []).length, 7);
  await assert.rejects(readdir(path.join(docs, "project")), { code: "ENOENT" });
});
