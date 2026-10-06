import assert from "node:assert/strict";
import test from "node:test";
import { JudgeEvidenceSelectionError, selectJudgeEvidenceInputs } from "../lib/judge-evidence-selection.ts";

function input(sample, id, mime) {
  return { blind_sample_id: sample, artifact_id: id, mime_type: mime };
}

test("a video task sends video and text without mixing in screenshots", () => {
  const selection = selectJudgeEvidenceInputs([
    input("sample-a", "screenshot", "image/png"),
    input("sample-a", "video", "video/mp4"),
    input("sample-a", "notes", "text/plain"),
  ], ["text", "video"]);
  assert.equal(selection.selectedFamily, "video");
  assert.deepEqual(selection.selected.map(item => item.artifact_id), ["video", "notes"]);
  assert.deepEqual(selection.omittedArtifactIds, ["screenshot"]);
});

test("comparison judging chooses one common media family for every sample", () => {
  const selection = selectJudgeEvidenceInputs([
    input("sample-a", "video-a", "video/mp4"),
    input("sample-a", "image-a", "image/png"),
    input("sample-b", "image-b", "image/jpeg"),
  ], ["video", "image"]);
  assert.equal(selection.selectedFamily, "image");
  assert.deepEqual(selection.selected.map(item => item.artifact_id), ["image-a", "image-b"]);
  assert.deepEqual(selection.omittedArtifactIds, ["video-a"]);
});

test("the locked Protocol preference wins when several common families are available", () => {
  const selection = selectJudgeEvidenceInputs([
    input("sample-a", "document", "application/pdf"),
    input("sample-a", "image", "image/png"),
  ], ["image", "document"]);
  assert.equal(selection.selectedFamily, "image");
  assert.deepEqual(selection.selected.map(item => item.artifact_id), ["image"]);
});

test("incomparable evidence families fail before any provider request", () => {
  assert.throws(() => selectJudgeEvidenceInputs([
    input("sample-a", "video-a", "video/mp4"),
    input("sample-b", "image-b", "image/png"),
  ], ["mixed"]), JudgeEvidenceSelectionError);
});
