# 11-history-notices: preserve specific undo/redo action information

Status: validated by root; see [acceptance evidence](../../undo-redo-validation.md).

The user changed a color but the undo/redo pill reported only Artboard. Trace how notices acquire action metadata across transactions, undo and redo; retain useful property/value information at the appropriate history boundary rather than reconstructing labels from an unrelated current selection. Keep generic fallbacks for genuinely unknown actions, preserve translated labels in all twelve locales, and preserve the existing pill geometry, lifetime, hover pause and dismissal.

Root supervises, reviews and runs all checks. The assigned worker investigates and implements after explicit coordinator handoff, with one writer per file and no independent heavy checks or Git changes.
