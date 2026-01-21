import { BIASED } from './formats.mjs'

export class Scoring {
  static measureAttn(event, previousEvent = null) {
    let score = 0
    const currentT = new Date(event.timestamp).getTime()
    if (event.reactions?.length) score += 0.25
    if (BIASED.includes(event.type)) score += 0.3 
    if (previousEvent) {
      const prevT = new Date(previousEvent.timestamp).getTime()
      const hours = (currentT - prevT) / 3600000
      if (hours < 0.25) {
        score += 0.15
      } else if (hours < 2) {
        score += 0.1
      }
      if (hours > 72) score -= 0.15
    }
    return Math.max(0.1, Math.min(1.0, score))
  }

  static convertToNetworkEvents(jsonEvents) {
    return jsonEvents.map((event, index) => {
      const prev = index > 0 ? jsonEvents[index - 1] : null
      const receiver = event.receiver || (event.sender === 'AgentA' ? 'AgentB' : 'AgentA')
      const score = this.measureAttn(event, prev)
      return { ...event, receiver, attention: score, engagement: score }
    })
}
}