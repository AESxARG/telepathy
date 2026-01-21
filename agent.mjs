import { MotifLogger } from './motif_logger.mjs'

export class Agent {
  constructor(id, name = null) {
    this.id = id
    this.name = name || `Agent_${id}`
    this.incomingLogger = new MotifLogger()
    this.outgoingLogger = new MotifLogger()
    this.interactions = new Set()
    this.lastUpdate = Date.now()
  }

  addInteraction(signal, direction = 'outgoing') {
    if (direction === 'incoming') {
      this.interactions.add(signal.sender)
      this.incomingLogger.logs.push(signal)
    } else {
      this.interactions.add(signal.receiver)
      this.outgoingLogger.logs.push(signal)
    }
    this.lastUpdate = Date.now()
  }

  getIndividualFingerprint() {
    const incoming = this.incomingLogger.generateVectorsFromHistory()
    const outgoing = this.outgoingLogger.generateVectorsFromHistory()
    let internalSymmetry = 0
    if (outgoing) {
      const analysis = this.outgoingLogger.classifier.analyzeVectors(outgoing.a, outgoing.b, outgoing.c, outgoing.d)
      internalSymmetry = analysis.symmetryScore
    }
    return {
      id: this.id,
      receptivity: incoming ? (incoming.angleDeg || 90) : 90,
      assertiveness: outgoing ? (outgoing.angleDeg || 90) : 90,
      capacity: outgoing ? (outgoing.valB || 1) : 1,
      reliability: internalSymmetry
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      interactionCount: this.incomingLogger.logs.length + this.outgoingLogger.logs.length,
      interactionPartners: Array.from(this.interactions),
      lastUpdate: new Date(this.lastUpdate).toISOString()
    }
  }
}