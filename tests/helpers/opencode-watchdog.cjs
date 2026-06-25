#!/usr/bin/env node
const targetPid = Number(process.argv[2])
if (!Number.isInteger(targetPid) || targetPid <= 0) {
  process.stderr.write(`opencode-watchdog: invalid targetPid: ${process.argv[2]}\n`)
  process.exit(2)
}

const recordedParent = process.ppid

const tick = setInterval(() => {
  if (process.ppid !== recordedParent) {
    try { process.kill(targetPid, "SIGKILL") } catch { /* already dead */ }
    clearInterval(tick)
    process.exit(0)
    return
  }
  let targetAlive = true
  try { process.kill(targetPid, 0) } catch { targetAlive = false }
  if (!targetAlive) {
    clearInterval(tick)
    process.exit(0)
  }
}, 250)