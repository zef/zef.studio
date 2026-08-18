// A small WebGL viewer for the rendered part.
//
// Written directly against WebGL rather than pulling in a 3D library: the whole
// job is one flat-shaded mesh, a ground grid and an orbit camera, and a
// dependency for that would outweigh the code by a wide margin. Shaders are
// GLSL ES 1.00 so the same source runs on a WebGL 2 or WebGL 1 context.
//
// Draws on demand — after an interaction or a new mesh — rather than running a
// permanent animation loop, so an idle page costs nothing.

const VERTEX_SHADER = `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelView;
  uniform mat4 projection;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    vec4 eye = modelView * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vEye = -eye.xyz;
    gl_Position = projection * eye;
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vEye;
  uniform vec3 baseColor;
  uniform vec3 keyDirection;
  uniform vec3 fillDirection;
  void main() {
    vec3 n = normalize(vNormal);
    // Two-sided: interior walls seen through an opening should still be lit.
    if (!gl_FrontFacing) n = -n;
    vec3 eye = normalize(vEye);

    float key = max(dot(n, keyDirection), 0.0);
    float fill = max(dot(n, fillDirection), 0.0);
    // A touch of rim light separates the silhouette from the background.
    float rim = pow(1.0 - max(dot(n, eye), 0.0), 3.0);

    vec3 color = baseColor * (0.30 + 0.58 * key + 0.20 * fill) + vec3(0.16, 0.22, 0.34) * rim;
    gl_FragColor = vec4(color, 1.0);
  }
`

const GRID_VERTEX_SHADER = `
  attribute vec3 position;
  uniform mat4 modelView;
  uniform mat4 projection;
  varying vec2 vGround;
  void main() {
    vGround = position.xy;
    gl_Position = projection * modelView * vec4(position, 1.0);
  }
`

const GRID_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 vGround;
  uniform vec3 gridColor;
  uniform vec2 gridCenter;
  uniform float fadeRadius;
  void main() {
    // Fading has to happen per pixel: every grid line ends at the outer radius,
    // so a per-vertex fade would interpolate from zero to zero and the whole
    // line would vanish.
    float fade = 1.0 - clamp(length(vGround - gridCenter) / fadeRadius, 0.0, 1.0);
    gl_FragColor = vec4(gridColor, fade * 0.42);
  }
`

// ------------------------------------------------------------------ mat4

const mat4 = {
  identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),

  perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2)
    const out = new Float32Array(16)
    out[0] = f / aspect
    out[5] = f
    out[10] = (far + near) / (near - far)
    out[11] = -1
    out[14] = (2 * far * near) / (near - far)
    return out
  },

  lookAt(eye, target, up) {
    const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]])
    const x = normalize(cross(up, z))
    const y = cross(z, x)
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ])
  },

  // Upper-left 3x3 of a rigid transform: no non-uniform scale here, so the
  // rotation part transforms normals correctly as-is.
  normalMatrix(m) {
    return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]])
  },
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

// ---------------------------------------------------------------- viewer

// The part is rendered in filament off-white against the dark blue stage: it
// reads as printed plastic, and it separates from the background far better
// than a blue part on a blue ground.
const DEFAULT_COLORS = {
  model: [0.87, 0.85, 0.81],
  grid: [0.78, 0.84, 0.95],
}

export class Viewer {
  constructor(canvas, { colors = DEFAULT_COLORS } = {}) {
    this.canvas = canvas
    this.colors = colors
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: true }) ||
      canvas.getContext("webgl", { antialias: true, alpha: true })
    if (!this.gl) throw new Error("This browser can't open a WebGL context")

    this.geometry = null
    this.triangleCount = 0
    this.needsDraw = false

    // Camera in spherical coordinates around a target point.
    this.yaw = Math.PI * 0.28
    this.pitch = Math.PI * 0.20
    this.distance = 100
    this.target = [0, 0, 0]
    this.gridSpacing = 10
    this.gridExtent = 100

    this.setupPrograms()
    this.setupBuffers()
    this.attachControls()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  destroy() {
    this.resizeObserver.disconnect()
    this.detachControls?.()
  }

  // ---------------------------------------------------------- gl setup

  compile(type, source) {
    const { gl } = this
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader failed to compile: ${gl.getShaderInfoLog(shader)}`)
    }
    return shader
  }

  link(vertexSource, fragmentSource) {
    const { gl } = this
    const program = gl.createProgram()
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, vertexSource))
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, fragmentSource))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program failed to link: ${gl.getProgramInfoLog(program)}`)
    }
    return program
  }

  setupPrograms() {
    const { gl } = this
    this.meshProgram = this.link(VERTEX_SHADER, FRAGMENT_SHADER)
    this.gridProgram = this.link(GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER)

    this.meshLocations = {
      position: gl.getAttribLocation(this.meshProgram, "position"),
      normal: gl.getAttribLocation(this.meshProgram, "normal"),
      modelView: gl.getUniformLocation(this.meshProgram, "modelView"),
      projection: gl.getUniformLocation(this.meshProgram, "projection"),
      normalMatrix: gl.getUniformLocation(this.meshProgram, "normalMatrix"),
      baseColor: gl.getUniformLocation(this.meshProgram, "baseColor"),
      keyDirection: gl.getUniformLocation(this.meshProgram, "keyDirection"),
      fillDirection: gl.getUniformLocation(this.meshProgram, "fillDirection"),
    }
    this.gridLocations = {
      position: gl.getAttribLocation(this.gridProgram, "position"),
      modelView: gl.getUniformLocation(this.gridProgram, "modelView"),
      projection: gl.getUniformLocation(this.gridProgram, "projection"),
      gridColor: gl.getUniformLocation(this.gridProgram, "gridColor"),
      gridCenter: gl.getUniformLocation(this.gridProgram, "gridCenter"),
      fadeRadius: gl.getUniformLocation(this.gridProgram, "fadeRadius"),
    }
  }

  setupBuffers() {
    const { gl } = this
    this.positionBuffer = gl.createBuffer()
    this.normalBuffer = gl.createBuffer()
    this.gridBuffer = gl.createBuffer()
    this.gridVertexCount = 0

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  // ------------------------------------------------------------ geometry

  setGeometry(geometry) {
    const { gl } = this
    this.geometry = geometry
    this.triangleCount = geometry.triangles

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW)

    this.buildGrid(geometry.bounds)
    this.draw()
  }

  /**
   * Frames the part: centres it and pulls the camera back to fit.
   */
  frame(bounds = this.geometry?.bounds) {
    if (!bounds) return
    const radius = boundingRadius(bounds)
    this.target = [bounds.center[0], bounds.center[1], bounds.center[2]]
    // Fit the bounding sphere, with just enough margin that the part doesn't
    // touch the edges as it's orbited.
    this.distance = (radius / Math.tan(this.fovY / 2)) * 1.06
    this.framedRadius = radius
    this.draw()
  }

  /**
   * Re-frames only when the part's size has changed enough that the current
   * view no longer suits it. Nudging a slider leaves the camera exactly where
   * the visitor put it; jumping to a preset four times the size doesn't leave
   * them staring at a cropped fragment.
   */
  frameIfNeeded(bounds = this.geometry?.bounds) {
    if (!bounds) return
    if (!this.framedRadius) return this.frame(bounds)

    const ratio = boundingRadius(bounds) / this.framedRadius
    if (ratio > 1.35 || ratio < 0.72) this.frame(bounds)
  }

  get fovY() {
    return (38 * Math.PI) / 180
  }

  // A ground grid in centimetre-ish steps, scaled to the part so a small clip
  // and a large flange both get a useful reference.
  buildGrid(bounds) {
    const span = Math.max(bounds.size[0], bounds.size[1], 10)
    const spacing = niceStep(span / 6)
    const extent = Math.ceil((span * 1.4) / spacing) * spacing
    this.gridSpacing = spacing
    this.gridExtent = extent

    // Centred under the part, which may not sit on the origin.
    const [cx, cy] = bounds.center
    const lines = []
    const z = bounds.min[2]
    for (let offset = -extent; offset <= extent + 1e-6; offset += spacing) {
      lines.push(cx + offset, cy - extent, z, cx + offset, cy + extent, z)
      lines.push(cx - extent, cy + offset, z, cx + extent, cy + offset, z)
    }

    const { gl } = this
    const data = new Float32Array(lines)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    this.gridVertexCount = data.length / 3
    this.gridCenter = new Float32Array([cx, cy])
  }

  // ------------------------------------------------------------- drawing

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.draw()
  }

  /** Coalesces repeated calls into one draw on the next frame. */
  draw() {
    if (this.needsDraw) return
    this.needsDraw = true
    requestAnimationFrame(() => {
      this.needsDraw = false
      this.render()
    })
  }

  cameraPosition() {
    const cosPitch = Math.cos(this.pitch)
    return [
      this.target[0] + this.distance * cosPitch * Math.sin(this.yaw),
      this.target[1] - this.distance * cosPitch * Math.cos(this.yaw),
      this.target[2] + this.distance * Math.sin(this.pitch),
    ]
  }

  render() {
    const { gl } = this
    const width = this.canvas.width
    const height = this.canvas.height
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    if (!this.geometry) return

    const eye = this.cameraPosition()
    const modelView = mat4.lookAt(eye, this.target, [0, 0, 1])
    // Near/far track the orbit distance so precision stays usable across the
    // range of part sizes, from a 6 mm clip to a 200 mm funnel.
    const projection = mat4.perspective(
      this.fovY,
      width / height,
      Math.max(this.distance / 100, 0.05),
      this.distance * 10
    )

    this.drawGrid(modelView, projection)
    this.drawMesh(modelView, projection)
  }

  drawMesh(modelView, projection) {
    const { gl, meshLocations: loc } = this
    gl.useProgram(this.meshProgram)
    gl.uniformMatrix4fv(loc.modelView, false, modelView)
    gl.uniformMatrix4fv(loc.projection, false, projection)
    gl.uniformMatrix3fv(loc.normalMatrix, false, mat4.normalMatrix(modelView))
    gl.uniform3fv(loc.baseColor, this.colors.model)
    // Lights are fixed in eye space, so the part stays evenly lit as it turns.
    gl.uniform3fv(loc.keyDirection, normalize([-0.4, 0.5, 0.75]))
    gl.uniform3fv(loc.fillDirection, normalize([0.65, -0.2, 0.3]))

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.enableVertexAttribArray(loc.position)
    gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
    gl.enableVertexAttribArray(loc.normal)
    gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, this.triangleCount * 3)
  }

  drawGrid(modelView, projection) {
    if (!this.gridVertexCount) return
    const { gl, gridLocations: loc } = this
    gl.useProgram(this.gridProgram)
    gl.uniformMatrix4fv(loc.modelView, false, modelView)
    gl.uniformMatrix4fv(loc.projection, false, projection)
    gl.uniform3fv(loc.gridColor, this.colors.grid)
    gl.uniform2fv(loc.gridCenter, this.gridCenter)
    gl.uniform1f(loc.fadeRadius, this.gridExtent)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer)
    gl.enableVertexAttribArray(loc.position)
    gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.LINES, 0, this.gridVertexCount)
  }

  // ------------------------------------------------------------ controls

  attachControls() {
    const canvas = this.canvas
    const pointers = new Map()
    let lastPinch = 0

    const orbit = (dx, dy) => {
      this.yaw += dx * 0.008
      this.pitch = clamp(this.pitch + dy * 0.008, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05)
      this.draw()
    }

    const pan = (dx, dy) => {
      // Move the target across the camera's own axes, scaled so a drag tracks
      // the cursor at roughly the depth of the part.
      const eye = this.cameraPosition()
      const forward = normalize([
        this.target[0] - eye[0],
        this.target[1] - eye[1],
        this.target[2] - eye[2],
      ])
      const right = normalize(cross(forward, [0, 0, 1]))
      const up = cross(right, forward)
      const scale = (this.distance * Math.tan(this.fovY / 2) * 2) / this.canvas.clientHeight
      for (let axis = 0; axis < 3; axis++) {
        this.target[axis] += (-right[axis] * dx + up[axis] * dy) * scale
      }
      this.draw()
    }

    const zoom = (factor) => {
      this.distance = clamp(this.distance * factor, 1, 100000)
      this.draw()
    }

    const onPointerDown = (event) => {
      canvas.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      lastPinch = 0
    }

    const onPointerMove = (event) => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.size >= 2) {
        // Two fingers: pinch to zoom, drag to pan.
        const [a, b] = [...pointers.values()]
        const spread = Math.hypot(a.x - b.x, a.y - b.y)
        if (lastPinch) zoom(lastPinch / spread)
        lastPinch = spread
        pan(dx / 2, dy / 2)
      } else if (event.shiftKey || event.button === 1) {
        pan(dx, dy)
      } else {
        orbit(dx, dy)
      }
    }

    const onPointerUp = (event) => {
      pointers.delete(event.pointerId)
      lastPinch = 0
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }

    const onWheel = (event) => {
      event.preventDefault()
      zoom(Math.exp(event.deltaY * 0.0012))
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    this.detachControls = () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("wheel", onWheel)
    }
  }
}

const clamp = (value, low, high) => Math.min(Math.max(value, low), high)

const boundingRadius = (bounds) => Math.max(Math.hypot(...bounds.size) / 2, 1)

/** Rounds a grid step to a 1, 2 or 5 times a power of ten. */
function niceStep(raw) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 0.001)))
  const normalized = raw / magnitude
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1
  return step * magnitude
}
