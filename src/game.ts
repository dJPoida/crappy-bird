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
    this.drawPlateTexture()
  }

  private drawSky() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT)
    gradient.addColorStop(0, '#efdcb8')
    gradient.addColorStop(0.45, '#d2b07d')
    gradient.addColorStop(1, '#8a5f39')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.ctx.fillStyle = 'rgba(252, 234, 191, 0.38)'
    this.ctx.beginPath()
    this.ctx.arc(WORLD_WIDTH - 84, 106, 54, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.fillStyle = 'rgba(95, 60, 31, 0.1)'
    this.ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  }

  private drawBackdrop() {
    const ctx = this.ctx
    const haze = Math.sin(this.elapsed * 0.35) * 5

    ctx.fillStyle = 'rgba(245, 229, 198, 0.2)'
    ctx.fillRect(0, 148 + haze, WORLD_WIDTH, 48)

    ctx.fillStyle = '#7d5a3a'
    ctx.beginPath()
    ctx.moveTo(0, WORLD_HEIGHT - 286)
    ctx.lineTo(36, WORLD_HEIGHT - 308)
    ctx.lineTo(78, WORLD_HEIGHT - 258)
    ctx.lineTo(130, WORLD_HEIGHT - 318)
    ctx.lineTo(196, WORLD_HEIGHT - 248)
    ctx.lineTo(254, WORLD_HEIGHT - 296)
    ctx.lineTo(316, WORLD_HEIGHT - 244)
    ctx.lineTo(420, WORLD_HEIGHT - 292)
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT - 190)
    ctx.lineTo(0, WORLD_HEIGHT - 202)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#5f4229'
    ctx.beginPath()
    ctx.moveTo(0, WORLD_HEIGHT - 230)
    ctx.quadraticCurveTo(62, WORLD_HEIGHT - 278, 118, WORLD_HEIGHT - 214)
    ctx.quadraticCurveTo(172, WORLD_HEIGHT - 176, 226, WORLD_HEIGHT - 226)
    ctx.quadraticCurveTo(284, WORLD_HEIGHT - 274, 334, WORLD_HEIGHT - 214)
    ctx.quadraticCurveTo(378, WORLD_HEIGHT - 180, 420, WORLD_HEIGHT - 210)
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT - GROUND_HEIGHT)
    ctx.lineTo(0, WORLD_HEIGHT - GROUND_HEIGHT)
    ctx.closePath()
    ctx.fill()

    this.drawTown()
    this.drawTelegraphPole(56, WORLD_HEIGHT - 198, 68)
    this.drawTelegraphPole(338, WORLD_HEIGHT - 186, 56)
    this.drawCactus(92, WORLD_HEIGHT - GROUND_HEIGHT - 2, 0.95)
    this.drawCactus(356, WORLD_HEIGHT - GROUND_HEIGHT + 8, 0.72)
  }

  private drawTown() {
    const ctx = this.ctx
    const baseY = WORLD_HEIGHT - GROUND_HEIGHT

    ctx.fillStyle = '#4d311d'
    ctx.fillRect(34, baseY - 64, 44, 64)
    ctx.fillRect(86, baseY - 52, 54, 52)
    ctx.fillRect(150, baseY - 72, 58, 72)
    ctx.fillRect(216, baseY - 48, 48, 48)
    ctx.fillRect(274, baseY - 66, 56, 66)

    ctx.fillRect(28, baseY - 70, 56, 8)
    ctx.fillRect(82, baseY - 58, 62, 6)
    ctx.fillRect(144, baseY - 78, 70, 8)
    ctx.fillRect(268, baseY - 72, 68, 8)

    ctx.fillStyle = '#d9ba85'
    for (let index = 0; index < 9; index += 1) {
      const x = 42 + index * 32
      const y = index % 2 === 0 ? baseY - 42 : baseY - 30
      ctx.fillRect(x, y, 9, 12)
    }
  }

  private drawTelegraphPole(x: number, y: number, height: number) {
    const ctx = this.ctx
    ctx.fillStyle = '#4f3420'
    ctx.fillRect(x, y - height, 6, height)
    ctx.fillRect(x - 10, y - height + 12, 26, 5)
    ctx.strokeStyle = 'rgba(69, 43, 25, 0.8)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x - 10, y - height + 15)
    ctx.quadraticCurveTo(WORLD_WIDTH / 2, y - height + 28, WORLD_WIDTH + 12, y - height + 18)
    ctx.stroke()
  }

  private drawCactus(x: number, baseY: number, scale: number) {
    const ctx = this.ctx
    const trunkHeight = 42 * scale
    ctx.fillStyle = '#6f5835'
    ctx.fillRect(x, baseY - trunkHeight, 12 * scale, trunkHeight)
    ctx.fillRect(x - 10 * scale, baseY - trunkHeight + 14 * scale, 9 * scale, 20 * scale)
    ctx.fillRect(x + 12 * scale, baseY - trunkHeight + 10 * scale, 9 * scale, 18 * scale)
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
    ctx.fillStyle = '#7d5835'
    ctx.fillRect(x, y, width, height)
    ctx.fillStyle = '#5b3d24'
    ctx.fillRect(x + width - 12, y, 12, height)
    ctx.fillStyle = '#9e7650'
    ctx.fillRect(x, y, 12, height)

    ctx.fillStyle = 'rgba(244, 220, 185, 0.16)'
    for (let boardY = y + 16; boardY < y + height; boardY += 28) {
      ctx.fillRect(x, boardY, width, 3)
    }

    const lipY = isTop ? height - 22 : y
    ctx.fillStyle = '#8c6641'
    ctx.fillRect(x - 6, lipY, width + 12, 22)
    ctx.fillStyle = '#4e341f'
    ctx.fillRect(x + width - 6, lipY, 12, 22)

    ctx.fillStyle = '#3f2817'
    ctx.fillRect(x + 14, lipY + 8, 4, 4)
    ctx.fillRect(x + width - 20, lipY + 8, 4, 4)
  }

  private drawGround() {
    const ctx = this.ctx
    const groundY = WORLD_HEIGHT - GROUND_HEIGHT

    ctx.fillStyle = '#9f7448'
    ctx.fillRect(0, groundY, WORLD_WIDTH, GROUND_HEIGHT)
    ctx.fillStyle = '#c69b63'
    ctx.fillRect(0, groundY, WORLD_WIDTH, 16)

    for (let x = -48 + this.groundOffset; x < WORLD_WIDTH + 48; x += 48) {
      ctx.fillStyle = 'rgba(132, 88, 49, 0.24)'
      ctx.fillRect(x, groundY + 28, 34, 10)
      ctx.fillRect(x + 16, groundY + 62, 30, 10)
    }

    ctx.strokeStyle = 'rgba(111, 74, 41, 0.55)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(46 - this.groundOffset * 0.2, groundY + 18)
    ctx.quadraticCurveTo(WORLD_WIDTH / 2, groundY + 54, WORLD_WIDTH - 54 - this.groundOffset * 0.2, groundY + 16)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(72 - this.groundOffset * 0.2, groundY + 34)
    ctx.quadraticCurveTo(WORLD_WIDTH / 2, groundY + 70, WORLD_WIDTH - 30 - this.groundOffset * 0.2, groundY + 30)
    ctx.stroke()

    ctx.fillStyle = '#6c492c'
    ctx.fillRect(0, groundY - 14, WORLD_WIDTH, 14)
  }

  private drawBird() {
    const ctx = this.ctx
    const tilt = clamp(this.bird.velocityY / 500, -0.55, 1)

    ctx.save()
    ctx.translate(this.bird.x, this.bird.y)
    ctx.rotate(tilt)

    ctx.fillStyle = '#9d7448'
    ctx.beginPath()
    ctx.arc(0, 0, this.bird.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#71492b'
    ctx.beginPath()
    ctx.ellipse(-4, 6, 14, 9, -0.24, 0, Math.PI * 2)
    ctx.fill()

    const wingLift = this.state === 'ready' ? Math.sin(this.elapsed * 12) * 5 : -this.bird.velocityY / 85
    ctx.fillStyle = '#c49b67'
    ctx.beginPath()
    ctx.ellipse(-5, 2 + clamp(wingLift, -7, 7), 11, 7, -0.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#efe3c7'
    ctx.beginPath()
    ctx.arc(7, -6, 5.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#2e1a0d'
    ctx.beginPath()
    ctx.arc(9, -6, 2.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#5f351a'
    ctx.beginPath()
    ctx.moveTo(16, 1)
    ctx.lineTo(28, -2)
    ctx.lineTo(16, -8)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#2f1b10'
    ctx.fillRect(-8, -20, 18, 4)
    ctx.fillRect(-3, -28, 9, 9)

    ctx.strokeStyle = 'rgba(56, 30, 15, 0.65)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-16, -1)
    ctx.quadraticCurveTo(-22, 5, -20, 14)
    ctx.stroke()

    ctx.restore()
  }

  private drawOverlay() {
    const ctx = this.ctx

    ctx.fillStyle = 'rgba(58, 34, 17, 0.2)'
    ctx.font = '700 56px Georgia, Times New Roman, serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(this.score), WORLD_WIDTH / 2, 104)

    if (this.state === 'playing') {
      return
    }

    ctx.fillStyle = 'rgba(74, 46, 24, 0.78)'
    this.roundRect(38, 208, WORLD_WIDTH - 76, 184, 28)
    ctx.fill()

    ctx.strokeStyle = 'rgba(235, 213, 176, 0.4)'
    ctx.lineWidth = 1
    this.roundRect(46, 216, WORLD_WIDTH - 92, 168, 22)
    ctx.stroke()

    ctx.fillStyle = '#f4dfb5'
    ctx.font = '700 28px Georgia, Times New Roman, serif'
    ctx.fillText(this.state === 'ready' ? 'Take Wing' : 'Hard Landing', WORLD_WIDTH / 2, 268)

    ctx.font = '500 17px Georgia, Times New Roman, serif'
    ctx.fillStyle = '#ead8b5'
    const detail =
      this.state === 'ready'
        ? 'Keep the bird above the dust and through each timber opening.'
        : `Score ${this.score}. Best ${this.bestScore}. Tap to ride again.`
    ctx.fillText(detail, WORLD_WIDTH / 2, 314, WORLD_WIDTH - 124)

    ctx.font = '600 16px Georgia, Times New Roman, serif'
    ctx.fillStyle = '#f1c988'
    ctx.fillText(
      this.state === 'ready' ? 'Touch, click, or press Space' : 'Restart unlocks after a beat',
      WORLD_WIDTH / 2,
      352,
    )
  }

  private drawPlateTexture() {
    const ctx = this.ctx

    const vignette = ctx.createRadialGradient(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_HEIGHT * 0.18,
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_HEIGHT * 0.72,
    )
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, 'rgba(54, 33, 20, 0.26)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    ctx.fillStyle = 'rgba(255, 244, 219, 0.06)'
    for (let index = 0; index < 7; index += 1) {
      const x = 18 + index * 58 + Math.sin(this.elapsed + index) * 2
      ctx.fillRect(x, 24, 1, WORLD_HEIGHT - 48)
    }

    ctx.strokeStyle = 'rgba(72, 44, 25, 0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(26, 120)
    ctx.quadraticCurveTo(48, 290, 30, 482)
    ctx.stroke()
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
