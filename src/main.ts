import './style.css'
import { FlappyGame } from './game'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="page-shell">
    <section class="hero-copy">
      <p class="eyebrow">TypeScript canvas game</p>
      <h1>Crappy Bird</h1>
      <p class="lede">
        Tap the playfield to flap, weave through the pipes, and chase a best score that stays
        saved on your device.
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

      <canvas
        id="game"
        class="game-canvas"
        aria-label="Crappy Bird playable canvas"
        role="img"
      ></canvas>

      <p id="status" class="status-line">Tap anywhere to start your run.</p>

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

const statusByState = {
  ready: 'Tap anywhere to start your run.',
  playing: 'Stay centered and thread the gaps.',
  gameover: 'Tap again to restart after a crash.',
} as const

const game = new FlappyGame({
  canvas,
  onScoreChange(score) {
    scoreEl.textContent = String(score)
  },
  onBestScoreChange(bestScore) {
    bestScoreEl.textContent = String(bestScore)
  },
  onStateChange(state) {
    statusEl.textContent = statusByState[state]
  },
})

const triggerFlap = (event: Event) => {
  event.preventDefault()
  game.handleTap()
}

shell.addEventListener('pointerdown', triggerFlap)
shell.addEventListener('contextmenu', (event) => event.preventDefault())

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault()
    game.handleTap()
  }
})

game.mount()
