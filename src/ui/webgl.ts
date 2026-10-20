// Decides, before three.js has loaded, whether the start screen gets the 3D scale. The context is
// made on the scale's own canvas with three's settings, so the renderer takes it over later.

/** WebGL drawn on the CPU (no GPU, or a blocklisted one), where every frame costs the page. */
function software(gl: WebGL2RenderingContext): boolean {
  let name = String(gl.getParameter(gl.RENDERER));
  if (/^webkit webgl$/i.test(name)) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  }
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/** A hardware WebGL 2 context on `canvas`, or nothing (no WebGL, software WebGL, or Save-Data). */
export function hardwareContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | undefined {
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return undefined;
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
  } catch {
    return undefined;
  }
  if (!gl) return undefined;
  if (software(gl)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return undefined;
  }
  return gl;
}
