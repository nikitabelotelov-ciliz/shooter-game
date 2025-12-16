import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { Chicken, Egg, GameState, Side } from './gameModel'
import { GameModel, LINES_PER_SIDE, SEATS_PER_LINE } from './gameModel'

const FRAME_MS = 1000 / 30
const SHOOT_COOLDOWN_MS = 900

function App() {
  const gameModelRef = useRef(new GameModel())
  const [gameState, setGameState] = useState<GameState>(() => gameModelRef.current.getState())
  const [reloadUntil, setReloadUntil] = useState<number>(0)

  useEffect(() => {
    const tick = () => {
      const state = gameModelRef.current.update()
      setGameState(state)
    }

    tick()
    const interval = setInterval(tick, FRAME_MS)
    return () => clearInterval(interval)
  }, [])

  const gridPositions = useMemo(() => {
    const positions = [] as { row: number; col: number }[]
    for (let row = 0; row < LINES_PER_SIDE; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        positions.push({ row, col })
      }
    }
    return positions
  }, [])

  const handleShootChicken = (chicken: Chicken) => {
    if (gameState.gameOver) return
    const now = performance.now()
    if (now < reloadUntil) return

    gameModelRef.current.removeChicken(chicken.id)
    setReloadUntil(now + SHOOT_COOLDOWN_MS)
    setGameState(gameModelRef.current.getState())
  }

  const handleShootEgg = (egg: Egg) => {
    if (gameState.gameOver) return
    const now = performance.now()
    if (now < reloadUntil) return

    gameModelRef.current.removeEgg(egg.id)
    setReloadUntil(now + SHOOT_COOLDOWN_MS)
    setGameState(gameModelRef.current.getState())
  }

  const handleReset = () => {
    gameModelRef.current.reset()
    setGameState(gameModelRef.current.getState())
    setReloadUntil(0)
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
          <div className="stat">Caught eggs: {gameState.caughtEggs}</div>
          <div className={`stat ${gameState.droppedEggs >= 2 ? 'danger' : ''}`}>
            Dropped eggs: {gameState.droppedEggs}/3
          </div>
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

      {gameState.gameOver && (
        <div className="banner">Three eggs hit the floor. Tap Restart to try again!</div>
      )}

      <div className="arena">
        <ConveyorColumn
          side="left"
          chickens={gameState.chickens.filter((c) => c.side === 'left')}
          eggs={gameState.eggs.filter((egg) => egg.side === 'left')}
          onShootChicken={handleShootChicken}
          onShootEgg={handleShootEgg}
        />

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
          chickens={gameState.chickens.filter((c) => c.side === 'right')}
          eggs={gameState.eggs.filter((egg) => egg.side === 'right')}
          onShootChicken={handleShootChicken}
          onShootEgg={handleShootEgg}
        />
      </div>

      <div className="instructions">
        <p>Chickens perch on six conveyor lines with seats closer or farther from the drop point.</p>
        <ul>
          <li>New chickens occupy free seats every few seconds; click a chicken to clear its spot.</li>
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
  onShootChicken: (chicken: Chicken) => void
  onShootEgg: (egg: Egg) => void
}

function ConveyorColumn({ side, chickens, eggs, onShootChicken, onShootEgg }: ConveyorProps) {
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
        <div className="conveyor" key={`${side}-${rowIndex}`}>
          <div className="track" />
          <div className="chickens">
            {Array.from({ length: SEATS_PER_LINE }).map((_, seatIndex) => {
              const chicken = rowChickens.find((item) => item.seat === seatIndex)
              return (
                <button
                  key={`${side}-${rowIndex}-${seatIndex}`}
                  className={`chicken ${!chicken ? 'empty' : ''}`}
                  onClick={() => chicken && onShootChicken(chicken)}
                  title={chicken ? 'Remove chicken' : 'Empty seat'}
                  disabled={!chicken}
                >
                  {chicken ? '🐔' : '⬜️'}
                </button>
              )
            })}
          </div>

          <div className="eggs">
            {eggsByRow[rowIndex].map((egg) => {
              const pathProgress = Math.min(1, egg.progress / egg.travelDistance)
              const left = side === 'left' ? `${pathProgress * 100}%` : `${(1 - pathProgress) * 100}%`
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
