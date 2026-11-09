# Boolean export memory investigation

The house failure was reproduced from the open scene's twelve box primitives.
After fixing winding during chunk compaction, the 192-sample Boolean surface
contained 244,650 triangles. The existing 256 MiB export budget admitted Fast but
rejected Standard and High after accounting for retained model and export buffers.

The desktop export panel now offers 256, 384 and 512 MiB. The default remains
256 MiB. The chosen budget follows Boolean sampling, chunk compaction and final
encoding, including assembly part exports. Editing and display-preview budgets,
sampling resolution, triangle ceilings, cancellation and topology validation remain
unchanged. Memory and triangle rejections now give separate, actionable reasons.

## House observations

| Export budget | Standard | High |
| --- | --- | --- |
| 256 MiB | Rejected | Rejected |
| 384 MiB | Valid STL | Rejected |
| 512 MiB | Valid STL | Valid STL |

At 512 MiB, approximately 443.4 MiB remained available for encoding after tracked
model and prepared export buffers. Standard estimated 201.6 MiB; High estimated
336.0 MiB. High produced 238,222 triangles, removing 6,428 additional planar
triangles without moving retained vertices. The longest dimension remained 100 mm,
with zero boundary, non-manifold, inconsistent-winding or degenerate edges/faces.
The existing warning about three disconnected surfaces remains.

These are single observations from the actual export worker under macOS Node.
Sampled whole-process RSS peaked around 685 MiB for Standard and 786 MiB for High
in the 512 MiB run. Workers ran sequentially after Boolean preparation, so RSS
includes runtime overhead, earlier allocations and retained allocator memory.
The budget is an admission estimate for tracked work, not a hard cap on browser
or process RSS. This does not establish memory suitability on Quest or phones.

## Verification

- The house regression exercises Standard and High through the real worker at
  512 MiB and confirms default-budget rejection, valid topology, unchanged native
  bytes and unchanged Undo count.
- Budget tests cover allowed choices, invalid values and the unchanged High
  triangle ceiling. Boolean preparation rejects budgets above 512 MiB before
  creating export resources.
- The desktop panel was inspected with High quality and 512 MiB selected.

## Phase 7.5.4c

The exact STL compactor now avoids unused local reports and per-corner views.
Budgets and refusal policy remain unchanged; lower wall time does not imply lower
peak RSS. See [integration evidence and original-path rollback](PHASE_7_5_4C_EXPORT_INTEGRATION.md).
