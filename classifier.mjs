export class Classifier {
  constructor(tolerance = 0.2, angleTolerance = 15.0) {
    this.tolerance = tolerance
    this.angleTolerance = angleTolerance
    this.history = []
    this.definitions = this._initializeDefinitions()
    this.categories = this.definitions
    this.deviation = angleTolerance * 0.01
  }

  addToHistory(event) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
    this.history.push(`[${timestamp}] ${event}`)
  }

  magnitude(v) { return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) }
  dotProduct(v1, v2) { return v1.reduce((sum, x, i) => sum + x * v2[i], 0) }

  angleBetween(v1, v2) {
    const mag1 = this.magnitude(v1)
    const mag2 = this.magnitude(v2)
    const dot = this.dotProduct(v1, v2)
    if (mag1 === 0 || mag2 === 0) return 90
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)))
    return Math.acos(cosTheta) * (180 / Math.PI)
  }

  analyzeVectors(a, b, c, d, customTol = null, customAngTol = null) {
    const activeTol = customTol ?? this.tolerance
    const activeAngTol = customAngTol ?? this.angleTolerance
    const lengths = { a: this.magnitude(a), b: this.magnitude(b), c: this.magnitude(c), d: this.magnitude(d) }
    const angles = {
      α: this.angleBetween(b, c), β: this.angleBetween(a, c), γ: this.angleBetween(a, b),
      δ: this.angleBetween(a, d), ε: this.angleBetween(b, d), ζ: this.angleBetween(c, d)
    }
    const sym = this._createSymmetryMap(lengths, angles, activeTol, activeAngTol)
    let matched = this.definitions.find(def => def.check(lengths, angles, sym))
    const result = matched || { id: 0, name: "Unclassified configuration", genParams: null }
    const symmetryScore = this._calculateSymmetryScore(result, lengths, angles)
    return {
      category: result.name,
      categoryId: result.id,
      symmetryScore
    }
  }

  _calculateSymmetryScore(definition, lengths, angles) {
    if (!definition || definition.id === 0) return 0
    let score = definition.id / 23
    if (definition.genParams?.edges === "equal") {
      const edges = [lengths.a, lengths.b, lengths.c, lengths.d]
      const avgEdge = edges.reduce((a, b) => a + b) / 4
      const edgeVariance = edges.reduce((sum, e) => sum + Math.pow(e - avgEdge, 2), 0) / 4
      const edgeConsistency = 1 - Math.min(1, Math.sqrt(edgeVariance) / (avgEdge || 1))
      score += this.deviation * edgeConsistency
    } else {
      score += this.deviation
    }
    if (definition.genParams?.angles) {
      const ideals = definition.genParams.angles
      let totalDev = 0
      const targetAll = ideals.all || 90
      totalDev += Math.abs(angles.α - (ideals.α || targetAll))
      totalDev += Math.abs(angles.β - (ideals.β || targetAll))
      totalDev += Math.abs(angles.γ - (ideals.γ || targetAll))
      totalDev += Math.abs(angles.δ - (ideals.δ || targetAll))
      totalDev += Math.abs(angles.ε - (ideals.ε || targetAll))
      totalDev += Math.abs(angles.ζ - (ideals.ζ || targetAll))
      const avgDev = totalDev / 6
      const anglePrecision = Math.max(0, 1 - (avgDev / this.angleTolerance))
      score += this.deviation * anglePrecision
    }
    return Math.max(0, Math.min(1, score))
  }

  _createSymmetryMap(L, A, tol, angTol) {
    const eq = (v1, v2) => {
      if (v1 === 0 && v2 === 0) return true
      const diff = Math.abs(v1 - v2)
      const max = Math.max(v1, v2)
      return (diff / max) < (tol * this.angleTolerance * 0.01)
    }
    const ang = (a1, a2) => Math.abs(a1 - a2) < angTol
    const is90 = (val) => Math.abs(val - 90) < angTol
    const is120 = (val) => Math.abs(val - 120) < angTol 
    const allEdgesEq = eq(L.a, L.b) && eq(L.b, L.c) && eq(L.c, L.d)
    const abEq = eq(L.a, L.b)
    const all90 = is90(A.α) && is90(A.β) && is90(A.γ) && is90(A.δ) && is90(A.ε) && is90(A.ζ)
    return {
      allEdgesEq,
      abcEq: eq(L.a, L.b) && eq(L.b, L.c),
      abEq,
      all90,
      is90, is120,
      isEq: eq,
      isAngEq: ang
    }
  }

  _initializeDefinitions() {
    return [
      { 
        id: 23, name: "Hypercubic", 
        genParams: { edges: "equal", angles: { all: 90 } },
        check: (_, _A, S) => S.allEdgesEq && S.all90 
      },
      { 
        id: 20, name: "Hexagonal",
        genParams: { edges: "equal", angles: { γ: 120, all: 90 } },
        check: (_, A, S) => S.allEdgesEq && S.is120(A.γ)
      },
      {
        id: 17, name: "Trigonal",
        genParams: { edges: "unequal", angles: { γ: 120, all: 90 } },
        check: (_, A, S) => S.is120(A.γ)
      },
      {
        id: 15, name: "Tetragonal",
        genParams: { edges: "ab_equal", angles: { all: 90 } },
        check: (_, _A, S) => S.all90 && S.abEq
      },
      {
        id: 10, name: "Orthorhombic",
        genParams: { edges: "unequal", angles: { all: 90 } },
        check: (_, _A, S) => S.all90 
      },
      {
        id: 4, name: "Monoclinic",
        genParams: { edges: "unequal", angles: { γ: 75, all: 90 } },
        check: (_, A, S) => !S.all90 && !S.is90(A.α) && S.is90(A.β) && S.is90(A.γ) && S.is90(A.δ) && S.is90(A.ε) && S.is90(A.ζ)
      },
      {
        id: 3, name: "Diclinic",
        genParams: { edges: "unequal", angles: { γ: 75, ζ: 75, all: 90 } },
        check: (_, A, S) => !S.all90 && !S.is90(A.α) && !S.is90(A.ζ) 
      },
      {
        id: 1, name: "Triclinic",
        genParams: { edges: "unequal", angles: { all: "any" } },
        check: (_, _A, _S) => true 
      }
    ]
  }
}