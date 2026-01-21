import { Network } from './network.mjs'
import { readFileSync } from 'fs'
import { Scoring } from './scoring.mjs'
import { FORMATS, BIASED } from './formats.mjs'

export function runDemo() {
  const RANGE = 60
  const MIN_INTERACTION = 15
  const FILES = [
    { name: 'LOW SYNC', path: './interactions.losync.json' },
    { name: 'HIGH SYNC', path: './interactions.hisync.json' },
    { name: 'TRIAD', path: './interactions.triosync.json' }
  ]
  const calculateConfig = (events, daysActive) => {
    const hasBonus = events.some(e => e.reactions?.length > 0 || BIASED.includes(e.type))
    const boost = hasBonus ? 0.6 : 0.0
    const baseTol = 1.1
    console.log(`[System] Mode Active (${daysActive.toFixed(1)} days).`)
    return {
      classifier: { tolerance: baseTol + boost, angleTolerance: 20.0 },
      bias: { time: { factor: 1.0 }, payload: { multipliers: FORMATS } }
    }
  }
  function printLn(s) { return s.repeat(50) }
  FILES.forEach(file => {
    console.log(`\n\n${printLn('=')}`) 
    console.log(`RUNNING TEST SUITE: ${file.name}`)
    console.log(`${printLn('=')}`)
    let rawData = []
    try {
      rawData = JSON.parse(readFileSync(file.path, 'utf8'))
    } catch (e) {
      console.error(`Skipping ${file.name}: File not found or invalid JSON.`)
      return
    }
    const processedEvents = Scoring.convertToNetworkEvents(rawData)
    if (processedEvents.length === 0) {
      console.log("No events found.")
      return
    }
    const startTime = new Date(processedEvents[0].timestamp)
    const endTime = new Date(processedEvents[processedEvents.length - 1].timestamp)
    const totalDays = (endTime - startTime) / (1000 * 60 * RANGE * 24)
    const DYNAMIC_CONFIG = calculateConfig(processedEvents, totalDays)
    const network = new Network(DYNAMIC_CONFIG)
    network.addEvents(processedEvents)
    const results = network.analyzeAllPairs()
    const metrics = network.getNetworkMetrics()
    console.log(`
NETWORK TOPOLOGY REPORT
${printLn('=')} 
Nodes:            ${metrics.totalAgents}
Edges (Pairs):    ${metrics.totalPairs}
Sync Rate:        ${(metrics.synchronizationRate * 100).toFixed(1)}%
Network Density:  ${(metrics.networkDensity * 100).toFixed(1)}%
Clusters:         ${metrics.clusterCount}
`)
    results.forEach(result => {
      const [agentAId, agentBId] = result.agents || ['Unknown', 'Unknown']
      if (result.syncState === 'INSUFFICIENT_DATA') {
        console.log(`
${printLn('-')}
CONNECTION: ${agentAId} ↔ ${agentBId}
${printLn('-')}
⚠️  STATUS: INSUFFICIENT DATA`)
        return
      }
      const compatibility = network.compareFingerprints(agentAId, agentBId)
      if (!compatibility) {
console.warn(`  ⚠️  WARNING: Could not calculate fingerprints for ${agentAId} ↔ ${agentBId}`)
        return
      }
      const agentA = network.agents.get(agentAId), agentB = network.agents.get(agentBId)
      const phenom = result.subjectiveTime || { timeEffect: 1.0, perceivedHour: 60, description: 'N/A' }
      console.log(`
${printLn('-')}
CONNECTION: ${agentAId} ↔ ${agentBId}
${printLn('-')}`)
      console.log(`PRE-SYNC STATUS:`)
      console.log(`  Sync Likelihood:  ${(compatibility.potentialSync * 100).toFixed(1)}%`)
      console.log(`  Balance:          ${(compatibility.balance * 100).toFixed(1)}%`)
      console.log(`  Status:           ${compatibility.isVerified ? 'VERIFIED' : 'UNVERIFIED'}`)
      console.log(`\nAGENT FINGERPRINTS:`)
      console.log(`  ${agentAId}: [Rx: ${agentA.getIndividualFingerprint().receptivity.toFixed(1)}° | Tx: ${agentA.getIndividualFingerprint().assertiveness.toFixed(1)}°]`)
      console.log(`  ${agentBId}: [Rx: ${agentB.getIndividualFingerprint().receptivity.toFixed(1)}° | Tx: ${agentB.getIndividualFingerprint().assertiveness.toFixed(1)}°]`)
      console.log(`\nANALYSIS:`)
      console.log(`  PHASE STATE:      [ ${result.syncState} ] (${result.syncPercent})`)
      console.log(`  PATTERN:          ${result.geoType} (ID: ${result.geoId})`)
      console.log(`  SYNC SCORE:       ${result.synchronizationScore.toFixed(3)}`)
      console.log(`\nSUBJECTIVE TIME:`)
      console.log(`  Time Effect:      ${phenom.timeEffect.toFixed(3)}x`)
      console.log(`  Subjective Hour:  60 minutes feels like ${phenom.perceivedHour.toFixed(0)} minutes`)
      console.log(`  Proof of Work:    ${result.proofOfWork}`)
      if (processedEvents.length < MIN_INTERACTION && result.geoId >= 17 && totalDays < RANGE) {
        console.log(` ⚠️  WARNING: Artifact detected (High Symmetry / Low Volume)`)
      }
    })
  })
}

runDemo()