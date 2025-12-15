import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Side = 'left' | 'right'

interface Chicken {
  id: string
  side: Side
  row: number
  slot: number
  cooldown: number
}

interface Egg {
  id: string
  side: Side
  row: number
  progress: number
  speed: number
}

interface Position {
  row: number
  col: number
}

const ROWS = 3
const CHICKENS_PER_ROW = 3
const TICK_MS = 180
const SHOOT_COOLDOWN_MS = 900
const CHICKEN_DISABLE_MS = 4500
const WOLF_STEP_MS = 240
const EGG_SPEED = 0.45
const MIN_SPAWN_MS = 10000
const MAX_SPAWN_MS = 20000

const nextSpawnDelay = () => MIN_SPAWN_MS + Math.random() * (MAX_SPAWN_MS - MIN_SPAWN_MS)

const initialChickens = (): Chicken[] => {
  const list: Chicken[] = []
  ;(['left', 'right'] as Side[]).forEach((side) => {
    for (let row = 0; row < ROWS; row += 1) {
      for (let slot = 0; slot < CHICKENS_PER_ROW; slot += 1) {
        list.push({
          id: `${side}-${row}-${slot}`,
          side,
          row,
          slot,
          cooldown: 0,
        })
      }
    }
  })
  return list
}

const catchPositionForLine = (side: Side, row: number): Position => ({
  row,
  col: side === 'left' ? 0 : 2,
})

function App() {
  const [chickens, setChickens] = useState<Chicken[]>(() => initialChickens())
  const [eggs, setEggs] = useState<Egg[]>([])
  const [wolfPosition, setWolfPosition] = useState<Position>({ row: 1, col: 1 })
  const [wolfTarget, setWolfTarget] = useState<Position>({ row: 1, col: 1 })
  const [caughtEggs, setCaughtEggs] = useState(0)
  const [droppedEggs, setDroppedEggs] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [reloadUntil, setReloadUntil] = useState<number>(0)
  const [nextEggSpawnAt, setNextEggSpawnAt] = useState(() => performance.now() + nextSpawnDelay())

  useEffect(() => {
    const timer = setInterval(() => {
      setChickens((prev) =>
        prev.map((chicken) => ({
          ...chicken,
          cooldown: Math.max(0, chicken.cooldown - TICK_MS),
        })),
      )

      setEggs((prev) => {
        const updated = prev.map((egg) => ({
          ...egg,
          progress: egg.progress + egg.speed * (TICK_MS / 1000),
        }))

        const survivors: Egg[] = []
        updated.forEach((egg) => {
          if (egg.progress >= 1) {
            const guard = catchPositionForLine(egg.side, egg.row)
            const wolfCatching = wolfPosition.row === guard.row && wolfPosition.col === guard.col

            if (wolfCatching) {
              setCaughtEggs((count) => count + 1)
            } else {
              setDroppedEggs((count) => count + 1)
            }
          } else {
            survivors.push(egg)
          }
        })

        let spawnEgg: Egg | null = null

        if (!gameOver && performance.now() >= nextEggSpawnAt) {
          const available = chickens.filter((chicken) => chicken.cooldown <= 0)
          if (available.length) {
            const chicken = available[Math.floor(Math.random() * available.length)]
            const startProgress = (chicken.slot + 1) / (CHICKENS_PER_ROW + 1)
            spawnEgg = {
              id: `${chicken.id}-${Date.now()}-${Math.random().toFixed(4)}`,
              side: chicken.side,
              row: chicken.row,
              progress: startProgress,
              speed: EGG_SPEED,
            }
          }
          setNextEggSpawnAt(performance.now() + nextSpawnDelay())
        }

        return spawnEgg ? [...survivors, spawnEgg] : survivors
      })
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [chickens, wolfPosition, gameOver, nextEggSpawnAt])

  useEffect(() => {
    if (droppedEggs >= 3) {
      setGameOver(true)
    }
  }, [droppedEggs])

  useEffect(() => {
    if (gameOver) return
    if (!eggs.length) {
      setWolfTarget({ row: 1, col: 1 })
      return
    }

    let bestEgg = eggs[0]
    let bestTime = (1 - eggs[0].progress) / eggs[0].speed

    eggs.forEach((egg) => {
      const timeLeft = (1 - egg.progress) / egg.speed
      if (timeLeft < bestTime) {
        bestTime = timeLeft
        bestEgg = egg
      }
    })

    setWolfTarget(catchPositionForLine(bestEgg.side, bestEgg.row))
  }, [eggs, gameOver])

  useEffect(() => {
    if (gameOver) return
    const interval = setInterval(() => {
      setWolfPosition((pos) => {
        if (pos.row === wolfTarget.row && pos.col === wolfTarget.col) return pos

        const next: Position = { ...pos }
        if (pos.row !== wolfTarget.row) {
          next.row += pos.row < wolfTarget.row ? 1 : -1
        } else if (pos.col !== wolfTarget.col) {
          next.col += pos.col < wolfTarget.col ? 1 : -1
        }
        return next
      })
    }, WOLF_STEP_MS)

    return () => clearInterval(interval)
  }, [wolfTarget, gameOver])

  const gridPositions = useMemo(() => {
    const positions: Position[] = []
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        positions.push({ row, col })
      }
    }
    return positions
  }, [])

  const handleShootChicken = (chicken: Chicken) => {
    if (gameOver) return
    const now = performance.now()
    if (now < reloadUntil) return

    setChickens((prev) =>
      prev.map((item) => (item.id === chicken.id ? { ...item, cooldown: CHICKEN_DISABLE_MS } : item)),
    )
    setReloadUntil(now + SHOOT_COOLDOWN_MS)
  }

  const handleShootEgg = (egg: Egg) => {
    if (gameOver) return
    const now = performance.now()
    if (now < reloadUntil) return

    setEggs((prev) => prev.filter((item) => item.id !== egg.id))
    setReloadUntil(now + SHOOT_COOLDOWN_MS)
  }

  const handleReset = () => {
    setChickens(initialChickens())
    setEggs([])
    setWolfPosition({ row: 1, col: 1 })
    setWolfTarget({ row: 1, col: 1 })
    setCaughtEggs(0)
    setDroppedEggs(0)
    setGameOver(false)
    setReloadUntil(0)
    setNextEggSpawnAt(performance.now() + nextSpawnDelay())
  }

  const reloadProgress = (() => {
    const now = performance.now()
    if (now >= reloadUntil) return 1
    const left = reloadUntil - now
    return Math.max(0, 1 - left / SHOOT_COOLDOWN_MS)
  })()

  return (
    <div className="app">
      <header className="hud">
        <div>
          <h1>Wolf &amp; Eggs</h1>
          <p className="subtitle">Indirect control: shoot chickens, guide the wolf, save the eggs.</p>
        </div>
        <div className="stats">
          <div className="stat">Caught eggs: {caughtEggs}</div>
          <div className={`stat ${droppedEggs >= 2 ? 'danger' : ''}`}>Dropped eggs: {droppedEggs}/3</div>
          <div className="reload">
            <span>Reload</span>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${reloadProgress * 100}%` }} />
            </div>
          </div>
          <button className="secondary" onClick={handleReset}>
            Restart
          </button>
        </div>
      </header>

      {gameOver && <div className="banner">Three eggs hit the floor. Tap Restart to try again!</div>}

      <div className="arena">
        <ConveyorColumn
          side="left"
          chickens={chickens.filter((c) => c.side === 'left')}
          eggs={eggs.filter((egg) => egg.side === 'left')}
          onShootChicken={handleShootChicken}
          onShootEgg={handleShootEgg}
        />

        <div className="wolf-zone">
          <div className="grid">
            {gridPositions.map((pos) => {
              const isWolf = wolfPosition.row === pos.row && wolfPosition.col === pos.col
              const isTarget = wolfTarget.row === pos.row && wolfTarget.col === pos.col
              return (
                <div
                  key={`${pos.row}-${pos.col}`}
                  className={`node ${isWolf ? 'wolf' : ''} ${isTarget && !isWolf ? 'target' : ''}`}
                >
                  {isWolf && <span className="wolf-icon" role="img" aria-label="wolf">🐺</span>}
                </div>
              )
            })}
          </div>
        </div>

        <ConveyorColumn
          side="right"
          chickens={chickens.filter((c) => c.side === 'right')}
          eggs={eggs.filter((egg) => egg.side === 'right')}
          onShootChicken={handleShootChicken}
          onShootEgg={handleShootEgg}
        />
      </div>

      <div className="instructions">
        <p>Chickens drop eggs one at a time with long pauses. The farther a chicken is from the exit, the longer its eggs take to reach the wolf.</p>
        <ul>
          <li>The wolf moves automatically toward the next egg that will drop.</li>
          <li>Click a chicken to scare it. Scared chickens stop dropping eggs while recovering.</li>
          <li>Click an egg to shoot it if the wolf cannot get there in time.</li>
          <li>Three dropped eggs end the run. Keep the wolf close to the busiest lines!</li>
        </ul>
      </div>
    </div>
  )
}

interface ConveyorProps {
  side: Side
  chickens: Chicken[]
  eggs: Egg[]
  onShootChicken: (chicken: Chicken) => void
  onShootEgg: (egg: Egg) => void
}

function ConveyorColumn({ side, chickens, eggs, onShootChicken, onShootEgg }: ConveyorProps) {
  const rows: Chicken[][] = useMemo(() => {
    const grouped: Chicken[][] = Array.from({ length: ROWS }, () => [])
    chickens.forEach((chicken) => {
      grouped[chicken.row].push(chicken)
    })
    return grouped
  }, [chickens])

  const eggsByRow = useMemo(() => {
    const grouped: Egg[][] = Array.from({ length: ROWS }, () => [])
    eggs.forEach((egg) => grouped[egg.row].push(egg))
    return grouped
  }, [eggs])

  return (
    <div className={`column ${side}`}>
      {rows.map((rowChickens, rowIndex) => (
        <div className="conveyor" key={`${side}-${rowIndex}`}>
          <div className="track" />
          <div className="chickens">
            {rowChickens
              .sort((a, b) => a.slot - b.slot)
              .map((chicken) => (
                <button
                  key={chicken.id}
                  className={`chicken ${chicken.cooldown > 0 ? 'sleep' : ''}`}
                  onClick={() => onShootChicken(chicken)}
                  title={chicken.cooldown > 0 ? 'Recovering' : 'Active'}
                >
                  🐔
                </button>
              ))}
          </div>

          <div className="eggs">
            {eggsByRow[rowIndex].map((egg) => {
              const left = side === 'left' ? `${egg.progress * 100}%` : `${(1 - egg.progress) * 100}%`
              return (
                <button
                  key={egg.id}
                  className="egg"
                  style={{ left }}
                  onClick={() => onShootEgg(egg)}
                  title="Shoot egg"
                >
                  🥚
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default App
