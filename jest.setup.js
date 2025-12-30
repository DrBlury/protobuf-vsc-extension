// Override Node's builtin localStorage to avoid warnings about missing --localstorage-file.
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

try {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: noopStorage,
  });
} catch {
  // Ignore if the runtime does not permit overriding localStorage.
}

// Mock web-tree-sitter module for tests that don't need actual tree-sitter functionality
jest.mock(
  "web-tree-sitter",
  () => {
    const mockParser = {
      setLanguage: jest.fn(),
      parse: jest.fn().mockReturnValue({
        rootNode: {
          type: "source_file",
          text: "",
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 0 },
          children: [],
          namedChildren: [],
          childCount: 0,
          namedChildCount: 0,
          firstChild: null,
          lastChild: null,
          firstNamedChild: null,
          lastNamedChild: null,
          parent: null,
          nextSibling: null,
          previousSibling: null,
          nextNamedSibling: null,
          previousNamedSibling: null,
          descendantForPosition: jest.fn(),
          namedDescendantForPosition: jest.fn(),
          walk: jest.fn(),
        },
      }),
    };

    return {
      __esModule: true,
      default: {
        init: jest.fn().mockResolvedValue(undefined),
        Language: {
          load: jest.fn().mockResolvedValue({}),
        },
        Parser: jest.fn().mockImplementation(() => mockParser),
      },
    };
  },
  { virtual: true }
);
