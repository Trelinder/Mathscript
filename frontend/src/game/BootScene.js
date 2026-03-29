/**
 * BootScene
 *
 * The very first scene that runs when the Phaser game starts.
 * Its only job is to do any one-time global configuration (e.g. set canvas
 * background colour, configure the physics world) and then hand off to
 * PreloadScene so assets can be loaded with a progress bar.
 *
 * Keep this file small — heavy work belongs in PreloadScene or PlayScene.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  /**
   * init  – called before preload/create each time the scene starts.
   * Nothing to do here yet, but the hook is useful when passing data from
   * the React layer via scene.start('BootScene', { ... }).
   */
  init() {}

  /**
   * preload – load assets that PreloadScene itself needs (e.g. a logo shown
   * on the loading screen).  For now there are none; all assets are
   * programmatic so they are created in PreloadScene.create().
   */
  preload() {}

  /**
   * create – transition straight to PreloadScene.
   */
  create() {
    this.scene.start('PreloadScene')
  }
}
