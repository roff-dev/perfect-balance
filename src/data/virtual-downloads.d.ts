declare module 'virtual:downloads' {
  /** Where the physics engine's WebAssembly is served from. */
  export const wasmUrl: string;
  export const WASM_BYTES: number;
  /** By model file name, without the extension. */
  export const MODEL_BYTES: Readonly<Record<string, number>>;
}
