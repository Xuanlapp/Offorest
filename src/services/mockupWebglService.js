import * as PIXI from 'pixi.js'

const blendModeMap = {
  'source-over': PIXI.BLEND_MODES.NORMAL,
  multiply: PIXI.BLEND_MODES.MULTIPLY,
  screen: PIXI.BLEND_MODES.SCREEN,
  overlay: PIXI.BLEND_MODES.OVERLAY,
  darken: PIXI.BLEND_MODES.DARKEN,
  lighten: PIXI.BLEND_MODES.LIGHTEN,
}

const mapBlendMode = (blendMode) => blendModeMap[String(blendMode || 'source-over').toLowerCase()] || PIXI.BLEND_MODES.NORMAL

const waitForTexture = (texture) =>
  new Promise((resolve, reject) => {
    if (texture?.baseTexture?.valid) {
      resolve(texture)
      return
    }

    const onLoaded = () => {
      cleanup()
      resolve(texture)
    }

    const onError = (error) => {
      cleanup()
      reject(error || new Error('Không thể load texture'))
    }

    const cleanup = () => {
      texture?.baseTexture?.off('loaded', onLoaded)
      texture?.baseTexture?.off('error', onError)
    }

    texture?.baseTexture?.on('loaded', onLoaded)
    texture?.baseTexture?.on('error', onError)
  })

const createTexture = async (dataUrl) => {
  const texture = PIXI.Texture.from(dataUrl)
  return waitForTexture(texture)
}

export const composeMockupWithPixi = async ({
  width,
  height,
  previewDataUrl,
  designDataUrl,
  designLayers = [],
}) => {
  if (!previewDataUrl || !designDataUrl) {
    throw new Error('Thiếu dữ liệu preview hoặc design để render WebGL')
  }

  const app = new PIXI.Application({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
    forceCanvas: false,
  })

  try {
    if (app.renderer?.type !== PIXI.RENDERER_TYPE.WEBGL) {
      throw new Error('Thiết bị không hỗ trợ WebGL cho PixiJS')
    }

    const baseTexture = await createTexture(previewDataUrl)
    const baseSprite = new PIXI.Sprite(baseTexture)
    baseSprite.x = 0
    baseSprite.y = 0
    baseSprite.width = width
    baseSprite.height = height
    app.stage.addChild(baseSprite)

    const designTexture = await createTexture(designDataUrl)

    for (const layer of designLayers) {
      const sprite = new PIXI.Sprite(designTexture)
      sprite.x = Number(layer?.left || 0)
      sprite.y = Number(layer?.top || 0)
      sprite.width = Math.max(1, Number(layer?.width || 1))
      sprite.height = Math.max(1, Number(layer?.height || 1))
      sprite.alpha = Math.max(0, Math.min(1, Number(layer?.opacity ?? 1)))
      sprite.blendMode = mapBlendMode(layer?.blendMode)

      const maskLayer = layer?.mask
      if (maskLayer?.dataUrl) {
        const maskTexture = await createTexture(maskLayer.dataUrl)
        const maskSprite = new PIXI.Sprite(maskTexture)
        maskSprite.x = Number(maskLayer?.left || 0)
        maskSprite.y = Number(maskLayer?.top || 0)
        maskSprite.width = Math.max(1, Number(maskLayer?.width || 1))
        maskSprite.height = Math.max(1, Number(maskLayer?.height || 1))
        app.stage.addChild(maskSprite)
        sprite.mask = maskSprite
      }

      app.stage.addChild(sprite)
    }

    app.renderer.render(app.stage)
    const extractedBase64 = app.renderer.plugins.extract.base64(app.stage, 'image/png')
    const dataUrl = typeof extractedBase64?.then === 'function'
      ? await extractedBase64
      : extractedBase64

    if (!String(dataUrl || '').startsWith('data:image/')) {
      // Fallback path for environments where extract.base64 is unsupported or unstable.
      const extractedCanvas = app.renderer.plugins.extract.canvas(app.stage)
      const fallbackDataUrl = extractedCanvas?.toDataURL?.('image/png') || ''
      if (String(fallbackDataUrl).startsWith('data:image/')) {
        return {
          name: 'MOCKUP-WEBGL.png',
          dataUrl: fallbackDataUrl,
        }
      }

      throw new Error('PixiJS extract không trả về data:image hợp lệ')
    }

    return {
      name: 'MOCKUP-WEBGL.png',
      dataUrl,
    }
  } finally {
    app.destroy(true, { children: true, texture: true, baseTexture: true })
  }
}
