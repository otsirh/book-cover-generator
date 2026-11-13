// resvg's WebAssembly, as the Worker imports it: wrangler compiles a .wasm import into a
// WebAssembly.Module. (Node can't import one: there, the module comes in as env.RESVG_WASM.)
import wasm from '@resvg/resvg-wasm/index_bg.wasm';

export default wasm;
