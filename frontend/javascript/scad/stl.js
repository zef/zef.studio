// Binary STL → flat-shaded geometry.
//
// OpenSCAD's output is genuinely faceted — curves are polygon approximations —
// so each triangle keeps its own normal rather than being smoothed across
// neighbours. What you see is what gets sliced.

const HEADER_BYTES = 80
const COUNT_BYTES = 4
const TRIANGLE_BYTES = 50 // normal + 3 vertices, 12 bytes each, then 2 spare

export function parseSTL(buffer) {
  const view = new DataView(buffer)
  if (buffer.byteLength < HEADER_BYTES + COUNT_BYTES) {
    throw new Error("STL is too short to be valid")
  }

  const count = view.getUint32(HEADER_BYTES, true)
  const expected = HEADER_BYTES + COUNT_BYTES + count * TRIANGLE_BYTES
  if (buffer.byteLength < expected) {
    throw new Error(`STL claims ${count} triangles but is only ${buffer.byteLength} bytes`)
  }

  const positions = new Float32Array(count * 9)
  const normals = new Float32Array(count * 9)

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let t = 0; t < count; t++) {
    const base = HEADER_BYTES + COUNT_BYTES + t * TRIANGLE_BYTES
    const nx = view.getFloat32(base, true)
    const ny = view.getFloat32(base + 4, true)
    const nz = view.getFloat32(base + 8, true)

    for (let v = 0; v < 3; v++) {
      const o = base + 12 + v * 12
      const x = view.getFloat32(o, true)
      const y = view.getFloat32(o + 4, true)
      const z = view.getFloat32(o + 8, true)

      const i = t * 9 + v * 3
      positions[i] = x
      positions[i + 1] = y
      positions[i + 2] = z
      normals[i] = nx
      normals[i + 1] = ny
      normals[i + 2] = nz

      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }
  }

  // A zeroed facet normal is legal in the format and shows up in the wild;
  // recover those from the winding so they don't render black.
  repairNormals(positions, normals, count)

  const min = [minX, minY, minZ]
  const max = [maxX, maxY, maxZ]
  return {
    triangles: count,
    positions,
    normals,
    bounds: {
      min,
      max,
      size: [maxX - minX, maxY - minY, maxZ - minZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    },
  }
}

function repairNormals(positions, normals, count) {
  for (let t = 0; t < count; t++) {
    const i = t * 9
    if (normals[i] !== 0 || normals[i + 1] !== 0 || normals[i + 2] !== 0) continue

    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5]
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8]

    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    nx /= length
    ny /= length
    nz /= length

    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = nx
      normals[i + v * 3 + 1] = ny
      normals[i + v * 3 + 2] = nz
    }
  }
}

/** Enclosed volume of the mesh, in mm³. */
export function estimateVolume(geometry) {
  const { positions, triangles } = geometry
  // Signed volume of the tetrahedron each triangle makes with the origin.
  let total = 0
  for (let t = 0; t < triangles; t++) {
    const i = t * 9
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5]
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8]
    total +=
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(total) // mm³
}

/** Total surface area of the mesh, in mm². Used to estimate the printed shell. */
export function surfaceArea(geometry) {
  const { positions, triangles } = geometry
  let total = 0
  for (let t = 0; t < triangles; t++) {
    const i = t * 9
    const ux = positions[i + 3] - positions[i]
    const uy = positions[i + 4] - positions[i + 1]
    const uz = positions[i + 5] - positions[i + 2]
    const vx = positions[i + 6] - positions[i]
    const vy = positions[i + 7] - positions[i + 1]
    const vz = positions[i + 8] - positions[i + 2]
    // Half the magnitude of the cross product.
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  return total
}

// A slicer fills the outside of a part solid and the inside at the infill
// density, so a printed part weighs far less than its volume suggests — but
// only once it's big enough to have an inside at all.
//
// Eroding the solid by the shell thickness removes roughly `surface area ×
// thickness`, which is a good enough stand-in for what the slicer does without
// reimplementing one. Small or thin-walled parts come out all shell, which is
// exactly right: a 2 mm funnel wall has no interior to skimp on.
const SHELL_MM = 0.9 // ~2 perimeters plus top and bottom layers
const DENSITY_G_PER_CM3 = 1.24 // PLA; PETG is 1.27, close enough to share

export function estimateWeight(geometry, infillFraction) {
  const volume = estimateVolume(geometry)
  const shell = Math.min(surfaceArea(geometry) * SHELL_MM, volume)
  const interior = Math.max(0, volume - shell)
  const printed = shell + interior * infillFraction
  return {
    solidVolume: volume / 1000, // cm³
    printedVolume: printed / 1000, // cm³
    grams: (printed / 1000) * DENSITY_G_PER_CM3,
  }
}
