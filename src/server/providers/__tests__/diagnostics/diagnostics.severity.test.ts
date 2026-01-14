import { DiagnosticsProvider } from "../../diagnostics";
import { ProtoParser } from "../../../core/parser";
import { SemanticAnalyzer } from "../../../core/analyzer";
import { GOOGLE_WELL_KNOWN_PROTOS } from "../../../utils/googleWellKnown";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS } from "../../diagnostics/types";

describe("DiagnosticsProvider severity", () => {
  const parser = new ProtoParser();
  const analyzer = new SemanticAnalyzer();
  const diagnosticsProvider = new DiagnosticsProvider(analyzer);

  beforeAll(() => {
    // Preload minimal google.type.Date stub
    const dateContent = GOOGLE_WELL_KNOWN_PROTOS["google/type/date.proto"];
    const dateUri = "builtin:///google/type/date.proto";
    analyzer.updateFile(dateUri, parser.parse(dateContent, dateUri));
  });

  describe("nonCanonicalImportPath", () => {
    const content = `syntax = "proto3";
      import "date.proto";
      
      message Sample {
        google.type.Date date = 1;
      }`;
    const uri = "file:///sample_wrong_import.proto";
    const file = parser.parse(content, uri);
    analyzer.updateFile(uri, file);

    it("reports non-canonical import path at default severity", () => {
      const diags = diagnosticsProvider.validate(uri, file);
      const wrongImport = diags.find((d) =>
        d.message.includes("should be imported via")
      );

      expect(wrongImport).toBeDefined();
      expect(wrongImport?.severity).toBe(DiagnosticSeverity.Error);
    });

    it("reports non-canonical import path at specified severity", () => {
      diagnosticsProvider.updateSettings({
        severity: {
          ...DEFAULT_DIAGNOSTICS_SEVERITY_SETTINGS,
          nonCanonicalImportPath: "hint",
        },
      });
      const diags = diagnosticsProvider.validate(uri, file);
      const wrongImport = diags.find((d) =>
        d.message.includes("should be imported via")
      );

      expect(wrongImport).toBeDefined();
      expect(wrongImport?.severity).toBe(DiagnosticSeverity.Hint);
    });
  });
});
