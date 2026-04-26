type GameState = 'ready' | 'playing' | 'gameover'

type GameCallbacks = {
  canvas: HTMLCanvasElement
  onScoreChange: (score: number) => void
  onBestScoreChange: (bestScore: number) => void
  onStateChange: (state: GameState) => void
}

type Bird = {
  x: number
  y: number
  velocityY: number
  radius: number
}

type Pipe = {
  x: number
  width: number
  gapY: number
  gapHeight: number
  passed: boolean
}

const STORAGE_KEY = 'crappy-bird-best-score'
const WORLD_WIDTH = 420
const WORLD_HEIGHT = 720
const GROUND_HEIGHT = 110
const PIPE_WIDTH = 86
const PIPE_GAP = 176
const PIPE_SPEED = 188
const PIPE_INTERVAL = 1.38
const GRAVITY = 1380
const FLAP_FORCE = -390
const MAX_FALL_SPEED = 630
const PIPE_MARGIN = 96
const TOP_MARGIN = 82
const RESTART_LOCK = 0.45

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const intersectsCircleRect = (
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
) => {
  const nearestX = clamp(cx, rx, rx + rw)
  const nearestY = clamp(cy, ry, ry + rh)
  const dx = cx - nearestX
  const dy = cy - nearestY
  return dx * dx + dy * dy < radius * radius
}

export class FlappyGame {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly onScoreChange: GameCallbacks['onScoreChange']
  private readonly onBestScoreChange: GameCallbacks['onBestScoreChange']
  private readonly onStateChange: GameCallbacks['onStateChange']

  private lastFrameTime = 0
  private elapsed = 0
  private spawnTimer = PIPE_INTERVAL
  private groundOffset = 0
  private score = 0
  private bestScore = 0
  private state: GameState = 'ready'
  private restartTimer = 0
  private readonly bird: Bird = {
    x: WORLD_WIDTH * 0.3,
    y: WORLD_HEIGHT * 0.42,
    velocityY: 0,
    radius: 18,
  }
  private pipes: Pipe[] = []

  constructor({ canvas, onScoreChange, onBestScoreChange, onStateChange }: GameCallbacks) {
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('2D canvas is not available in this browser.')
    }

    this.canvas = canvas
    this.ctx = context
    this.onScoreChange = onScoreChange
    this.onBestScoreChange = onBestScoreChange
    this.onStateChange = onStateChange
    this.bestScore = this.readBestScore()
    this.syncUi()
  }

  mount() {
    this.resizeCanvas()
    window.addEventListener('resize', this.resizeCanvas)
    window.requestAnimationFrame(this.frame)
  }

  handleTap() {
    if (this.state === 'gameover') {
      if (this.restartTimer >= RESTART_LOCK) {
        this.reset()
      }
      return
    }

    if (this.state === 'ready') {
      this.state = 'playing'
      this.spawnTimer = 0.85
      this.onStateChange(this.state)
    }

    this.bird.velocityY = FLAP_FORCE
  }

  private reset() {
    this.state = 'ready'
    this.restartTimer = 0
    this.score = 0
    this.spawnTimer = PIPE_INTERVAL
    this.groundOffset = 0
    this.elapsed = 0
    this.pipes = []
    this.bird.y = WORLD_HEIGHT * 0.42
    this.bird.velocityY = 0
    this.syncUi()
  }

  private frame = (timestamp: number) => {
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp
    }

    const delta = Math.min((timestamp - this.lastFrameTime) / 1000, 1 / 20)
    this.lastFrameTime = timestamp
    this.elapsed += delta

    this.update(delta)
    this.draw()

    window.requestAnimationFrame(this.frame)
  }

  private update(delta: number) {
    this.groundOffset = (this.groundOffset + PIPE_SPEED * delta) % 48

    if (this.state === 'ready') {
      this.bird.y = WORLD_HEIGHT * 0.42 + Math.sin(this.elapsed * 3.2) * 10
      return
    }

    this.bird.velocityY = clamp(this.bird.velocityY + GRAVITY * delta, FLAP_FORCE, MAX_FALL_SPEED)
    this.bird.y += this.bird.velocityY * delta

    if (this.bird.y - this.bird.radius < 0) {
      this.bird.y = this.bird.radius
      this.bird.velocityY = 0
    }

    this.spawnTimer -= delta

    if (this.state === 'playing' && this.spawnTimer <= 0) {
      this.spawnPipe()
      this.spawnTimer += PIPE_INTERVAL
    }

    for (const pipe of this.pipes) {
      pipe.x -= PIPE_SPEED * delta

      if (!pipe.passed && pipe.x + pipe.width < this.bird.x) {
        pipe.passed = true
        this.score += 1
        if (this.score > this.bestScore) {
          this.bestScore = this.score
          this.writeBestScore(this.bestScore)
          this.onBestScoreChange(this.bestScore)
        }
        this.onScoreChange(this.score)
      }
    }

    this.pipes = this.pipes.filter((pipe) => pipe.x + pipe.width > -40)

    if (this.state === 'playing' && this.hitsAnyPipe()) {
      this.finishRun()
    }

    if (this.bird.y + this.bird.radius >= WORLD_HEIGHT - GROUND_HEIGHT) {
      this.bird.y = WORLD_HEIGHT - GROUND_HEIGHT - this.bird.radius
      if (this.state === 'playing') {
        this.finishRun()
      }
    }

    if (this.state === 'gameover') {
      this.restartTimer += delta
    }
  }

  private finishRun() {
    this.state = 'gameover'
    this.restartTimer = 0
    this.onStateChange(this.state)
  }

  private hitsAnyPipe() {
    return this.pipes.some((pipe) => {
      const topHeight = pipe.gapY - pipe.gapHeight / 2
      const bottomY = pipe.gapY + pipe.gapHeight / 2
      const bottomHeight = WORLD_HEIGHT - GROUND_HEIGHT - bottomY

      return (
        intersectsCircleRect(this.bird.x, this.bird.y, this.bird.radius, pipe.x, 0, pipe.width, topHeight) ||
        intersectsCircleRect(
          this.bird.x,
          this.bird.y,
          this.bird.radius,
          pipe.x,
          bottomY,
          pipe.width,
          bottomHeight,
        )
      )
    })
  }

  private spawnPipe() {
    const minGapY = TOP_MARGIN + PIPE_GAP / 2
    const maxGapY = WORLD_HEIGHT - GROUND_HEIGHT - PIPE_MARGIN - PIPE_GAP / 2
    const gapY = minGapY + Math.random() * (maxGapY - minGapY)

    this.pipes.push({
      x: WORLD_WIDTH + 24,
      width: PIPE_WIDTH,
      gapY,
      gapHeight: PIPE_GAP,
      passed: false,
    })
  }

  private draw() {
    const ctx = this.ctx

    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.drawSky()
    this.drawBackdrop()
    this.drawPipes()
    this.drawGround()
    this.drawBird()
    this.drawOverlay()
  }

  private drawSky() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT)
    gradient.addColorStop(0, '#89d4ff')
    gradient.addColorStop(0.45, '#c6f2ff')
    gradient.addColorStop(1, '#f7dba7')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.ctx.fillStyle = 'rgba(255, 244, 189, 0.88)'
    this.ctx.beginPath()
    this.ctx.arc(WORLD_WIDTH - 72, 94, 38, 0, Math.PI * 2)
    this.ctx.fill()
  }

  private drawBackdrop() {
    const ctx = this.ctx
    const wave = Math.sin(this.elapsed * 0.5) * 6

    ctx.fillStyle = 'rgba(255, 255, 255, 0.46)'
    this.drawCloud(78, 110 + wave * 0.2, 0.8)
    this.drawCloud(292, 154 - wave * 0.1, 0.65)
    this.drawCloud(220, 86 + wave * 0.15, 0.55)

    ctx.fillStyle = '#5f99b1'
    ctx.beginPath()
    ctx.moveTo(0, WORLD_HEIGHT - 214)
    ctx.quadraticCurveTo(96, WORLD_HEIGHT - 274, 184, WORLD_HEIGHT - 206)
    ctx.quadraticCurveTo(264, WORLD_HEIGHT - 142, 420, WORLD_HEIGHT - 222)
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT - GROUND_HEIGHT)
    ctx.lineTo(0, WORLD_HEIGHT - GROUND_HEIGHT)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#2f6274'
    ctx.fillRect(28, WORLD_HEIGHT - 210, 28, 100)
    ctx.fillRect(70, WORLD_HEIGHT - 232, 34, 122)
    ctx.fillRect(112, WORLD_HEIGHT - 198, 42, 88)
    ctx.fillRect(165, WORLD_HEIGHT - 252, 32, 142)
    ctx.fillRect(206, WORLD_HEIGHT - 222, 36, 112)
    ctx.fillRect(258, WORLD_HEIGHT - 242, 48, 132)
    ctx.fillRect(316, WORLD_HEIGHT - 206, 30, 96)
    ctx.fillRect(356, WORLD_HEIGHT - 260, 38, 150)

    ctx.fillStyle = '#ffe49a'
    for (let index = 0; index < 18; index += 1) {
      const x = 36 + (index % 9) * 42
      const row = Math.floor(index / 9)
      const y = WORLD_HEIGHT - 190 - row * 34
      ctx.fillRect(x, y, 8, 10)
      ctx.fillRect(x + 14, y, 8, 10)
    }
  }

  private drawCloud(x: number, y: number, scale: number) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, 22 * scale, 0, Math.PI * 2)
    ctx.arc(x + 22 * scale, y - 8 * scale, 18 * scale, 0, Math.PI * 2)
    ctx.arc(x + 46 * scale, y, 24 * scale, 0, Math.PI * 2)
    ctx.arc(x + 20 * scale, y + 10 * scale, 26 * scale, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawPipes() {
    for (const pipe of this.pipes) {
      const topHeight = pipe.gapY - pipe.gapHeight / 2
      const bottomY = pipe.gapY + pipe.gapHeight / 2
      const bottomHeight = WORLD_HEIGHT - GROUND_HEIGHT - bottomY

      this.drawPipe(pipe.x, 0, pipe.width, topHeight, true)
      this.drawPipe(pipe.x, bottomY, pipe.width, bottomHeight, false)
    }
  }

  private drawPipe(x: number, y: number, width: number, height: number, isTop: boolean) {
    const ctx = this.ctx
    ctx.fillStyle = '#4fbb4a'
    ctx.fillRect(x, y, width, height)
    ctx.fillStyle = '#2f7d28'
    ctx.fillRect(x + width - 12, y, 12, height)
    ctx.fillStyle = '#8ce76f'
    ctx.fillRect(x, y, 10, height)

    const lipY = isTop ? height - 22 : y
    ctx.fillStyle = '#61cb54'
    ctx.fillRect(x - 6, lipY, width + 12, 22)
    ctx.fillStyle = '#347b28'
    ctx.fillRect(x + width - 6, lipY, 12, 22)
  }

  private drawGround() {
    const ctx = this.ctx
    const groundY = WORLD_HEIGHT - GROUND_HEIGHT

    ctx.fillStyle = '#c9a46c'
    ctx.fillRect(0, groundY, WORLD_WIDTH, GROUND_HEIGHT)
    ctx.fillStyle = '#e8c88d'
    ctx.fillRect(0, groundY, WORLD_WIDTH, 16)

    for (let x = -48 + this.groundOffset; x < WORLD_WIDTH + 48; x += 48) {
      ctx.fillStyle = '#b98a52'
      ctx.fillRect(x, groundY + 26, 28, 14)
      ctx.fillStyle = '#996c37'
      ctx.fillRect(x + 24, groundY + 52, 28, 14)
    }

    ctx.fillStyle = '#7cbe58'
    ctx.fillRect(0, groundY - 14, WORLD_WIDTH, 18)
    ctx.fillStyle = '#4f8b37'
    ctx.fillRect(0, groundY - 6, WORLD_WIDTH, 6)
  }

  private drawBird() {
    const ctx = this.ctx
    const tilt = clamp(this.bird.velocityY / 500, -0.55, 1)

    ctx.save()
    ctx.translate(this.bird.x, this.bird.y)
    ctx.rotate(tilt)

    ctx.fillStyle = '#ffd146'
    ctx.beginPath()
    ctx.arc(0, 0, this.bird.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#f09a2f'
    ctx.beginPath()
    ctx.ellipse(-4, 6, 14, 9, -0.3, 0, Math.PI * 2)
    ctx.fill()

    const wingLift = this.state === 'ready' ? Math.sin(this.elapsed * 12) * 5 : -this.bird.velocityY / 85
    ctx.fillStyle = '#f5b028'
    ctx.beginPath()
    ctx.ellipse(-5, 2 + clamp(wingLift, -7, 7), 11, 7, -0.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(7, -6, 5.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#1f2937'
    ctx.beginPath()
    ctx.arc(9, -6, 2.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ef6a39'
    ctx.beginPath()
    ctx.moveTo(16, 1)
    ctx.lineTo(28, -2)
    ctx.lineTo(16, -8)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  private drawOverlay() {
    const ctx = this.ctx

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    ctx.font = '700 56px Trebuchet MS, Avenir Next, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(this.score), WORLD_WIDTH / 2, 104)

    if (this.state === 'playing') {
      return
    }

    ctx.fillStyle = 'rgba(12, 36, 52, 0.72)'
    this.roundRect(38, 208, WORLD_WIDTH - 76, 184, 28)
    ctx.fill()

    ctx.fillStyle = '#fef6dc'
    ctx.font = '700 28px Trebuchet MS, Avenir Next, sans-serif'
    ctx.fillText(this.state === 'ready' ? 'Tap To Fly' : 'Crash Landing', WORLD_WIDTH / 2, 268)

    ctx.font = '500 17px Verdana, Geneva, sans-serif'
    ctx.fillStyle = '#dff4ff'
    const detail =
      this.state === 'ready'
        ? 'Keep the bird above the ground and between every pipe gap.'
        : `Score ${this.score}. Best ${this.bestScore}. Tap to try another run.`
    ctx.fillText(detail, WORLD_WIDTH / 2, 314, WORLD_WIDTH - 124)

    ctx.font = '600 16px Verdana, Geneva, sans-serif'
    ctx.fillStyle = '#ffe49a'
    ctx.fillText(
      this.state === 'ready' ? 'Touch, click, or press Space' : 'Restart unlocks in a moment',
      WORLD_WIDTH / 2,
      352,
    )
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  private resizeCanvas = () => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    this.canvas.width = Math.floor(WORLD_WIDTH * ratio)
    this.canvas.height = Math.floor(WORLD_HEIGHT * ratio)
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  private readBestScore() {
    try {
      return Number(window.localStorage.getItem(STORAGE_KEY) ?? '0') || 0
    } catch {
      return 0
    }
  }

  private writeBestScore(bestScore: number) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(bestScore))
    } catch {
      // Ignore storage failures so gameplay still works in restricted browsers.
    }
  }

  private syncUi() {
    this.onScoreChange(this.score)
    this.onBestScoreChange(this.bestScore)
    this.onStateChange(this.state)
  }
}
