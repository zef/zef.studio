// Arranging separately-rendered parts on one plate.
//
// A multi-part model builds one piece per render, each at the origin and
// turned the way it prints — so drawn as they arrive they would sit inside one
// another. This lays them out in a row, in the order the model declares them,
// and welds them into the single buffer the viewer draws.
//
// The row grows to the right from a fixed left edge rather than being centred,
// so a part appearing mid-batch doesn't shove the ones already on screen
// sideways. Parts already sit on the plate, so nothing here touches Z.

/** Space between parts, as a fraction of the widest one on the plate. */
const GAP_FRACTION = 0.18
const MIN_GAP_MM = 2

/**
 * @param {{part: string, geometry: object}[]} pieces in declaration order
 * @returns {{part: string, geometry: object, offset: number[]}[]}
 */
export function layoutParts(pieces) {
  // One part is the common case and wants to stay exactly where it rendered:
  // moving it would mean copying its whole vertex buffer to no visible end.
  if (pieces.length <= 1) return pieces.map((piece) => ({ ...piece, offset: [0, 0, 0] }))

  const gap = Math.max(Math.max(...pieces.map((p) => p.geometry.bounds.size[0])) * GAP_FRACTION, MIN_GAP_MM)
  let x = 0
  return pieces.map((piece) => {
    const { min, max, size } = piece.geometry.bounds
    const offset = [x - min[0], -(min[1] + max[1]) / 2, 0]
    x += size[0] + gap
    return { ...piece, offset }
  })
}

/**
 * Welds laid-out pieces into one geometry.
 *
 * Translation only, so every facet normal carries over untouched.
 */
export function mergeGeometries(placed) {
  if (!placed.length) return null
  if (placed.length === 1 && placed[0].offset.every((value) => value === 0)) {
    return placed[0].geometry
  }

  const triangles = placed.reduce((sum, piece) => sum + piece.geometry.triangles, 0)
  const positions = new Float32Array(triangles * 9)
  const normals = new Float32Array(triangles * 9)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  let at = 0
  for (const { geometry, offset } of placed) {
    normals.set(geometry.normals, at)
    const source = geometry.positions
    for (let i = 0; i < source.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = source[i + axis] + offset[axis]
        positions[at + i + axis] = value
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }
    at += source.length
  }

  return {
    triangles,
    positions,
    normals,
    bounds: {
      min,
      max,
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    },
  }
}
