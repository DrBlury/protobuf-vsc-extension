/**
 * LSP Handlers
 * Centralized exports for all LSP request handlers
 */

export { handleCompletion } from './completionHandler';
export { handleHover } from './hoverHandler';
export { handleDefinition, extractIdentifierAtPosition } from './definitionHandler';
export { handleReferences } from './referencesHandler';
export { handleDocumentFormatting, handleRangeFormatting } from './formattingHandler';
export { handleDocumentSymbols, handleWorkspaceSymbols } from './symbolsHandler';
export { handleCodeLens } from './codeLensHandler';
export { handleDocumentLinks } from './documentLinksHandler';
export { handlePrepareRename, handleRename } from './renameHandler';
export { handleCodeActions } from './codeActionsHandler';
