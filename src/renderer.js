// Low-resolution cel-shaded renderer.
//
// The scene is rendered into a small render target (≈200px on the short side),
// together with a view-space normal pass. A composite shader then draws
// pixel-perfect outlines (depth Laplacian -> dark silhouette lines; convex
// normal creases -> light rim highlights) and the canvas is upscaled with
// nearest-neighbour filtering by an integer factor.
import * as THREE from 'three';

const TARGET_SHORT_SIDE = 200;

const compositeVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const compositeFrag = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 texel;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float depthThreshold;
  uniform float outlineStrength;
  uniform float highlightStrength;
  varying vec2 vUv;

  float viewDepth(vec2 uv) {
    // Orthographic camera: depth buffer is linear.
    float d = texture2D(tDepth, uv).x;
    return cameraNear + d * (cameraFar - cameraNear);
  }
  vec3 viewNormal(vec2 uv) {
    return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  }

  void main() {
    vec4 col = texture2D(tColor, vUv);
    float d = viewDepth(vUv);
    vec3 n = viewNormal(vUv);

    vec2 offs[4];
    offs[0] = vec2( 1.0, 0.0);
    offs[1] = vec2(-1.0, 0.0);
    offs[2] = vec2( 0.0, 1.0);
    offs[3] = vec2( 0.0,-1.0);

    float lap = 0.0;
    float crease = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 uv = vUv + offs[i] * texel;
      float dn = viewDepth(uv);
      lap += dn - d;
      vec3 nn = viewNormal(uv);
      // Convex crease: the normal turns towards the offset direction.
      float convex = dot(nn - n, vec3(offs[i], 0.0));
      // Only draw on the nearer (or equal) pixel so lines stay 1px wide.
      if (dn - d > -0.02 && convex > 0.25) crease = max(crease, convex);
    }

    vec3 c = col.rgb;
    if (lap > depthThreshold) {
      // Silhouette: darken and cool the base colour instead of flat black.
      c = mix(c * 0.32, vec3(0.06, 0.04, 0.14), 0.35) ;
      c = mix(col.rgb, c, outlineStrength);
    } else if (crease > 0.0) {
      c = mix(c, c * 1.25 + 0.06, highlightStrength * clamp(crease, 0.0, 1.0));
    }

    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

export class PixelRenderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.clearColor = new THREE.Color(0x2b6a4f);

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tNormal: { value: null },
        texel: { value: new THREE.Vector2() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        depthThreshold: { value: 0.12 },
        outlineStrength: { value: 1.0 },
        highlightStrength: { value: 0.55 },
      },
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri, this.compositeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.resize();
  }

  makeTargets() {
    this.colorTarget?.dispose();
    this.normalTarget?.dispose();
    const opts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    };
    const depthTexture = new THREE.DepthTexture(this.width, this.height);
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    this.colorTarget = new THREE.WebGLRenderTarget(this.width, this.height, { ...opts, depthTexture });
    this.normalTarget = new THREE.WebGLRenderTarget(this.width, this.height, opts);
    const u = this.compositeMaterial.uniforms;
    u.tColor.value = this.colorTarget.texture;
    u.tDepth.value = depthTexture;
    u.tNormal.value = this.normalTarget.texture;
    u.texel.value.set(1 / this.width, 1 / this.height);
  }

  // Pick an integer upscale factor so the short side lands near TARGET_SHORT_SIDE.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.container.clientWidth || window.innerWidth;
    const cssH = this.container.clientHeight || window.innerHeight;
    const devW = Math.round(cssW * dpr);
    const devH = Math.round(cssH * dpr);
    const scale = Math.max(1, Math.round(Math.min(devW, devH) / TARGET_SHORT_SIDE));
    const w = Math.ceil(devW / scale);
    const h = Math.ceil(devH / scale);
    this.scale = scale;
    this.cssPixel = scale / dpr; // CSS px per game pixel
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.renderer.setSize(w, h, false);
      this.makeTargets();
    }
    // Exact integer device-pixel scaling; centred, overflow cropped by container.
    const s = this.canvas.style;
    s.width = `${(w * scale) / dpr}px`;
    s.height = `${(h * scale) / dpr}px`;
    s.left = `${(cssW - (w * scale) / dpr) / 2}px`;
    s.top = `${(cssH - (h * scale) / dpr) / 2}px`;
  }

  render(scene, camera) {
    const r = this.renderer;
    const u = this.compositeMaterial.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;

    r.shadowMap.needsUpdate = true;
    r.setClearColor(this.clearColor, 1);
    r.setRenderTarget(this.colorTarget);
    r.render(scene, camera);

    scene.overrideMaterial = this.normalMaterial;
    r.setClearColor(0x8080ff, 1);
    r.setRenderTarget(this.normalTarget);
    r.render(scene, camera);
    scene.overrideMaterial = null;

    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
