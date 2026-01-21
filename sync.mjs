import { MotifLogger } from './motif_logger.mjs'
import { Classifier } from './classifier.mjs'
import { BIASED } from './formats.mjs'

const RECIP_LIMIT = 0.9

export class Sync {
  constructor(agentAId, agentBId, allEvents = [], options = {}) {
    this.agentAId = agentAId
    this.agentBId = agentBId
    this.allEvents = allEvents
    const classifierConfig = options.classifier || {}
    const biasConfig = options.bias || null
    this.pairLogger = new MotifLogger(classifierConfig, biasConfig)
    this.classifier = new Classifier(classifierConfig.tolerance, classifierConfig.angleTolerance)
    this.history = []
    this._initializePairLogger()
  }

  _initializePairLogger() {
    const pairEvents = this.allEvents.filter(event => (event.sender === this.agentAId && event.receiver === this.agentBId) ||
      (event.sender === this.agentBId && event.receiver === this.agentAId)
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    this.pairLogger.logs = pairEvents
    return pairEvents
  }

  _calculateDirectionalMetrics() {
    const events = this.pairLogger.logs
    const aToB = events.filter(e => e.sender === this.agentAId && e.receiver === this.agentBId)
    const bToA = events.filter(e => e.sender === this.agentBId && e.receiver === this.agentAId)
    const aToBEngagement = aToB.length > 0 ? aToB.reduce((sum, e) => sum + e.engagement, 0) / aToB.length : 0
    const bToAEngagement = bToA.length > 0 ? bToA.reduce((sum, e) => sum + e.engagement, 0) / bToA.length : 0
    return {
      engagementSymmetry: 1 - Math.abs(aToBEngagement - bToAEngagement),
      directionalBalance: (aToB.length + bToA.length) > 0 ? Math.min(aToB.length, bToA.length) / Math.max(aToB.length, bToA.length) : 0
    }
  }

  _calculateJointManifold() {
    const basicGeometry = this.pairLogger.generateVectorsFromHistory()
    if (!basicGeometry) return null
    const { a, b, c, d, ...rest } = basicGeometry
    const directional = this._calculateDirectionalMetrics()
    const reciprocity = directional.directionalBalance
    const symmetryBoost = reciprocity > RECIP_LIMIT ? 1.0 : (0.4 + reciprocity * 0.6)
    const enhancedA = a.map(val => val * symmetryBoost)
    const enhancedB = b.map(val => val * symmetryBoost)
    return { a: enhancedA, b: enhancedB, c, d, directionalMetrics: directional, ...rest }
  }

  analyze() {
    const geometry = this._calculateJointManifold()
    if (!geometry) {
      return { 
        agents: [this.agentAId, this.agentBId],
        syncState: "INSUFFICIENT_DATA", 
        synchronizationScore: 0,
        geoType: "NONE", 
        geoId: 0,
        subjectiveTime: null 
      }
    }
    const classification = this.classifier.analyzeVectors(geometry.a, geometry.b, geometry.c, geometry.d)
    const syncScore = this._calculateSynchronizationScore(classification, geometry)  
    let phase = "DECOHERENT"
    if (syncScore >= 0.8) phase = "ENTANGLED"
    else if (syncScore >= 0.6) phase = "ALIGNED"
    else if (syncScore >= 0.4) phase = "COHERENT"
    const magA = this.pairLogger.magnitude(geometry.a) || 1.0
    const magB = this.pairLogger.magnitude(geometry.b) || 1.0
    const symmetryMultiplier = classification.categoryId / 23
    const rMag = (magA * magB) * (0.5 + symmetryMultiplier)
    const structuralWeight = (classification.symmetryScore || 0)
    const syncWeight = this._calculateSynchronizationScore(classification, geometry)
    const combinedDilationWeight = (structuralWeight * 0.4) + (syncWeight * 0.6)
    const denominator = 1 + (Math.log(Math.max(1, rMag) + 1) * combinedDilationWeight)
    const timeEffect = 1 / denominator
    return {
      agents: [this.agentAId, this.agentBId],
      syncState: phase,
      syncPercent: (syncScore * 100).toFixed(1) + "%",
      synchronizationScore: syncScore,
      geoType: classification.category,
      geoId: classification.categoryId,
      subjectiveTime: {
        timeEffect,
        perceivedHour: 60 * timeEffect,
        description: `1 hour feels like ${(60 * timeEffect).toFixed(0)} minutes`
      },
      proofOfWork: this._generateProofOfWork(geometry, classification)
    }
  }

  _calculateSynchronizationScore(classification, geometry) {
    const structuralScore = (classification.symmetryScore || 0) * 0.45
    const reciprocityScore = (geometry.directionalMetrics.directionalBalance || 0) * 0.25
    const highResCount = this.allEvents.filter(e => BIASED.includes(e.type) || (e.reactions && e.reactions.length > 0)).length
    const resDensity = (highResCount / this.allEvents.length) * 0.25
    return Math.max(0, Math.min(1, structuralScore + reciprocityScore + resDensity))
  }

  _generateProofOfWork(geometry, classification) {
    const components = [this.agentAId, this.agentBId, classification.categoryId, geometry.angleDeg].join(':')
    let hash = 0
    for (let i = 0; i < components.length; i++) {
      hash = ((hash << 5) - hash) + components.charCodeAt(i)
      hash = hash & hash
    } 
    return `sync_${Math.abs(hash).toString(16).slice(0, 12)}`
  }
}