/**
 * What the game can't run without: WebGL2 for the scene and WebAssembly for the physics. A worker
 * that won't start isn't on the list, because the physics then runs on the main thread (§10.4).
 */
export function canPlay(): boolean {
  if (typeof WebAssembly !== 'object') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // a browser only allows a few contexts at once, so this one is given back
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}
