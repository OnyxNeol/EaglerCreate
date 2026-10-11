// src/render/webgl-renderer.mjs
// WebGL1 renderer for compiled ModelBuilder meshes with dynamic UV scrolling
// for conveyor belts and mechanical texture animations (animated PNG strips).
//
// Shader features:
// - Belt UV scrolling: the fragment shader offsets texUV.y by a uniform
//   beltOffset when scrollBelt is true, producing smooth conveyor motion.
// - Animated textures: mcmeta animation frames are cycled at their declared
//   frametime by advancing the frameUV.y offset, without per-frame texture
//   uploads.
// - Directional lighting via a fixed light vector and per-face normals.
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

// ---------------------------------------------------------------------------
// Shader sources — minimal WebGL1, no external libraries.
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 camera;
uniform mat4 model;
varying vec2 texUV;
varying float light;
void main() {
  gl_Position = camera * model * vec4(position, 1.0);
  texUV = uv;
  vec3 n = normalize(mat3(model) * normal);
  light = 0.45 + 0.55 * abs(dot(n, normalize(vec3(0.5, 1.0, 0.7))));
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D image;
uniform vec2 frameUV;
uniform float beltOffset;
uniform bool scrollBelt;
varying vec2 texUV;
varying float light;
void main() {
  vec2 finalUV;
  finalUV.x = texUV.x;
  finalUV.y = scrollBelt ? fract(texUV.y + beltOffset) : texUV.y;
  finalUV = vec2(finalUV.x, finalUV.y * frameUV.x + frameUV.y);
  vec4 c = texture2D(image, finalUV);
  if (c.a < 0.1) discard;
  gl_FragColor = vec4(c.rgb * light, c.a);
}
`;

// ---------------------------------------------------------------------------
// WebGLModelRenderer — renders compiled ModelBuilder meshes.
// ---------------------------------------------------------------------------

export class WebGLModelRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Map<string, {image: HTMLImageElement|HTMLCanvasElement, metadata?: object}>} textures
   */
  constructor(canvas, textures) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.canvas = canvas;
    this._meshes = new Map();
    this._textures = new Map();
    this._animatedTextures = [];
    this.disposed = false;
    this.camera = _identity4(new Float32Array(16));

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(reason);
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program));
    }

    this.attributes = ['position', 'normal', 'uv'].map(name => gl.getAttribLocation(this.program, name));
    this.cameraUniform = gl.getUniformLocation(this.program, 'camera');
    this.modelUniform = gl.getUniformLocation(this.program, 'model');
    this.beltUniform = gl.getUniformLocation(this.program, 'beltOffset');
    this.scrollUniform = gl.getUniformLocation(this.program, 'scrollBelt');
    this.frameUniform = gl.getUniformLocation(this.program, 'frameUV');
    this.imageUniform = gl.getUniformLocation(this.program, 'image');

    // Upload textures and extract animation metadata for frame cycling.
    for (const [id, { image, metadata }] of textures) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const animation = metadata?.mcmeta?.animation;
      const frameHeight = animation ? (animation.height ?? Math.min(image.width, image.height)) : image.height;
      const frames = animation?.frames;
      const frameCount = frames ? frames.length : (animation ? Math.floor(image.height / frameHeight) : 1);
      const frametime = animation?.frametime ?? 1; // ticks per frame at 20 Hz
      const first = frames?.[0] ?? 0;
      const firstIndex = typeof first === 'number' ? first : first.index;

      const entry = {
        texture,
        scale: frameHeight / image.height,
        offset: firstIndex * frameHeight / image.height,
        // Animation state
        animated: !!animation,
        frameHeight,
        frameCount,
        frametime,
        currentFrame: firstIndex,
        elapsed: 0,
        frames: frames || null,
      };
      this._textures.set(id, entry);
      if (entry.animated) this._animatedTextures.push(entry);
    }
  }

  /**
   * Advance animated texture frames. Call after each 20 Hz tick (dt = 0.05).
   * Frame cycling uses mcmeta frametime (in ticks at 20 Hz) and optional
   * custom frame indices/durations. No texture re-upload is needed — only
   * the frameUV.y offset changes.
   */
  captureTick(dt = 0.05) {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0 || dt > 1) throw new RangeError('dt must be seconds in [0,1]');
    // Convert dt to ticks: 20 Hz means 1 tick = 0.05s.
    const ticks = dt / 0.05;
    for (let i = 0; i < this._animatedTextures.length; i++) {
      const tex = this._animatedTextures[i];
      tex.elapsed += ticks;
      while (tex.elapsed >= tex.frametime) {
        tex.elapsed -= tex.frametime;
        if (tex.frames) {
          // Custom frame sequence with optional per-frame time.
          tex.currentFrame = (tex.currentFrame + 1) % tex.frameCount;
          const frameData = tex.frames[tex.currentFrame];
          const frameIndex = typeof frameData === 'number' ? frameData : frameData.index;
          tex.offset = frameIndex * tex.frameHeight / (tex.frameHeight / tex.scale);
        } else {
          // Uniform frames: cycle through vertical strip.
          tex.currentFrame = (tex.currentFrame + 1) % tex.frameCount;
          tex.offset = tex.currentFrame * tex.scale;
        }
      }
    }
  }

  /** Upload mesh buffers once; reused on steady frames without re-allocation. */
  prepare(mesh) {
    if (this.disposed) throw new Error('Renderer disposed');
    if (this._meshes.has(mesh)) return;
    const gl = this.gl;
    const batches = [];
    for (const batch of mesh.batches) {
      if (!this._textures.has(batch.texture)) throw new Error(`Missing texture ${batch.texture}`);
      const buffers = [batch.positions, batch.normals, batch.uvs].map(data => {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return buffer;
      });
      const isBelt = /(?:^|\/)belt(?:_|$)/.test(batch.texture);
      batches.push({
        buffers,
        vertices: batch.vertexCount,
        material: this._textures.get(batch.texture),
        belt: isBelt,
      });
    }
    this._meshes.set(mesh, batches);
  }

  beginFrame() {
    if (this.disposed) throw new Error('Renderer disposed');
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.055, 0.07, 0.10, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.cameraUniform, false, this.camera);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.imageUniform, 0);
  }

  draw(mesh, matrix, record = null, part = null) {
    this.prepare(mesh);
    const gl = this.gl;
    gl.uniformMatrix4fv(this.modelUniform, false, matrix);
    const batches = this._meshes.get(mesh);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      // Belt UV scroll offset comes from the animation bridge's BeltUVScroll.
      gl.uniform1f(this.beltUniform, part?.uvOffset ?? record?.uvOffset ?? 0);
      gl.uniform1i(this.scrollUniform, batch.belt && part?.motion === 'belt' ? 1 : 0);
      // Animated textures: use the current frame offset.
      gl.uniform2f(this.frameUniform, batch.material.scale, batch.material.offset);
      for (let j = 0; j < 3; j++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffers[j]);
        gl.enableVertexAttribArray(this.attributes[j]);
        gl.vertexAttribPointer(this.attributes[j], j === 2 ? 2 : 3, gl.FLOAT, false, 0, 0);
      }
      gl.bindTexture(gl.TEXTURE_2D, batch.material.texture);
      gl.drawArrays(gl.TRIANGLES, 0, batch.vertices);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const batches of this._meshes.values()) {
      for (const batch of batches) {
        for (const buffer of batch.buffers) gl.deleteBuffer(buffer);
      }
    }
    for (const { texture } of this._textures.values()) gl.deleteTexture(texture);
    gl.deleteProgram(this.program);
    this._meshes.clear();
    this._textures.clear();
    this._animatedTextures.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Matrix helpers (column-major, WebGL convention).
// ---------------------------------------------------------------------------

function _identity4(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}
