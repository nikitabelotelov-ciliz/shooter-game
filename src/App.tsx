import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import './App.css'
import type { Chicken, Egg, GameState, Side } from './gameModel'
import { EXTRA_TIMER_MS, GameModel, LINES_PER_SIDE, SEATS_PER_LINE } from './gameModel'

const FRAME_MS = 1000 / 30
const DEFAULT_CHICKEN_BG = '#233247'
const DEFAULT_CHICKEN_BORDER = '#355170'
const ALERT_CHICKEN_BG = '#d74f4f'
const ALERT_CHICKEN_BORDER = '#f28b6b'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const mixColors = (from: string, to: string, ratio: number) => {
  const normalized = clamp01(ratio)
  const parse = (color: string) => {
    const hex = color.replace('#', '')
    const bigint = parseInt(hex, 16)
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    }
  }

  const start = parse(from)
  const end = parse(to)

  const r = Math.round(start.r + (end.r - start.r) * normalized)
  const g = Math.round(start.g + (end.g - start.g) * normalized)
  const b = Math.round(start.b + (end.b - start.b) * normalized)

  return `rgb(${r}, ${g}, ${b})`
}

const getChickenStyle = (chicken: Chicken): CSSProperties | undefined => {
  if (chicken.extraTimer <= 0) return undefined

  const intensity = clamp01(chicken.extraTimer / EXTRA_TIMER_MS)
  const blendRatio = 1 - intensity

  return {
    backgroundColor: mixColors(ALERT_CHICKEN_BG, DEFAULT_CHICKEN_BG, blendRatio),
    borderColor: mixColors(ALERT_CHICKEN_BORDER, DEFAULT_CHICKEN_BORDER, blendRatio),
  }
}

function App() {
  const [gameModel] = useState(() => new GameModel())
  const [gameState, setGameState] = useState<GameState>(() => gameModel.getState())
  const slowedLinesRef = useRef<Set<number>>(new Set())
  const caughtPerSecond = useMemo(() => {
    const seconds = gameState.elapsedMs / 1000
    if (seconds <= 0) return '0.00'
    return (gameState.caughtEggs / seconds).toFixed(2)
  }, [gameState.caughtEggs, gameState.elapsedMs])

  useEffect(() => {
    const tick = () => {
      const state = gameModel.update(performance.now(), slowedLinesRef.current)
      setGameState(state)
    }

    tick()
    const interval = setInterval(tick, FRAME_MS)
    return () => clearInterval(interval)
  }, [gameModel])

  const gridPositions = useMemo(() => {
    const positions = [] as { row: number; col: number }[]
    for (let row = 0; row < LINES_PER_SIDE; row += 1) {
      positions.push({ row, col: 0 })
    }
    return positions
  }, [])

  const handleShootChicken = (chicken: Chicken) => {
    if (gameState.gameOver) return

    if (gameModel.shootChicken(chicken.id)) {
      setGameState(gameModel.getState())
    }
  }

  const handleShootEgg = (egg: Egg) => {
    if (gameState.gameOver) return

    if (gameModel.shootEgg(egg.id)) {
      setGameState(gameModel.getState())
    }
  }

  const handleReset = () => {
    slowedLinesRef.current = new Set()
    gameModel.reset()
    setGameState(gameModel.getState())
  }

  const addSlowedLine = (line: number) => {
    const next = new Set(slowedLinesRef.current)
    next.add(line)
    slowedLinesRef.current = next
  }

  const removeSlowedLine = (line: number) => {
    const next = new Set(slowedLinesRef.current)
    next.delete(line)
    slowedLinesRef.current = next
  }

  const handleSlowPointerDown = (line: number, event: PointerEvent) => {
    if (event.button !== 2 && event.pointerType !== 'touch') return
    event.preventDefault()
    addSlowedLine(line)
  }

  const handleSlowPointerUp = (line: number) => {
    removeSlowedLine(line)
  }

  const handleSlowPointerLeave = (line: number) => {
    removeSlowedLine(line)
  }

  const handleSlowPointerCancel = (line: number) => {
    removeSlowedLine(line)
  }

  return (
    <div className="app">
      <header className="hud">
        <div className="stats">
          <div className="stat">Eggs: {gameState.caughtEggs}</div>
          <div className="stat">Rate: {caughtPerSecond}</div>
          <div className={`stat ${gameState.droppedEggs >= 2 ? 'danger' : ''}`}>
            Dropped eggs: {gameState.droppedEggs}/3
          </div>
          <div className="reload">
            <span>Reload</span>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${gameState.reloadProgress * 100}%` }} />
            </div>
          </div>
          <button className="secondary" onClick={handleReset}>
            Restart
          </button>
        </div>
      </header>

      {gameState.gameOver && (
        <div className="banner">Three eggs hit the floor. Tap Restart to try again!</div>
      )}

      <div className="arena">
        <div className="wolf-zone">
          <div className="grid">
            {gridPositions.map((pos) => {
              const isWolf = gameState.wolfPosition.row === pos.row && gameState.wolfPosition.col === pos.col
              const isTarget = gameState.wolfTarget.row === pos.row && gameState.wolfTarget.col === pos.col
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
          chickens={gameState.chickens}
          eggs={gameState.eggs}
          slowedLines={gameState.slowedLines}
          onShootChicken={handleShootChicken}
          onShootEgg={handleShootEgg}
          onSlowDownStart={handleSlowPointerDown}
          onSlowDownEnd={handleSlowPointerUp}
          onSlowDownCancel={handleSlowPointerCancel}
          onSlowDownLeave={handleSlowPointerLeave}
        />
      </div>

      <div className="instructions">
        <p>Chickens perch on four conveyor lines on the right side, with seats closer or farther from the drop point.</p>
        <ul>
          <li>New chickens occupy free seats every few seconds; click a chicken to shake out an extra egg.</li>
          <li>Each chicken drops eggs every 5-10 seconds. The closer the seat, the shorter the fall.</li>
          <li>The wolf moves automatically toward the egg that will drop first.</li>
          <li>Click an egg to shoot it if the wolf cannot get there in time. Three dropped eggs end the run.</li>
        </ul>
      </div>
    </div>
  )
}

interface ConveyorProps {
  side: Side
  chickens: Chicken[]
  eggs: Egg[]
  slowedLines: number[]
  onShootChicken: (chicken: Chicken) => void
  onShootEgg: (egg: Egg) => void
  onSlowDownStart: (line: number, event: PointerEvent) => void
  onSlowDownEnd: (line: number) => void
  onSlowDownCancel: (line: number) => void
  onSlowDownLeave: (line: number) => void
}

function ConveyorColumn({
  side,
  chickens,
  eggs,
  slowedLines,
  onShootChicken,
  onShootEgg,
  onSlowDownStart,
  onSlowDownEnd,
  onSlowDownCancel,
  onSlowDownLeave,
}: ConveyorProps) {
  const rows: Chicken[][] = useMemo(() => {
    const grouped: Chicken[][] = Array.from({ length: LINES_PER_SIDE }, () => [])
    chickens.forEach((chicken) => {
      grouped[chicken.line].push(chicken)
    })
    return grouped
  }, [chickens])

  const eggsByRow = useMemo(() => {
    const grouped: Egg[][] = Array.from({ length: LINES_PER_SIDE }, () => [])
    eggs.forEach((egg) => grouped[egg.line].push(egg))
    return grouped
  }, [eggs])

  return (
    <div className={`column ${side}`}>
      {rows.map((rowChickens, rowIndex) => (
        <div
          className={`conveyor ${side} ${slowedLines.includes(rowIndex) ? 'slowed' : ''}`}
          key={`${side}-${rowIndex}`}
          onPointerDown={(event) => onSlowDownStart(rowIndex, event)}
          onPointerUp={() => onSlowDownEnd(rowIndex)}
          onPointerLeave={() => onSlowDownLeave(rowIndex)}
          onPointerCancel={() => onSlowDownCancel(rowIndex)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="chickens">
            {Array.from({ length: SEATS_PER_LINE }).map((_, seatIndex) => {
              const chicken = rowChickens.find((item) => item.seat === seatIndex)
              return (
                <button
                  key={`${side}-${rowIndex}-${seatIndex}`}
                  className={`chicken ${!chicken ? 'empty' : ''}`}
                  onClick={() => chicken && onShootChicken(chicken)}
                  style={chicken ? getChickenStyle(chicken) : undefined}
                  title={chicken ? 'Shoot chicken for an extra egg' : 'Empty seat'}
                  disabled={!chicken}
                >
                  {chicken ? '🐔' : '⬜️'}
                </button>
              )
            })}
          </div>

          <div className="belt">
            <div className="track" />
            <div className="eggs">
              {eggsByRow[rowIndex].map((egg) => {
                const pathProgress = Math.min(1, egg.progress / egg.travelDistance)
                const position = egg.startPosition * (1 - pathProgress)
                const left = `${position * 100}%`
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
        </div>
      ))}
    </div>
  )
}

export default App
