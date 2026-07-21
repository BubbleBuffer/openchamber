export type LivenessCallbacks = {
  onDataStall?: (info: { duration: number }) => void
  onDataResumed?: (info: { lastEventId?: string }) => void
  onSocketTimeout?: () => void
}

export type LivenessMonitor = {
  markDataEvent: () => void
  markSocketActivity: () => void
  handleStallSignal: (info: { duration: number }) => void
  handleResumedSignal: (info?: { lastEventId?: string }) => void
  resetDataTimer: () => void
  resetSocketTimer: () => void
  getDataSilenceElapsed: () => number
  destroy: () => void
  isDataFlowing: () => boolean
  isSocketAlive: () => boolean
}

export function createLivenessMonitor(options: {
  dataSilenceMs?: number
  socketTimeoutMs?: number
  onDataStall?: (info: { duration: number }) => void
  onDataResumed?: (info: { lastEventId?: string }) => void
  onSocketTimeout?: () => void
}): LivenessMonitor {
  const {
    dataSilenceMs = 15_000,
    socketTimeoutMs = 30_000,
    onDataStall = () => {},
    onDataResumed = () => {},
    onSocketTimeout = () => {},
  } = options

  let lastDataEventAt = Date.now()
  let lastSocketActivityAt = Date.now()
  let dataTimer: ReturnType<typeof setTimeout> | undefined
  let socketTimer: ReturnType<typeof setTimeout> | undefined
  let stalled = false
  let hasReceivedData = false
  let destroyed = false

  const clearTimers = () => {
    if (dataTimer) clearTimeout(dataTimer)
    if (socketTimer) clearTimeout(socketTimer)
    dataTimer = undefined
    socketTimer = undefined
  }

  const scheduleDataCheck = () => {
    if (dataTimer) clearTimeout(dataTimer)
    dataTimer = setTimeout(() => {
      if (destroyed) return
      const elapsed = Date.now() - lastDataEventAt
      if (elapsed >= dataSilenceMs && !stalled) {
        stalled = true
        onDataStall({ duration: elapsed })
      }
    }, dataSilenceMs + 10)
  }

  const scheduleSocketCheck = () => {
    if (socketTimer) clearTimeout(socketTimer)
    socketTimer = setTimeout(() => {
      if (destroyed) return
      const elapsed = Date.now() - lastSocketActivityAt
      if (elapsed >= socketTimeoutMs) {
        onSocketTimeout()
      }
    }, socketTimeoutMs + 10)
  }

  scheduleDataCheck()
  scheduleSocketCheck()

  const markDataEvent = () => {
    hasReceivedData = true
    const wasStalled = stalled
    stalled = false
    lastDataEventAt = Date.now()
    if (wasStalled) {
      onDataResumed({})
    }
    scheduleDataCheck()
  }

  const markSocketActivity = () => {
    lastSocketActivityAt = Date.now()
    scheduleSocketCheck()
  }

  const handleStallSignal = (_info: { duration: number }) => {
    if (!stalled) {
      stalled = true
      onDataStall(_info)
    }
  }

  const handleResumedSignal = (info?: { lastEventId?: string }) => {
    stalled = false
    lastDataEventAt = Date.now()
    scheduleDataCheck()
    onDataResumed(info ?? {})
  }

  const resetDataTimer = () => {
    lastDataEventAt = Date.now()
    if (stalled) {
      stalled = false
      onDataResumed({})
    }
    scheduleDataCheck()
  }

  const resetSocketTimer = () => {
    lastSocketActivityAt = Date.now()
    scheduleSocketCheck()
  }

  const getDataSilenceElapsed = () => Date.now() - lastDataEventAt

  const destroy = () => {
    destroyed = true
    clearTimers()
  }

  const isDataFlowing = () => hasReceivedData && !stalled
  const isSocketAlive = () => Date.now() - lastSocketActivityAt < socketTimeoutMs

  return {
    markDataEvent,
    markSocketActivity,
    handleStallSignal,
    handleResumedSignal,
    resetDataTimer,
    resetSocketTimer,
    getDataSilenceElapsed,
    destroy,
    isDataFlowing,
    isSocketAlive,
  }
}
