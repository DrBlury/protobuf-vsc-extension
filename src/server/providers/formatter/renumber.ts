/** Share the AST-based renumbering path with explicit renumber commands. */
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProtoParser } from '../../core/parser';
import { RenumberProvider } from '../renumber';
import type { FormatterSettings } from './types';

export function renumberFields(text: string, settings: FormatterSettings): string {
  const uri = 'untitled:format.proto';
  const provider = new RenumberProvider(new ProtoParser());
  provider.updateSettings({
    startNumber: settings.renumberStartNumber ?? 1,
    increment: settings.renumberIncrement ?? 1,
    preserveReserved: settings.preserveReserved ?? true,
    skipReservedRange: settings.skipInternalRange ?? true,
  });
  const edits = provider.renumberDocument(text, uri, false);
  return TextDocument.applyEdits(TextDocument.create(uri, 'proto', 1, text), edits);
}
