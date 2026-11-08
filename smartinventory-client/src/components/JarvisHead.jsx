import {
  useEffect,
  useRef,
  useState,
} from "react";

import * as THREE from "three";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import { voiceLevel } from "../lib/voiceAudio.js";

const MODEL_URL =
  "https://threejs.org/examples/models/gltf/facecap.glb";

function facePose({
  status,
  time,
  level,
  previewTime,
  reducedMotion,
}) {
  const preview =
    previewTime >= 0 && previewTime < 4;

  const smilePreview =
    preview && previewTime >= 2;

  const audio = Number.isFinite(level)
    ? THREE.MathUtils.clamp(level, 0, 1)
    : 0;

  const listening = status === "listening";
  const thinking = status === "thinking";

  // Follow actual audio, even when the status arrives late.
  let jaw = Math.pow(audio, 0.65) * 0.9;

  if (preview) {
    jaw = smilePreview
      ? 0
      : 0.2 +
        0.65 *
          (0.5 + 0.5 * Math.sin(previewTime * 11));
  }

  const naturalBlink = reducedMotion
    ? 0
    : Math.max(
        0,
        1 - Math.abs((time % 4.5) - 4.1) / 0.18
      );

  const blink = preview
    ? previewTime > 2.6 && previewTime < 2.9
      ? 1
      : 0
    : naturalBlink;

  const smile = smilePreview
    ? 0.6
    : thinking
      ? 0
      : listening
        ? 0.18
        : 0.1;

  return {
    jawOpen: jaw,
    mouthClose: 0,
    mouthFunnel: jaw * 0.2,

    mouthLowerDown_L: jaw * 0.22,
    mouthLowerDown_R: jaw * 0.22,

    mouthSmile_L: smile,
    mouthSmile_R: smile,

    cheekSquint_L: smile * 0.2,
    cheekSquint_R: smile * 0.2,

    eyeBlink_L: blink,
    eyeBlink_R: blink,

    eyeWide_L: listening
      ? 0.12 * (1 - blink)
      : 0,

    eyeWide_R: listening
      ? 0.12 * (1 - blink)
      : 0,

    browInnerUp: smilePreview
      ? 0.45
      : listening
        ? 0.35
        : 0.05,

    browOuterUp_L: listening ? 0.12 : 0,
    browOuterUp_R: listening ? 0.12 : 0,

    browDown_L: thinking ? 0.22 : 0,
    browDown_R: thinking ? 0.12 : 0,

    eyeLookUp_L: thinking ? 0.15 : 0,
    eyeLookUp_R: thinking ? 0.15 : 0,
  };
}

function disposeTree(root) {
  const resources = new Set();

  root.traverse((object) => {
    if (object.geometry) {
      resources.add(object.geometry);
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      if (material) {
        resources.add(material);
      }
    });
  });

  resources.forEach((resource) => {
    resource.dispose();
  });
}

export default function JarvisHead({
  status = "idle",
}) {
  const hostRef = useRef(null);
  const statusRef = useRef(status);

  const previewStartRef = useRef(null);
  const previewTimerRef = useRef(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return () => {
      clearTimeout(previewTimerRef.current);
    };
  }, []);

  function testFace() {
    if (
      loading ||
      error ||
      previewing ||
      status !== "idle"
    ) {
      return;
    }

    previewStartRef.current = performance.now();

    setPreviewing(true);

    clearTimeout(previewTimerRef.current);

    previewTimerRef.current = setTimeout(() => {
      previewStartRef.current = null;
      setPreviewing(false);
    }, 4200);
  }

  useEffect(() => {
    const host = hostRef.current;

    let disposed = false;
    let renderer;

    setLoading(true);
    setError("");

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
      });
    } catch {
      setLoading(false);

      setError(
        "3D rendering ආරම්භ කරන්න බැහැ. Browser hardware acceleration බලන්න."
      );

      return;
    }

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 1.5)
    );

    renderer.setClearColor(0x020b13);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    renderer.domElement.style.cssText =
      "display:block;width:100%;height:100%";

    renderer.domElement.setAttribute(
      "aria-hidden",
      "true"
    );

    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      36,
      1,
      0.1,
      40
    );

    const head = new THREE.Group();
    const halo = new THREE.Group();

    scene.add(head, halo);

    halo.position.z = -1.5;

    scene.add(
      new THREE.AmbientLight(0x7adfff, 0.7)
    );

    const keyLight = new THREE.DirectionalLight(
      0xc4faff,
      1.8
    );

    keyLight.position.set(3, 4, 5);

    const fillLight = new THREE.DirectionalLight(
      0x167ddb,
      0.8
    );

    fillLight.position.set(-3, 1, 2);

    scene.add(keyLight, fillLight);

    const faceMaterial = new THREE.MeshPhongMaterial({
      color: 0x197a94,
      specular: 0x4d9eb6,
      shininess: 35,
    });

    const detailMaterial = new THREE.MeshPhongMaterial({
      color: 0x7ab2c2,
      shininess: 20,
    });

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x29dfff,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x16bfdc,
      transparent: true,
      opacity: 0.45,
    });

    [1.68, 1.88, 2.08].forEach((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          radius,
          0.012,
          6,
          100
        ),
        ringMaterial
      );

      ring.rotation.y = index * 0.12;

      halo.add(ring);
    });

    const morphMeshes = [];

    const loader = new GLTFLoader();

    loader.setMeshoptDecoder(MeshoptDecoder);

    // Use our materials without loading the original textures.
    loader.register(() => ({
      name: "JarvisHologramMaterials",

      loadMaterial: () =>
        Promise.resolve(
          new THREE.MeshPhongMaterial()
        ),
    }));

    loader.load(
      MODEL_URL,

      (gltf) => {
        if (disposed) {
          disposeTree(gltf.scene);
          return;
        }

        const root = gltf.scene;

        const required = [
          "jawOpen",
          "eyeBlink_L",
          "eyeBlink_R",
          "browInnerUp",
          "mouthSmile_L",
          "mouthSmile_R",
        ];

        const available = new Set();

        root.traverse((object) => {
          Object.keys(
            object.morphTargetDictionary || {}
          ).forEach((name) => {
            available.add(name);
          });
        });

        const missingAnimation = required.some(
          (name) => !available.has(name)
        );

        if (missingAnimation) {
          disposeTree(root);
          setLoading(false);

          setError(
            "මේ model එකේ අවශ්‍ය facial animations නැහැ. Face Cap model URL එක භාවිත කරන්න."
          );

          return;
        }

        const originals = new Set();

        root.traverse((object) => {
          if (!object.isMesh) {
            return;
          }

          const materials = Array.isArray(
            object.material
          )
            ? object.material
            : [object.material];

          materials.forEach((material) => {
            originals.add(material);
          });

          object.frustumCulled = false;

          if (object.morphTargetInfluences) {
            object.morphTargetInfluences.fill(0);

            morphMeshes.push(object);
            object.material = faceMaterial;
          } else {
            object.material = detailMaterial;
          }
        });

        originals.forEach((material) => {
          material?.dispose();
        });

        root.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(
          root,
          true
        );

        const center = box.getCenter(
          new THREE.Vector3()
        );

        const height = box.getSize(
          new THREE.Vector3()
        ).y;

        root.position.sub(center);

        const fitted = new THREE.Group();

        fitted.scale.setScalar(
          3 / Math.max(height, 0.001)
        );

        fitted.add(root);
        head.add(fitted);

        morphMeshes.forEach((mesh) => {
          const wire = new THREE.Mesh(
            mesh.geometry,
            wireMaterial
          );

          // Share the same facial animation values.
          wire.morphTargetInfluences =
            mesh.morphTargetInfluences;

          wire.morphTargetDictionary =
            mesh.morphTargetDictionary;

          wire.frustumCulled = false;
          wire.scale.setScalar(1.0005);

          mesh.add(wire);
        });

        setLoading(false);
      },

      undefined,

      () => {
        if (!disposed) {
          setLoading(false);

          setError(
            "Face model එක load වුණේ නැහැ. Internet connection එක බලන්න."
          );
        }
      }
    );

    function applyPose(pose, delta) {
      for (const mesh of morphMeshes) {
        for (const [name, target] of Object.entries(pose)) {
          const index =
            mesh.morphTargetDictionary?.[name];

          if (index === undefined) {
            continue;
          }

          const speed = name.startsWith("eyeBlink")
            ? 32
            : 18;

          mesh.morphTargetInfluences[index] =
            THREE.MathUtils.damp(
              mesh.morphTargetInfluences[index],
              target,
              speed,
              delta
            );
        }
      }
    }

    function resize() {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);

      camera.aspect = width / height;

      camera.position.set(
        0,
        0.05,
        6.8 * Math.max(1, 0.95 / camera.aspect)
      );

      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      renderer.setSize(width, height, false);
    }

    const observer = new ResizeObserver(resize);

    observer.observe(host);
    resize();

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const started = performance.now();

    let previous = started;

    renderer.setAnimationLoop(() => {
      const now = performance.now();

      const delta = Math.min(
        (now - previous) / 1000,
        0.05
      );

      previous = now;

      if (document.hidden) {
        return;
      }

      const time = (now - started) / 1000;
      const currentStatus = statusRef.current;

      const previewTime =
        previewStartRef.current === null
          ? -1
          : (now - previewStartRef.current) / 1000;

      const pose = facePose({
        status: currentStatus,
        time,
        level: voiceLevel.current,
        previewTime,
        reducedMotion: reducedMotion.matches,
      });

      applyPose(pose, delta);

      const turn =
        currentStatus === "thinking"
          ? -0.1
          : Math.sin(time * 0.55) * 0.06;

      const tilt =
        currentStatus === "listening"
          ? -0.05
          : currentStatus === "thinking"
            ? 0.04
            : 0;

      head.rotation.y = THREE.MathUtils.damp(
        head.rotation.y,
        reducedMotion.matches ? 0 : turn,
        4,
        delta
      );

      head.rotation.z = THREE.MathUtils.damp(
        head.rotation.z,
        reducedMotion.matches ? 0 : tilt,
        4,
        delta
      );

      head.rotation.x = reducedMotion.matches
        ? 0
        : Math.sin(time * 3) *
          pose.jawOpen *
          0.035;

      if (!reducedMotion.matches) {
        halo.rotation.z +=
          delta *
          (currentStatus === "thinking" ? 0.2 : 0.04);
      }

      wireMaterial.opacity =
        0.08 + pose.jawOpen * 0.07;

      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;

      renderer.setAnimationLoop(null);

      observer.disconnect();

      disposeTree(scene);

      faceMaterial.dispose();
      detailMaterial.dispose();
      wireMaterial.dispose();
      ringMaterial.dispose();

      renderer.dispose();
      renderer.forceContextLoss();

      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="relative overflow-hidden bg-[#020b13]">
      <div
        ref={hostRef}
        role="img"
        aria-label="Jarvis animated face"
        className="h-[400px] w-full sm:h-[460px]"
      />

      <span className="absolute left-4 top-4 rounded-full border border-cyan-800 bg-slate-950/80 px-3 py-1 text-xs uppercase text-cyan-300">
        {status}
      </span>

      <button
        type="button"
        onClick={testFace}
        disabled={
          loading ||
          Boolean(error) ||
          previewing ||
          status !== "idle"
        }
        title="හඬ නැතිව කට, සිනහව සහ ඇස් චලනය පරීක්ෂා කරන්න"
        className="absolute right-3 top-3 z-20 rounded-lg border border-cyan-700 bg-slate-950/90 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40"
      >
        {previewing ? "Testing…" : "Test face"}
      </button>

      {(loading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#020b13]/90 p-6 text-center">
          <p
            role={error ? "alert" : "status"}
            className={
              error
                ? "text-red-300"
                : "text-cyan-300"
            }
          >
            {error || "Loading Jarvis face…"}
          </p>
        </div>
      )}

      <p className="pb-3 text-center text-[10px] text-slate-500">
    
        <a
          href="https://www.bannaflak.com/face-cap/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
        
        </a>
   
      </p>
    </div>
  );
}