# Teaching Source Data Model

`CanonicalSermonAnalysis` v3 is the normalized sermon record used by every Sunday Multiplied resource generator.

## Governing rule

> What happened in church is authoritative; what was planned supports our understanding of it.

When a delivered-sermon transcript is available, it controls sermon content, emphasis, progression, and application. Pastor notes, manuscripts, outlines, and other supporting documents can clarify the delivered sermon, but they cannot override it.

Church-provided metadata remains authoritative for factual fields such as the published title, series, speaker, date, and passage. Supplied Scripture text is verification-only content, not evidence that the preacher emphasized a particular idea.

## Source hierarchy

| Priority | Source | Role | Permitted use |
| --- | --- | --- | --- |
| 1 | Delivered-sermon transcript | Controlling | Establish what was preached and how it was emphasized |
| 2 | Pastor notes, manuscript, outline | Supporting | Clarify structure, wording, references, and probable transcription errors |
| 3 | Church-provided metadata | Factual | Establish published sermon facts |
| 4 | Supplied Scripture text | Verification only | Reproduce or verify the selected passage |
| 5 | AI inference | None | Record uncertainty; never invent missing sermon content |

## Required provenance

Every evidence item records:

- `source_type`: the kind of uploaded or supplied source
- `source_ref`: the exact source record
- `source_role`: controlling, supporting, factual, or verification-only
- `delivery_status`: delivered, planned, factual context, or verification-only
- `excerpt`: the smallest sufficient supporting excerpt
- timestamp fields when timestamps actually exist
- support type and confidence

Claims also carry a `basis` of `transcript`, `both`, or `supporting_source`. Supporting-source-only material must never be represented as delivered content.

Source IDs, roles, filenames, and transcript hashes are server-owned fields. The analysis model may return the required shape, but the production worker replaces those values from the actual upload before validation and storage.

## Memorable sermon structure

The `memorable_structure` collection preserves outlines, alliteration, repeated phrases, sequences, and contrasts. Each structure receives both a `delivered_status` and a `use_in_resources` decision.

- `explicit_in_transcript` or `evident_in_transcript` may be eligible for resource use.
- `notes_only` is recorded for review but is excluded by default.
- `uncertain` must not silently shape a downstream resource.

This allows Group Multiplied to echo a preacher's real memorable structure without mistaking a planned outline for the sermon that was delivered.

## Source comparison and conflict handling

`source_comparison` explicitly stores:

- material supported by both transcript and notes
- transcript-only material
- notes-only content and its downstream restriction
- departures between the plan and the delivered sermon
- source conflicts and their resolution
- probable transcription corrections with evidence from both sides

The default conflict resolution is `follow_transcript`. A genuinely ambiguous material conflict becomes `human_review_required`; it is never settled by silently preferring the supporting document.

## Downstream generation gate

Resource generation may continue only when:

- source quality does not require human review or blocking;
- the fidelity audit passes or passes with warnings;
- transcript authority is preserved;
- notes-only content is restricted;
- no notes-only item has been approved for context use without human review.

The next intake step should populate `source_bundle` with distinct source records and retain the extracted text for each source separately. It should not concatenate all uploaded files into an unattributed text blob.

## Step 2 intake contract

The production form accepts:

- one required TXT or VTT delivered-sermon transcript;
- optional pastor notes, manuscript, outline, and supporting documents in TXT, DOCX, or PDF form;
- optional speaker, sermon title, series title, and primary-passage overrides.

Supplemental TXT, DOCX, and text-based PDF files are extracted before analysis. The original bytes and separately normalized text are stored in R2 under the production job with a source ID, source type, original filename, media type, SHA-256 hash, character count, extraction status, and any warnings. Scanned PDFs without a usable text layer stop the workflow with a clear OCR/upload correction message.

The canonical analysis receives every source as a separately labeled input. Supporting sources may clarify transcript-supported structure, wording, references, and probable transcription errors, but may not override or independently establish what was delivered. Evidence records must retain the exact source ID, supporting role, and planned delivery status.

Nonblank metadata overrides are applied after analysis as server-controlled factual values with high-confidence `church_metadata` evidence. Blank fields continue to use conservative automatic detection.
