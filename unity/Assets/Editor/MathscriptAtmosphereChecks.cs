using System;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using MathscriptPrototype;

public static class MathscriptAtmosphereChecks
{
    public static void Run()
    {
        var setup = EditorSceneManager.GetSceneManagerSetup();
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        try
        {
            var game = new GameObject("Atmosphere fixture").AddComponent<MathscriptIdleMiner>();
            game.towerShader = Shader.Find("Standard");
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            var state = new MathscriptEconomy();
            typeof(MathscriptIdleMiner).GetField("state", flags).SetValue(game, state);
            typeof(MathscriptIdleMiner).GetMethod("CreateTower", flags).Invoke(game, null);
            var perspective = game.gameObject.AddComponent<MathscriptPerspective>();
            perspective.Initialize(game);
            var camera = GameObject.Find("Perspective Camera").GetComponent<Camera>();
            var light = GameObject.Find("Tower Sun").GetComponent<Light>();
            var skybox = RenderSettings.skybox;
            if (skybox == null || skybox.shader.name != "Skybox/Procedural") throw new Exception("Procedural surface sky is unavailable");
            var frame = typeof(MathscriptPerspective).GetMethod("FrameCamera", flags);
            int materials = Resources.FindObjectsOfTypeAll<Material>().Length;
            Color day = Color.clear;
            Color dayTint = Color.clear;
            foreach (float seconds in new[] { 0f,90f,180f,270f,360f })
            {
                state.viewport = 0;
                frame.Invoke(perspective, null);
                perspective.ApplyAtmosphere(seconds);
                if (seconds == 0)
                {
                    day = camera.backgroundColor;
                    dayTint = skybox.GetColor("_SkyTint");
                    if (camera.clearFlags != CameraClearFlags.Skybox) throw new Exception("Surface must render the procedural sky");
                }
                if (seconds == 180 && camera.backgroundColor == day) throw new Exception("Midnight must differ from daylight");
                if (seconds == 180 && skybox.GetColor("_SkyTint") == dayTint) throw new Exception("Procedural sky tint must change at midnight");
                if (seconds == 360 && camera.backgroundColor != day) throw new Exception("Cycle must wrap to daylight");
                if (seconds == 360 && skybox.GetColor("_SkyTint") != dayTint) throw new Exception("Procedural sky tint must wrap to daylight");
                if (light.intensity < 0.65f) throw new Exception("Surface illumination below floor");
                state.viewport = 5;
                frame.Invoke(perspective, null);
                perspective.ApplyAtmosphere(seconds);
                if (camera.backgroundColor != (Color)new Color32(80,87,83,255)) throw new Exception("Underground background changed");
                if (camera.clearFlags != CameraClearFlags.SolidColor) throw new Exception("Procedural sky visible underground");
                if (light.intensity < 1.05f) throw new Exception("Underground illumination below floor");
                var sky = GameObject.Find("Perspective Data Center").transform.Find("Campus atmosphere");
                if (sky.gameObject.activeSelf) throw new Exception("Sky visible underground");
                if (Resources.FindObjectsOfTypeAll<Material>().Length != materials) throw new Exception("Atmosphere allocated materials during updates");
            }
            Debug.Log("MATHSCRIPT_ATMOSPHERE_PASS day/night/wrap/underground/materials");
        }
        finally
        {
            bool hasActiveScene = Array.Exists(setup, scene => scene.isActive && scene.isLoaded);
            if (hasActiveScene) EditorSceneManager.RestoreSceneManagerSetup(setup);
            else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
}