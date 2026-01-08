/**
 * Provider Registry
 * Centralizes provider lifecycle management and dependencies
 */

import { SemanticAnalyzer } from '../core/analyzer';
import { ParserFactory } from '../core/parserFactory';
import { DiagnosticsProvider } from '../providers/diagnostics';
import { ProtoFormatter } from '../providers/formatter';
import { CompletionProvider } from '../providers/completion';
import { HoverProvider } from '../providers/hover';
import { DefinitionProvider } from '../providers/definition';
import { ReferencesProvider } from '../providers/references';
import { SymbolProvider } from '../providers/symbols';
import { RenumberProvider } from '../providers/renumber';
import { RenameProvider } from '../providers/rename';
import { CodeActionsProvider } from '../providers/codeActions';
import { SchemaGraphProvider } from '../providers/schemaGraph';
import { CodeLensProvider } from '../providers/codeLens';
import { DocumentLinksProvider } from '../providers/documentLinks';
import { SemanticTokensProvider } from '../providers/semanticTokens';
import { GrpcProvider } from '../providers/grpc';
import { DocumentationProvider } from '../providers/documentation';
import { ProtocCompiler } from '../services/protoc';
import { BreakingChangeDetector } from '../services/breaking';
import { ExternalLinterProvider } from '../services/externalLinter';
import { ClangFormatProvider } from '../services/clangFormat';
import { BufFormatProvider } from '../services/bufFormat';
import { MigrationProvider } from '../providers/migration';

/**
 * Registry of all providers for the language server
 */
export class ProviderRegistry {
  // Core
  public readonly parser: ParserFactory;
  public readonly analyzer: SemanticAnalyzer;

  // Providers
  public readonly diagnostics: DiagnosticsProvider;
  public readonly formatter: ProtoFormatter;
  public readonly completion: CompletionProvider;
  public readonly hover: HoverProvider;
  public readonly definition: DefinitionProvider;
  public readonly references: ReferencesProvider;
  public readonly symbols: SymbolProvider;
  public readonly renumber: RenumberProvider;
  public readonly rename: RenameProvider;
  public readonly codeActions: CodeActionsProvider;
  public readonly schemaGraph: SchemaGraphProvider;
  public readonly codeLens: CodeLensProvider;
  public readonly documentLinks: DocumentLinksProvider;
  public readonly semanticTokens: SemanticTokensProvider;
  public readonly migration: MigrationProvider;
  public readonly grpc: GrpcProvider;
  public readonly documentation: DocumentationProvider;

  // Services
  public readonly protoc: ProtocCompiler;
  public readonly breaking: BreakingChangeDetector;
  public readonly externalLinter: ExternalLinterProvider;
  public readonly clangFormat: ClangFormatProvider;
  public readonly bufFormat: BufFormatProvider;

  constructor() {
    // Initialize core first
    this.parser = new ParserFactory();
    this.analyzer = new SemanticAnalyzer();

    // Initialize services (mostly independent)
    this.protoc = new ProtocCompiler();
    this.breaking = new BreakingChangeDetector();
    this.externalLinter = new ExternalLinterProvider();
    this.clangFormat = new ClangFormatProvider();
    this.bufFormat = new BufFormatProvider();

    // Initialize providers (depend on analyzer)
    this.diagnostics = new DiagnosticsProvider(this.analyzer);
    this.formatter = new ProtoFormatter(this.clangFormat, this.bufFormat);
    this.completion = new CompletionProvider(this.analyzer);
    this.hover = new HoverProvider(this.analyzer);
    this.definition = new DefinitionProvider(this.analyzer);
    this.references = new ReferencesProvider(this.analyzer);
    this.symbols = new SymbolProvider(this.analyzer);
    this.renumber = new RenumberProvider(this.parser);
    this.rename = new RenameProvider(this.analyzer);
    this.codeActions = new CodeActionsProvider(this.analyzer, this.renumber);
    this.schemaGraph = new SchemaGraphProvider(this.analyzer);
    this.codeLens = new CodeLensProvider(this.analyzer);
    this.documentLinks = new DocumentLinksProvider(this.analyzer);
    this.semanticTokens = new SemanticTokensProvider(this.analyzer);
    this.migration = new MigrationProvider();
    this.grpc = new GrpcProvider(this.analyzer);
    this.documentation = new DocumentationProvider(this.analyzer);
  }

  /**
   * Set workspace roots for providers that need them
   */
  setWorkspaceRoots(roots: string[]): void {
    if (roots.length > 0) {
      this.protoc.setWorkspaceRoot(roots[0]!);
      this.breaking.setWorkspaceRoot(roots[0]!);
      this.externalLinter.setWorkspaceRoot(roots[0]!);
      this.analyzer.setWorkspaceRoots(roots);
    }
  }

  /**
   * Set whether to use Tree-sitter parser
   */
  setUseTreeSitter(use: boolean): void {
    this.parser.setUseTreeSitter(use);
  }
}
