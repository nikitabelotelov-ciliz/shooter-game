export type Side = 'right'

export interface Position {
  row: number
  col: number
}

export interface Chicken {
  id: string
  side: Side
  line: number
  seat: number
  nextEggMs: number
  extraTimer: number
}

export interface Egg {
  id: string
  side: Side
  line: number
  progress: number
  travelDistance: number
  startPosition: number
}

export interface GameState {
  chickens: Chicken[]
  eggs: Egg[]
  wolfPosition: Position
  wolfTarget: Position
  caughtEggs: number
  droppedEggs: number
  elapsedMs: number
  gameOver: boolean
}

const LINES_PER_SIDE = 4
const SEATS_PER_LINE = 3
const MIN_INITIAL_CHICKENS = 2
const MAX_INITIAL_CHICKENS = 3
const EGG_SPEED_UNITS_PER_SECOND = 0.1
const EGG_COOLDOWN_RANGE_MS: [number, number] = [10000, 20000]
const INITIAL_EGG_SPAWN_MS = 3000
const CHICKEN_SPAWN_RANGE_MS: [number, number] = [5000, 10000]
const EXTRA_TIMER_MS = 10000
const MAX_DROPPED_EGGS = 3
const WOLF_STEP_MS = 240
const DROP_POSITION: Record<Side, number> = { right: 0 }
const SEAT_TRAVEL_RATIOS: readonly number[] = [1, 0.90, 0.8]
const WOLF_START_ROW = Math.floor((LINES_PER_SIDE - 1) / 2)
const WOLF_COL = 0

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min
const randomDelay = (range: [number, number]) => randomBetween(range[0], range[1])

const normalizedSeatIndex = (seat: number) => SEATS_PER_LINE - 1 - seat

const travelDistanceForSeat = (seat: number) => {
  const indexFromDrop = normalizedSeatIndex(seat)
  const boundedIndex = Math.min(SEAT_TRAVEL_RATIOS.length - 1, Math.max(0, indexFromDrop))
  return SEAT_TRAVEL_RATIOS[boundedIndex]
}

const spawnPositionForSeat = (side: Side, seat: number) => {
  const dropPosition = DROP_POSITION[side]
  const distance = travelDistanceForSeat(seat)
  return dropPosition === 1 ? 1 - distance : distance
}

const catchPositionForLine = (_side: Side, line: number): Position => ({
  row: line,
  col: WOLF_COL,
})

interface SeatPosition {
  side: Side
  line: number
  seat: number
}

export class GameModel {
  private chickens: Chicken[] = []

  private eggs: Egg[] = []

  private wolfPosition: Position = { row: WOLF_START_ROW, col: WOLF_COL }

  private wolfTarget: Position = { row: WOLF_START_ROW, col: WOLF_COL }

  private caughtEggs = 0

  private droppedEggs = 0

  private gameOver = false

  private startTime = performance.now()

  private elapsedMs = 0

  private lastUpdate = performance.now()

  private nextChickenSpawnMs = randomDelay(CHICKEN_SPAWN_RANGE_MS)

  private wolfMoveAccumulator = 0

  constructor() {
    this.seedInitialChickens()
  }

  reset() {
    this.chickens = []
    this.eggs = []
    this.wolfPosition = { row: WOLF_START_ROW, col: WOLF_COL }
    this.wolfTarget = { row: WOLF_START_ROW, col: WOLF_COL }
    this.caughtEggs = 0
    this.droppedEggs = 0
    this.gameOver = false
    this.wolfMoveAccumulator = 0
    this.nextChickenSpawnMs = randomDelay(CHICKEN_SPAWN_RANGE_MS)
    this.startTime = performance.now()
    this.elapsedMs = 0
    this.seedInitialChickens()
    this.lastUpdate = this.startTime
  }

  removeChicken(id: string) {
    this.chickens = this.chickens.filter((chicken) => chicken.id !== id)
  }

  removeEgg(id: string) {
    this.eggs = this.eggs.filter((egg) => egg.id !== id)
  }

  update(now: number = performance.now()): GameState {
    const delta = Math.max(0, Math.min(1000, now - this.lastUpdate))
    this.lastUpdate = now
    
    if (!this.gameOver) {
      this.elapsedMs = Math.max(0, now - this.startTime)
      this.updateChickenSpawns(delta)
      this.updateChickenEggs(delta)
      this.updateEggs(delta)
      this.updateWolf(delta)
    }

    return this.getState()
  }

  getState(): GameState {
    return {
      chickens: this.chickens.map((chicken) => ({ ...chicken })),
      eggs: this.eggs.map((egg) => ({ ...egg })),
      wolfPosition: { ...this.wolfPosition },
      wolfTarget: { ...this.wolfTarget },
      caughtEggs: this.caughtEggs,
      droppedEggs: this.droppedEggs,
      elapsedMs: this.elapsedMs,
      gameOver: this.gameOver,
    }
  }

  private seedInitialChickens() {
    const totalToSpawn = Math.floor(randomBetween(MIN_INITIAL_CHICKENS, MAX_INITIAL_CHICKENS + 1))
    for (let i = 0; i < totalToSpawn; i += 1) {
      this.spawnRandomChicken()
    }
    
    // Reduce all initial chickens' timers so the first egg spawns at INITIAL_EGG_SPAWN_MS
    if (this.chickens.length > 0) {
      const minTimer = Math.min(...this.chickens.map((chicken) => chicken.nextEggMs))
      const reduction = minTimer - INITIAL_EGG_SPAWN_MS
      if (reduction > 0) {
        this.chickens.forEach((chicken) => {
          chicken.nextEggMs -= reduction
        })
      }
    }
  }

  private spawnRandomChicken() {
    const seat = this.pickRandomFreeSeat()
    if (!seat) return

    this.chickens.push({
      id: `${seat.side}-${seat.line}-${seat.seat}-${Date.now()}-${Math.random().toFixed(4)}`,
      side: seat.side,
      line: seat.line,
      seat: seat.seat,
      nextEggMs: randomDelay(EGG_COOLDOWN_RANGE_MS),
      extraTimer: 0,
    })
  }

  private pickRandomFreeSeat(): SeatPosition | undefined {
    const occupied = new Set<string>(this.chickens.map((chicken) => `${chicken.side}-${chicken.line}-${chicken.seat}`))
    const openSeats: SeatPosition[] = []

    ;(['right'] as Side[]).forEach((side) => {
      for (let line = 0; line < LINES_PER_SIDE; line += 1) {
        for (let seat = 0; seat < SEATS_PER_LINE; seat += 1) {
          const key = `${side}-${line}-${seat}`
          if (!occupied.has(key)) {
            openSeats.push({ side, line, seat })
          }
        }
      }
    })

    if (!openSeats.length) return undefined
    const index = Math.floor(Math.random() * openSeats.length)
    return openSeats[index]
  }

  private updateChickenSpawns(delta: number) {
    this.nextChickenSpawnMs -= delta
    if (this.nextChickenSpawnMs > 0) return

    this.spawnRandomChicken()
    this.nextChickenSpawnMs = randomDelay(CHICKEN_SPAWN_RANGE_MS)
  }

  private updateChickenEggs(delta: number) {
    this.chickens.forEach((chicken) => {
      chicken.extraTimer = Math.max(0, chicken.extraTimer - delta)
      chicken.nextEggMs -= delta
      if (chicken.nextEggMs > 0) return

      this.spawnEgg(chicken)
      chicken.nextEggMs = randomDelay(EGG_COOLDOWN_RANGE_MS)
    })
  }

  shootChicken(chickenId: string) {
    const chicken = this.chickens.find((item) => item.id === chickenId)
    if (!chicken) return

    this.spawnEgg(chicken)
    chicken.extraTimer = EXTRA_TIMER_MS
  }

  private spawnEgg(chicken: Chicken) {
    const travelDistance = travelDistanceForSeat(chicken.seat)
    const startPosition = spawnPositionForSeat(chicken.side, chicken.seat)
    this.eggs.push({
      id: `${chicken.id}-egg-${Date.now()}-${Math.random().toFixed(4)}`,
      side: chicken.side,
      line: chicken.line,
      progress: 0,
      travelDistance,
      startPosition,
    })
  }

  private updateEggs(delta: number) {
    const survivors: Egg[] = []
    this.eggs.forEach((egg) => {
      const progress = egg.progress + (delta / 1000) * EGG_SPEED_UNITS_PER_SECOND
      if (progress >= egg.travelDistance) {
        this.handleEggDrop(egg)
      } else {
        survivors.push({ ...egg, progress })
      }
    })
    this.eggs = survivors
  }

  private handleEggDrop(egg: Egg) {
    const catchPos = catchPositionForLine(egg.side, egg.line)
    const wolfCatching =
      this.wolfPosition.row === catchPos.row && this.wolfPosition.col === catchPos.col

    if (wolfCatching) {
      this.caughtEggs += 1
    } else {
      this.droppedEggs += 1
      if (this.droppedEggs >= MAX_DROPPED_EGGS) {
        this.gameOver = true
      }
    }
  }

  private updateWolf(delta: number) {
    if (!this.eggs.length) {
      this.wolfTarget = { row: WOLF_START_ROW, col: WOLF_COL }
    } else {
      let bestEgg = this.eggs[0]
      let bestTimeLeft = this.timeToDrop(bestEgg)

      this.eggs.forEach((egg) => {
        const timeLeft = this.timeToDrop(egg)
        if (timeLeft < bestTimeLeft) {
          bestTimeLeft = timeLeft
          bestEgg = egg
        }
      })

      this.wolfTarget = catchPositionForLine(bestEgg.side, bestEgg.line)
    }

    this.wolfMoveAccumulator += delta
    while (this.wolfMoveAccumulator >= WOLF_STEP_MS) {
      this.wolfMoveAccumulator -= WOLF_STEP_MS
      this.stepWolf()
    }
  }

  private timeToDrop(egg: Egg) {
    const remainingDistance = Math.max(0, egg.travelDistance - egg.progress)
    return remainingDistance / EGG_SPEED_UNITS_PER_SECOND
  }

  private stepWolf() {
    if (this.wolfPosition.row === this.wolfTarget.row && this.wolfPosition.col === this.wolfTarget.col) {
      return
    }

    const next: Position = { ...this.wolfPosition }
    if (next.row !== this.wolfTarget.row) {
      next.row += next.row < this.wolfTarget.row ? 1 : -1
    } else if (next.col !== this.wolfTarget.col) {
      next.col += next.col < this.wolfTarget.col ? 1 : -1
    }

    this.wolfPosition = next
  }
}

export { LINES_PER_SIDE, SEATS_PER_LINE, EXTRA_TIMER_MS, catchPositionForLine }
