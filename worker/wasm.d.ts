// A .wasm import, as wrangler bundles it: a compiled module.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
