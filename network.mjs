import { Sync } from './sync.mjs'
import { Agent } from './agent.mjs'

export class Network {
  constructor(options = {}) {
    this.agents = new Map()
    this.pairs = new Map()
    this.events = []
    this.syncClusters = []
    this.analysisHistory = []
    this.options = options
  }

  _getPairKey(agentA, agentB) { return [agentA, agentB].sort().join(':') }

  registerAgent(agentId, name = null) {
    if (!agentId || agentId.trim() === '') {
      console.warn('Attempted to register agent with empty ID')
      return null
    }
    if (!this.agents.has(agentId)) this.agents.set(agentId, new Agent(agentId, name))
    return this.agents.get(agentId)
  }

  addEvent(event) {
    if (!event || typeof event !== 'object') {
      console.warn('Event is not an object:', event)
      return false
    }
    const { sender, receiver, timestamp } = event
    if (!sender || !receiver || !timestamp) {
      console.warn('Missing required fields:', { sender, receiver, timestamp })
      return false
    }
    if (sender === receiver) {
      console.warn('Sender and receiver are the same:', sender)
      return false
    }
    if (isNaN(new Date(timestamp).getTime())) {
      console.warn('Invalid timestamp:', timestamp)
      return false
    }
    this.events.push(event)
    const senderAgent = this.registerAgent(sender), receiverAgent = this.registerAgent(receiver)
    if (!senderAgent || !receiverAgent) {
      console.warn('Failed to register agents for event:', event)
      return false
    }
    const outgoingEvent = { ...event, direction: 'outgoing' }, incomingEvent = { ...event, direction: 'incoming' }
    senderAgent.addInteraction(outgoingEvent, 'outgoing')
    receiverAgent.addInteraction(incomingEvent, 'incoming')
    const pairKey = this._getPairKey(sender, receiver)
    if (this.pairs.has(pairKey)) {
      const pair = this.pairs.get(pairKey)
      pair.allEvents = this.events
      pair._initializePairLogger()
    }
    return true
  }

  addEvents(events) {
    let successCount = 0
    events.forEach(event => { if (this.addEvent(event)) successCount++ })
    console.log(`Added ${successCount}/${events.length} events successfully`)
    return successCount
  }

  compareFingerprints(agentAId, agentBId) {
    const agentA = this.agents.get(agentAId), agentB = this.agents.get(agentBId)
    if (!agentA || !agentB) return null
    const fpA = agentA.getIndividualFingerprint()
    const fpB = agentB.getIndividualFingerprint()
    const pairKey = this._getPairKey(agentAId, agentBId)
    const pair = this.pairs.get(pairKey)
    const actualSync = pair ? pair.analyze().synchronizationScore : 0
    const alignment = (fpA.reliability + fpB.reliability) / 2
    const potential = (fpA.capacity > 0 && fpB.capacity > 0) ? 1 - Math.abs(fpA.assertiveness - fpB.receptivity) / 180 : 0
    const finalScore = (potential * 0.4) + (alignment * 0.3) + (actualSync * 0.3)
    return {
      potentialSync: finalScore,
      actualizedSync: actualSync,
      balance: Math.min(fpA.capacity, fpB.capacity) / Math.max(fpA.capacity, fpB.capacity || 1),
      isVerified: actualSync > 0.6 && alignment > 0.5
    }
  }

  analyzePair(agentAId, agentBId) {
    const pairKey = this._getPairKey(agentAId, agentBId)
    if (!this.pairs.has(pairKey)) this.pairs.set(pairKey, new Sync(agentAId, agentBId, this.events, this.options))
    const pair = this.pairs.get(pairKey)
    const result = pair.analyze()
    this.analysisHistory.push({
      timestamp: new Date().toISOString(),
      type: 'pair_analysis',
      pairKey,
      result: { ...result, geometry: undefined }
    })
    return result
  }

  analyzeAllPairs() {
    const agentIds = Array.from(this.agents.keys())
    const results = []
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const result = this.analyzePair(agentIds[i], agentIds[j])
        results.push(result)
      }
    }
    this._updateSyncClusters(results);    
    return results
  }

  _updateSyncClusters(pairResults) {
    const synchronizedPairs = pairResults.filter(r => r.synchronized)
    const graph = new Map()
    synchronizedPairs.forEach(pair => {
      const [a, b] = pair.agents
      if (!graph.has(a)) graph.set(a, new Set())
      if (!graph.has(b)) graph.set(b, new Set())
      graph.get(a).add(b)
      graph.get(b).add(a)
    })
    const visited = new Set(), clusters = []
    for (const [agent] of graph.entries()) {
      if (!visited.has(agent)) {
        const cluster = this._dfsFindCluster(agent, graph, visited)
        if (cluster.size >= 2) {
          clusters.push({
            agents: Array.from(cluster),
            size: cluster.size,
            pairCount: this._countPairsInCluster(cluster),
            avgSyncScore: this._calculateClusterSyncScore(cluster, synchronizedPairs)
          })
        }
      }
    }
    clusters.sort((a, b) => b.avgSyncScore - a.avgSyncScore)
    this.syncClusters = clusters
  }

  _dfsFindCluster(start, graph, visited) {
    const stack = [start], cluster = new Set()
    while (stack.length > 0) {
      const agent = stack.pop()
      if (!visited.has(agent)) {
        visited.add(agent)
        cluster.add(agent)
        const neighbors = graph.get(agent) || new Set()
        for (const neighbor of neighbors) { if (!visited.has(neighbor)) stack.push(neighbor) }
      }
    }
    return cluster
  }

  _countPairsInCluster(cluster) {
    const agents = Array.from(cluster)
    let count = 0
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const pairKey = this._getPairKey(agents[i], agents[j])
        if (this.pairs.has(pairKey) && this.pairs.get(pairKey).history.length > 0) count++
      }
    }
    return count
  }

  _calculateClusterSyncScore(cluster, synchronizedPairs) {
    const agents = Array.from(cluster)
    let totalScore = 0, pairCount = 0
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const pairResult = synchronizedPairs.find(p => (p.agents[0] === agents[i] && p.agents[1] === agents[j]) || (p.agents[0] === agents[j] && p.agents[1] === agents[i]))
        if (pairResult) {
          totalScore += pairResult.synchronizationScore
          pairCount++
        }
      }
    } 
    return pairCount > 0 ? totalScore / pairCount : 0
  }

  findMotifs() {
    const geoGroups = new Map()
    for (const pair of this.pairs.values()) {
      if (pair.history.length > 0) {
        const lastResult = pair.analyze(), geoType = lastResult.geoType
        if (!geoGroups.has(geoType)) geoGroups.set(geoType, [])
        geoGroups.get(geoType).push({
          agents: lastResult.agents,
          syncScore: lastResult.synchronizationScore,
          proofOfWork: lastResult.proofOfWork
        })
      }
    }
    return Array.from(geoGroups.entries())
      .map(([geoType, pairs]) => ({ geoType, pairCount: pairs.length, pairs: pairs.sort((a, b) => b.syncScore - a.syncScore) }))
      .sort((a, b) => b.pairCount - a.pairCount)
  }

  getNetworkMetrics() {
    const totalEvents = this.events.length
    const totalAgents = this.agents.size
    const totalPairs = this.pairs.size
    const synchronizedPairs = Array.from(this.pairs.values()).filter(pair => pair.history.length > 0).map(pair => pair.analyze()).filter(result => result.synchronized)
    const syncRate = totalPairs > 0 ? synchronizedPairs.length / totalPairs : 0
    const possiblePairs = (totalAgents * (totalAgents - 1)) / 2
    const pairDensity = possiblePairs > 0 ? totalPairs / possiblePairs : 0
    const avgSyncScore = synchronizedPairs.length > 0 ? synchronizedPairs.reduce((sum, p) => sum + p.synchronizationScore, 0) / synchronizedPairs.length : 0
    return {
      totalEvents,
      totalAgents,
      totalPairs,
      synchronizedPairs: synchronizedPairs.length,
      synchronizationRate: syncRate,
      networkDensity: pairDensity,
      averageSyncScore: avgSyncScore,
      clusterCount: this.syncClusters.length,
      largestCluster: this.syncClusters.length > 0 ? Math.max(...this.syncClusters.map(c => c.size)) : 0
    }
  }

  toJSON() {
    return {
      networkMetrics: this.getNetworkMetrics(),
      agents: Array.from(this.agents.values()).map(a => a.toJSON()),
      clusters: this.syncClusters,
      analysisHistory: this.analysisHistory.slice(-20),
      totalEvents: this.events.length
    }
  }
}