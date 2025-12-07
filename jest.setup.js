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
