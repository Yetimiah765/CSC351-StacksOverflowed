import * as THREE from 'three';

/**
 * Compiles every shader `object` needs in the background (three's
 * `compileAsync`, which uses parallel shader compiling where the browser has
 * it), resolving when they're ready. Left to the first frame they compile one
 * after another and freeze the page: on Windows every shader goes through
 * Direct3D's compiler, and the floor's few dozen materials took seconds.
 *
 * The scene is drawn into the post-processing composer's off-screen buffer,
 * and three builds a different version of each shader for drawing off screen
 * (no tone mapping, linear colour) — so they're compiled with one of those
 * set, or the versions compiled would never be used.
 */
export function compileInBackground(
  renderer: THREE.WebGLRenderer,
  object: THREE.Object3D,
  camera: THREE.Camera,
  scene?: THREE.Scene
): Promise<void> {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  let done: Promise<unknown>;
  try {
    done = renderer.compileAsync(object, camera, scene ?? null);
  } catch {
    done = Promise.resolve();
  } finally {
    renderer.setRenderTarget(previous);
  }
  return done.then(
    () => target.dispose(),
    () => target.dispose()
  );
}
