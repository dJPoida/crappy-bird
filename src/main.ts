import './style.css'
import { FlappyGame } from './game'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="page-shell">
    <section class="hero-copy">
      <p class="eyebrow">Tintype arcade</p>
      <h1>Crappy Bird</h1>
      <p class="lede">
        A sun-baked little flyer trapped inside an old frontier photograph. Tap the playfield,
        dodge the timber gauntlet, and chase a best score that stays saved on your device.
      </p>
    </section>

    <section class="game-card" id="game-shell" aria-label="Crappy Bird game area">
      <div class="hud-row">
        <div class="score-pill">
          <span>Score</span>
          <strong id="score">0</strong>
        </div>
        <div class="score-pill">
          <span>Best</span>
          <strong id="best-score">0</strong>
        </div>
      </div>

      <div class="playfield-stage">
        <button id="exit-immersive" class="exit-immersive" type="button">Leave Frame</button>
        <canvas
          id="game"
          class="game-canvas"
          aria-label="Crappy Bird playable canvas"
          role="img"
        ></canvas>
      </div>

      <p id="status" class="status-line">Tap anywhere to start your run.</p>

      <div class="trail-meter" aria-label="Current difficulty">
        <div class="trail-meter-copy">
          <span>Trail</span>
          <strong id="difficulty-label">Quiet</strong>
        </div>
        <div class="trail-track">
          <div id="difficulty-fill" class="trail-fill"></div>
        </div>
      </div>

      <div class="meta-row">
        <span>Tap / Click / Space</span>
        <span>Ready for GitHub and Vercel</span>
      </div>
    </section>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const shell = document.querySelector<HTMLElement>('#game-shell')!
const scoreEl = document.querySelector<HTMLElement>('#score')!
const bestScoreEl = document.querySelector<HTMLElement>('#best-score')!
const statusEl = document.querySelector<HTMLElement>('#status')!
const difficultyLabelEl = document.querySelector<HTMLElement>('#difficulty-label')!
const difficultyFillEl = document.querySelector<HTMLElement>('#difficulty-fill')!
const exitImmersiveButton = document.querySelector<HTMLButtonElement>('#exit-immersive')!

const statusByState = {
  ready: 'Tap anywhere to stir the dust.',
  playing: 'Hold your line through the timber gaps.',
  gameover: 'Tap again when the dust settles.',
} as const

let gameState: keyof typeof statusByState = 'ready'
let immersiveMode = false

const syncImmersiveMode = () => {
  document.body.classList.toggle('immersive-play', immersiveMode)
}

const enterImmersiveMode = async () => {
  if (immersiveMode) {
    return
  }

  immersiveMode = true
  syncImmersiveMode()

  if (document.fullscreenEnabled && !document.fullscreenElement) {
    try {
      await shell.requestFullscreen()
    } catch {
      // The fixed viewport fallback is already active.
    }
  }
}

const exitImmersiveMode = async () => {
  immersiveMode = false
  syncImmersiveMode()

  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen()
    } catch {
      // Ignore exit failures and keep the layout fallback in sync.
    }
  }
}

const game = new FlappyGame({
  canvas,
  onScoreChange(score) {
    scoreEl.textContent = String(score)
  },
  onBestScoreChange(bestScore) {
    bestScoreEl.textContent = String(bestScore)
  },
  onDifficultyChange(progress, label) {
    difficultyLabelEl.textContent = label
    difficultyFillEl.style.width = `${Math.round(progress * 100)}%`
  },
  onStateChange(state) {
    gameState = state
    statusEl.textContent = statusByState[state]
  },
})

const triggerFlap = (event: Event) => {
  event.preventDefault()

  if (gameState === 'ready') {
    void enterImmersiveMode()
  }

  game.handleTap()
}

shell.addEventListener('pointerdown', triggerFlap)
document.addEventListener('contextmenu', (event) => event.preventDefault())
document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false })
exitImmersiveButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  event.stopPropagation()
})
exitImmersiveButton.addEventListener('click', (event) => {
  event.preventDefault()
  event.stopPropagation()
  void exitImmersiveMode()
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault()

    if (gameState === 'ready') {
      void enterImmersiveMode()
    }

    game.handleTap()
  }

  if (event.code === 'Escape' && immersiveMode) {
    event.preventDefault()
    void exitImmersiveMode()
  }
})

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && immersiveMode) {
    syncImmersiveMode()
  }
})

game.mount()
