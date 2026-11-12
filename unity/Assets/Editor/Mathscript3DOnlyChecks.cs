using System;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;
using MathscriptPrototype;

public static class Mathscript3DOnlyChecks
{
    public static void Run()
    {
        var setup = EditorSceneManager.GetSceneManagerSetup();
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        try
        {
            MathscriptTycoonUI.RunFixedLayoutChecks();
            var game = new GameObject("3D-only fixture").AddComponent<MathscriptIdleMiner>();
            game.towerShader = Shader.Find("Standard");
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            var state = new MathscriptEconomy();
            typeof(MathscriptIdleMiner).GetField("state", flags).SetValue(game, state);
            typeof(MathscriptIdleMiner).GetMethod("CreateTower", flags).Invoke(game, null);
            var world = game.gameObject.AddComponent<MathscriptPerspective>();
            world.Initialize(game);
            typeof(MathscriptIdleMiner).GetField("<Perspective>k__BackingField", flags).SetValue(game, world);
            var ui = game.gameObject.AddComponent<MathscriptTycoonUI>();
            ui.Initialize(game);
            var root = game.GetComponent<UIDocument>().rootVisualElement;
            if (!root.ClassListContains("perspective")) throw new Exception("Game did not initialize its 3D world");
            foreach (var control in root.Query<Button>().ToList())
                if (control.text == "VIEW" || control.text == "2D") throw new Exception("View switch remains available");
            foreach (string sprite in new[] { "worker", "rack", "rail", "elevator", "work-packet", "transfer-packet" })
                if (root.Query(className: sprite).ToList().Count != 0) throw new Exception("2D world actor remains: " + sprite);
            if (!GameObject.Find("Perspective Camera").GetComponent<Camera>().enabled) throw new Exception("3D camera is disabled");
            if (GameObject.Find("Tower Camera") != null || typeof(MathscriptIdleMiner).GetMethod("LegacyUI", flags) != null)
                throw new Exception("Legacy tower renderer remains");
            if (typeof(MathscriptTycoonUI).GetMethod("TogglePerspective", flags) != null || typeof(MathscriptPerspective).GetMethod("SetVisible") != null)
                throw new Exception("Alternate view path remains");
            var sizes = new[] { new Vector2Int(1280, 800), new Vector2Int(390, 844), new Vector2Int(844, 390), new Vector2Int(1920, 800), new Vector2Int(800, 1280) };
            var camera = GameObject.Find("Perspective Camera").GetComponent<Camera>();
            var stage = GameObject.Find("Perspective Data Center").transform;
            var frame = new Rect(0, 240, 1020, 480);
            world.SetFrameRect(frame);
            foreach (int viewport in new[] { 0, 2, 4, 5 })
            {
                state.viewport = viewport;
                world.SetFrameRect(frame);
                typeof(MathscriptPerspective).GetMethod("FrameViewport", flags).Invoke(world, new object[] { 1280, 800 });
                Vector3 position = camera.transform.position;
                Quaternion rotation = camera.transform.rotation;
                float zoom = camera.orthographicSize;
                Matrix4x4 projection = camera.projectionMatrix;
                Vector3 marker = new Vector3(97, MathscriptPerspective.DeckY(viewport) + 1.2f, 0);
                Vector3 projected = camera.WorldToViewportPoint(marker);
                foreach (Vector2Int size in sizes)
                {
                    bool portrait = MathscriptTycoonUI.IsPortraitViewport(size.x, size.y) || MathscriptTycoonUI.IsCompactLandscape(size.x, size.y);
                    Vector2 logicalSize = MathscriptTycoonUI.LogicalSize(size.x, size.y);
                    Rect viewportFrame = MathscriptTycoonUI.WorldBounds(size.x, size.y);
                    typeof(MathscriptTycoonUI).GetMethod("ApplyViewport", flags).Invoke(ui, new object[] { size.x, size.y });
                    world.SetFrameRect(viewportFrame);
                    typeof(MathscriptPerspective).GetMethod("FrameViewport", flags).Invoke(world, new object[] { size.x, size.y });
                    Rect content = MathscriptTycoonUI.ContentBounds(size.x, size.y);
                    float scale = MathscriptTycoonUI.ViewportScale(size.x, size.y);
                    var panel = game.GetComponent<UIDocument>().panelSettings;
                    if (panel.scaleMode != PanelScaleMode.ConstantPixelSize || Mathf.Abs(panel.scale - 1) > 0.0001f
                        || Mathf.Abs(root.style.width.value.value - logicalSize.x) > 0.01f || Mathf.Abs(root.style.height.value.value - logicalSize.y) > 0.01f
                        || Vector3.Distance(root.style.scale.value.value, new Vector3(scale, scale, 1)) > 0.0001f
                        || root.style.transformOrigin.value.x.value != 0 || root.style.transformOrigin.value.y.value != 0
                        || Mathf.Abs(root.style.left.value.value - content.x) > 0.01f || Mathf.Abs(root.style.top.value.value - content.y) > 0.01f)
                        throw new Exception("UI root transform, 1x panel or margin changed: " + size);
                    Rect physical = MathscriptTycoonUI.LogicalToScreen(viewportFrame, size.x, size.y);
                    Rect actual = new Rect(camera.rect.x * size.x, (1 - camera.rect.yMax) * size.y, camera.rect.width * size.x, camera.rect.height * size.y);
                    Vector3 pointDelta = camera.WorldToViewportPoint(marker) - projected;
                    Vector2 pixelDelta = new Vector2(pointDelta.x * physical.width, pointDelta.y * physical.height);
                    if (Vector2.Distance(actual.position, physical.position) > 0.01f || Vector2.Distance(actual.size, physical.size) > 0.01f
                        || Mathf.Abs(camera.aspect - viewportFrame.width / viewportFrame.height) > 0.0001f
                        || (!portrait && (Vector3.Distance(camera.transform.position, position) > 0.0001f || !camera.transform.rotation.Equals(rotation)
                            || Mathf.Abs(camera.orthographicSize - zoom) > 0.0001f || camera.projectionMatrix != projection
                            || Mathf.Abs(pixelDelta.x) > 1 || Mathf.Abs(pixelDelta.y) > 1 || Mathf.Abs(pointDelta.z) > 0.0001f))
                        || (portrait && (camera.WorldToViewportPoint(marker).x < 0 || camera.WorldToViewportPoint(marker).x > 1
                            || camera.WorldToViewportPoint(marker).y < 0 || camera.WorldToViewportPoint(marker).y > 1))
                        || stage.localScale != Vector3.one || world.VisibleFloorCount != (portrait ? 1 : 3) || state.viewport != viewport)
                        throw new Exception("Viewport recomposed the camera, architecture or departments: " + size + " depth=" + viewport
                            + " frame=" + actual + " expected=" + physical + " positionDelta=" + Vector3.Distance(camera.transform.position, position)
                            + " rotationEqual=" + camera.transform.rotation.Equals(rotation) + " zoomDelta=" + (camera.orthographicSize - zoom)
                            + " aspect=" + camera.aspect + " projectionEqual=" + (camera.projectionMatrix == projection) + " pixelDelta=" + pixelDelta
                            + " stageScale=" + stage.localScale + " floors=" + world.VisibleFloorCount + " viewport=" + state.viewport);
                }
            }
            state.viewport = 0;
            typeof(MathscriptTycoonUI).GetMethod("ConfigureViewport", flags).Invoke(ui, null);
            typeof(MathscriptPerspective).GetMethod("FrameCamera", flags).Invoke(world, null);
            Debug.Log("MATHSCRIPT_FIXED_LAYOUT_CAMERA_PASS five sizes / four depths / unchanged landscape / portrait department in frame / unit architecture / 1x panel");
            foreach (int level in new[] { 1, 10, 25, 50 })
            {
                state.levels[0] = level;
                typeof(MathscriptPerspective).GetMethod("Update", flags).Invoke(world, null);
                typeof(MathscriptPerspective).GetMethod("AssertDepartment", flags).Invoke(world, new object[] { 0 });
            }
            var heroes = world.HeroVisualState();
            if (heroes.Length != 7 || !heroes[0].visible || state.hired[0])
                throw new Exception("An unlocked department must show its hero even before hiring automation");
            for (int floor = 0; floor < heroes.Length; floor++)
            {
                string name = ((MathscriptWorker.Hero)floor).ToString();
                if (heroes[floor].name != name || heroes[floor].model != "Original " + name + " hero" || heroes[floor].bones != 16)
                    throw new Exception("Hero model is not bound to its own department: " + name);
                state.levels[floor] = 1;
            }
            for (int viewport = 0; viewport <= 5; viewport++)
            {
                state.viewport = viewport;
                typeof(MathscriptPerspective).GetMethod("Update", flags).Invoke(world, null);
                foreach (var hero in world.HeroVisualState())
                    if (hero.visible != (hero.floor >= viewport && hero.floor < viewport + world.VisibleFloorCount))
                        throw new Exception("Hero visibility does not follow the mine viewport: " + hero.name);
            }
            state.viewport = 0;
            state.levels[0] = 0;
            typeof(MathscriptPerspective).GetMethod("Update", flags).Invoke(world, null);
            if (world.HeroVisualState()[0].visible) throw new Exception("A locked department must not display a hero");
            Debug.Log("MATHSCRIPT_3D_ONLY_PASS startup/no-view/no-sprite-world/crew-evolution");
        }
        finally
        {
            if (Array.Exists(setup, scene => scene.isActive && scene.isLoaded)) EditorSceneManager.RestoreSceneManagerSetup(setup);
            else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
}