import * as THREE from 'three';

export interface ThumbnailSource {
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Renders each object once, from a three-quarter view, into an image URL for its tile.
 * It uses its own short-lived context rather than the game's renderer, so the tiles get the
 * same colour handling as a normal frame without any render-target readback.
 */
export async function renderThumbnails(items: ThumbnailSource[], size = 160): Promise<Map<string, string>> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const urls = new Map<string, string>();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight('#fff6e8', 2.4);
    key.position.set(-2.2, 5, 3.2);
    scene.add(key, new THREE.HemisphereLight('#fffaf2', '#b8a88f', 1.3));
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const sphere = new THREE.Sphere();
    const view = new THREE.Vector3(0.9, 0.75, 1.25).normalize();

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;

    for (const item of items) {
      const mesh = new THREE.Mesh(item.geometry, item.material);
      scene.add(mesh);
      item.geometry.computeBoundingSphere();
      sphere.copy(item.geometry.boundingSphere!);
      const distance = (sphere.radius * 1.12) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.copy(sphere.center).addScaledVector(view, distance);
      camera.near = distance / 10;
      camera.far = distance * 10;
      camera.updateProjectionMatrix();
      camera.lookAt(sphere.center);
      renderer.render(scene, camera);
      scene.remove(mesh);

      // copy straight away: the drawing buffer isn't kept once the frame is done
      context.clearRect(0, 0, size, size);
      context.drawImage(renderer.domElement, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) urls.set(item.id, URL.createObjectURL(blob));
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return urls;
}
