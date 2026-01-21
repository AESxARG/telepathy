import { Classifier } from './classifier.mjs'
import { FORMATS, BIASED } from './formats.mjs'

const DAYS = 60
export class MotifLogger {
  constructor(config = {}, biasConfig = null) {
    this.logs = []
    this.biasConfig = biasConfig || { time: { factor: 1.0 }, payload: { multipliers: FORMATS } }
    this.classifier = new Classifier(config.tolerance || 1.1, config.angleTolerance || 20.0)
  }

  magnitude(v) { return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) }

  _groupSessions() {
    if (this.logs.length === 0) return []
    const sessions = []
    let current = null
    this.logs.forEach(log => {
      const logTime = new Date(log.timestamp)
      if (!current || (logTime - current.end) / (1000 * 60 * DAYS * 2) > 1) { 
        if (current) sessions.push(current)
        current = { start: logTime, end: logTime, types: new Set(), logs: [] }
      }
      current.end = logTime
      current.types.add((log.type || 'DEFAULT').toUpperCase())
      current.logs.push(log)
    })
    if (current) sessions.push(current)
    return sessions
  }

  _quantize(value, type, session = null) {
    if (type === 'time') return Math.min(5, Math.ceil(Math.log2(value + 1)) || 1)
    if (type === 'payload' && session) {
      const typeWeight = Array.from(session.types).reduce((max, t) => Math.max(max, this.biasConfig.payload.multipliers[t] || 1), 0)
      const reactionBonus = session.logs.some(l => l.reactions?.length > 0) ? 1 : 0
      return Math.min(5, Math.ceil(typeWeight + reactionBonus))
    }
    return 1
  }

  generateVectorsFromHistory() {
    const sessions = this._groupSessions()
    if (sessions.length < 2) return null
    const latest = sessions[sessions.length - 1]
    const totalSpan = (latest.end - sessions[0].start) / (1000 * 60 * DAYS * 24)
    let valA = this._quantize(totalSpan, 'time')
    let valB = this._quantize(null, 'payload', latest) || 1
    const highResCount = sessions.filter(s => [...s.types].some(t => BIASED.includes(t))).length
    const coRatio = highResCount / sessions.length
    let angleDeg = 90
    if (coRatio > 0) {
      angleDeg = 90 + (30 * coRatio)
    } else if (totalSpan > 30) {
      const driftFactor = Math.min(1, (totalSpan - 30) / 335)
      angleDeg = 90 - (15 * driftFactor)
    }
    const angleRad = (angleDeg * Math.PI / 180)
    const a = [valA, 0, 0, 0]; 
    const b = [valB * Math.cos(angleRad), valB * Math.sin(angleRad), 0, 0]
    const c = [0, 0, valB, 0]; 
    const d = [0, 0, 0, valB]
    return { a, b, c, d, totalSpan, angleDeg }
  }
}